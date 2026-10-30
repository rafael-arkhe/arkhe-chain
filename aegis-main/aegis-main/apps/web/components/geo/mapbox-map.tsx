'use client';

/**
 * MapboxMap — componente de mapa 2D genérico e reutilizável (M2, 2026-05-25).
 *
 * Pacote novo, modular: `mapbox-gl` (mesma versão de web-app/politicians-app).
 * NÃO é acoplado a domínio nenhum — recebe marcadores/rotas/zonas em convenção
 * AEGIS (lat,lng, igual `aegis.maps`) e converte pra [lng,lat] do Mapbox por
 * dentro. É o par 2D do globo Cesium: a página do visitante reusa este; futuros
 * widgets/painéis também.
 *
 * F1.2 (2026-08-02): o token deixou de ser a constante de módulo `TOKEN`
 * (lida de `NEXT_PUBLIC_MAPBOX_TOKEN` no load, o que o Next inlina no bundle e
 * amarrava um build por cliente) e passou a vir do `useMapboxToken()`, que lê
 * a config de runtime. Quem precisar do token faz o mesmo — não há mais uma
 * constante para importar.
 */
import * as React from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { useT } from '@/lib/i18n/provider';
import { useMapboxToken } from '@/lib/config/runtime';

// Exportado (ADITIVO) p/ o `builder-map` (Construtor de Camadas) reusar o MESMO
// catálogo de basemaps — sem duplicar configuração.
export const STYLES: Record<string, string> = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
};

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  popupHtml?: string;
  pulse?: boolean;
  /** Peso no heatmap (critério de densidade). Default 1. */
  weight?: number;
}
export interface MapZone {
  id: string;
  ring: [number, number][]; // [lat, lng] (anel do polígono — fecha sozinho)
  color?: string;
}
export interface MapRoute {
  id: string;
  path: [number, number][]; // [lat, lng]
  color?: string;
  width?: number;
  /** Relações§ (ADITIVO): label da linha — aparece em popup no HOVER.
   *  Ausente/vazio = comportamento original (linha muda), retrocompat. */
  label?: string;
}
export interface MapboxMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  view?: 'streets' | 'satellite' | 'dark' | 'light';
  markers?: MapMarker[];
  zones?: MapZone[];
  routes?: MapRoute[];
  className?: string;
  onReady?: () => void;
  /** V2 visão§: marcador clicável — popup vira HOVER e o click seleciona.
   *  Ausente = comportamento M2 (popup no click), retrocompat total. */
  onMarkerClick?: (id: string, marker: MapMarker) => void;
  /** V3 (B4): polígono clicável — hover realça (feature-state) e o click
   *  seleciona a instância dona do polígono. Ausente = polígonos estáticos. */
  onZoneClick?: (id: string) => void;
  /** F3: agregação nativa (clustering). Quando true, os `markers` viram um
   *  source GeoJSON com `cluster:true` (bolhas com contagem que expandem ao
   *  clicar) em vez de N markers DOM — escala pra milhares de pontos. Click
   *  num ponto individual ainda dispara `onMarkerClick`. Default false
   *  (retrocompat: markers DOM como antes). */
  cluster?: boolean;
  /** Onda 4 (picker de localização): clique no CANVAS do mapa → (lat, lng) na
   *  convenção AEGIS. ADITIVO — ausente, nenhum listener extra é registrado
   *  (retrocompat total com /geo e widgets). Markers DOM já fazem
   *  stopPropagation, então clicar num marker NÃO dispara este callback. */
  onMapClick?: (lat: number, lng: number) => void;
  /** Densidade: renderiza uma camada `heatmap` (blur de concentração) sobre os
   *  mesmos pontos. Combina com `cluster` (heatmap embaixo, bolhas em cima) —
   *  ideal pra "ONDE a demanda se concentra". Default false. */
  heatmap?: boolean;
  /** Ícone (nome maki do sprite do estilo, ex.: 'town-hall','marker','circle') plotado
   *  sobre os pontos individuais + no topo das bolhas de cluster — IDENTIFICA o que o
   *  ponto representa. Vazio = só o círculo colorido. */
  icon?: string;
}

