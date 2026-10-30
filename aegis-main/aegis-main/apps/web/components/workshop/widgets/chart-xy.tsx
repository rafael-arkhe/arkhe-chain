'use client';

/**
 * Chart XY — Sprint 5 do parity roadmap.
 *
 * Bar/line chart simples em SVG nativo (sem dep de recharts pra
 * manter bundle leve). Lê de uma variable array de objetos.
 *
 * Config:
 *   - `source`: variable array
 *   - `x_field`: chave do eixo X (string ou number)
 *   - `y_field`: chave do eixo Y (number)
 *   - `kind`: 'bar' (default) | 'line'
 *   - `title`: header opcional
 *   - `height`: altura em px (default 220)
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { getField } from './_row';

type Cfg = {
  source?: string;
  x_field?: string;
  y_field?: string;
  kind?: 'bar' | 'line';
  title?: string;
  height?: number;
};

function pickRows(variables: Record<string, unknown>, source: string | undefined): Record<string, unknown>[] {
  if (!source) return [];
  const raw = variables[source];
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
    return (raw as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

function ChartXY({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const rows = pickRows(variables, cfg.source);
  const xField = cfg.x_field;
  const yField = cfg.y_field;
  const kind = cfg.kind ?? 'bar';
  const height = cfg.height ?? 220;

  if (!xField || !yField) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Configure `x_field` e `y_field` no Inspetor.
      </div>
    );
  }
  if (rows.length === 0) {
    // A mensagem vazia fala a lingua do operador: usa o TITULO do widget quando
    // existe. O nome interno (`sacos_por_hora`) e' endereco de programador.
    const titulo = typeof cfg.title === 'string' ? cfg.title.trim() : '';
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        {titulo ? `Sem dados para "${titulo}" no per\u00edodo.` : 'Sem dados no per\u00edodo.'}
      </div>
    );
  }

  const points = rows
    .map((r) => ({
      x: String(getField(r, xField) ?? ''),
      y: Number(getField(r, yField) ?? 0),
    }))
    .filter((p) => Number.isFinite(p.y));
  const maxY = Math.max(...points.map((p) => p.y), 0);
  const W = 480;
  const H = height;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = points.length;
  const step = n > 1 ? innerW / (n - 1) : innerW;
  const barW = n > 0 ? Math.max(4, innerW / n - 4) : 0;

  const scaleY = (v: number) => (maxY > 0 ? padT + innerH - (v / maxY) * innerH : padT + innerH);
  const scaleX = (i: number) => padL + (n > 1 ? i * step : innerW / 2);

  // Grid lines (3 horizontal)
  const gridYs = [0, 0.5, 1].map((p) => padT + innerH * (1 - p));

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="chart-xy">
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
            {cfg.title}
          </p>
          <span className="text-[10px] font-mono text-muted-on-light">{kind}</span>
        </header>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
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
        {/* Bars / Line */}
        {kind === 'bar' &&
          points.map((p, i) => {
            const x = scaleX(i) - barW / 2;
            const y = scaleY(p.y);
            const h = innerH - (y - padT);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={Math.max(0, h)}
                className="fill-primary"
              />
            );
          })}
        {kind === 'line' && points.length > 0 && (
          <>
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              points={points.map((p, i) => `${scaleX(i)},${scaleY(p.y)}`).join(' ')}
              className="text-primary"
            />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={scaleX(i)}
                cy={scaleY(p.y)}
                r={2.5}
                className="fill-primary"
              />
            ))}
          </>
        )}
        {/* X labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={scaleX(i)}
            y={H - padB + 14}
            textAnchor="middle"
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            className="fill-muted-on-light"
          >
            {p.x.length > 8 ? p.x.slice(0, 7) + '…' : p.x}
          </text>
        ))}
      </svg>
    </div>
  );
}

const MOCK_SERIES = [
  { mes: 'Jan', valor: 142 },
  { mes: 'Fev', valor: 168 },
  { mes: 'Mar', valor: 134 },
  { mes: 'Abr', valor: 201 },
  { mes: 'Mai', valor: 187 },
  { mes: 'Jun', valor: 245 },
  { mes: 'Jul', valor: 220 },
];

registerWidget('chart_xy', ChartXY, {
  group: 'viz',
  label: 'Gráfico XY',
  description:
    'Gráfico de barras ou linha sobre uma lista de dados, mapeando um campo no eixo X e um valor numérico no eixo Y.',
  icon: 'chart-column',
  defaultColSpan: 10,
  mockConfig: {
    title: 'BOs por mês',
    source: 'series',
    x_field: 'mes',
    y_field: 'valor',
    kind: 'bar',
    height: 220,
  },
  mockVariables: { series: MOCK_SERIES },
  previewWidth: 520,
  previewHeight: 280,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'BOs por mês' },
    { name: 'source', label: 'Lista de dados', field: 'variable-ref' },
    { name: 'x_field', label: 'Campo X', field: 'string' },
    { name: 'y_field', label: 'Campo Y (número)', field: 'string' },
    { name: 'kind', label: 'Tipo', field: 'select', options: [{ value: 'bar', label: 'Barras' }, { value: 'line', label: 'Linha' }], default: 'bar' },
    { name: 'height', label: 'Altura (px)', field: 'number', min: 120, max: 600, step: 20, default: 220, unit: 'px' },
  ],
});
