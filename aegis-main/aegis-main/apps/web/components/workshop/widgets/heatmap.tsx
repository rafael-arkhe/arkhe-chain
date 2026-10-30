'use client';

/**
 * Heatmap (matriz) — mapa de calor de densidade/intensidade por DUAS
 * dimensões. NÃO é o calendar (52w × 7d fixo). Reusa exatamente a mesma
 * resolução de dados do `pivot_table` (agrega por row × col sobre um
 * object set), mas em vez de imprimir os números crus pinta cada célula
 * com intensidade proporcional ao valor — rampa monocromática do tema.
 *
 * Casos multi-domínio (o widget não sabe O QUE é o dado, isso vem da
 * ontologia): ocorrências por bairro × hora (segurança), produtividade
 * por talhão × cultura (agro), correlação var × var (pesquisa).
 *
 * Config (igual ao pivot_table):
 *   - source: string         external_id da variable (array de objetos)
 *   - row_field: string      chave que vira linhas
 *   - col_field: string      chave que vira colunas
 *   - value_field?: string   chave numérica agregada (opcional)
 *   - agg?: Agg              'count' (default) | 'sum' | 'avg' | 'min' | 'max'
 *   - title?: string
 */
import * as React from 'react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { useT } from '@/lib/i18n/provider';

type Agg = 'count' | 'sum' | 'avg' | 'min' | 'max';

type Cfg = {
  source?: string;
  row_field?: string;
  col_field?: string;
  value_field?: string;
  agg?: Agg;
  title?: string;
};

