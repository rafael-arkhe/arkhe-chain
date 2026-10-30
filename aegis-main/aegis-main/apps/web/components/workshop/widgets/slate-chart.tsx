'use client';

/**
 * Slate Chart — Sprint L7 (2026-05-23).
 *
 * Wrapper "alto-nível" sobre o existing chart_xy. Suporta 3 tipos de gráfico
 * (line, bar, area) com pequenas customizações de série + grade + título.
 * Pesquisa R2 Slate · widgets/chart.md.
 *
 * Diferença vs chart-xy:
 *   - tipo "area" novo (preenchimento sob curva)
 *   - múltiplas séries (até 3) com cores distintas
 *   - footer com legenda automática
 *
 * Config:
 *   - source: string         external_id da variable (array de objetos)
 *   - x_field: string        coluna do eixo X
 *   - series: { field: string; label?: string; color?: string }[]   1-3 séries
 *   - kind: 'line' | 'bar' | 'area' (default 'line')
 *   - title?: string
 *   - height?: number  (default 240)
 */
import * as React from 'react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Series = { field: string; label?: string; color?: string };

type Cfg = {
  source?: string;
  x_field?: string;
  series?: Series[] | string;
  kind?: 'line' | 'bar' | 'area';
  title?: string;
  height?: number;
};

const DEFAULT_COLORS = ['var(--primary)', '#7e22ce', '#0e7490'];

