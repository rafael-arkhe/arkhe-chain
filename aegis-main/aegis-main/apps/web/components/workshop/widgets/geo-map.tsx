'use client';

/**
 * Geo Map — Sprint L16 (2026-05-23).
 *
 * Mapa Mercator simples renderizado em SVG puro — sem dependências
 * externas, sem CDN, sem Mapbox. Lê uma lista de markers da variable
 * `source` (formato esperado: array de `{lat, lng, label?, color?}`)
 * e plota cada um sobre um placeholder de "globo" estilizado.
 *
 * Não tenta ser mapa cartográfico — é "marker plot" sobre projeção
 * equirretangular minimal. Para mapas reais, use Cesium/Mapbox no
 * web-app principal; aqui é só pra dashboards estáticos.
 *
 * Config:
 *   - source: string         external_id da variable (array de pontos)
 *   - title?: string         título acima do mapa
 *   - height?: number        default 240
 *   - center?: [lng, lat]    centro padrão da projeção (default [-50, -15] BR)
 *   - zoom?: number          fator multiplicativo simples (default 1.0)
 */
import * as React from 'react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Marker = {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
};

type Cfg = {
  source?: string;
  title?: string;
  height?: number;
  center?: [number, number] | string;
  zoom?: number;
  /**
   * Modo de render dos pontos. 'pins' (default, retrocompat) plota
   * marcadores; 'heatmap' plota uma camada de DENSIDADE/calor (círculos
   * com opacidade proporcional ao nº de pontos próximos). Também aceita
   * o atalho booleano `heatmap: true`.
   */
  mode?: 'pins' | 'heatmap';
  heatmap?: boolean;
};

const DEFAULT_COLOR = 'var(--primary)';

function parseCenter(c: Cfg['center']): [number, number] {
  if (Array.isArray(c) && c.length === 2) {
    return [Number(c[0]) || 0, Number(c[1]) || 0];
  }
  if (typeof c === 'string') {
    try {
      const arr = JSON.parse(c);
      if (Array.isArray(arr) && arr.length === 2) {
        return [Number(arr[0]) || 0, Number(arr[1]) || 0];
      }
    } catch {
      // fall through
    }
  }
  return [-50, -15];
}

function pickMarkers(
  variables: Record<string, unknown>,
  source: string | undefined,
): Marker[] {
  if (!source) return [];
  const raw = variables[source];
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
      return ((raw as { rows: unknown[] }).rows as unknown[]).flatMap((r) =>
        toMarker(r) ? [toMarker(r) as Marker] : [],
      );
    }
    return [];
  }
  return (raw as unknown[]).flatMap((r) => (toMarker(r) ? [toMarker(r) as Marker] : []));
}

function toMarker(raw: unknown): Marker | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // Onda 5 (mapa-de-calor do síndico) — lat/lng no TOPO (retrocompat) OU, quando
  // a variável é um objectSet canônico (`{properties:{geopoint:{lat,lng}}}` /
  // `geo:{lat,lon}` legado), descendo em `properties` — mesmo validador que o
  // `map_live.asLatLng`. Sem isso, o heatmap sobre `desvios` (evento) via 0 ponto.
  const props =
    r.properties && typeof r.properties === 'object'
      ? (r.properties as Record<string, unknown>)
      : {};
  const gp =
    (props.geopoint && typeof props.geopoint === 'object'
      ? (props.geopoint as Record<string, unknown>)
      : undefined) ??
    (props.geo && typeof props.geo === 'object'
      ? (props.geo as Record<string, unknown>)
      : undefined);
  const lat = Number(r.lat ?? r.latitude ?? gp?.lat ?? gp?.latitude);
  const lng = Number(r.lng ?? r.lon ?? r.longitude ?? gp?.lng ?? gp?.lon ?? gp?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label =
    typeof r.label === 'string'
      ? r.label
      : typeof r.name === 'string'
        ? r.name
        : undefined;
  return {
    lat,
    lng,
    label,
    color: typeof r.color === 'string' ? r.color : undefined,
  };
}

