'use client';

/**
 * BuilderMap — superfície de DESENHO do Construtor de Camadas (o "My Maps" do
 * AEGIS). Mapbox GL 2D + `mapbox-gl-draw`: polígono, linha e ponto, com
 * arrastar de vértices e midpoints.
 *
 * É IRMÃO do `mapbox-map.tsx`, não uma extensão: aquele é um mapa de EXIBIÇÃO
 * genérico (markers/zonas/heatmap/cluster) reusado pelo /visitante e pelos
 * widgets; o desenho precisa de controle total das sources e dos eventos, e
 * misturar os dois incharia o componente compartilhado. Token e catálogo de
 * basemaps vêm de lá (fonte única).
 *
 * O globo Cesium do /geo NÃO é tocado — esta é a mesa de trabalho; o /geo
 * segue sendo a sala de situação que CONSOME o que foi publicado.
 */
import * as React from 'react';
import type MapboxDrawType from '@mapbox/mapbox-gl-draw';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

import { useMapboxToken } from '@/lib/config/runtime';
import type { FeatureRow } from '@/lib/geo/geojson-io';
import { useT } from '@/lib/i18n/provider';

import { STYLES } from './mapbox-map';

export type DrawMode =
  | 'simple_select'
  | 'draw_polygon'
  | 'draw_line_string'
  | 'draw_point';

export interface BuilderMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  view?: 'streets' | 'satellite' | 'dark' | 'light';
  /** Feições da camada ativa — o mapa é ESPELHO deste array (fonte da verdade
   *  fica no widget, que salva/publica). */
  features: FeatureRow[];
  selectedId?: string | null;
  mode?: DrawMode;
  /** Somente leitura (operador sem `security.geo.camada.manage`). */
  readOnly?: boolean;
  onModeChange?: (mode: DrawMode) => void;
  /** Feição nova desenhada — o pai gera o id e decide categoria/estilo. */
  onDrawCreate?: (geometry: GeoJSON.Geometry) => void;
  /** Geometria editada (arrastar vértice/feição). */
  onDrawUpdate?: (id: string, geometry: GeoJSON.Geometry) => void;
  onDrawDelete?: (ids: string[]) => void;
  onSelect?: (id: string | null) => void;
  className?: string;
}

const ACCENT = '#2D77BE';

/** Estilo do desenho no DS: cantos retos, azul-aço, SEM glow. Cada feição usa a
 *  cor do próprio `geo_style` (via `user_color`) e cai no acento quando não tem. */
const DRAW_STYLES = [
  {
    id: 'gl-draw-polygon-fill',
    type: 'fill',
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    paint: {
      'fill-color': ['coalesce', ['get', 'user_color'], ACCENT],
      'fill-opacity': ['case', ['==', ['get', 'active'], 'true'], 0.4, 0.22],
    },
  },
  {
    id: 'gl-draw-polygon-stroke',
    type: 'line',
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'butt', 'line-join': 'miter' },
    paint: {
      'line-color': ['coalesce', ['get', 'user_color'], ACCENT],
      'line-width': ['case', ['==', ['get', 'active'], 'true'], 3, 2],
    },
  },
  {
    id: 'gl-draw-line',
    type: 'line',
    filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
    layout: { 'line-cap': 'butt', 'line-join': 'miter' },
    paint: {
      'line-color': ['coalesce', ['get', 'user_color'], ACCENT],
      'line-width': ['case', ['==', ['get', 'active'], 'true'], 4, 3],
    },
  },
  // vértices e midpoints (quadrados — cantos retos, régua do DS)
  {
    id: 'gl-draw-polygon-and-line-vertex',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
    paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-stroke-width': 2, 'circle-stroke-color': ACCENT },
  },
  {
    id: 'gl-draw-polygon-midpoint',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: { 'circle-radius': 3, 'circle-color': ACCENT },
  },
  {
    id: 'gl-draw-point',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 8, 6],
      'circle-color': ['coalesce', ['get', 'user_color'], ACCENT],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#FFFFFF',
    },
  },
];

