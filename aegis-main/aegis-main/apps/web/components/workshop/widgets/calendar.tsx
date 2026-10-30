'use client';

/**
 * Calendar Heatmap — Sprint L16 (2026-05-23).
 *
 * Heatmap estilo GitHub contribution grid: 52 semanas × 7 dias =
 * matriz fixa de 364 células. Cada célula colorida proporcional ao
 * count daquele dia. Sem dependências.
 *
 * Input: variable contém array de `{date: "YYYY-MM-DD", count: number}`
 * OU map `{ "YYYY-MM-DD": number }`. Cores via 5-step scale (claro→escuro).
 *
 * Útil para audit logs ("dias em que rodaram X execuções"), atividade
 * por operador, frequência de alertas etc.
 *
 * Config:
 *   - source: string             variable com dados
 *   - title?: string             cabeçalho
 *   - color_scale?: string       'emerald' | 'blue' | 'amber' | 'violet' (default 'blue')
 *   - end_date?: string          'YYYY-MM-DD' do último dia (default = hoje)
 */
import * as React from 'react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  source?: string;
  title?: string;
  color_scale?: 'emerald' | 'blue' | 'amber' | 'violet';
  end_date?: string;
};

/* 5 steps por escala (0 = vazio, 4 = pico). Cores absolutas (sem var)
   pra renderizar idêntico em testes JSDOM. */
const SCALES: Record<string, [string, string, string, string, string]> = {
  emerald: ['#F1F5F9', '#A7F3D0', '#34D399', '#059669', '#065F46'],
  blue: ['#F1F5F9', '#BFDBFE', '#60A5FA', '#2563EB', '#1E3A8A'],
  amber: ['#F1F5F9', '#FDE68A', '#FBBF24', '#D97706', '#78350F'],
  violet: ['#F1F5F9', '#DDD6FE', '#A78BFA', '#7C3AED', '#4C1D95'],
};

const CELL = 11; // px
const GAP = 2; // px
const COLS = 52;
const ROWS = 7;

function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickCounts(
  variables: Record<string, unknown>,
  source: string | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  if (!source) return m;
  const raw = variables[source];
  if (!raw) return m;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const date = String((item as Record<string, unknown>).date ?? '');
        const count = Number((item as Record<string, unknown>).count ?? 0);
        if (date && Number.isFinite(count)) {
          m.set(date, (m.get(date) ?? 0) + count);
        }
      }
    }
    return m;
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const count = Number(v);
      if (Number.isFinite(count)) m.set(k, count);
    }
  }
  return m;
}

function pickColor(count: number, max: number, scale: [string, string, string, string, string]): string {
  if (count <= 0 || max <= 0) return scale[0];
  const t = count / max;
  if (t > 0.75) return scale[4];
  if (t > 0.5) return scale[3];
  if (t > 0.25) return scale[2];
  return scale[1];
}

