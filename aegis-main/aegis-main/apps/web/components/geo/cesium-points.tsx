'use client';

/**
 * CesiumPoints — globo 3D GENÉRICO (V2 visão→georref→mapa).
 *
 * Esqueleto reutilizável extraído do cesium-globe.tsx, SEM nenhuma categoria
 * de domínio (zero CCTV/pins demo/detecções). Recebe pontos {id,lat,lng,label,
 * color} e um callback de click — é o par 3D do MapboxMap. O par de domínio
 * (cesium-globe) continua intacto; este nasce neutro p/ o widget globe_live.
 *
 * Build: reusa o symlink public/cesium + DefinePlugin CESIUM_BASE_URL='/cesium'
 * + token ION (config de runtime, opcional). Carregado via dynamic
 * import (ssr:false) pelos consumidores.
 */
import * as React from 'react';

import { carregarConfig } from '@/lib/config/runtime';
import { useT } from '@/lib/i18n/provider';

export interface GlobePoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

/** Relações§ — linha discreta entre pontos (par 3D do MapRoute.label):
 *  `path` em [lat,lng] (convenção AEGIS), `label` vira texto no ponto médio. */
export interface GlobeLine {
  id: string;
  path: [number, number][];
  color?: string;
  label?: string;
}

export interface CesiumPointsProps {
  points: GlobePoint[];
  /** Relações§ (ADITIVO): polylines discretas entre pontos — ausente =
   *  comportamento original, retrocompat total. */
  lines?: GlobeLine[];
  className?: string;
  /** Centraliza/enquadra os pontos automaticamente quando muda. */
  followPoints?: boolean;
  onPointClick?: (id: string) => void;
  /** F3: agregação (clustering) no globo — bolhas com contagem que se
   *  separam ao aproximar. Default false (1 entidade por ponto). */
  cluster?: boolean;
  /** Paridade dual-surface (picker 2D/3D): clique em GLOBO VAZIO → (lat, lng)
   *  em graus, MESMA convenção do MapboxMap.onMapClick. Prioridade: se o
   *  clique PEGA uma entity (scene.pick), dispara só onPointClick — onMapClick
   *  NÃO é chamado. ADITIVO: prop ausente = zero mudança de comportamento
   *  (retrocompat total com /geo e widgets). */
  onMapClick?: (lat: number, lng: number) => void;
}

type AnyCesium = typeof import('cesium');
type AnyViewer = import('cesium').Viewer;
type AnyDataSource = import('cesium').CustomDataSource;

