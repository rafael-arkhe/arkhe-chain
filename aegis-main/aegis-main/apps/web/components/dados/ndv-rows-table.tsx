'use client';

/**
 * NdvRowsTable — tabela de dados do NDV (F8.2c, paridade n8n §4): busca nas
 * linhas + page size [1,10,25,50,100] (default 25) + pager, e hover de linha
 * (F8.2b: o preview de token resolve contra a linha sob o mouse).
 *
 * Usada nos painéis INPUT e OUTPUT do NodeConfigOverlay. Régua: cantos retos,
 * mono nos dados, useT() no chamador via props (labels injetados) — o
 * componente recebe `t` do contexto i18n global.
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';

export const NDV_PAGE_SIZES = [1, 10, 25, 50, 100] as const;

/** Filtro de busca: substring case-insensitive em QUALQUER valor da linha. */
export function filterRows(
  rows: Array<Record<string, unknown>>,
  query: string,
): Array<Record<string, unknown>> {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    Object.values(r || {}).some((v) => v != null && String(v).toLowerCase().includes(q)),
  );
}

export function NdvRowsTable({
  cols,
  rows,
  testid,
  onHoverRow,
}: {
  cols: string[];
  rows: Array<Record<string, unknown>>;
  /** prefixo dos testids (ex.: 'pb-ndv-in' → pb-ndv-in-search etc.) */
  testid: string;
  /** F8.2b — linha sob o mouse (null ao sair). Índice na lista FILTRADA. */
  onHoverRow?: (row: Record<string, unknown> | null) => void;
}) {
  const t = useT();
  const [query, setQuery] = React.useState('');
  const [pageSize, setPageSize] = React.useState<number>(25);
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => filterRows(rows, query), [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const start = cur * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  React.useEffect(() => { setPage(0); }, [query, pageSize]);

  const showCols = cols.length ? cols : Object.keys(filtered[0] ?? {});

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-6 px-1.5 bg-white border border-border-light focus-within:border-primary flex items-center gap-1 min-w-0">
          <Search className="w-3 h-3 shrink-0 text-muted-on-light" strokeWidth={1.5} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pipeCanvas.ndv.searchRows')}
            data-testid={`${testid}-search`}
            className="flex-1 min-w-0 text-[10px] outline-none bg-transparent"
          />
        </div>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          data-testid={`${testid}-pagesize`}
          aria-label={t('pipeCanvas.ndv.pageSize')}
          className="h-6 px-1 text-[10px] bg-white border border-border-light outline-none focus:border-primary"
        >
          {NDV_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-[11px] text-muted-on-light italic" data-testid={`${testid}-empty`}>
          {t('pipeCanvas.ndv.noRows')}
        </p>
      ) : (
        // inc4 — data-table nível n8n: TODAS as colunas (sem cap de 8) com scroll-x;
        // célula larga (até 280px) truncada com hover title (revela o valor cheio).
        <div className="overflow-auto border border-border-light max-h-72">
          <table className="text-[10px] font-mono w-max min-w-full" data-testid={`${testid}-table`}>
            <thead className="bg-raised-light sticky top-0 z-10">
              <tr>{showCols.map((c) => <th key={c} className="px-1.5 py-1 text-left text-muted-on-light font-medium whitespace-nowrap">{c}</th>)}</tr>
            </thead>
            <tbody onMouseLeave={() => onHoverRow?.(null)}>
              {visible.map((row, i) => (
                <tr
                  key={start + i}
                  data-testid={`${testid}-row-${start + i}`}
                  onMouseEnter={() => onHoverRow?.(row)}
                  className="border-t border-border-light/60 hover:bg-primary/5"
                >
                  {showCols.map((c) => (
                    <td key={c} title={row[c] == null ? undefined : String(row[c])}
                      className="px-1.5 py-1 text-text-on-light whitespace-nowrap max-w-[280px] truncate">
                      {row[c] == null ? '—' : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-on-light">
        <span data-testid={`${testid}-count`}>
          {filtered.length === rows.length
            ? `${filtered.length} ${t('pipeCanvas.ndv.rows')}`
            : `${filtered.length}/${rows.length} ${t('pipeCanvas.ndv.rows')}`}
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-1">
            <button type="button" disabled={cur === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
              data-testid={`${testid}-prev`} aria-label={t('pipeCanvas.ndv.prevPage')}
              className="h-5 w-5 flex items-center justify-center border border-border-light disabled:opacity-40 hover:border-primary">
              <ChevronLeft className="w-3 h-3" strokeWidth={1.5} />
            </button>
            <span className="font-mono" data-testid={`${testid}-page`}>{cur + 1}/{pages}</span>
            <button type="button" disabled={cur >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              data-testid={`${testid}-next`} aria-label={t('pipeCanvas.ndv.nextPage')}
              className="h-5 w-5 flex items-center justify-center border border-border-light disabled:opacity-40 hover:border-primary">
              <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