function Calendar({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const counts = pickCounts(variables, cfg.source);
  const scale = SCALES[cfg.color_scale ?? 'blue'] ?? SCALES.blue;

  // end_date default = hoje UTC
  const end = parseDate(cfg.end_date ?? '') ?? new Date();
  // Backward para popular 52*7 dias terminando em `end`
  const startTs = end.getTime() - (COLS * ROWS - 1) * 24 * 3600 * 1000;
  const start = new Date(startTs);

  const cells: { date: string; count: number; color: string }[] = [];
  let max = 0;
  for (const v of counts.values()) if (v > max) max = v;

  for (let i = 0; i < COLS * ROWS; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
    const key = fmt(d);
    const c = counts.get(key) ?? 0;
    cells.push({ date: key, count: c, color: pickColor(c, max, scale) });
  }

  // Reorganiza em colunas (semana) de 7 linhas (dia da semana).
  // Cell[i] vai em col = floor(i/7), row = i%7.
  const widthPx = COLS * (CELL + GAP);
  const heightPx = ROWS * (CELL + GAP);

  // Resumo: total + média
  const total = cells.reduce((a, b) => a + b.count, 0);

  return (
    <div
      className="bg-white border border-border-light p-3 flex flex-col gap-2"
      data-testid="calendar-widget"
    >
      {cfg.title && (
        <p className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
          {cfg.title}
        </p>
      )}
      <div
        data-testid="calendar-canvas"
        className="overflow-x-auto"
      >
        <svg
          data-testid="calendar-svg"
          width={widthPx}
          height={heightPx}
          viewBox={`0 0 ${widthPx} ${heightPx}`}
          style={{ display: 'block' }}
        >
          {cells.map((c, i) => {
            const col = Math.floor(i / ROWS);
            const row = i % ROWS;
            const x = col * (CELL + GAP);
            const y = row * (CELL + GAP);
            return (
              <rect
                key={`c-${i}`}
                data-testid={`calendar-cell-${i}`}
                data-date={c.date}
                data-count={c.count}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                fill={c.color}
                stroke="#E2E8F0"
                strokeWidth={0.4}
              >
                <title>{`${c.date}: ${c.count}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div
        data-testid="calendar-legend"
        className="flex items-center gap-2 text-[10px] font-mono text-muted-on-light"
      >
        <span data-testid="calendar-total">
          Total: {total.toLocaleString('pt-BR')}
        </span>
        <span className="flex-1" />
        <span>Menos</span>
        {scale.map((c, i) => (
          <span
            key={`leg-${i}`}
            data-testid={`calendar-legend-step-${i}`}
            style={{
              display: 'inline-block',
              width: CELL,
              height: CELL,
              background: c,
              border: '1px solid #E2E8F0',
            }}
          />
        ))}
        <span>Mais</span>
      </div>
    </div>
  );
}

// Mock de 52 semanas pseudo-aleatório p/ paleta — usa hashing simples
// pro mesmo widget renderizar igual entre re-mounts.
function buildMockCounts(): { date: string; count: number }[] {
  const today = new Date();
  const out: { date: string; count: number }[] = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * 24 * 3600 * 1000);
    const dow = d.getUTCDay();
    // Picos de seg-qua, queda fim de semana.
    const base = dow === 0 || dow === 6 ? 0.3 : 1.0;
    const n = Math.max(0, Math.floor(base * (10 + 5 * Math.sin(i / 7))));
    out.push({ date: fmt(d), count: n });
  }
  return out;
}

registerWidget('calendar', Calendar, {
  group: 'viz',
  label: 'Calendário (heatmap)',
  description: 'Grid 52w × 7d estilo contribution graph — uma célula por dia.',
  icon: 'calendar',
  defaultColSpan: 8,
  mockConfig: {
    source: 'atividade',
    title: 'Execuções por dia · 12 meses',
    color_scale: 'blue',
  },
  mockVariables: {
    atividade: buildMockCounts(),
  },
  config_schema: [
    {
      name: 'source',
      label: 'Dado de contagens',
      description:
        'Variable com array [{date: "YYYY-MM-DD", count: number}] ou map {date: count}.',
      field: 'variable-ref',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho exibido acima do grid.',
      field: 'string',
      placeholder: 'ex.: Execuções por dia',
    },
    {
      name: 'color_scale',
      label: 'Escala de cor',
      description: 'Paleta usada para colorir as células.',
      field: 'select',
      options: [
        { value: 'blue', label: 'Azul' },
        { value: 'emerald', label: 'Verde' },
        { value: 'amber', label: 'Âmbar' },
        { value: 'violet', label: 'Violeta' },
      ],
      default: 'blue',
    },
    {
      name: 'end_date',
      label: 'Data final (YYYY-MM-DD)',
      description: 'Último dia do grid. Vazio = hoje.',
      field: 'string',
      placeholder: 'ex.: 2026-05-23',
    },
  ],
});

export { Calendar };
