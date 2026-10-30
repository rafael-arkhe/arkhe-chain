'use client';

/**
 * Time Axis — Sprint L7 (2026-05-23).
 *
 * Eixo temporal horizontal com markers + ticks + zoom in/out + scroll.
 * Pesquisa R2 Slate · widgets/time.md. Diferente do `timeline` (lista
 * vertical de eventos), o time-axis é uma régua horizontal que mostra
 * marcos contra um range temporal — útil para visualizar densidade de
 * eventos, períodos de operação, janelas críticas.
 *
 * Config:
 *   - source: string         external_id da variable (array de eventos)
 *   - timestamp_key: string  default 'timestamp'
 *   - label_key?: string     default 'label'
 *   - range_start?: string   ISO; default = min do array
 *   - range_end?: string     ISO; default = max do array
 *   - height?: number        px, default 80
 */
import * as React from 'react';
import { ZoomIn, ZoomOut, Move } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { getField } from './_row';

type Cfg = {
  source?: string;
  timestamp_key?: string;
  label_key?: string;
  range_start?: string;
  range_end?: string;
  height?: number;
};

type Marker = { ts: number; label: string };

function pickEvents(
  variables: Record<string, unknown>,
  source: string | undefined,
  tsKey: string,
  labelKey: string,
): Marker[] {
  if (!source) return [];
  const v = variables[source];
  if (!Array.isArray(v)) return [];
  const out: Marker[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const raw = getField(o, tsKey);
    if (raw == null) continue;
    const ts =
      typeof raw === 'number' ? raw : Date.parse(String(raw));
    if (!Number.isFinite(ts)) continue;
    out.push({ ts, label: String(getField(o, labelKey) ?? '') });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function fmtRange(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTick(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimeAxis({ config, variables }: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const tsKey = cfg.timestamp_key ?? 'timestamp';
  const labelKey = cfg.label_key ?? 'label';
  const height = cfg.height ?? 80;

  const markers = React.useMemo(
    () => pickEvents(variables ?? {}, cfg.source, tsKey, labelKey),
    [variables, cfg.source, tsKey, labelKey],
  );

  // Zoom state (multiplier sobre o range natural). Scroll posiciona o
  // centro do view dentro do range completo.
  const [zoom, setZoom] = React.useState(1);
  const [centerFrac, setCenterFrac] = React.useState(0.5);

  if (markers.length === 0) {
    return (
      <div
        className="border border-border-light bg-white p-3 text-[11px] text-muted-on-light italic"
        data-testid="time-axis-empty"
      >
        Sem eventos. Configure `source` no Inspector.
      </div>
    );
  }

  const fullStart = cfg.range_start
    ? Date.parse(cfg.range_start)
    : markers[0].ts;
  const fullEnd = cfg.range_end
    ? Date.parse(cfg.range_end)
    : markers[markers.length - 1].ts;
  const fullSpan = Math.max(1, fullEnd - fullStart);

  const viewSpan = fullSpan / Math.max(0.5, zoom);
  const center = fullStart + fullSpan * centerFrac;
  const viewStart = Math.max(fullStart, center - viewSpan / 2);
  const viewEnd = Math.min(fullEnd, viewStart + viewSpan);
  const span = Math.max(1, viewEnd - viewStart);

  const W = 720;
  const H = height;
  const padL = 40;
  const padR = 16;
  const padT = 10;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const baselineY = padT + innerH / 2;

  const scaleX = (ts: number) =>
    padL + ((ts - viewStart) / span) * innerW;

  // 6 ticks distribuídos uniformemente
  const ticks: number[] = [];
  for (let i = 0; i <= 5; i++) {
    ticks.push(viewStart + (span * i) / 5);
  }

  const visibleMarkers = markers.filter(
    (m) => m.ts >= viewStart && m.ts <= viewEnd,
  );

  const zoomIn = () => setZoom((z) => Math.min(64, z * 2));
  const zoomOut = () => setZoom((z) => Math.max(1, z / 2));
  const onScrollChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCenterFrac(Number(e.target.value) / 100);
  };

  return (
    <div
      className="border border-border-light bg-white flex flex-col"
      data-testid="time-axis"
    >
      <header className="h-8 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
          Eixo temporal · {visibleMarkers.length}/{markers.length}
        </p>
        <p className="text-[10px] font-mono text-muted-on-light">
          {fmtRange(viewStart)} → {fmtRange(viewEnd)}
        </p>
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= 1}
          aria-label="Zoom out"
          data-testid="time-axis-zoom-out"
          className="h-6 w-6 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light disabled:opacity-30"
        >
          <ZoomOut className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= 64}
          aria-label="Zoom in"
          data-testid="time-axis-zoom-in"
          className="h-6 w-6 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light disabled:opacity-30"
        >
          <ZoomIn className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </header>

      <div className="p-2">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Baseline */}
          <line
            x1={padL}
            x2={W - padR}
            y1={baselineY}
            y2={baselineY}
            stroke="currentColor"
            strokeWidth={1}
            className="text-border-light"
          />
          {/* Ticks */}
          {ticks.map((tk, i) => {
            const x = scaleX(tk);
            return (
              <g key={i}>
                <line
                  x1={x}
                  x2={x}
                  y1={baselineY - 4}
                  y2={baselineY + 4}
                  stroke="currentColor"
                  strokeWidth={0.75}
                  className="text-muted-on-light"
                />
                <text
                  x={x}
                  y={baselineY + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="ui-monospace, monospace"
                  className="fill-muted-on-light"
                >
                  {fmtTick(tk)}
                </text>
              </g>
            );
          })}
          {/* Markers */}
          {visibleMarkers.map((m, i) => {
            const x = scaleX(m.ts);
            return (
              <g key={i} data-testid={`time-axis-marker-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={padT}
                  y2={baselineY}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="text-primary"
                />
                <circle
                  cx={x}
                  cy={padT + 2}
                  r={3}
                  fill="currentColor"
                  className="text-primary"
                />
                {m.label && (
                  <title>{m.label}</title>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <footer className="px-2.5 py-1.5 border-t border-border-light bg-raised-light/30 flex items-center gap-2">
        <Move
          className="w-3 h-3 text-muted-on-light"
          strokeWidth={1.5}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(centerFrac * 100)}
          onChange={onScrollChange}
          aria-label="Posição"
          data-testid="time-axis-scroll"
          className="flex-1 accent-primary"
        />
        <span className="text-[10px] font-mono text-muted-on-light">
          {Math.round(zoom * 100)}%
        </span>
      </footer>
    </div>
  );
}

const NOW = Date.now();
const MOCK = [
  { ts: NOW - 1000 * 60 * 60 * 24 * 7, label: 'Ocorrência inicial' },
  { ts: NOW - 1000 * 60 * 60 * 24 * 5, label: 'Atualização' },
  { ts: NOW - 1000 * 60 * 60 * 24 * 3, label: 'Apreensão' },
  { ts: NOW - 1000 * 60 * 60 * 24 * 1, label: 'Notificação' },
  { ts: NOW - 1000 * 60 * 60 * 6, label: 'Fechamento parcial' },
  { ts: NOW - 1000 * 60 * 60 * 2, label: 'Encerrado' },
];

registerWidget('time_axis', TimeAxis, {
  group: 'viz',
  label: 'Eixo temporal',
  description:
    'Régua temporal horizontal com marcadores de eventos, controles de zoom e rolagem.',
  icon: 'clock',
  defaultColSpan: 12,
  mockConfig: {
    source: 'eventos',
    timestamp_key: 'ts',
    label_key: 'label',
    height: 100,
  },
  mockVariables: { eventos: MOCK },
  previewWidth: 720,
  previewHeight: 200,
  config_schema: [
    {
      name: 'source',
      label: 'Lista de eventos',
      field: 'variable-ref',
    },
    {
      name: 'timestamp_key',
      label: 'Propriedade de data/hora',
      description: 'Propriedade usada no eixo do tempo (default: timestamp). Vem do contrato do tipo da lista.',
      field: 'property',
      typeFrom: 'source',
    },
    {
      name: 'label_key',
      label: 'Propriedade do rótulo',
      description: 'Propriedade exibida como rótulo do evento (default: label).',
      field: 'property',
      typeFrom: 'source',
    },
    {
      name: 'range_start',
      label: 'Início (ISO 8601, opcional)',
      field: 'string',
      placeholder: '2026-01-01T00:00:00Z',
    },
    {
      name: 'range_end',
      label: 'Fim (ISO 8601, opcional)',
      field: 'string',
    },
    {
      name: 'height',
      label: 'Altura (px)',
      field: 'number',
      min: 60,
      max: 240,
      step: 10,
      default: 80,
      unit: 'px',
    },
  ],
});