/** Mercator simplificado — projeção equirretangular (lat-lng → x,y).
 *  Não usa log/tan da Mercator real porque queremos um plot legível
 *  até polos sem distorção extrema. */
function project(
  lng: number,
  lat: number,
  width: number,
  height: number,
  center: [number, number],
  zoom: number,
): { x: number; y: number } {
  const lngOffset = lng - center[0];
  const latOffset = lat - center[1];
  // lng range -180..180 → x range 0..width
  const x = width / 2 + (lngOffset / 180) * (width / 2) * zoom;
  // lat range -90..90 → y range 0..height (invertido pra norte = topo)
  const y = height / 2 - (latOffset / 90) * (height / 2) * zoom;
  return { x, y };
}

/**
 * Densidade por ponto — conta quantos outros markers caem dentro de um
 * raio (em px de tela) ao redor de cada um. Usado no modo heatmap pra
 * escalar opacidade/raio do "calor" sem dependência externa (Mapbox/GL).
 */
function computeDensity(
  pts: { x: number; y: number }[],
  radius: number,
): number[] {
  const r2 = radius * radius;
  return pts.map((p) => {
    let n = 0;
    for (const q of pts) {
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      if (dx * dx + dy * dy <= r2) n += 1;
    }
    return n; // inclui o próprio ponto → mínimo 1
  });
}