const ll = (p: [number, number]): [number, number] => [p[1], p[0]]; // [lat,lng] -> [lng,lat]

function zonesFC(zones: MapZone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      // V3 (B4): id na PROPERTY (promoteId) — habilita feature-state (hover)
      // e o click devolver a instância dona do polígono.
      properties: { color: z.color || '#2563eb', id: z.id },
      geometry: { type: 'Polygon', coordinates: [z.ring.map(ll)] },
    })),
  };
}
function routesFC(routes: MapRoute[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      properties: { color: r.color || '#2563eb', width: r.width || 5, label: r.label || '' },
      geometry: { type: 'LineString', coordinates: r.path.map(ll) },
    })),
  };
}
// F3: pontos como FeatureCollection p/ o modo CLUSTER (agregação nativa do
// Mapbox). Sem isso, N pontos = N markers DOM → trava com centenas/milhares.
function markersFC(markers: MapMarker[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature',
      properties: { id: m.id, color: m.color || '#2563eb', popupHtml: m.popupHtml || '', weight: m.weight ?? 1 },
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
    })),
  };
}

export function MapboxMap({
  center, zoom = 15, view = 'streets', markers = [], zones = [], routes = [], className, onReady,
  onMarkerClick, onZoneClick, cluster = false, onMapClick, heatmap = false, icon = '',
}: MapboxMapProps) {
  const t = useT();
  // `null` enquanto a config de runtime não chegou: NÃO é "sem token" — anunciar
  // token ausente antes da resposta faria a tela piscar erro em todo boot.
  const token = useMapboxToken();
  const clusterRef = React.useRef(cluster);
  // F3: mantém o ref do cluster em dia (defensivo; o widget também remonta via key).
  React.useEffect(() => { clusterRef.current = cluster; }, [cluster]);
  const heatmapRef = React.useRef(heatmap);
  React.useEffect(() => { heatmapRef.current = heatmap; }, [heatmap]);
  const iconRef = React.useRef(icon);
  React.useEffect(() => { iconRef.current = icon; }, [icon]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<mapboxgl.Map | null>(null);
  const markersRef = React.useRef<Record<string, mapboxgl.Marker>>({});
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Callback em ref: os listeners dos marcadores são criados UMA vez (diff por
  // id) — lendo da ref, a identidade do callback pode mudar sem recriar nada.
  const onMarkerClickRef = React.useRef<MapboxMapProps['onMarkerClick']>(onMarkerClick);
  React.useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);
  // Dados do marcador em ref p/ o listener entregar o objeto ATUAL no click.
  const markerDataRef = React.useRef<Record<string, MapMarker>>({});
  const onZoneClickRef = React.useRef<MapboxMapProps['onZoneClick']>(onZoneClick);
  React.useEffect(() => { onZoneClickRef.current = onZoneClick; }, [onZoneClick]);
  const hoveredZoneRef = React.useRef<string | number | null>(null);
  // Onda 4: callback do click genérico em ref — listener registrado UMA vez
  // no init; a identidade do callback pode mudar sem recriar o mapa.
  const onMapClickRef = React.useRef<MapboxMapProps['onMapClick']>(onMapClick);
  React.useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // init once (re-dispara quando o token de runtime chega)
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (token === null) return; // config ainda em voo
    if (!token) {
      setError(t('mapbox.tokenMissing'));
      return;
    }
    mapboxgl.accessToken = token;
    try {
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLES[view] || STYLES.streets,
        center: [center.lng, center.lat],
        zoom,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('load', () => {
        // Sala de situação: nos basemaps ESCURO/CLARO, recua rótulos e vias pra o DADO
        // (heatmap/pontos) dominar. Genérico por tipo/id de camada (degrada se o estilo mudar).
        if (view === 'dark' || view === 'light') {
          for (const lyr of map.getStyle().layers || []) {
            try {
              if (lyr.type === 'symbol') map.setPaintProperty(lyr.id, 'text-opacity', 0.5);
              else if (lyr.type === 'line' && /road|street|bridge|tunnel|transit/i.test(lyr.id))
                map.setPaintProperty(lyr.id, 'line-opacity', 0.45);
            } catch { /* camada sem essa prop no estilo atual — ignora */ }
          }
        }
        map.addSource('aegis-zones', { type: 'geojson', data: zonesFC(zones), promoteId: 'id' });
        map.addLayer({ id: 'aegis-zones-fill', type: 'fill', source: 'aegis-zones',
          paint: {
            'fill-color': ['get', 'color'],
            // V3 (B4): hover via feature-state realça o polígono sob o cursor.
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.32, 0.12],
          } });
        map.addLayer({ id: 'aegis-zones-line', type: 'line', source: 'aegis-zones',
          paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });

        // V3 (B4) — interação por POLÍGONO (lê das refs: registra uma vez).
        map.on('mousemove', 'aegis-zones-fill', (e) => {
          if (!onZoneClickRef.current) return;
          const f = e.features?.[0];
          if (!f || f.id == null) return;
          if (hoveredZoneRef.current != null && hoveredZoneRef.current !== f.id) {
            map.setFeatureState({ source: 'aegis-zones', id: hoveredZoneRef.current }, { hover: false });
          }
          hoveredZoneRef.current = f.id;
          map.setFeatureState({ source: 'aegis-zones', id: f.id }, { hover: true });
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'aegis-zones-fill', () => {
          if (hoveredZoneRef.current != null) {
            map.setFeatureState({ source: 'aegis-zones', id: hoveredZoneRef.current }, { hover: false });
            hoveredZoneRef.current = null;
          }
          map.getCanvas().style.cursor = '';
        });
        map.on('click', 'aegis-zones-fill', (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id != null) onZoneClickRef.current?.(String(id));
        });
        map.addSource('aegis-routes', { type: 'geojson', data: routesFC(routes) });
        map.addLayer({ id: 'aegis-routes-line', type: 'line', source: 'aegis-routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] } });
        // Relações§ — hover numa linha COM label → popup discreto com o nome
        // da relação. Linha sem label (rotas M2) segue muda: retrocompat.
        const routePopup = new mapboxgl.Popup({ closeButton: false, offset: 8 });
        map.on('mousemove', 'aegis-routes-line', (e) => {
          const lbl = e.features?.[0]?.properties?.label;
          if (lbl) {
            map.getCanvas().style.cursor = 'default';
            routePopup.setLngLat(e.lngLat).setText(String(lbl)).addTo(map);
          }
        });
        map.on('mouseleave', 'aegis-routes-line', () => {
          routePopup.remove();
          map.getCanvas().style.cursor = '';
        });

        // Densidade — camada `heatmap` (blur de concentração). Source próprio,
        // SEM cluster (o heatmap quer pontos crus). Renderiza EMBAIXO das bolhas
        // de cluster (add antes). Rampa azul-aço→laranja→vermelho (sem amarelo).
        // Cria SEM guard de markers.length — os pontos chegam async (object set) DEPOIS
        // do load; o efeito de markers realimenta o source. Com guard, um load com
        // markers=[] nunca criava a camada e o calor não aparecia.
        if (heatmapRef.current) {
          map.addSource('aegis-heat', { type: 'geojson', data: markersFC(markers) });
          map.addLayer({
            id: 'aegis-heat', type: 'heatmap', source: 'aegis-heat',
            paint: {
              // CRITÉRIO: peso POR PONTO (properties.weight) — o que não é crítico entra
              // fraco (ex.: homenagens ~0.08), o que importa entra cheio. Default 1.
              'heatmap-weight': ['coalesce', ['get', 'weight'], 1],
              // Intensidade/raio CONTIDOS: mancha só onde CONCENTRA de verdade, não cobre a
              // cidade toda (feedback do dono). Hotspots discretos, não blanket.
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 0.9, 16, 1.4],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 18, 16, 28],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.72, 16, 0.45],
              // Rampa CALIBRADA p/ contraste TONAL entre níveis: azul profundo (baixa) →
              // ciano (média) → laranja (alta) → vermelho profundo (pico). Saltos de
              // matiz/luminância distintos — dá pra LER a diferença de densidade. Sem amarelo.
              'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.12, 'rgba(22,70,138,0.5)',
                0.34, 'rgba(30,152,188,0.72)',
                0.56, 'rgba(232,132,40,0.85)',
                0.8, 'rgba(210,66,34,0.92)',
                1, 'rgba(158,20,14,0.97)'],
            },
          });
        }

        // F3 — agregação nativa (clustering). Só monta quando o consumidor opta.
        if (clusterRef.current) {
          map.addSource('aegis-points', {
            type: 'geojson', data: markersFC(markers),
            cluster: true, clusterRadius: 50, clusterMaxZoom: 14,
          });
          map.addLayer({
            id: 'aegis-clusters', type: 'circle', source: 'aegis-points',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': ['step', ['get', 'point_count'], '#2D77BE', 20, '#E97D2A', 100, '#C8341F'],
              'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 24],
              'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
            },
          });
          map.addLayer({
            id: 'aegis-cluster-count', type: 'symbol', source: 'aegis-points',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 11,
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              // Ícone IDENTIFICADOR acima da contagem (quando o widget declara um).
              ...(iconRef.current
                ? { 'icon-image': iconRef.current, 'icon-size': 0.7, 'icon-anchor': 'bottom',
                    'icon-offset': [0, -9], 'icon-allow-overlap': true, 'text-offset': [0, 0.5] }
                : {}),
            },
            paint: { 'text-color': '#ffffff' },
          });
          map.addLayer({
            id: 'aegis-unclustered', type: 'circle', source: 'aegis-points',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': ['get', 'color'], 'circle-radius': 6,
              'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
            },
          });
          // Ícone no ponto INDIVIDUAL (identifica a demanda ao dar zoom).
          if (iconRef.current) {
            map.addLayer({
              id: 'aegis-unclustered-icon', type: 'symbol', source: 'aegis-points',
              filter: ['!', ['has', 'point_count']],
              layout: { 'icon-image': iconRef.current, 'icon-size': 0.75, 'icon-allow-overlap': true },
            });
          }
          // Click num cluster → expande (zoom até separar os pontos).
          map.on('click', 'aegis-clusters', (e) => {
            const f = map.queryRenderedFeatures(e.point, { layers: ['aegis-clusters'] })[0];
            const cid = f?.properties?.cluster_id;
            const src = map.getSource('aegis-points') as mapboxgl.GeoJSONSource | undefined;
            if (cid == null || !src) return;
            src.getClusterExpansionZoom(cid, (err, z) => {
              if (err || z == null) return;
              map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z });
            });
          });
          // Click num ponto individual → popup + onMarkerClick (seleção).
          map.on('click', 'aegis-unclustered', (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const id = f.properties?.id != null ? String(f.properties.id) : '';
            const html = f.properties?.popupHtml ? String(f.properties.popupHtml) : '';
            const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
            if (html) {
              new mapboxgl.Popup({ offset: 12, closeButton: false })
                .setLngLat(coords).setHTML(html).addTo(map);
            }
            if (id && onMarkerClickRef.current) {
              onMarkerClickRef.current(
                id,
                markerDataRef.current[id] ?? {
                  id, lat: coords[1], lng: coords[0],
                  color: typeof f.properties?.color === 'string' ? f.properties.color : undefined,
                  popupHtml: html || undefined,
                },
              );
            }
          });
          for (const lyr of ['aegis-clusters', 'aegis-unclustered']) {
            map.on('mouseenter', lyr, () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', lyr, () => { map.getCanvas().style.cursor = ''; });
          }
        }
        setReady(true);
        map.resize();
        onReady?.();
      });
      map.on('error', (e) => {
        const m = (e as { error?: { message?: string } }).error?.message || '';
        if (m && !m.includes('already')) setError(m);
      });
      // Onda 4 — click genérico no canvas → (lat, lng). Lê da ref (registrado
      // uma vez); inerte quando o consumidor não passa a prop.
      map.on('click', (e) => {
        onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng);
      });
      mapRef.current = map;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      try { mapRef.current?.remove(); } catch { /* noop */ }
      mapRef.current = null;
    };
    // `token` é a ÚNICA dep: o efeito guarda-se com `mapRef.current` e roda de
    // fato uma vez só — mas precisa re-disparar quando a config de runtime chega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // update vector data
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('aegis-zones') as mapboxgl.GeoJSONSource | undefined)?.setData(zonesFC(zones));
    (map.getSource('aegis-routes') as mapboxgl.GeoJSONSource | undefined)?.setData(routesFC(routes));
  }, [ready, zones, routes]);

  // diff markers by id
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // Heatmap (independe do modo cluster): realimenta a densidade quando os pontos
    // chegam async. Sem isto, o source nasce vazio no load e o calor nunca aparece.
    if (heatmapRef.current) {
      (map.getSource('aegis-heat') as mapboxgl.GeoJSONSource | undefined)?.setData(
        markersFC(markers),
      );
    }
    // F3 — modo cluster: alimenta o source GeoJSON (sem markers DOM).
    if (clusterRef.current) {
      for (const m of markers) markerDataRef.current[m.id] = m;
      (map.getSource('aegis-points') as mapboxgl.GeoJSONSource | undefined)?.setData(
        markersFC(markers),
      );
      return;
    }
    const interactive = Boolean(onMarkerClickRef.current);
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      markerDataRef.current[m.id] = m;
      const el = markersRef.current[m.id];
      if (el) {
        el.setLngLat([m.lng, m.lat]);
        // popup pode mudar (properties editadas) — atualiza o HTML in-place.
        if (m.popupHtml) el.getPopup()?.setHTML(m.popupHtml);
      } else {
        const dot = document.createElement('div');
        dot.style.cssText = `width:16px;height:16px;border:2px solid #fff;background:${m.color || '#2563eb'};box-shadow:0 0 0 2px rgba(0,0,0,.25);${interactive ? 'cursor:pointer;' : ''}`;
        if (m.pulse) dot.className = 'aegis-map-pulse';
        dot.setAttribute('data-testid', `map-marker-${m.id}`);
        const mk = new mapboxgl.Marker({ element: dot }).setLngLat([m.lng, m.lat]);
        if (m.popupHtml) mk.setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(m.popupHtml));
        if (interactive) {
          // V2: popup vira HOVER; o CLICK seleciona (emite pro grafo de
          // variáveis — edição/remoção abre via overlay do app).
          dot.addEventListener('mouseenter', () => { if (!mk.getPopup()?.isOpen()) mk.togglePopup(); });
          dot.addEventListener('mouseleave', () => { if (mk.getPopup()?.isOpen()) mk.togglePopup(); });
          dot.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const cur = markerDataRef.current[m.id];
            onMarkerClickRef.current?.(m.id, cur || m);
          });
        }
        mk.addTo(map);
        markersRef.current[m.id] = mk;
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
        delete markerDataRef.current[id];
      }
    }
  }, [ready, markers]);

  // keep camera following the explicit center prop
  React.useEffect(() => {
    if (mapRef.current && ready) mapRef.current.easeTo({ center: [center.lng, center.lat], duration: 600 });
  }, [ready, center.lat, center.lng]);

  if (error) {
    return (
      <div className={className} data-testid="mapbox-error"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0c', color: '#9ca3af', fontSize: 12 }}>
        {t('mapbox.unavailable')}: {error}
      </div>
    );
  }
  return (
    <>
      <style>{`.aegis-map-pulse{border-radius:9999px;animation:aegisPulse 1.6s ease-out infinite}@keyframes aegisPulse{0%{box-shadow:0 0 0 0 rgba(37,99,235,.5)}100%{box-shadow:0 0 0 18px rgba(37,99,235,0)}}`}</style>
      <div ref={containerRef} className={className} data-testid="mapbox-map" style={{ width: '100%', height: '100%' }} />
    </>
  );
}