function pickRows(
  variables: Record<string, unknown>,
  source: string | undefined,
): Record<string, unknown>[] {
  if (!source) return [];
  const raw = variables[source];
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
    return (raw as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

function aggregate(values: number[], agg: Agg): number {
  if (values.length === 0) return 0;
  if (agg === 'sum') return values.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  if (agg === 'max') return Math.max(...values);
  return values.length; // count
}

function HeatmapMatrix({ config, variables }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  const rows = pickRows(variables, cfg.source);
  const rowField = cfg.row_field;
  const colField = cfg.col_field;
  const valueField = cfg.value_field;
  const agg: Agg = cfg.agg ?? 'count';

  if (!rowField || !colField) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        {t('heatmapMatrix.configHint')}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        {t('heatmapMatrix.empty')}
      </div>
    );
  }

  // Mesma coleta de universos do pivot_table.
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  const buckets = new Map<string, number[]>(); // key: `${row}|${col}`

  for (const r of rows) {
    const rk = String(r[rowField] ?? '—');
    const ck = String(r[colField] ?? '—');
    rowSet.add(rk);
    colSet.add(ck);
    const key = `${rk}|${ck}`;
    if (!buckets.has(key)) buckets.set(key, []);
    if (valueField && agg !== 'count') {
      const v = Number(r[valueField]);
      if (Number.isFinite(v)) buckets.get(key)!.push(v);
    } else {
      buckets.get(key)!.push(1);
    }
  }

  const rowKeys = Array.from(rowSet).sort();
  const colKeys = Array.from(colSet).sort();

  const cell = (rk: string, ck: string): number => {
    const vals = buckets.get(`${rk}|${ck}`) ?? [];
    return aggregate(vals, agg);
  };

  // Escala de intensidade: min..max do conjunto de células → opacidade.
  let min = Infinity;
  let max = -Infinity;
  for (const rk of rowKeys) {
    for (const ck of colKeys) {
      const v = cell(rk, ck);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  const span = max - min;

  // Rampa monocromática do tema (cor primária, opacidade 0.08..1).
  const intensity = (v: number): number => {
    if (span <= 0) return v > 0 ? 1 : 0.08;
    return 0.08 + (0.92 * (v - min)) / span;
  };

  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  return (
    <div
      className="bg-white border border-border-light flex flex-col"
      data-testid="heatmap-matrix"
    >
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2 shrink-0">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
            {cfg.title}
          </p>
          <span className="text-[10px] font-mono text-muted-on-light">
            {agg} · {rows.length}
          </span>
        </header>
      )}
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-border-light bg-raised-light/30">
              <th className="text-left px-2 h-7 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono">
                {rowField}
              </th>
              {colKeys.map((c) => (
                <th
                  key={c}
                  className="text-center px-2 h-7 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((r) => (
              <tr key={r} className="border-b border-border-light/40">
                <td className="px-2 h-7 font-medium whitespace-nowrap">{r}</td>
                {colKeys.map((c) => {
                  const v = cell(r, c);
                  const op = intensity(v);
                  return (
                    <td
                      key={c}
                      data-testid={`heatmap-cell-${r}-${c}`}
                      data-value={v}
                      title={`${r} × ${c}: ${fmt(v)}`}
                      className="relative px-2 h-7 text-center font-mono tabular-nums"
                    >
                      <span
                        data-testid={`heatmap-fill-${r}-${c}`}
                        aria-hidden
                        className="pointer-events-none"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'var(--primary)',
                          opacity: op,
                        }}
                      />
                      <span className="relative">{fmt(v)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Legenda de escala monocromática */}
      <footer className="h-7 px-2.5 border-t border-border-light flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-mono text-muted-on-light">{fmt(min)}</span>
        <div
          data-testid="heatmap-legend"
          className="flex-1 h-2 max-w-[160px]"
          style={{
            background:
              'linear-gradient(to right, color-mix(in srgb, var(--primary) 8%, transparent), var(--primary))',
          }}
        />
        <span className="text-[10px] font-mono text-muted-on-light">{fmt(max)}</span>
        <span className="text-[10px] font-mono text-muted-on-light ml-auto">
          {t('heatmapMatrix.scale')}
        </span>
      </footer>
    </div>
  );
}

const MOCK_HEATMAP_ROWS = [
  { bairro: 'Centro', hora: '08h', ocorrencias: 12 },
  { bairro: 'Centro', hora: '20h', ocorrencias: 34 },
  { bairro: 'Norte', hora: '08h', ocorrencias: 4 },
  { bairro: 'Norte', hora: '20h', ocorrencias: 28 },
  { bairro: 'Sul', hora: '08h', ocorrencias: 9 },
  { bairro: 'Sul', hora: '20h', ocorrencias: 17 },
];

registerWidget('heatmap', HeatmapMatrix, {
  group: 'viz',
  label: 'Mapa de calor (matriz)',
  description:
    'Matriz de densidade: agrega um valor por duas dimensões e pinta cada célula com intensidade proporcional. Útil para concentração por categoria × categoria.',
  icon: 'grid-3x3',
  defaultColSpan: 8,
  mockConfig: {
    title: 'Ocorrências por bairro × hora',
    source: 'rows',
    row_field: 'bairro',
    col_field: 'hora',
    value_field: 'ocorrencias',
    agg: 'sum',
  },
  mockVariables: { rows: MOCK_HEATMAP_ROWS },
  previewWidth: 460,
  previewHeight: 240,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'Ocorrências por bairro × hora' },
    { name: 'source', label: 'Lista de dados', field: 'variable-ref' },
    { name: 'row_field', label: 'Campo das linhas', field: 'property', typeFrom: 'source' },
    { name: 'col_field', label: 'Campo das colunas', field: 'property', typeFrom: 'source' },
    { name: 'value_field', label: 'Campo do valor (opcional)', field: 'property', typeFrom: 'source' },
    {
      name: 'agg',
      label: 'Operação',
      field: 'select',
      options: [
        { value: 'count', label: 'Contar' },
        { value: 'sum', label: 'Somar' },
        { value: 'avg', label: 'Média' },
        { value: 'min', label: 'Mínimo' },
        { value: 'max', label: 'Máximo' },
      ],
      default: 'count',
    },
  ],
});

export { HeatmapMatrix };