export function CesiumPoints({
  points, lines = [], className, followPoints = true, onPointClick, cluster = false, onMapClick,
}: CesiumPointsProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<AnyViewer | null>(null);
  const cesiumRef = React.useRef<AnyCesium | null>(null);
  const dsRef = React.useRef<AnyDataSource | null>(null);
  const clusterRef = React.useRef(cluster);
  React.useEffect(() => { clusterRef.current = cluster; }, [cluster]);
  const onClickRef = React.useRef<CesiumPointsProps['onPointClick']>(onPointClick);
  // Picker dual-surface: callback do clique em globo vazio em ref — o handler
  // de input é registrado UMA vez no init; a identidade pode mudar à vontade.
  const onMapClickRef = React.useRef<CesiumPointsProps['onMapClick']>(onMapClick);
  const t = useT();
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { onClickRef.current = onPointClick; }, [onPointClick]);
  React.useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // init once
  React.useEffect(() => {
    let cancelled = false;
    let viewer: AnyViewer | null = null;
    if (typeof window !== 'undefined') window.CESIUM_BASE_URL = '/cesium';

    (async () => {
      try {
        const Cesium = await import('cesium');
        await import('cesium/Build/Cesium/Widgets/widgets.css');
        cesiumRef.current = Cesium;
        if (cancelled || !containerRef.current) return;

        // F1.2: token de runtime (/api/config), não mais inlinado no bundle.
        const { cesiumIonToken } = await carregarConfig();
        if (cancelled) return;
        if (cesiumIonToken) Cesium.Ion.defaultAccessToken = cesiumIonToken;

        const v = new Cesium.Viewer(containerRef.current, {
          animation: false, baseLayerPicker: false, fullscreenButton: false,
          geocoder: false, homeButton: false, infoBox: false,
          sceneModePicker: false, selectionIndicator: false, timeline: false,
          navigationHelpButton: false, navigationInstructionsInitiallyVisible: false,
          scene3DOnly: true, shouldAnimate: true,
        });
        viewerRef.current = v;
        viewer = v;

        // Globo leve (sem terrain/atmosfera/sol — foco nos pontos).
        v.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a0e14');
        v.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0e14');
        if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = false;
        v.scene.fog.enabled = false;
        v.scene.globe.showGroundAtmosphere = false;
        v.scene.globe.enableLighting = false;
        if (v.scene.moon) v.scene.moon.show = false;
        if (v.scene.sun) v.scene.sun.show = false;
        if (v.scene.skyBox) v.scene.skyBox.show = false;
        (v.cesiumWidget.creditContainer as HTMLElement).setAttribute('style', 'display:none');

        // F3 — clustering: pontos vão num CustomDataSource com clustering
        // ligado (entidades do viewer default NÃO clusterizam).
        if (clusterRef.current) {
          const ds = new Cesium.CustomDataSource('aegis-points');
          ds.clustering.enabled = true;
          ds.clustering.pixelRange = 40;
          ds.clustering.minimumClusterSize = 3;
          ds.clustering.clusterEvent.addEventListener((entities, clu) => {
            const n = entities.length;
            clu.billboard.show = false;
            clu.point.show = true;
            clu.point.pixelSize = n >= 100 ? 26 : n >= 20 ? 20 : 16;
            clu.point.color = Cesium.Color.fromCssColorString(
              n >= 100 ? '#DC2626' : n >= 20 ? '#F59E0B' : '#2D77BE',
            );
            clu.point.outlineColor = Cesium.Color.WHITE;
            clu.point.outlineWidth = 2;
            clu.label.show = true;
            clu.label.text = String(n);
            clu.label.font = 'bold 12px "JetBrains Mono", monospace';
            clu.label.fillColor = Cesium.Color.WHITE;
            clu.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            clu.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            clu.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
          });
          v.dataSources.add(ds);
          dsRef.current = ds;
        }

        // Picking: click numa entity → onPointClick(id). Entity tem PRIORIDADE
        // sobre o clique de globo — quando pega, onMapClick NÃO dispara.
        const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
        handler.setInputAction((evt: import('cesium').ScreenSpaceEventHandler.PositionedEvent) => {
          const picked = v.scene.pick(evt.position);
          const pid = (picked?.id?.id) as string | undefined;
          if (pid) {
            onClickRef.current?.(pid);
            return;
          }
          // Globo vazio → (lat, lng) graus, convenção AEGIS (par do Mapbox).
          // pickEllipsoid primeiro; fallback globe.pick(ray) (terreno ativo).
          if (!onMapClickRef.current) return;
          let cart = v.camera.pickEllipsoid(evt.position, v.scene.globe.ellipsoid);
          if (!cart) {
            const ray = v.camera.getPickRay(evt.position);
            if (ray) cart = v.scene.globe.pick(ray, v.scene);
          }
          if (!cart) return;
          const carto = Cesium.Cartographic.fromCartesian(cart);
          onMapClickRef.current?.(
            Cesium.Math.toDegrees(carto.latitude),
            Cesium.Math.toDegrees(carto.longitude),
          );
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      const v = viewer || viewerRef.current;
      // F3: remove explicitamente o dataSource clusterizado antes de destruir
      // (cleanup explícito; destroy() já cobre, mas evita leak em remount rápido).
      try {
        if (v && !v.isDestroyed() && dsRef.current) v.dataSources.remove(dsRef.current, true);
      } catch { /* noop */ }
      dsRef.current = null;
      try { if (v && !v.isDestroyed()) v.destroy(); } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, []);

  // diff pontos por id (entities) + enquadra
  React.useEffect(() => {
    const v = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!v || !Cesium || !ready) return;
    // F3: alvo = dataSource clusterizado quando ligado; senão entities default.
    const target = clusterRef.current && dsRef.current ? dsRef.current.entities : v.entities;
    target.removeAll();
    for (const p of points) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      target.add({
        id: p.id,
        position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString(p.color || '#2563eb'),
          outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: p.label ? {
          text: p.label,
          font: '11px "JetBrains Mono", monospace',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#0a0e14cc'),
          pixelOffset: new Cesium.Cartesian2(0, -18),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
      });
    }
    // Relações§ — polylines discretas entre pontos + label no ponto médio.
    // Mesmo target (removeAll acima já limpou); ids prefixados evitam colisão.
    for (const l of lines) {
      const pts = l.path.filter(
        (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]),
      );
      if (pts.length < 2) continue;
      const midLat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const midLng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      target.add({
        id: `line-${l.id}`,
        position: Cesium.Cartesian3.fromDegrees(midLng, midLat),
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(
            pts.flatMap((p) => [p[1], p[0]]),
          ),
          width: 2,
          material: Cesium.Color.fromCssColorString(l.color || '#6B7280').withAlpha(0.85),
          clampToGround: true,
        },
        label: l.label ? {
          text: l.label,
          font: '10px "JetBrains Mono", monospace',
          fillColor: Cesium.Color.fromCssColorString('#d1d5db'),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#0a0e14cc'),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
      });
    }
    if (followPoints && points.length) {
      const flyTarget = clusterRef.current && dsRef.current ? dsRef.current : v.entities;
      v.flyTo(flyTarget, { duration: 0.8 }).catch(() => undefined);
    }
  }, [ready, points, lines, followPoints]);

  if (error) {
    return (
      <div className={className} data-testid="cesium-error"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e14', color: '#9ca3af', fontSize: 12 }}>
        {t('cesium.unavailable')}: {error}
      </div>
    );
  }
  return <div ref={containerRef} className={className} data-testid="cesium-points" style={{ width: '100%', height: '100%' }} />;
}