function pickRows(
  variables: Record<string, unknown>,
  source: string | undefined,
): Record<string, unknown>[] {
  if (!source) return [];
  const raw = variables[source];
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (
    raw
    && typeof raw === 'object'
    && Array.isArray((raw as { rows?: unknown[] }).rows)
  ) {
    return (raw as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

function parseSeries(cfg: Cfg): Series[] {
  if (Array.isArray(cfg.series)) return cfg.series;
  if (typeof cfg.series === 'string') {
    try {
      const parsed = JSON.parse(cfg.series);
      if (Array.isArray(parsed)) return parsed as Series[];
    } catch {
      // ignore
    }
  }
  return [];
}

export function SlateChart({ config, variables }: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const rows = pickRows(variables ?? {}, cfg.source);
  const xField = cfg.x_field;
  const series = parseSeries(cfg).slice(0, 3);
  const kind = cfg.kind ?? 'line';
  const height = cfg.height ?? 240;

  if (!xField || series.length === 0) {
    return (
      <div
        className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic"
        data-testid="slate-chart-empty"
      >
        Configure `x_field` e ao menos uma série no Inspector.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic"
        data-testid="slate-chart-empty"
      >
        Sem dados em <code className="text-primary">{cfg.source}</code>.
      </div>
    );
  }

  // Coleta pontos por série
  const seriesData = series.map((s, idx) => ({
    label: s.label ?? s.field,
    color: s.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
    field: s.field,
    points: rows
      .map((r) => ({
        x: String(r[xField] ?? ''),
        y: Number(r[s.field] ?? 0),
      }))
      .filter((p) => Number.isFinite(p.y)),
  }));

  const allYs = seriesData.flatMap((s) => s.points.map((p) => p.y));
  const maxY = Math.max(...allYs, 1);
  const W = 560;
  const H = height;
  const padL = 40;
  const padR = 16;
  const padT = 14;
  const padB = 42;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = seriesData[0].points.length;
  const step = n > 1 ? innerW / (n - 1) : innerW;
  const barWGroup = n > 0 ? Math.max(8, innerW / n - 6) : 8;
  const barW = barWGroup / series.length;

  const scaleY = (v: number) =>
    maxY > 0 ? padT + innerH - (v / maxY) * innerH : padT + innerH;
  const scaleX = (i: number) => padL + (n > 1 ? i * step : innerW / 2);

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((p) => padT + innerH * (1 - p));

  return (
    <div
      className="bg-white border border-border-light flex flex-col"
      data-testid="slate-chart"
    >
      <header className="h-8 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
          {cfg.title ?? 'Gráfico'}
        </p>
        <span className="text-[10px] font-mono text-muted-on-light">{kind}</span>
      </header>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        data-testid={`slate-chart-svg-${kind}`}
      >
        {/* Grid */}
        {gridYs.map((y, i) => (
          <line
            key={i}
            x1={padL}
            x2={W - padR}
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-border-light"
          />
        ))}
        {/* Y labels */}
        {[0, 0.5, 1].map((p, i) => (
          <text
            key={i}
            x={padL - 6}
            y={padT + innerH * (1 - p) + 4}
            textAnchor="end"
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            className="fill-muted-on-light"
          >
            {Math.round(maxY * p).toLocaleString('pt-BR')}
          </text>
        ))}

        {/* Per-series drawing */}
        {seriesData.map((sd, sIdx) => (
          <g key={sIdx} data-testid={`slate-chart-series-${sIdx}`}>
            {kind === 'bar'
              && sd.points.map((p, i) => {
                const groupX = scaleX(i) - barWGroup / 2;
                const x = groupX + sIdx * barW + 1;
                const y = scaleY(p.y);
                const h = innerH - (y - padT);
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={Math.max(2, barW - 2)}
                    height={Math.max(0, h)}
                    fill={sd.color}
                  />
                );
              })}
            {(kind === 'line' || kind === 'area') && sd.points.length > 0 && (
              <>
                {kind === 'area' && (
                  <polygon
                    fill={sd.color}
                    fillOpacity={0.15}
                    stroke="none"
                    points={[
                      ...sd.points.map(
                        (p, i) => `${scaleX(i)},${scaleY(p.y)}`,
                      ),
                      `${scaleX(sd.points.length - 1)},${padT + innerH}`,
                      `${scaleX(0)},${padT + innerH}`,
                    ].join(' ')}
                  />
                )}
                <polyline
                  fill="none"
                  stroke={sd.color}
                  strokeWidth={2}
                  points={sd.points
                    .map((p, i) => `${scaleX(i)},${scaleY(p.y)}`)
                    .join(' ')}
                />
                {sd.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={scaleX(i)}
                    cy={scaleY(p.y)}
                    r={2.5}
                    fill={sd.color}
                  />
                ))}
              </>
            )}
          </g>
        ))}

        {/* X labels */}
        {seriesData[0].points.map((p, i) => (
          <text
            key={i}
            x={scaleX(i)}
            y={H - padB + 14}
            textAnchor="middle"
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            className="fill-muted-on-light"
          >
            {p.x.length > 9 ? p.x.slice(0, 8) + '…' : p.x}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <footer
        className="px-2.5 py-1.5 border-t border-border-light bg-raised-light/30 flex gap-3 flex-wrap"
        data-testid="slate-chart-legend"
      >
        {seriesData.map((sd, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-on-light"
          >
            <span
              className="inline-block w-2.5 h-2.5"
              style={{ backgroundColor: sd.color }}
              aria-hidden="true"
            />
            {sd.label}
          </span>
        ))}
      </footer>
    </div>
  );
}

const MOCK = [
  { mes: 'Jan', bo: 142, prisoes: 32, viaturas: 18 },
  { mes: 'Fev', bo: 168, prisoes: 41, viaturas: 22 },
  { mes: 'Mar', bo: 134, prisoes: 28, viaturas: 17 },
  { mes: 'Abr', bo: 201, prisoes: 49, viaturas: 26 },
  { mes: 'Mai', bo: 187, prisoes: 44, viaturas: 24 },
  { mes: 'Jun', bo: 245, prisoes: 58, viaturas: 31 },
];

registerWidget('slate_chart', SlateChart, {
  group: 'viz',
  label: 'Gráfico (multi-série)',
  description:
    'Gráfico de linha, área ou barras com até 3 séries comparadas. Recebe uma tabela de dados e mapeia colunas para eixos.',
  icon: 'bar-chart-3',
  defaultColSpan: 10,
  mockConfig: {
    title: 'BOs vs prisões vs viaturas',
    source: 'series',
    x_field: 'mes',
    kind: 'line',
    series: [
      { field: 'bo', label: 'BOs', color: '#1d4ed8' },
      { field: 'prisoes', label: 'Prisões', color: '#7e22ce' },
      { field: 'viaturas', label: 'Viaturas', color: '#0e7490' },
    ],
    height: 240,
  },
  mockVariables: { series: MOCK },
  previewWidth: 560,
  previewHeight: 320,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string' },
    { name: 'source', label: 'Lista de dados', field: 'variable-ref' },
    { name: 'x_field', label: 'Campo X', field: 'property', typeFrom: 'source' },
    {
      name: 'series',
      label: 'Séries (JSON: [{ field, label?, color? }])',
      field: 'string',
      placeholder: '[{"field":"valor","label":"BOs"}]',
    },
    {
      name: 'kind',
      label: 'Tipo',
      field: 'select',
      options: [
        { value: 'line', label: 'Linha' },
        { value: 'bar', label: 'Barras' },
        { value: 'area', label: 'Área' },
      ],
      default: 'line',
    },
    {
      name: 'height',
      label: 'Altura (px)',
      field: 'number',
      min: 120,
      max: 600,
      step: 20,
      default: 240,
      unit: 'px',
    },
  ],
});
