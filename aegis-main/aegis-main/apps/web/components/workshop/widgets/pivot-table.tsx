'use client';

/**
 * Pivot Table — Sprint 5 do parity roadmap.
 *
 * Cross-tabulação simples sobre um array de objetos:
 *   - `row_field`: chave que vira linhas
 *   - `col_field`: chave que vira colunas
 *   - `value_field`: chave que vira a célula
 *   - `agg`: 'count' (default) | 'sum' | 'avg' | 'min' | 'max'
 *
 * Renderiza tabela com totais por linha + grand-total.
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Agg = 'count' | 'sum' | 'avg' | 'min' | 'max';

type Cfg = {
  source?: string;
  row_field?: string;
  col_field?: string;
  value_field?: string;
  agg?: Agg;
  title?: string;
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

function aggregate(values: number[], agg: Agg): number {
  if (values.length === 0) return 0;
  if (agg === 'sum') return values.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  if (agg === 'max') return Math.max(...values);
  return values.length; // count
}

function PivotTable({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const rows = pickRows(variables, cfg.source);
  const rowField = cfg.row_field;
  const colField = cfg.col_field;
  const valueField = cfg.value_field;
  const agg: Agg = cfg.agg ?? 'count';

  if (!rowField || !colField) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Configure `row_field` e `col_field` (e opcionalmente `value_field` + `agg`) no Inspetor.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Sem dados em <code className="text-primary">{cfg.source}</code>.
      </div>
    );
  }

  // Coleta universos de linhas e colunas
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

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="pivot-table">
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
            {cfg.title}
          </p>
          <span className="text-[10px] font-mono text-muted-on-light">
            {agg} · {rows.length} linhas
          </span>
        </header>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border-light bg-raised-light/30">
              <th className="text-left px-2 h-7 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono">
                {rowField}
              </th>
              {colKeys.map((c) => (
                <th
                  key={c}
                  className="text-right px-2 h-7 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono"
                >
                  {c}
                </th>
              ))}
              <th className="text-right px-2 h-7 text-[10px] uppercase tracking-wider text-text-on-light font-semibold font-mono bg-raised-light">
                total
              </th>
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((r) => {
              const total = colKeys.reduce((acc, c) => acc + cell(r, c), 0);
              return (
                <tr key={r} className="border-b border-border-light/60">
                  <td className="px-2 h-7 font-medium">{r}</td>
                  {colKeys.map((c) => (
                    <td key={c} className="px-2 h-7 text-right font-mono tabular-nums">
                      {cell(r, c).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                    </td>
                  ))}
                  <td className="px-2 h-7 text-right font-mono tabular-nums bg-raised-light/40 font-semibold">
                    {total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MOCK_PIVOT_ROWS = [
  { uf: 'SP', partido: 'PT', votos: 1200 },
  { uf: 'SP', partido: 'PSDB', votos: 980 },
  { uf: 'SP', partido: 'NOVO', votos: 320 },
  { uf: 'RJ', partido: 'PT', votos: 800 },
  { uf: 'RJ', partido: 'PSDB', votos: 1100 },
  { uf: 'MG', partido: 'PT', votos: 700 },
  { uf: 'MG', partido: 'PSDB', votos: 600 },
  { uf: 'MG', partido: 'NOVO', votos: 450 },
  { uf: 'BA', partido: 'PT', votos: 1500 },
];

registerWidget('pivot_table', PivotTable, {
  group: 'data',
  label: 'Tabela cruzada',
  description:
    'Tabela cruzada que conta, soma ou tira média de um valor combinando duas dimensões nas linhas e colunas.',
  icon: 'table-2',
  defaultColSpan: 10,
  mockConfig: {
    title: 'Votos por UF × Partido',
    source: 'rows',
    row_field: 'uf',
    col_field: 'partido',
    value_field: 'votos',
    agg: 'sum',
  },
  mockVariables: { rows: MOCK_PIVOT_ROWS },
  previewWidth: 460,
  previewHeight: 260,
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'Votos por UF × Partido' },
    { name: 'source', label: 'Lista de dados', field: 'variable-ref' },
    { name: 'row_field', label: 'Campo das linhas', field: 'string' },
    { name: 'col_field', label: 'Campo das colunas', field: 'string' },
    { name: 'value_field', label: 'Campo do valor (opcional)', field: 'string' },
    { name: 'agg', label: 'Operação', field: 'select', options: [
      { value: 'count', label: 'Contar' },
      { value: 'sum', label: 'Somar' },
      { value: 'avg', label: 'Média' },
      { value: 'min', label: 'Mínimo' },
      { value: 'max', label: 'Máximo' },
    ], default: 'count' },
  ],
});