function GeoMap({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const markers = pickMarkers(variables, cfg.source);
  const height = cfg.height ?? 240;
  const width = 480; // viewBox-relative; rende sempre 100% via SVG scaling
  const center = parseCenter(cfg.center);
  const zoom = typeof cfg.zoom === 'number' && cfg.zoom > 0 ? cfg.zoom : 1.0;
  const isHeatmap = cfg.mode === 'heatmap' || cfg.heatmap === true;

  // Linhas de grade simples
  const gridLngs = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const gridLats = [-60, -30, 0, 30, 60];

  return (
    <div
      className="bg-white border border-border-light p-3 flex flex-col gap-2"
      data-testid="geo-map-widget"
    >
      {cfg.title && (
        <p className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
          {cfg.title}
        </p>
      )}
      <div
        data-testid="geo-map-canvas"
        className="relative bg-canvas-light border border-border-light overflow-hidden"
        style={{ height }}
      >
        <svg
          data-testid="geo-map-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height={height}
          style={{ display: 'block' }}
        >
          {/* Fundo "oceano" sutil */}
          <rect x={0} y={0} width={width} height={height} fill="#F8FAFC" />
          {/* Linhas de longitude */}
          <g data-testid="geo-map-grid" stroke="#E2E8F0" strokeWidth={0.5}>
            {gridLngs.map((lng) => {
              const { x } = project(lng, 0, width, height, center, zoom);
              return <line key={`lng-${lng}`} x1={x} y1={0} x2={x} y2={height} />;
            })}
            {gridLats.map((lat) => {
              const { y } = project(0, lat, width, height, center, zoom);
              return <line key={`lat-${lat}`} x1={0} y1={y} x2={width} y2={y} />;
            })}
          </g>
          {/* Equador + meridiano de Greenwich destacados */}
          <g stroke="#94A3B8" strokeWidth={0.8}>
            <line
              x1={0}
              x2={width}
              y1={project(0, 0, width, height, center, zoom).y}
              y2={project(0, 0, width, height, center, zoom).y}
              data-testid="geo-map-equator"
            />
            <line
              x1={project(0, 0, width, height, center, zoom).x}
              x2={project(0, 0, width, height, center, zoom).x}
              y1={0}
              y2={height}
            />
          </g>
          {/* Camada de densidade (heatmap) OU markers (pins, default) */}
          {isHeatmap ? (
            (() => {
              const pts = markers.map((m) =>
                project(m.lng, m.lat, width, height, center, zoom),
              );
              const RADIUS = 22; // px de aglomeração
              const density = computeDensity(pts, RADIUS);
              const maxD = density.reduce((a, b) => Math.max(a, b), 1);
              return (
                <g data-testid="geo-map-heatmap">
                  {pts.map((p, i) => {
                    // intensidade 0..1 pela densidade local
                    const t = density[i] / maxD;
                    return (
                      <circle
                        key={`h-${i}`}
                        data-testid={`geo-map-heat-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={RADIUS * (0.55 + 0.45 * t)}
                        fill={DEFAULT_COLOR}
                        opacity={0.12 + 0.5 * t}
                        style={{ mixBlendMode: 'multiply' }}
                      />
                    );
                  })}
                </g>
              );
            })()
          ) : (
            <g data-testid="geo-map-markers">
              {markers.map((m, i) => {
                const { x, y } = project(m.lng, m.lat, width, height, center, zoom);
                const color = m.color ?? DEFAULT_COLOR;
                return (
                  <g key={`m-${i}`} data-testid={`geo-map-marker-${i}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={5}
                      fill={color}
                      stroke="#0F172A"
                      strokeWidth={0.8}
                    />
                    {m.label && (
                      <text
                        x={x + 7}
                        y={y + 3}
                        fontSize={9}
                        fill="#1E293B"
                        fontFamily="ui-monospace, monospace"
                      >
                        {m.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        {markers.length === 0 && (
          <div
            data-testid="geo-map-empty"
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <p className="text-[11px] font-mono text-muted-on-light italic">
              Sem coordenadas para plotar.
            </p>
          </div>
        )}
      </div>
      <p
        data-testid="geo-map-count"
        className="text-[10px] font-mono text-muted-on-light"
      >
        {markers.length} {markers.length === 1 ? 'marcador' : 'marcadores'}
      </p>
    </div>
  );
}

registerWidget('geo_map', GeoMap, {
  group: 'viz',
  label: 'Mapa geográfico',
  description:
    'Projeção Mercator simples com markers — usa lat/lng vindos de uma variable.',
  icon: 'map',
  defaultColSpan: 6,
  mockConfig: {
    source: 'pontos',
    title: 'Ocorrências por bairro',
    height: 240,
    center: [-50, -15],
    zoom: 4,
  },
  mockVariables: {
    pontos: [
      { lat: -23.55, lng: -46.63, label: 'SP', color: '#7C3AED' },
      { lat: -22.91, lng: -43.21, label: 'RJ', color: '#2D77BE' },
      { lat: -15.79, lng: -47.93, label: 'BSB', color: '#0D9488' },
      { lat: -25.43, lng: -49.27, label: 'CWB' },
    ],
  },
  config_schema: [
    {
      name: 'source',
      label: 'Dado de pontos',
      description: 'Variable que devolve array de {lat, lng, label?, color?}.',
      field: 'variable-ref',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima do mapa.',
      field: 'string',
      placeholder: 'ex.: Ocorrências por bairro',
    },
    {
      name: 'height',
      label: 'Altura (px)',
      description: 'Altura em pixels do canvas do mapa.',
      field: 'number',
      min: 120,
      max: 800,
      step: 20,
      default: 240,
    },
    {
      name: 'zoom',
      label: 'Zoom',
      description: 'Fator multiplicativo simples (1 = mundo inteiro, 4 = país).',
      field: 'number',
      min: 0.5,
      max: 10,
      step: 0.5,
      default: 1,
    },
    {
      name: 'mode',
      label: 'Modo de visualização',
      description:
        'Marcadores plota um pino por ponto; Densidade plota uma camada de calor proporcional à concentração de pontos.',
      field: 'select',
      options: [
        { value: 'pins', label: 'Marcadores' },
        { value: 'heatmap', label: 'Densidade (calor)' },
      ],
      default: 'pins',
    },
  ],
});

export { GeoMap };