/** Linhas da camada → FeatureCollection do Draw (id = id da feição, e a cor
 *  viaja como `user_color` pro estilo pintar cada feição com a sua). */
function rowsToDrawFC(rows: FeatureRow[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      id: r.id,
      properties: { color: r.geo_style?.color || ACCENT },
      geometry: r.geometry,
    })) as GeoJSON.Feature[],
  };
}

export function BuilderMap({
  center,
  zoom = 13,
  view = 'streets',
  features,
  selectedId = null,
  mode = 'simple_select',
  readOnly = false,
  onModeChange,
  onDrawCreate,
  onDrawUpdate,
  onDrawDelete,
  onSelect,
  className,
}: BuilderMapProps) {
  const t = useT();
  // `null` = config de runtime ainda em voo (≠ "sem token"). Ver mapbox-map.
  const token = useMapboxToken();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<mapboxgl.Map | null>(null);
  const drawRef = React.useRef<MapboxDrawType | null>(null);
  const readyRef = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  // Callbacks por ref: os listeners do Draw são registrados UMA vez; sem isto
  // cada render recriaria o mapa (e o desenho em curso se perderia).
  const cbRef = React.useRef({ onDrawCreate, onDrawUpdate, onDrawDelete, onSelect, onModeChange });
  cbRef.current = { onDrawCreate, onDrawUpdate, onDrawDelete, onSelect, onModeChange };

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!token) return; // null (carregando) ou '' (ausente) — nos dois casos, não inicia
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[view] || STYLES.streets,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    // A lib de desenho é ESM-only e pesa ~57 KB: import DINÂMICO mantém o
    // bundle das outras telas enxuto e evita puxar a cadeia ESM no ambiente de
    // teste (que renderiza este componente mockado).
    let disposed = false;
    void (async () => {
      const { default: MapboxDraw } = await import('@mapbox/mapbox-gl-draw');
      if (disposed) return;
      setupDraw(MapboxDraw);
    })();

    function setupDraw(MapboxDraw: typeof MapboxDrawType) {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        // a paleta de ferramentas é NOSSA (DS) — o controle nativo fica fora
        controls: {},
        styles: DRAW_STYLES as unknown as object[],
        userProperties: true,
      });
      drawRef.current = draw;

      // O control do Draw precisa do estilo pronto. `map.on('load')` sozinho
      // NÃO basta: este código roda depois de um `await import(...)`, e o
      // mapbox-gl não reemite `load` — com o estilo em cache e o chunk frio
      // (recarregar a página), o listener chegaria tarde e o construtor
      // nasceria morto (mapa desenhado, ferramenta inexistente, zero erro).
      const iniciar = () => {
        if (disposed) return;
        map.addControl(draw as unknown as mapboxgl.IControl);
        draw.set(rowsToDrawFC(features));
        readyRef.current = true;
        setReady(true);
      };
      if (map.loaded()) iniciar();
      else map.once('load', iniciar);

      map.on('draw.create', (e: { features: GeoJSON.Feature[] }) => {
        for (const f of e.features) {
          // o id definitivo é do pai (contrato do dataset): remove o temporário
          if (f.id != null) draw.delete(String(f.id));
          if (f.geometry) cbRef.current.onDrawCreate?.(f.geometry);
        }
        cbRef.current.onModeChange?.('simple_select');
      });

      map.on('draw.update', (e: { features: GeoJSON.Feature[] }) => {
        for (const f of e.features) {
          if (f.id != null && f.geometry) cbRef.current.onDrawUpdate?.(String(f.id), f.geometry);
        }
      });

      map.on('draw.delete', (e: { features: GeoJSON.Feature[] }) => {
        const ids = e.features.map((f) => String(f.id)).filter(Boolean);
        if (ids.length) cbRef.current.onDrawDelete?.(ids);
      });

      map.on('draw.selectionchange', (e: { features: GeoJSON.Feature[] }) => {
        const first = e.features[0];
        cbRef.current.onSelect?.(first?.id != null ? String(first.id) : null);
      });
    }

    return () => {
      disposed = true;
      readyRef.current = false;
      setReady(false);
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // monta uma vez: center/zoom/view/features entram pelos efeitos abaixo.
    // `token` é dep porque a config de runtime chega DEPOIS do primeiro render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Basemap: troca de estilo derruba sources/controls → re-adiciona o Draw e
  // repõe o desenho (gotcha clássico do mapbox-gl-draw com GL v3).
  React.useEffect(() => {
    const map = mapRef.current;
    const draw = drawRef.current;
    if (!map || !draw || !readyRef.current) return;
    const target = STYLES[view] || STYLES.streets;
    if (!target || !map.isStyleLoaded()) return;
    // Guarda o desenho ANTES da troca (o setStyle derruba sources) e repõe
    // depois. Nada de sondar `getStyle().name`/`.sprite`: são opcionais na
    // spec, e um estilo sem eles tornava a troca um no-op silencioso.
    const saved = draw.getAll();
    map.setStyle(target);
    map.once('style.load', () => {
      try {
        map.addControl(draw as unknown as mapboxgl.IControl);
      } catch {
        /* o Draw sobrevive à troca em algumas versões — reanexar dá erro */
      }
      draw.set(saved);
    });
  }, [view]);

  // Espelha as feições do widget no Draw (import, apagar pela árvore, trocar
  // de camada).
  //
  // CUIDADO — dois modos NÃO podem sofrer re-sync:
  //  · durante um DESENHO em curso, o Draw guarda uma feição temporária que
  //    não está em `features`; um `draw.set` a APAGA e o gesto morre em
  //    silêncio (o operador clica vértices e nada aparece);
  //  · durante `direct_select` (arrastar vértice), o `set`+`changeMode`
  //    jogaria o operador pra fora da edição a cada arrasto.
  // A sincronização com o mapa só faz sentido quando ele está em repouso.
  React.useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !ready) return;
    const modoAtual = String(draw.getMode() || '');
    if (modoAtual.startsWith('draw_') || modoAtual === 'direct_select') return;
    draw.set(rowsToDrawFC(features));
    if (selectedId) {
      try {
        draw.changeMode('simple_select', { featureIds: [selectedId] });
      } catch {
        /* feição saiu da camada — seleção some, sem quebrar */
      }
    }
  }, [features, ready, selectedId]);

  // Modo de desenho vindo da paleta (o widget é dono do estado).
  // Sem permissão de gestão o mapa entra em `static`: `simple_select` ainda
  // deixaria ARRASTAR a feição inteira e entrar em edição de vértice por
  // duplo-clique — o viewer sujaria o desenho sem ter como salvar.
  React.useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !ready) return;
    const target = readOnly ? 'static' : mode;
    try {
      if (draw.getMode() !== target) draw.changeMode(target as never);
    } catch {
      /* modo inválido p/ o estado atual — mantém o anterior */
    }
  }, [mode, ready, readOnly]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({ center: [center.lng, center.lat], zoom, duration: 600 });
  }, [center.lat, center.lng, zoom, ready]);

  // Só anuncia "sem token" quando a config JÁ respondeu (token === ''). Enquanto
  // carrega, mantém o container montado — é nele que o efeito acima se prende.
  if (token === '') {
    return (
      <div
        data-testid="builder-map-sem-token"
        className="w-full h-full flex items-center justify-center border border-border-light bg-raised-light p-4 text-[12px] text-muted-on-light text-center"
      >
        {t('builder.map.noToken')}
      </div>
    );
  }

  return <div ref={containerRef} data-testid="builder-map" className={className} />;
}

export default BuilderMap;
