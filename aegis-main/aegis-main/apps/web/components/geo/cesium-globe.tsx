'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Layers, Mountain, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { carregarConfig } from '@/lib/config/runtime';
import { Cctv, type CCTVStream } from '@/lib/api/cctv';
import type { GeoNode } from '@/lib/api/geo';
import type { AlertGeofence, AlertItem } from '@/lib/api/types';
import { alertCoords, useGeoOptional } from './geo-context';
import {
  categoryForNodeType,
  colorForNodeType,
  humanizePinLabel,
  rectangleToBbox,
  SEVERITY_COLOR,
} from './geo-utils';
import { clusterImage, markerImage } from './geo-markers';
import { zoneStyle, type GeoZone } from './geo-zones';
import { pulseRing, PULSE_DURATION_MS, prefersReducedMotion } from './geo-animations';

// Cesium 1.x ships complete typings (no @types/cesium needed). We keep the
// runtime `await import('cesium')` for code-splitting (the bundle is huge),
// but type the lazily-loaded module + viewer against the OFFICIAL types via
// `typeof import('cesium')` / `import('cesium').Viewer`. This replaces the
// hand-written partial shims that previously drifted from the real API.
type CesiumModule = typeof import('cesium');
type CesiumViewer = import('cesium').Viewer;

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

/**
 * Cesium tipa `LabelGraphics.show` como `Property | undefined`, mas o
 * setter da instância aceita boolean em runtime (auto-wrap em
 * ConstantProperty via createPropertyDescriptor). Este helper reflete o
 * comportamento de runtime sem espalhar casts pelos effects de toggle.
 */
/**
 * Acima deste número de nós, a camada NÃO cria rótulo de texto.
 *
 * No Cesium um `Label` não é uma primitiva — é um billboard POR CARACTERE
 * (mais um de fundo, com `showBackground`). Uma camada de 40k nós com nomes de
 * ~20 caracteres materializa ~880 MIL primitivas de texto de uma vez: é o que
 * trava o globo e cobre a tela de branco. Nesse zoom o texto seria ilegível de
 * qualquer forma — o pin continua lá, clicável, com o nome no painel de
 * detalhe. NÃO é teto de DADO: todos os nós continuam plotados.
 */
const LABEL_MAX_POR_CAMADA = 400;
/**
 * Faixa (metros de altitude de câmera) em que o rótulo existe.
 *
 * 25 km ≈ enquadramento de CIDADE: é onde o texto tem tamanho legível e o
 * número de pins na tela é humano. Acima disso o rótulo não aparece — não por
 * economia, mas porque a essa distância ele é ruído ilegível empilhado (foi o
 * "diversas labels carregadas ao mesmo tempo"). O pin continua lá.
 */
const LABEL_DIST_NEAR = 1.0e3;
const LABEL_DIST_FAR = 2.5e4;

function setLabelShow(label: import('cesium').LabelGraphics, show: boolean) {
  (label as { show?: boolean | unknown }).show = show;
}

/**
 * B5.3 — "sonar ring" de CHEGADA: um anel HOLLOW (centro transparente → SÓ
 * BORDA, nunca preenchimento/halo/glow) que expande e some (pulseRing) quando
 * uma detecção NOVA aparece. Real-driven (só arrivals genuínos, ver o guard
 * `bootstrapped`), auto-remove após a duração, e respeita prefers-reduced-motion.
 */
function spawnArrivalPulse(
  v: CesiumViewer,
  Cesium: CesiumModule,
  lon: number,
  lat: number,
) {
  if (prefersReducedMotion()) return;
  const start = performance.now();
  const id = `pulse-${start.toFixed(0)}-${lon.toFixed(4)}-${lat.toFixed(4)}`;
  const steel = Cesium.Color.fromCssColorString('#2D77BE');
  const ring = () => pulseRing(performance.now() - start, PULSE_DURATION_MS);
  try {
    v.entities.add({
      id,
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        // centro transparente = anel; borda aço que expande e some (sem glow).
        color: Cesium.Color.TRANSPARENT,
        pixelSize: new Cesium.CallbackProperty(
          () => 8 + ((ring().scale - 0.3) / 1.5) * 40, false),
        outlineColor: new Cesium.CallbackProperty(
          () => steel.withAlpha(ring().alpha), false),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  } catch {
    /* viewer ocupado — o pulso é best-effort, nunca derruba o globo */
  }
  setTimeout(() => {
    try { v.entities.removeById(id); } catch { /* já removido */ }
  }, PULSE_DURATION_MS + 150);
}

type Props = {
  height?: string;
  zoomLevel?: number;
  interactive?: boolean;
  /** Fora do GeoProvider (mini-mapa/widget), gate dos pins de streams CCTV.
   *  Dentro do /geo quem manda é filters.showCameras do GeoContext. */
  showPins?: boolean;
  showControls?: boolean;
  /** Centro inicial do globo. Default: SP center (-46.652, -23.5605). */
  center?: { lat: number; lon: number };
};

export function CesiumGlobe({
  height = '100%',
  zoomLevel = 12000,
  interactive = true,
  showPins = true,
  showControls = true,
  center,
}: Props) {
  const geo = useGeoOptional();
  const filters = geo?.filters;
  const setGeoSelected = geo?.setSelected;
  const setGeoCamera = geo?.setCamera;
  const setViewportBbox = geo?.setViewportBbox;
  const geoFlyToRef = geo?.flyToRef;
  const geoTool = geo?.tool ?? 'selecionar';
  const geoToolRef = useRef(geoTool);
  geoToolRef.current = geoTool;
  // Setter do draft de cerca (círculo/rota) — mantido em ref pra ser lido
  // dentro do handler de clique do Cesium (montado uma vez), sempre o atual.
  const setShapeDraftRef = useRef(geo?.setShapeDraft);
  setShapeDraftRef.current = geo?.setShapeDraft;
  const drawingsRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawingStateRef = useRef<{
    centerCart?: any;
    centerLon?: number;
    centerLat?: number;
    rotePositions?: any[];
    routeLonLat?: [number, number][];
    routeEntityId?: string;
    measureFirst?: any;
  }>({});
  // Quando muda de tool, reseta o estado interno pra não juntar
  // ferramentas (ex.: ficar com "centro" antigo do Raio).
  useEffect(() => {
    drawingStateRef.current = {};
  }, [geoTool]);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  // #9 — CustomDataSource com clustering p/ as camadas de PIN (cctv/onto/
  // geonode/geoalert): pins na mesma localização viram uma bolha com contagem
  // (expande ao aproximar) em vez de empilharem ilegíveis. Cercas/desenho/
  // linhas continuam em v.entities (não clusterizam). Fallback: se null, os
  // pins caem em v.entities (sem cluster) — degradação graciosa.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinsDsRef = useRef<any>(null);
  // Cache stream metadata indexed por entity id (uuid) pra picking
  const streamCacheRef = useRef<Map<string, CCTVStream>>(new Map());
  // Caches pra picking das camadas data-driven (nó/cerca/alerta).
  const nodeCacheRef = useRef<Map<string, GeoNode>>(new Map());
  const geofenceCacheRef = useRef<Map<string, AlertGeofence>>(new Map());
  const alertCacheRef = useRef<Map<string, AlertItem>>(new Map());
  // Zonas operacionais (KMZ/GeoJSON) por entity id → picking no clique.
  const zoneCacheRef = useRef<Map<string, GeoZone>>(new Map());

  const [terrain, setTerrain] = useState(false);
  const [buildings, setBuildings] = useState(false);
  const [labels, setLabels] = useState(true);
  const [lighting, setLighting] = useState(false);
  // Viewer boota async — as camadas data-driven replotam quando ele chega.
  const [viewerReady, setViewerReady] = useState(false);
  // Init do globo 3D pode falhar (WebGL indisponível / GPU desligada / navegador
  // antigo) → fallback contido, NUNCA derruba o app na mão do cliente.
  const [initError, setInitError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumViewer | null = null;

    if (typeof window !== 'undefined') {
      window.CESIUM_BASE_URL = '/cesium';
    }

    (async () => {
      const Cesium = await import('cesium');
      await import('cesium/Build/Cesium/Widgets/widgets.css');
      cesiumRef.current = Cesium;

      if (cancelled || !containerRef.current) return;

      // F1.2: token de runtime (/api/config), não mais inlinado no bundle.
      const { cesiumIonToken } = await carregarConfig();
      if (cancelled) return;
      if (cesiumIonToken) {
        Cesium.Ion.defaultAccessToken = cesiumIonToken;
      }

      let v: CesiumViewer;
      try {
        v = new Cesium.Viewer(containerRef.current, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
          scene3DOnly: true,
          shouldAnimate: true,
        });
      } catch (err) {
        // WebGL indisponível / GPU desligada / navegador antigo → fallback contido,
        // NUNCA derruba o app na mão do cliente (erro assíncrono não passa por
        // ErrorBoundary, então tratamos aqui na origem).
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[cesium-globe] globo 3D indisponível (WebGL?)', err);
          setInitError(true);
        }
        return;
      }

      viewerRef.current = v;
      viewer = v;
      setViewerReady(true);

      // #9 — datasource clusterizado dos pins (cctv/onto/geonode/geoalert).
      // Pins coincidentes viram bolha com contagem; expande ao aproximar.
      try {
        const pinsDs = new Cesium.CustomDataSource('aegis-pins');
        pinsDs.clustering.enabled = true;
        pinsDs.clustering.pixelRange = 38;
        pinsDs.clustering.minimumClusterSize = 2;
        pinsDs.clustering.clusterEvent.addEventListener((entities, clu) => {
          const n = entities.length;
          // Badge de cluster = billboard (contagem embutida no SVG, cantos
          // retos, SEM glow). Ponto/rótulo do cluster ficam ocultos.
          clu.billboard.show = true;
          clu.billboard.image = clusterImage(n);
          clu.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
          clu.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
          clu.point.show = false;
          clu.label.show = false;
        });
        v.dataSources.add(pinsDs);
        pinsDsRef.current = pinsDs;
      } catch {
        pinsDsRef.current = null; // fallback: pins em v.entities (sem cluster)
      }
      // Coleção dos PINS (clusterizada se disponível, senão a default).
      const pinEntities = () => (pinsDsRef.current?.entities ?? v.entities);

      v.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a0e14');
      v.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0e14');
      // 3D como o web-app AEGIS antigo: iluminação + atmosfera + névoa + atmosfera de
      // solo LIGADAS — é o que dá SOMBRA/PROFUNDIDADE aos polígonos extrudados (sem
      // isso a extrusão fica um bloco chapado, "jogado no mapa"). skyAtmosphere/moon/
      // sun/skyBox são `T | undefined`; guardamos com `?.`.
      v.scene.globe.enableLighting = true;
      if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;
      v.scene.fog.enabled = true;
      v.scene.globe.showGroundAtmosphere = true;
      if (v.scene.moon) v.scene.moon.show = false;
      if (v.scene.sun) v.scene.sun.show = false;
      (v.cesiumWidget.creditContainer as HTMLElement).setAttribute('style', 'display:none');

      v.scene.screenSpaceCameraController.enableInputs = interactive;

      // Plota câmeras CCTV reais do ontology (cada cctv_stream Entity
      // com lat/lon vira pin "cctv-<id>"). Fora do GeoProvider o gate é a
      // prop showPins (mini-mapa/widget); dentro, filters.showCameras.
      Cctv.streams
        .list()
        .then((streams: CCTVStream[]) => {
          if (!streams || cancelled) return;
          const showCameras = filters ? filters.showCameras : showPins;
          for (const s of streams) {
            if (s.latitude == null || s.longitude == null) continue;
            streamCacheRef.current.set(s.id, s);
            const isWebcam = s.source_type === 'webcam-usb';
            const onlineColor = isWebcam ? '#E97D2A' : '#3D9F58';
            const offlineColor = '#7C7C7C';
            const color = s.status === 'online' ? onlineColor : offlineColor;
            pinEntities().add({
              id: `cctv-${s.id}`,
              position: Cesium.Cartesian3.fromDegrees(s.longitude, s.latitude),
              show: showCameras,
              // Câmera = SENSOR (○) — moldura por categoria, cor = estado
              // (online verde / webcam laranja / offline cinza).
              billboard: {
                image: markerImage({ category: 'sensor', color }),
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                scale: 0.7,
                scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 4.0e6, 0.45),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                // Cola o pin no terreno quando "Terreno" estiver ligado;
                // sem isso o pin fica em altura 0 (mar) e parallax dá
                // sensação de que ele "desliza" quando a câmera move.
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
              label: {
                // Rótulo CURTO no mapa (o nome completo aparece no clique/
                // painel). Nome de câmera longo (rodovia+km+sentido+cidade)
                // desenhado inteiro vira um bloco gigante que se sobrepõe com
                // dezenas de pins na mesma vista.
                text: s.name.length > 26 ? `${s.name.slice(0, 25)}…` : s.name,
                font: '11px "JetBrains Mono", monospace',
                fillColor: Cesium.Color.fromCssColorString('#E6E9EE'),
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString('#14181E').withAlpha(0.92),
                backgroundPadding: new Cesium.Cartesian2(6, 4),
                pixelOffset: new Cesium.Cartesian2(0, -24),
                // Encolhe/some o rótulo quando a vista abre: numa vista de
                // estado inteiro (dezenas de câmeras) só os pins aparecem;
                // aproximou (rodovia/cidade) os rótulos voltam. Sem isso,
                // zoom-out = parede de texto cobrindo o mapa. Espelha o
                // scaleByDistance do billboard.
                scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 4.0e6, 0.45),
                translucencyByDistance: new Cesium.NearFarScalar(1.6e5, 1.0, 3.6e5, 0.0),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                style: Cesium.LabelStyle.FILL,
                show: labels && showCameras,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
            });
          }
        })
        .catch(() => {
          /* ontology offline — globo segue sem a camada de câmeras */
        });

      // Click handler GLOBAL — dispatch baseado na ferramenta ativa.
      const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);

      const pickWorld = (pos: import('cesium').Cartesian2) => {
        // Tenta pickPosition (precisa terrain), fallback pro ellipsoid pick.
        let cart: import('cesium').Cartesian3 | undefined;
        try {
          cart = v.scene.pickPosition(pos);
        } catch {
          /* ignore */
        }
        if (!cart) {
          const ray = v.camera.getPickRay(pos);
          if (ray) cart = v.scene.globe.pick(ray, v.scene);
        }
        if (!cart) return null;
        const carto = Cesium.Cartographic.fromCartesian(cart);
        return {
          lat: Cesium.Math.toDegrees(carto.latitude),
          lon: Cesium.Math.toDegrees(carto.longitude),
          cart,
        };
      };

      const fmtDist = (m: number) =>
        m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;

      handler.setInputAction((evt: import('cesium').ScreenSpaceEventHandler.PositionedEvent) => {
        const currentTool = geoToolRef.current;

        // SELECIONAR: pick padrão dos pins existentes
        if (currentTool === 'selecionar' || currentTool === 'poligono') {
          const picked = v.scene.pick(evt.position);
          // #9 — clique num CLUSTER (picked.id é um array de entidades): aproxima
          // a câmera pra ele se abrir, em vez de não fazer nada.
          const pickedEntity = picked?.id;
          if (Array.isArray(pickedEntity) && pickedEntity.length > 0) {
            try {
              const pos = pickedEntity[0]?.position?.getValue?.(v.clock.currentTime);
              if (pos) {
                v.camera.flyToBoundingSphere(
                  new Cesium.BoundingSphere(pos, 1),
                  { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), 3000), duration: 0.8 },
                );
              }
            } catch { /* zoom best-effort */ }
            return;
          }
          const pickedId = pickedEntity?.id as string | undefined;
          if (!pickedId) return;

          if (pickedId.startsWith('cctv-')) {
            const uuid = pickedId.slice(5);
            const cached = streamCacheRef.current.get(uuid);
            if (cached) setGeoSelected?.({ kind: 'stream', stream: cached });
            return;
          }
          // Camadas da ontologia (geonode-<type>-<id>) → ficha no painel.
          const node = nodeCacheRef.current.get(pickedId);
          if (node) {
            setGeoSelected?.({ kind: 'node', node });
            return;
          }
          // Cercas virtuais (geofence-<id>) → nome/severidade/ativa + remover.
          const fence = geofenceCacheRef.current.get(pickedId);
          if (fence) {
            setGeoSelected?.({ kind: 'geofence', geofence: fence });
            return;
          }
          // Alertas pendentes com geo (geoalert-<id>).
          const alert = alertCacheRef.current.get(pickedId);
          if (alert) {
            setGeoSelected?.({ kind: 'alert', alert });
            return;
          }
          if (pickedId.startsWith('det-stream-')) {
            const sid = pickedId.slice('det-stream-'.length);
            const s = streamCacheRef.current.get(sid);
            if (s) { setGeoSelected?.({ kind: 'stream', stream: s }); return; }
          }
          // Zonas operacionais (zone-<id>) → detalhe no painel (tipo/altura/remover).
          const zone = zoneCacheRef.current.get(pickedId);
          if (zone) {
            setGeoSelected?.({ kind: 'zone', zone });
            return;
          }
          // Camadas de REFERÊNCIA (GeoJsonDataSource): TODOS os atributos da feição
          // no painel quando o operador clica — contexto pra decisão (imprescindível).
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pbag = (pickedEntity as any)?.properties;
            const all = pbag?.getValue ? pbag.getValue(v.clock.currentTime) : null;
            if (all && all._layer) {
              setGeoSelected?.({
                kind: 'refFeature',
                layer: String(all._layer),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                title: (pickedEntity as any)?.name || undefined,
                props: all,
              });
            }
          } catch { /* noop */ }
          return;
        }

        // PIN / RAIO / ROTA / MEDIR — precisam de coord 3D do globo
        const hit = pickWorld(evt.position);
        if (!hit) return;
        const { lat, lon, cart } = hit;

        if (currentTool === 'pin') {
          const id = `draw-pin-${Date.now()}`;
          v.entities.add({
            id,
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            point: {
              pixelSize: 12,
              color: Cesium.Color.fromCssColorString('#2D77BE'),
              outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
              font: '10px "JetBrains Mono", monospace',
              fillColor: Cesium.Color.fromCssColorString('#ffffff'),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#2D77BE').withAlpha(0.92),
              backgroundPadding: new Cesium.Cartesian2(5, 3),
              pixelOffset: new Cesium.Cartesian2(0, 20),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              style: Cesium.LabelStyle.FILL,
            },
          });
          drawingsRef.current.push(id);
          return;
        }

        if (currentTool === 'raio') {
          const Cs = Cesium as {
            Cartesian3: {
              distance: (a: unknown, b: unknown) => number;
              fromDegrees: (lon: number, lat: number) => unknown;
            };
          };
          const state = drawingStateRef.current;
          if (!state.centerCart) {
            state.centerCart = cart;
            state.centerLon = lon;
            state.centerLat = lat;
            // marca o centro
            const cid = `draw-radius-center-${Date.now()}`;
            v.entities.add({
              id: cid,
              position: cart,
              point: {
                pixelSize: 8,
                color: Cesium.Color.fromCssColorString('#2D77BE'),
                outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            drawingsRef.current.push(cid);
            return;
          }
          const dist = Cs.Cartesian3.distance(state.centerCart, cart);
          const eid = `draw-radius-${Date.now()}`;
          v.entities.add({
            id: eid,
            position: state.centerCart,
            ellipse: {
              semiMajorAxis: dist,
              semiMinorAxis: dist,
              material: Cesium.Color.fromCssColorString('#2D77BE').withAlpha(0.2),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#2D77BE'),
              outlineWidth: 2,
            },
            label: {
              text: fmtDist(dist),
              font: '11px "JetBrains Mono", monospace',
              fillColor: Cesium.Color.fromCssColorString('#ffffff'),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#2D77BE').withAlpha(0.92),
              backgroundPadding: new Cesium.Cartesian2(6, 3),
              pixelOffset: new Cesium.Cartesian2(0, 0),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              style: Cesium.LabelStyle.FILL,
            },
          });
          drawingsRef.current.push(eid);
          // Publica o círculo desenhado como draft de cerca: o card de
          // criar-cerca (MapaCanvas) abre pra nomear + escolher severidade.
          if (state.centerLon != null && state.centerLat != null) {
            setShapeDraftRef.current?.({
              kind: 'circle',
              center: [state.centerLon, state.centerLat],
              radiusMeters: Math.round(dist),
            });
          }
          state.centerCart = undefined; // pronto pro próximo raio
          state.centerLon = undefined;
          state.centerLat = undefined;
          return;
        }

        if (currentTool === 'rota') {
          const state = drawingStateRef.current;
          state.rotePositions = state.rotePositions ?? [];
          state.rotePositions.push(cart);
          state.routeLonLat = state.routeLonLat ?? [];
          state.routeLonLat.push([lon, lat]);
          if (state.routeEntityId) {
            const ex = v.entities.getById(state.routeEntityId) as
              | { polyline?: { positions?: unknown } }
              | undefined;
            if (ex?.polyline) ex.polyline.positions = state.rotePositions;
          } else {
            const id = `draw-route-${Date.now()}`;
            v.entities.add({
              id,
              polyline: {
                positions: state.rotePositions,
                width: 3,
                material: Cesium.Color.fromCssColorString('#2D77BE'),
                clampToGround: true,
              },
            });
            drawingsRef.current.push(id);
            state.routeEntityId = id;
          }
          // pin pequeno em cada vértice
          const vid = `draw-route-vx-${Date.now()}`;
          v.entities.add({
            id: vid,
            position: cart,
            point: {
              pixelSize: 6,
              color: Cesium.Color.fromCssColorString('#2D77BE'),
              outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          drawingsRef.current.push(vid);
          // Publica os waypoints como draft de rota (corredor) — o card de
          // criar-cerca abre com a contagem ao-vivo + largura; cada clique
          // adicional estende a rota.
          setShapeDraftRef.current?.({
            kind: 'route',
            waypoints: [...state.routeLonLat],
          });
          return;
        }

        if (currentTool === 'medir') {
          const Cs = Cesium as {
            Cartesian3: { distance: (a: unknown, b: unknown) => number };
          };
          const state = drawingStateRef.current;
          if (!state.measureFirst) {
            state.measureFirst = cart;
            const pid = `draw-measure-p1-${Date.now()}`;
            v.entities.add({
              id: pid,
              position: cart,
              point: {
                pixelSize: 8,
                color: Cesium.Color.fromCssColorString('#E97D2A'),
                outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            drawingsRef.current.push(pid);
            return;
          }
          const dist = Cs.Cartesian3.distance(state.measureFirst, cart);
          const lid = `draw-measure-${Date.now()}`;
          v.entities.add({
            id: lid,
            polyline: {
              positions: [state.measureFirst, cart],
              width: 3,
              material: Cesium.Color.fromCssColorString('#E97D2A'),
              clampToGround: true,
            },
          });
          drawingsRef.current.push(lid);
          const lab = `draw-measure-label-${Date.now()}`;
          v.entities.add({
            id: lab,
            position: cart,
            label: {
              text: fmtDist(dist),
              font: '12px "JetBrains Mono", monospace',
              fillColor: Cesium.Color.fromCssColorString('#ffffff'),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#E97D2A').withAlpha(0.95),
              backgroundPadding: new Cesium.Cartesian2(6, 3),
              pixelOffset: new Cesium.Cartesian2(0, -20),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              style: Cesium.LabelStyle.FILL,
            },
          });
          drawingsRef.current.push(lab);
          state.measureFirst = undefined;
          return;
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      (v as { _handler?: unknown })._handler = handler;

      // expõe limpa-tudo pra UI
      const geoLocal = geo;
      if (geoLocal?.clearDrawingsRef) {
        geoLocal.clearDrawingsRef.current = () => {
          for (const id of drawingsRef.current) {
            try { v.entities.removeById(id); } catch { /* ignore */ }
          }
          drawingsRef.current = [];
          drawingStateRef.current = {};
          setShapeDraftRef.current?.(null);
        };
      }

      // pixel do canvas → lat/lng real do globo — é o que dá coordenada
      // GEOGRÁFICA ao polígono desenhado no overlay (cerca virtual).
      if (geoLocal?.screenToGeoRef) {
        geoLocal.screenToGeoRef.current = (xPx: number, yPx: number) => {
          const hit = pickWorld(new Cesium.Cartesian2(xPx, yPx));
          return hit ? { lat: hit.lat, lng: hit.lon } : null;
        };
      }

      // INVERSO de screenToGeoRef: lon/lat do globo → pixel do canvas. É o que
      // mantém o polígono em construção GRUDADO no chão quando a câmera move
      // (flyTo/resize/fullscreen) — o overlay re-projeta por frame em vez de
      // usar o % congelado do clique. null se o ponto está atrás do horizonte.
      if (geoLocal?.projectLonLatRef) {
        const ST = (Cesium as unknown as {
          SceneTransforms: {
            worldToWindowCoordinates: (
              scene: unknown, position: unknown, result?: unknown,
            ) => { x: number; y: number } | undefined;
          };
        }).SceneTransforms;
        geoLocal.projectLonLatRef.current = (lon: number, lat: number) => {
          const win = ST.worldToWindowCoordinates(
            v.scene, Cesium.Cartesian3.fromDegrees(lon, lat),
          );
          return win ? { xPx: win.x, yPx: win.y } : null;
        };
      }

      // Tique por frame: o MapaCanvas registra aqui sua re-projeção do polígono
      // em construção. postRender garante coordenadas frescas após cada render.
      if (geoLocal?.onGlobeFrameRef) {
        const scene = v.scene as {
          postRender: { addEventListener: (cb: () => void) => () => void };
        };
        scene.postRender.addEventListener(() => {
          geoLocal.onGlobeFrameRef?.current?.();
        });
      }

      // Exportar PNG real: força um render e captura o canvas WebGL.
      if (geoLocal?.capturePngRef) {
        geoLocal.capturePngRef.current = () => {
          try {
            v.scene.render();
            return v.scene.canvas.toDataURL('image/png');
          } catch {
            return null;
          }
        };
      }

      // Centraliza a câmera REALMENTE em cima do alvo. `flyTo` cru
      // posiciona a câmera em (lon,lat,h) e a pitch -55° faz o "olhar"
      // cair adiante do ponto — operador tinha que arrastar pra
      // ajustar. `flyToBoundingSphere` com HeadingPitchRange faz o
      // Cesium calcular a posição da câmera que mantém o alvo no
      // centro da tela com o pitch oblíquo desejado.
      const flyToTarget = (
        lat: number,
        lng: number,
        range: number,
        duration: number,
      ) => {
        const target = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
        const offset = new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-55),
          range,
        );
        v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
          offset,
          duration,
        });
      };

      flyToTarget(
        center?.lat ?? -23.5605,
        center?.lon ?? -46.6520,
        zoomLevel,
        0,
      );

      // Expõe flyTo pro contexto — consumido pela barra de busca do
      // mapa pra animar até um stream selecionado.
      if (geoFlyToRef) {
        geoFlyToRef.current = (lat: number, lng: number, alt = 5000) => {
          flyToTarget(lat, lng, alt, 1.5);
        };
      }

      // Camera position → GeoContext (overlay LAT/LNG/ALT em tempo real)
      if (setGeoCamera) {
        const camera = v.camera as {
          positionCartographic: { longitude: number; latitude: number; height: number };
          changed: { addEventListener: (cb: () => void) => () => void };
        };
        const emit = () => {
          const c = camera.positionCartographic;
          if (!c) return;
          setGeoCamera({
            lat: (c.latitude * 180) / Math.PI,
            lng: (c.longitude * 180) / Math.PI,
            altitude: c.height,
          });
        };
        emit();
        // debounce 100ms entre updates pra não inundar React
        let pending = false;
        camera.changed.addEventListener(() => {
          if (pending) return;
          pending = true;
          setTimeout(() => {
            pending = false;
            emit();
          }, 100);
        });
      }

      // B5.1 — bbox do viewport → contexto (carregamento progressivo). Quando a
      // câmera ASSENTA (moveEnd), recorta o retângulo visível e publica o bbox;
      // o GeoContext refaz o fetch das camadas ativas só com os nós visíveis.
      // Debounce 100ms pra não inundar o reload. rectangleToBbox devolve null
      // quando o recorte é o globo inteiro/degenerado → carga cega (sem bbox).
      if (setViewportBbox) {
        const pushViewportBbox = () => {
          const rect = v.camera.computeViewRectangle();
          if (!rect) return;
          setViewportBbox(
            rectangleToBbox(rect.west, rect.south, rect.east, rect.north),
          );
        };
        pushViewportBbox(); // recorte inicial
        let pendingBbox = false;
        v.camera.moveEnd.addEventListener(() => {
          if (pendingBbox) return;
          pendingBbox = true;
          setTimeout(() => {
            pendingBbox = false;
            pushViewportBbox();
          }, 100);
        });
      }
    })();

    return () => {
      cancelled = true;
      setViewerReady(false);
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
    // labels + interactive INTENCIONALMENTE fora do array — recriavam
    // o viewer inteiro (e o flyTo default) toda vez que mudavam.
    // Effects dedicados abaixo fazem update incremental (labels.show
    // e scene.screenSpaceCameraController.enableInputs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPins, zoomLevel, center?.lat, center?.lon]);

  // Toggle dinâmico de inputs (não rebuilda viewer). Usado quando o
  // operador entra em "modo polígono" pra desenhar — o Cesium ignora
  // pan/zoom enquanto o overlay HTML captura os cliques.
  useEffect(() => {
    const v = viewerRef.current as {
      scene?: {
        screenSpaceCameraController: { enableInputs: boolean };
      };
    } | null;
    if (!v?.scene) return;
    v.scene.screenSpaceCameraController.enableInputs = interactive;
  }, [interactive]);

  // Reage aos filtros do GeoContext: toggle visibility da camada de câmeras.
  useEffect(() => {
    const v = viewerRef.current as {
      entities: {
        values: Array<{ id: string; show?: boolean; label?: { show?: boolean } }>;
        add: (o: unknown) => unknown;
        removeById: (id: string) => boolean;
      };
    } | null;
    if (!v || !filters) return;
    // cctv-* vivem na coleção de pins (clusterizada) quando disponível.
    const col = pinsDsRef.current?.entities ?? v.entities;
    for (const e of col.values) {
      if (typeof e.id !== 'string') continue;
      if (e.id.startsWith('cctv-')) {
        e.show = filters.showCameras;
        if (e.label) e.label.show = filters.showCameras && labels;
      }
    }
  }, [filters, labels]);

  // ── Camadas da ontologia (GET /geo/nodes via GeoContext.layerNodes) ──
  // Declarativo: remove os pins `geonode-*` e replota a partir do estado.
  // Cor estável por node_type; pin clicável → ficha no painel de detalhe.
  const layerNodes = geo?.layerNodes;
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || v.isDestroyed() || !Cesium || !layerNodes) return;
    const col = pinsDsRef.current?.entities ?? v.entities;
    // ── Atualização INCREMENTAL ────────────────────────────────────────────
    // Antes: apagava TODAS as entidades e recriava TODAS a cada recarga. Com
    // dezenas de milhares de nós isso é destruir e reconstruir o mundo a cada
    // assentamento de câmera — a origem do lag e da piscada das camadas 3D.
    // Agora só sai o que sumiu e só entra o que chegou; o que continua igual
    // não é tocado. `suspendEvents` evita notificar a coleção por item.
    const desejados = new Set<string>();
    for (const [nodeType, nodes] of Object.entries(layerNodes)) {
      for (const node of nodes) {
        const eid = `geonode-${nodeType}-${node.id}`;
        desejados.add(eid);
        desejados.add(`${eid}-poly`);
      }
    }
    col.suspendEvents();
    v.entities.suspendEvents();
    const remover: string[] = [];
    for (const id of nodeCacheRef.current.keys()) {
      if (!desejados.has(id)) remover.push(id);
    }
    for (const id of remover) {
      try { col.removeById(id); } catch { /* já removido */ }
      // polígonos extrudados vivem em v.entities (não-clusterizado) — limpa lá também.
      try { v.entities.removeById(id); } catch { /* já removido */ }
      nodeCacheRef.current.delete(id);
    }
    const jaPlotados = new Set(nodeCacheRef.current.keys());
    for (const [nodeType, nodes] of Object.entries(layerNodes)) {
      const color = colorForNodeType(nodeType);
      // Rótulo é caro de um jeito não-óbvio: no Cesium um Label vira UM
      // BILLBOARD POR CARACTERE (+1 de fundo, showBackground). Uma camada de
      // 40k nós com ~20 chars = ~880 MIL primitivas de texto, criadas de uma
      // vez — é isso que trava o globo e cobre a tela de branco. Acima deste
      // corte o pin continua lá (e clicável, com o nome no painel); o que sai
      // é só o texto que ninguém conseguiria ler naquele zoom.
      const rotulavel = nodes.length <= LABEL_MAX_POR_CAMADA;
      for (const node of nodes) {
        const eid = `geonode-${nodeType}-${node.id}`;
        if (jaPlotados.has(eid)) continue;   // já está no globo: não recria
        nodeCacheRef.current.set(eid, node);
        // OP1/OP4 — estilo do PIPELINE vence a cor derivada do tipo: camadas
        // materializadas por fluxo (ontology_output.geo_style) têm cor própria.
        // OP1/OP4 — estilo do PIPELINE vence a cor derivada do tipo. geo_style é um
        // dict ARBITRÁRIO vindo do nó do DAG (ontology_output.geo_style): cor + TODAS
        // as personalizações 3D do polígono.
        const gstyle = (node as GeoNode).geo_style || null;
        const nodeColor = gstyle?.color || color;
        // Fase 1 (TODAS as camadas de referência → DAG) — nó materializado com
        // GEOMETRIA (transform geopoint emite o anel [[lon,lat],…]) desenha o
        // polígono da camada; com geo_style.extruded_height>0 ele vira VOLUME 3D
        // (como o web-app AEGIS antigo) — altura/base/tampas/opacidade/contorno
        // todos configuráveis no nó do pipeline. Sem extrusão = chapado (retrocompat).
        const ring = (node as GeoNode).zone_geometry;
        if (Array.isArray(ring) && ring.length >= 3) {
          try {
            const flat = ring.flatMap(([lon, lat]) => [lon, lat]);
            if (flat.length >= 6) {
              const pid = `${eid}-poly`;
              nodeCacheRef.current.set(pid, node);
              const extrude =
                typeof gstyle?.extruded_height === 'number' && gstyle.extruded_height > 0;
              // Volume tem que LER como volume. Com alpha baixo o Cesium
              // desenha translúcido sem depth-write: a face de trás, a tampa e
              // a base compõem no mesmo pixel, o miolo some e sobram as arestas
              // — é o "oco, só as paredes". Extrudado nasce sólido o bastante
              // pra ler como bloco (o mapa ainda aparece por baixo); chapado
              // segue leve. Feição com alpha próprio manda.
              // Volume extrudado nasce SÓLIDO (0.9). Translúcido no Cesium é
              // desenhado sem depth-write: tampa, parede de trás e chão
              // compõem no mesmo pixel e a forma lê como muro em pé, com o
              // terreno aparecendo por dentro — foi exatamente o que o
              // operador viu. Quem quiser vidro baixa a opacidade no nó do DAG.
              const alpha =
                typeof gstyle?.alpha === 'number' ? gstyle.alpha : extrude ? 0.45 : 0.18;
              const outlineWidth =
                typeof gstyle?.outline_width === 'number' ? gstyle.outline_width : 2;
              const base = typeof gstyle?.base_height === 'number' ? gstyle.base_height : 0;
              // ÁREA ou LINHA? O `zone_geometry` é só uma lista de vértices —
              // a diferença está no fecho, como manda o GeoJSON: anel FECHADO
              // (1º == último) é área; ABERTO é linha (rua, corredor, via).
              //
              // Tratar linha como polígono era a origem do "só paredes, sem
              // teto": uma linha não tem área, então o polígono degenera numa
              // lâmina vertical — não existe topo pra fechar. Agora cada uma
              // vira a geometria que É: área → volume com tampa; linha → muro
              // (Wall), que é a leitura correta de uma via com altura.
              const p0 = ring[0];
              const pN = ring[ring.length - 1];
              const fechado = p0[0] === pN[0] && p0[1] === pN[1];
              const altura = extrude ? (gstyle!.extruded_height as number) : 0;
              // Polígono/muro vão em v.entities (NÃO-clusterizado): a datasource
              // de pins clusteriza e suprime a extrusão.
              if (!fechado && extrude) {
                v.entities.add({
                  id: pid,
                  wall: {
                    positions: Cesium.Cartesian3.fromDegreesArray(flat),
                    maximumHeights: new Array(ring.length).fill(base + altura),
                    minimumHeights: new Array(ring.length).fill(base),
                    material: Cesium.Color.fromCssColorString(nodeColor).withAlpha(alpha),
                    outline: true,
                    outlineColor: Cesium.Color.fromCssColorString(
                      gstyle?.outline_color || nodeColor,
                    ),
                    outlineWidth,
                  },
                });
              } else if (!fechado) {
                // linha sem altura: é uma linha mesmo
                v.entities.add({
                  id: pid,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(flat),
                    width: Math.max(2, outlineWidth),
                    material: Cesium.Color.fromCssColorString(nodeColor).withAlpha(
                      Math.max(alpha, 0.85),
                    ),
                    clampToGround: true,
                  },
                });
              } else {
                v.entities.add({
                  id: pid,
                  polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(
                      Cesium.Cartesian3.fromDegreesArray(flat),
                    ),
                    material: Cesium.Color.fromCssColorString(nodeColor).withAlpha(alpha),
                    outline: true,
                    outlineColor: Cesium.Color.fromCssColorString(
                      gstyle?.outline_color || nodeColor,
                    ),
                    outlineWidth,
                    // Extrusão 3D dirigida pelo geo_style do nó do DAG.
                    ...(extrude
                      ? {
                          height: base,
                          extrudedHeight: base + altura,
                          // OCA por padrão: só as paredes, sem teto nem
                          // fundo — é a leitura que o operador quer da zona
                          // (volume delimitado, mapa visível por dentro).
                          // Fechar é opt-in no nó do DAG (close_top: true).
                          closeTop: gstyle?.close_top === true,
                          closeBottom: gstyle?.close_bottom === true,
                          perPositionHeight: false,
                        }
                      : {}),
                  },
                });
              }
            }
          } catch { /* anel podre — pin segue, polígono não derruba o globo */ }
        }
        col.add({
          id: eid,
          position: Cesium.Cartesian3.fromDegrees(node.lng, node.lat),
          // Nó da ontologia: moldura pela CATEGORIA do node_type (◇ evento /
          // □ ativo / ○ sensor), preenchida com a cor estável do tipo.
          billboard: {
            image: markerImage({
              category: categoryForNodeType(nodeType),
              color: nodeColor,
            }),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            scale: 0.7,
            scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 4.0e6, 0.45),
            // Grudar no terreno (CLAMP_TO_GROUND) custa POR ENTIDADE e a cada
            // frame — com dezenas de milhares de pins é boa parte da sensação
            // de engasgo ao arrastar o mapa. Com o terreno DESLIGADO (o
            // default) não há relevo pra acompanhar: o pin fica no elipsoide,
            // que é o mesmo lugar. Só quem liga o terreno paga o clamp.
            ...(terrain
              ? {
                  heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }
              : {}),
          },
          // Sem rótulo em camada densa (ver `rotulavel`): o texto só nasce
          // quando dá pra ler, e ainda assim só de perto.
          ...(rotulavel
            ? {
                label: {
                  text: humanizePinLabel(node.name, node.node_type, node.id),
                  font: '11px "JetBrains Mono", monospace',
                  fillColor: Cesium.Color.fromCssColorString('#E6E9EE'),
                  showBackground: true,
                  backgroundColor: Cesium.Color.fromCssColorString('#14181E').withAlpha(0.92),
                  backgroundPadding: new Cesium.Cartesian2(6, 4),
                  pixelOffset: new Cesium.Cartesian2(0, -20),
                  style: Cesium.LabelStyle.FILL,
                  show: labels,
                  ...(terrain
                    ? {
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                      }
                    : {}),
                  // atenuação que o pin de CCTV já tinha e esta camada não:
                  // some ao afastar em vez de virar sopa de texto
                  translucencyByDistance: new Cesium.NearFarScalar(
                    LABEL_DIST_NEAR, 1.0, LABEL_DIST_FAR, 0.0,
                  ),
                  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                    0.0, LABEL_DIST_FAR,
                  ),
                },
              }
            : {}),
        });
      }
    }
    col.resumeEvents();
    v.entities.resumeEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerNodes, labels, viewerReady, terrain]);

  // ── Camadas de REFERÊNCIA (GeoJSON externo: IBGE limites, CNES saúde) ──
  // Carrega cada GeoJSON ativo num GeoJsonDataSource próprio (polígonos +
  // pontos); remove ao desligar. Acento azul-aço; falha-suave por camada.
  const referenceGeoJSON = geo?.referenceGeoJSON;
  const markReferenceRendered = geo?.markReferenceRendered;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refDataSourcesRef = useRef<Record<string, any>>({});
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || v.isDestroyed() || !Cesium || !referenceGeoJSON) return;
    const want = new Set(Object.keys(referenceGeoJSON));
    const loaded = refDataSourcesRef.current;
    for (const id of Object.keys(loaded)) {
      if (!want.has(id)) {
        const ds = loaded[id];
        if (ds && ds !== 'pending') {
          try { v.dataSources.remove(ds, true); } catch { /* já removido */ }
        }
        delete loaded[id];
      }
    }
    // Estilo POR CAMADA (cor + pino + extrusão 3D). Data-viz funcional: cores
    // distintas pra separar camadas; desmatamento/risco saltam em 3D (e ficam
    // visíveis mesmo sendo polígonos minúsculos — corrige o "não aparece nada").
    const accent = '#2D77BE';
    const REF_STYLE: Record<string, { color: string; extrude?: boolean; pulse?: boolean; outlineOnly?: boolean }> = {
      ibge_uf_malha: { color: accent, outlineOnly: true },
      ibge_municipio_malha: { color: accent, outlineOnly: true },
      cnes_saude: { color: '#2E8B7A' },
      incra_assentamentos: { color: '#C9A227' },
      terras_indigenas: { color: '#C56B4A' },
      ucs_federais: { color: '#3A8E6B' },
      prodes_ti: { color: '#E2483B', extrude: true },
      prodes_geral: { color: '#E2483B', extrude: true },
      deter_amz: { color: '#D6336C', extrude: true },
      focos_calor: { color: '#FF6A00', pulse: true },
    };
    for (const [id, fc] of Object.entries(referenceGeoJSON)) {
      if (loaded[id]) continue;
      loaded[id] = 'pending';
      const st = REF_STYLE[id] || { color: accent };
      const col = Cesium.Color.fromCssColorString(st.color);
      Cesium.GeoJsonDataSource.load(fc, {
        stroke: col,
        fill: col.withAlpha(0.4),
        strokeWidth: 4,
        markerColor: col,
        clampToGround: false,
      })
        .then((ds: any) => {
          if (v.isDestroyed() || loaded[id] !== 'pending') return;
          // Pós-processa CADA feição p/ DECISÃO (clareza > enfeite): ponto nítido
          // de referência, FOCO pulsante SÓ-BORDA (urgência), polígono que salta.
          const white = Cesium.Color.WHITE.withAlpha(0.9);
          for (const ent of ds.entities.values) {
            if (ent.billboard || ent.point) {
              ent.billboard = undefined;
              if (st.pulse && !prefersReducedMotion()) {
                // Foco ativo = urgência REAL (fogo ativo agora): pulso SUTIL de
                // TAMANHO — SÓ BORDA, SEM glow/halo (contorno branco constante,
                // só o ponto respira). Corrige a violação DS do halo antigo.
                ent.point = new Cesium.PointGraphics({
                  color: col,
                  pixelSize: new Cesium.CallbackProperty(
                    () => 7 + (Math.sin(performance.now() / 600) + 1) * 1.5, false),
                  outlineColor: white,
                  outlineWidth: 2,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  scaleByDistance: new Cesium.NearFarScalar(5.0e4, 1.1, 6.0e6, 0.3),
                });
              } else if (st.pulse) {
                // reduced-motion: foco ativo ESTÁTICO (ponto nítido, sem animação).
                ent.point = new Cesium.PointGraphics({
                  color: col,
                  pixelSize: 9,
                  outlineColor: white,
                  outlineWidth: 2,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  scaleByDistance: new Cesium.NearFarScalar(5.0e4, 1.1, 6.0e6, 0.3),
                });
              } else {
                // Referência: ponto nítido (cor da camada + contorno branco).
                ent.point = new Cesium.PointGraphics({
                  color: col,
                  pixelSize: 11,
                  outlineColor: white,
                  outlineWidth: 2,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.3, 4.0e6, 0.5),
                });
              }
            }
            if (ent.polygon) {
              if (st.outlineOnly) {
                // Limites (IBGE) = só a LINHA — sem preenchimento azul que tapa a
                // análise do operador.
                ent.polygon.fill = false;
                ent.polygon.outline = true;
                ent.polygon.outlineColor = col;
                ent.polygon.outlineWidth = 2;
              } else {
                ent.polygon.material = col.withAlpha(0.42);
                ent.polygon.outline = true;
                ent.polygon.outlineColor = white;
                ent.polygon.outlineWidth = 2;
                if (st.extrude) {
                  ent.polygon.height = 0;
                  ent.polygon.extrudedHeight = 8000;
                }
              }
            }
            if (ent.polyline) {
              ent.polyline.material = col;
              ent.polyline.width = 4;
            }
          }
          v.dataSources.add(ds);
          loaded[id] = ds;
          try {
            markReferenceRendered?.(id, ds.entities?.values?.length ?? 0);
          } catch { /* noop */ }
          try {
            v.flyTo(ds, { duration: 1.2 });
          } catch { /* câmera travada; o layer fica lá */ }
        })
        .catch(() => {
          if (loaded[id] === 'pending') delete loaded[id];
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceGeoJSON, viewerReady]);

  // ── Cercas virtuais (Alerts.geofences — store na ontologia) ──────────
  // A zona renderizada AQUI é a MESMA cerca que o avaliador do Atlas usa
  // pra disparar alertas de borda. Cor por severidade; clique → painel.
  const geofences = geo?.geofences;
  const showGeofences = geo?.filters?.showGeofences ?? false;
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || v.isDestroyed() || !Cesium) return;
    for (const id of geofenceCacheRef.current.keys()) {
      try { v.entities.removeById(id); } catch { /* já removido */ }
    }
    geofenceCacheRef.current.clear();
    if (!showGeofences || !geofences) return;
    for (const g of geofences) {
      const eid = `geofence-${g.id}`;
      const color = SEVERITY_COLOR[g.severity] ?? '#2D77BE';
      const cesiumColor = Cesium.Color.fromCssColorString(color);
      const alpha = g.active ? 0.22 : 0.08;
      const coords = g.coordinates as unknown;
      try {
        if (g.shape === 'polygon' && Array.isArray(coords)) {
          const flat: number[] = [];
          for (const p of coords) {
            if (Array.isArray(p) && p.length >= 2) flat.push(Number(p[0]), Number(p[1]));
          }
          if (flat.length < 6) continue;
          v.entities.add({
            id: eid,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
              material: cesiumColor.withAlpha(alpha),
              outline: true,
              outlineColor: cesiumColor,
            },
          });
        } else if (
          g.shape === 'circle' && coords && typeof coords === 'object' && !Array.isArray(coords)
        ) {
          const c = coords as { center?: unknown; radius_meters?: unknown };
          const center = Array.isArray(c.center) ? c.center : null;
          const radius = Number(c.radius_meters);
          if (!center || center.length < 2 || !Number.isFinite(radius) || radius <= 0) continue;
          v.entities.add({
            id: eid,
            position: Cesium.Cartesian3.fromDegrees(Number(center[0]), Number(center[1])),
            ellipse: {
              semiMajorAxis: radius,
              semiMinorAxis: radius,
              material: cesiumColor.withAlpha(alpha),
              outline: true,
              outlineColor: cesiumColor,
            },
          });
        } else if (coords && typeof coords === 'object' && !Array.isArray(coords)) {
          // corridor | route — render como polyline pelos waypoints.
          const w = (coords as { waypoints?: unknown }).waypoints;
          if (!Array.isArray(w) || w.length < 2) continue;
          const flat: number[] = [];
          for (const p of w) {
            if (Array.isArray(p) && p.length >= 2) flat.push(Number(p[0]), Number(p[1]));
          }
          if (flat.length < 4) continue;
          v.entities.add({
            id: eid,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(flat),
              width: 4,
              material: cesiumColor.withAlpha(Math.max(alpha, 0.5)),
              clampToGround: true,
            },
          });
        } else {
          continue;
        }
        geofenceCacheRef.current.set(eid, g);
      } catch {
        /* coordenadas podres — pula a cerca, nunca derruba o globo */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geofences, showGeofences, viewerReady]);

  // ── Zonas operacionais (KMZ/GeoJSON importadas — GET /geo/zones) ──────
  // Espelha o effect das cercas: polígono DS-contido por categoria (paleta de
  // zoneStyle), extrusão 3D quando extruded_height>0, rótulo no centroide.
  // SEM glow/pulse. Clique → painel de detalhe (zoneCacheRef). Limpa polígono
  // + rótulo + cache a cada re-run.
  const zones = geo?.zones;
  const showZones = geo?.filters?.showZones ?? false;
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || v.isDestroyed() || !Cesium) return;
    for (const id of zoneCacheRef.current.keys()) {
      try { v.entities.removeById(id); } catch { /* já removido */ }
      try { v.entities.removeById(`${id}-label`); } catch { /* já removido */ }
    }
    zoneCacheRef.current.clear();
    if (!showZones || !zones) return;
    for (const zone of zones) {
      const eid = `zone-${zone.id}`;
      try {
        const flat = zone.geometry.flatMap(([lon, lat]) => [lon, lat]);
        if (flat.length < 6) continue;
        const ring = Cesium.Cartesian3.fromDegreesArray(flat);
        const style = zoneStyle(zone.zone_type);
        const extruded = zone.extruded_height > 0;
        v.entities.add({
          id: eid,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(ring),
            material: Cesium.Color.fromCssColorString(style.fill).withAlpha(
              extruded ? 0.22 : 0.18,
            ),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(style.outline),
            outlineWidth: 2,
            ...(extruded
              ? {
                  height: 0,
                  extrudedHeight: zone.extruded_height,
                  closeTop: true,
                  closeBottom: true,
                }
              : {}),
          },
        });
        // Rótulo no centroide (média dos vértices) — mesmo chip escuro/mono
        // dos demais rótulos; disableDepthTest pra não sumir atrás do relevo.
        const cx =
          zone.geometry.reduce((s, p) => s + p[0], 0) / zone.geometry.length;
        const cy =
          zone.geometry.reduce((s, p) => s + p[1], 0) / zone.geometry.length;
        v.entities.add({
          id: `${eid}-label`,
          position: Cesium.Cartesian3.fromDegrees(cx, cy),
          label: {
            text: zone.name,
            font: '11px "JetBrains Mono", monospace',
            fillColor: Cesium.Color.fromCssColorString('#E6E9EE'),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#14181E').withAlpha(0.92),
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            style: Cesium.LabelStyle.FILL,
            show: labels,
          },
        });
        zoneCacheRef.current.set(eid, zone);
      } catch {
        /* geometria podre — pula a zona, nunca derruba o globo */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, showZones, labels, viewerReady]);

  // ── Alertas pendentes com geo (payload.coords das cercas) ────────────
  const pendingAlerts = geo?.pendingAlerts;
  const showAlerts = geo?.filters?.showAlerts ?? false;
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || v.isDestroyed() || !Cesium) return;
    const col = pinsDsRef.current?.entities ?? v.entities;
    for (const id of alertCacheRef.current.keys()) {
      try { col.removeById(id); } catch { /* já removido */ }
    }
    alertCacheRef.current.clear();
    if (!showAlerts || !pendingAlerts) return;
    for (const a of pendingAlerts) {
      const pos = alertCoords(a);
      if (!pos) continue;
      const eid = `geoalert-${a.id}`;
      const color = SEVERITY_COLOR[a.severity ?? 'high'] ?? '#C8341F';
      alertCacheRef.current.set(eid, a);
      col.add({
        id: eid,
        position: Cesium.Cartesian3.fromDegrees(pos.lng, pos.lat),
        // Alerta pendente = EVENTO (◇); a severidade entra como a barra de
        // estado saturada dentro da moldura.
        billboard: {
          image: markerImage({ category: 'event', color, severity: a.severity }),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scale: 0.7,
          scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 4.0e6, 0.45),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: a.title,
          font: '10px "JetBrains Mono", monospace',
          fillColor: Cesium.Color.fromCssColorString('#ffffff'),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString(color).withAlpha(0.95),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          pixelOffset: new Cesium.Cartesian2(0, 18),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          style: Cesium.LabelStyle.FILL,
          show: labels,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAlerts, showAlerts, labels, viewerReady]);

  // Detecções recentes plotadas como pins efêmeros (id `det-<id>`).
  // Atualiza a cada 30s quando o filtro está ativo. Cor por kind.
  useEffect(() => {
    if (!filters?.showDetections) return;
    let cancelled = false;

    // Agregamos detecções POR STREAM — 10 detecções na mesma câmera
    // viravam 10 pins sobrepostos invisíveis. Agora 1 pin por câmera
    // com count + kind dominante.
    const plotted = new Set<string>();
    const flewToFirst = { value: false };
    // B5.3: só pulsa arrivals GENUÍNOS — o 1º tick semeia o estado atual sem
    // pulsar (senão tudo pulsaria de uma vez ao ligar a camada).
    let bootstrapped = false;
    const COLOR_BY_KIND: Record<string, string> = {
      face: '#C8341F',
      lpr: '#E97D2A',
      object: '#E8B33B',
    };

    const tick = async () => {
      const v = viewerRef.current as {
        entities: {
          add: (o: unknown) => unknown;
          removeById: (id: string) => boolean;
          getById: (id: string) => unknown;
        };
      } | null;
      const Cesium = cesiumRef.current as {
        Cartesian3: { fromDegrees: (lon: number, lat: number) => unknown };
        Color: {
          fromCssColorString: (s: string) => { withAlpha: (a: number) => unknown };
        };
        Cartesian2: new (x: number, y: number) => unknown;
        LabelStyle: { FILL: unknown };
        HeightReference: { CLAMP_TO_GROUND: unknown };
        VerticalOrigin: { CENTER: unknown };
        NearFarScalar: new (near: number, nearVal: number, far: number, farVal: number) => unknown;
      } | null;
      if (!v || !Cesium) {
        console.debug('[detections-layer] viewer not ready, skipping tick');
        return;
      }
      try {
        // Janela temporal REAL do GeoContext (null = default do backend).
        const win = geo?.sinceMinutes ?? undefined;
        const [dets, streams] = await Promise.all([
          Cctv.detections({ limit: 100, ...(win != null ? { since_minutes: win } : {}) }),
          Cctv.streams.list(),
        ]);
        if (cancelled) return;
        const streamById = new Map(streams.map((s) => [s.id, s]));
        // bucket por stream_id
        const byStream = new Map<
          string,
          { count: number; kinds: Record<string, number>; lat: number; lon: number; streamName: string }
        >();
        let skippedNoGeo = 0;
        for (const d of dets) {
          const s = streamById.get(d.stream_id);
          if (!s || s.latitude == null || s.longitude == null) {
            skippedNoGeo++;
            continue;
          }
          const cur = byStream.get(d.stream_id) ?? {
            count: 0,
            kinds: {} as Record<string, number>,
            lat: s.latitude,
            lon: s.longitude,
            streamName: s.name,
          };
          cur.count += 1;
          cur.kinds[d.kind] = (cur.kinds[d.kind] || 0) + 1;
          byStream.set(d.stream_id, cur);
        }
        // remove pins de streams que sumiram da janela
        for (const eid of plotted) {
          const sid = eid.slice('det-stream-'.length);
          if (!byStream.has(sid)) {
            v.entities.removeById(eid);
            plotted.delete(eid);
          }
        }
        let firstStreamWithDet: { lat: number; lon: number } | null = null;
        for (const [sid, info] of byStream) {
          const eid = `det-stream-${sid}`;
          const dominantKind = Object.entries(info.kinds).sort((a, b) => b[1] - a[1])[0]?.[0] || 'face';
          const color = COLOR_BY_KIND[dominantKind] || '#888';
          const labelText = `${info.count} ${dominantKind}${info.count > 1 ? 's' : ''}`;
          const existing = v.entities.getById(eid) as
            | { label?: { text?: string }; billboard?: { image?: unknown } }
            | undefined;
          if (existing) {
            if (existing.label) existing.label.text = labelText;
            // kind dominante mudou → re-gera a moldura (cor embutida no SVG).
            if (existing.billboard)
              existing.billboard.image = markerImage({ category: 'event', color });
            continue;
          }
          // heightReference: CLAMP_TO_GROUND gruda o marcador no chão (com o
          // EllipsoidTerrainProvider default cola na altura 0 do ellipsoid,
          // mesmo sem Ion/terreno) — evita o parallax de "deslizar".
          v.entities.add({
            id: eid,
            position: Cesium.Cartesian3.fromDegrees(info.lon, info.lat),
            // Detecção agregada por câmera = EVENTO (◇); cor pelo kind
            // dominante. A CONTAGEM continua no rótulo (labelText).
            billboard: {
              image: markerImage({ category: 'event', color }),
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              scale: 0.7,
              scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 4.0e6, 0.45),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            label: {
              text: labelText,
              font: '10px "JetBrains Mono", monospace',
              fillColor: Cesium.Color.fromCssColorString('#ffffff'),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString(color).withAlpha(0.95),
              backgroundPadding: new Cesium.Cartesian2(6, 3),
              pixelOffset: new Cesium.Cartesian2(0, 18),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              style: Cesium.LabelStyle.FILL,
            },
          });
          plotted.add(eid);
          // B5.3: detecção NOVA chegou (após o bootstrap) → sonar ring de
          // chegada (real-driven, só borda, sem glow). O viewer/Cesium já estão
          // montados aqui (guard no topo do tick).
          if (bootstrapped && viewerRef.current && cesiumRef.current) {
            spawnArrivalPulse(viewerRef.current, cesiumRef.current, info.lon, info.lat);
          }
          if (!firstStreamWithDet) {
            firstStreamWithDet = { lat: info.lat, lon: info.lon };
          }
        }
        // 1º tick já semeou o estado — os próximos pulsam arrivals reais.
        bootstrapped = true;
        // 1ª vez que filtra liga + acha detecção: voa pro 1º stream
        // pra operador VER imediatamente onde está (senão o pin fica
        // fora do viewport e parece que "não funciona").
        if (firstStreamWithDet && !flewToFirst.value && geoFlyToRef?.current) {
          flewToFirst.value = true;
          geoFlyToRef.current(firstStreamWithDet.lat, firstStreamWithDet.lon, 4000);
        }
        console.debug(
          `[detections-layer] tick: ${dets.length} dets · ${byStream.size} streams · plotted=${plotted.size} skipped_no_geo=${skippedNoGeo}`,
        );
      } catch (e) {
        console.warn('[detections-layer] tick falhou:', e);
      }
    };

    // 1º tick imediato + retries curtos enquanto viewer não monta
    let bootRetries = 0;
    const boot = setInterval(() => {
      if (viewerRef.current && cesiumRef.current) {
        clearInterval(boot);
        tick();
      } else if (++bootRetries > 30) {
        clearInterval(boot);
        console.warn('[detections-layer] desistiu — viewer não ficou pronto em 6s');
      }
    }, 200);
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(boot);
      // re-lê o viewer no cleanup — o ref pode ter sido limpo se o
      // componente desmontou (StrictMode double-mount em dev causa
      // "Cannot read properties of undefined (reading 'entities')").
      const view = viewerRef.current as {
        entities: { removeById: (id: string) => boolean };
      } | null;
      if (!view) return;
      for (const eid of plotted) {
        try {
          view.entities.removeById(eid);
        } catch {
          /* viewer destruído entre o read e o remove — ok */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.showDetections, geo?.sinceMinutes]);

  // ── Correlação espaço-temporal (linhas âncora↔vizinhos) ─────────────
  // Desenha as linhas que o painel-detalhe (Sensores próximos) calcula:
  // 'nearby' = vizinho explorado (tracejado, laranja); 'materialized' =
  // aresta CORRELACIONADO_COM já gravada (linha cheia). Cor laranja é
  // DISTINTA do azul das relações do Sprint 7. Ligado/desligado pela
  // camada showCorrelations. Reusa o mesmo conceito de polyline do globo.
  const correlationLines = geo?.correlationLines;
  const showCorrelations = geo?.filters?.showCorrelations ?? true;
  const corrCacheRef = useRef<string[]>([]);
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || v.isDestroyed() || !Cesium) return;
    for (const id of corrCacheRef.current) {
      try { v.entities.removeById(id); } catch { /* já removido */ }
    }
    corrCacheRef.current = [];
    if (!showCorrelations || !correlationLines) return;
    const CORR_COLOR = '#E97D2A';
    for (const l of correlationLines) {
      const pts = l.path.filter(
        (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]),
      );
      if (pts.length < 2) continue;
      const eid = `corr-${l.id}`;
      const material =
        l.kind === 'materialized'
          ? Cesium.Color.fromCssColorString(CORR_COLOR).withAlpha(0.95)
          : new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString(CORR_COLOR).withAlpha(0.85),
              dashLength: 12,
            });
      try {
        v.entities.add({
          id: eid,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(
              pts.flatMap((p) => [p[1], p[0]]),
            ),
            width: l.kind === 'materialized' ? 3 : 2,
            material,
            clampToGround: true,
          },
        });
        corrCacheRef.current.push(eid);
      } catch {
        /* coordenada podre — pula a linha, nunca derruba o globo */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correlationLines, showCorrelations, viewerReady]);

  // Trajetória de pessoa: quando /geo?focus=<entity_id>, busca observations
  // dessa pessoa e desenha polyline conectando as câmeras pela ordem
  // temporal — visualização espacial do "onde ela esteve".
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || !Cesium || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const focus = params.get('focus');
    if (!focus) return;

    const trailIds: string[] = [];
    let cancelled = false;

    (async () => {
      try {
        const [obs, streams] = await Promise.all([
          Cctv.entityObservations(focus, 500),
          Cctv.streams.list(),
        ]);
        if (cancelled) return;
        const streamById = new Map(streams.map((s) => [s.id, s]));
        // Cada obs.stream_id aponta pra cctv_stream. Ordena por hora
        // crescente e pega lat/lon do stream.
        const pts: Array<{ lon: number; lat: number; at: string; stream: string }> = [];
        for (const o of [...obs].sort((a, b) => a.detected_at.localeCompare(b.detected_at))) {
          const s = streamById.get(o.stream_id);
          if (s && s.latitude != null && s.longitude != null) {
            pts.push({ lon: s.longitude, lat: s.latitude, at: o.detected_at, stream: s.name });
          }
        }
        if (pts.length === 0) return;
        // polyline conectando os pontos
        const positions = pts.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat));
        const trailId = `trail-${focus}`;
        trailIds.push(trailId);
        v.entities.add({
          id: trailId,
          polyline: {
            positions,
            width: 3,
            material: Cesium.Color.fromCssColorString('#E97D2A').withAlpha(0.85),
            clampToGround: true,
          },
        });
        // Pin destacado em cada câmera onde foi vista (sobre o pin padrão)
        pts.forEach((p, i) => {
          const id = `trail-${focus}-stop-${i}`;
          trailIds.push(id);
          v.entities.add({
            id,
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
            point: {
              pixelSize: 14,
              color: Cesium.Color.fromCssColorString('#E97D2A'),
              outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            label: {
              text: `${i + 1}/${pts.length} · ${p.at.slice(11, 16)}`,
              font: '10px "JetBrains Mono", monospace',
              fillColor: Cesium.Color.fromCssColorString('#ffffff'),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#E97D2A').withAlpha(0.9),
              backgroundPadding: new Cesium.Cartesian2(5, 3),
              pixelOffset: new Cesium.Cartesian2(0, 20),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              style: Cesium.LabelStyle.FILL,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        });
        // Voa pro centro da trajetória
        const lonAvg = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
        const latAvg = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
        v.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lonAvg, latAvg, 40000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
          duration: 1.5,
        });
      } catch {
        /* ontology offline / sem observações — ignora silenciosamente */
      }
    })();

    return () => {
      cancelled = true;
      const view = viewerRef.current;
      if (!view) return;
      for (const id of trailIds) view.entities.removeById(id);
    };
  }, [interactive]);

  // Buildings 3D — instancia uma ÚNICA vez quando ligado pela primeira
  // vez; mantém ref no viewer pra esconder/mostrar via .show. Requer
  // Cesium Ion token (config de runtime). Sem token, falha
  // gracefully no console e mantém botão sem efeito visual.
  useEffect(() => {
    const v = viewerRef.current as {
      scene?: {
        primitives?: {
          add: (p: unknown) => { show: boolean };
          remove: (p: unknown) => void;
        };
      };
      _buildings?: { show: boolean };
    } | null;
    const Cesium = cesiumRef.current as {
      createOsmBuildingsAsync?: () => Promise<unknown>;
    } | null;
    if (!v || !v.scene || !Cesium) return;

    let cancelled = false;
    (async () => {
      if (!buildings) {
        if (v._buildings) v._buildings.show = false;
        return;
      }
      if (v._buildings) {
        v._buildings.show = true;
        return;
      }
      if (!Cesium.createOsmBuildingsAsync) return;
      try {
        const tileset = await Cesium.createOsmBuildingsAsync();
        if (cancelled || !v.scene?.primitives) return;
        const ref = v.scene.primitives.add(tileset) as { show: boolean };
        ref.show = true;
        v._buildings = ref;
      } catch (e) {
        console.warn('[cesium] buildings indisponível (Ion token?):', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildings]);

  // Terrain + Lighting — terrain requer Ion token; lighting é cliente puro.
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || !Cesium) return;
    const scene = v.scene;
    (async () => {
      if (terrain && Cesium.createWorldTerrainAsync) {
        try {
          scene.terrainProvider = await Cesium.createWorldTerrainAsync();
        } catch (e) {
          console.warn('[cesium] terrain indisponível (Ion token?):', e);
        }
      } else if (Cesium.EllipsoidTerrainProvider) {
        scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }
      scene.globe.depthTestAgainstTerrain = terrain;
      scene.globe.enableLighting = lighting;
    })();
  }, [terrain, lighting]);

  // Labels toggle — não recria pins, só muda .label.show em cada entity.
  // `LabelGraphics.show` é tipado como `Property` no Cesium, mas o setter
  // aceita boolean em runtime (auto-wrap em ConstantProperty). Usamos o
  // helper `setShow` pra refletir isso sem mudar o comportamento.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    // Varre as DUAS coleções: os pins das camadas vivem na datasource
    // clusterizada (`aegis-pins`), não em `v.entities` — o toggle "Rótulos"
    // simplesmente não os alcançava, e o operador não tinha como desligar o
    // texto justamente da camada que o cobria de branco.
    const colecoes = [v.entities.values, pinsDsRef.current?.entities.values ?? []];
    for (const values of colecoes) {
      for (const e of values) {
        if (e.label) setLabelShow(e.label, labels);
      }
    }
  }, [labels]);

  return (
    <div className="w-full h-full relative">
      <div
        ref={containerRef}
        data-testid="cesium-globe"
        className="w-full h-full bg-deep"
        style={{ minHeight: height }}
      />
      {initError && (
        <div
          data-testid="cesium-globe-fallback"
          className="absolute inset-0 flex items-center justify-center bg-deep p-4 text-center"
        >
          <p className="max-w-sm text-[12px] text-muted-on-dark">
            Globo 3D indisponível neste dispositivo — o navegador não suporta WebGL
            (ou a aceleração de GPU está desativada).
          </p>
        </div>
      )}
      {showControls && !initError && (
        <div
          data-testid="cesium-controls"
          className="absolute bottom-16 right-3 bg-panel-dark/95 border border-border-dark flex flex-col z-10"
        >
          {[
            { id: 'terrain', title: 'Terreno (Cesium World Terrain · requer Ion token)', active: terrain, set: setTerrain, icon: Mountain },
            { id: 'buildings', title: 'Prédios 3D (OSM Buildings · requer Ion token)', active: buildings, set: setBuildings, icon: Building2 },
            { id: 'labels', title: 'Rótulos das câmeras', active: labels, set: setLabels, icon: Layers },
            { id: 'lighting', title: 'Iluminação solar (animada)', active: lighting, set: setLighting, icon: Sun },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => c.set(!c.active)}
                data-testid={`cesium-${c.id}`}
                title={c.title}
                aria-label={c.title}
                className={cn(
                  'w-8 h-8 flex items-center justify-center border-b border-border-dark last:border-b-0 transition-colors',
                  c.active
                    ? 'bg-primary text-white'
                    : 'text-muted-on-dark hover:bg-raised-dark hover:text-text-on-dark',
                )}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
