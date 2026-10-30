'use client';

/**
 * Histórico de buscas RICO (BACKLOG #7b ELO 2).
 *
 * Fonte da verdade = BACKEND (`SearchHistory` SDK → `/search/history`, cerca por
 * tenant+user). NUNCA mais localStorage. Cada entrada guarda o CONTEXTO completo
 * da busca: a consulta + as fontes selecionadas + a Busca avançada
 * (fields/purpose/caseId), então "Re-rodar" restaura TUDO e executa de novo —
 * não é só `setQuery`.
 *
 * Dropdown na toolbar do /buscar:
 *   - lista do backend (recentes primeiro) com consulta · nº de fontes · quando;
 *   - filtro client-side por texto;
 *   - cada item: "Re-rodar" (restaura + dispara onSubmit), "Detalhe" (contexto
 *     completo inline) e "Remover" (uma entrada);
 *   - "Limpar histórico" → confirmModal (nunca diálogo nativo) → DELETE total.
 */
import * as React from 'react';
import { ChevronDown, History, Trash2, Play, Info, X, Loader2 } from 'lucide-react';
import { useT, useI18n } from '@/lib/i18n/provider';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import {
  SearchHistory,
  type SearchHistoryEntry,
} from '@/lib/api/search-history';

type Props = {
  /** Re-roda a busca da entrada: restaura consulta + fontes + avançado E executa. */
  onRerun: (entry: SearchHistoryEntry) => void;
};

function useWhenFmt(): (iso: string | null) => string {
  const { locale } = useI18n();
  return React.useCallback(
    (iso: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      try {
        return d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
      } catch {
        return d.toLocaleString();
      }
    },
    [locale],
  );
}

export function Historico({ onRerun }: Props) {
  const t = useT();
  const fmtWhen = useWhenFmt();
  const ref = React.useRef<HTMLDivElement>(null);

  const [open, setOpen] = React.useState(false);
  const [entries, setEntries] = React.useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  // boolean (a string traduzida sai no JSX): manter `load` ESTÁVEL — useT() sem
  // provider devolve uma função nova a cada render, então depender de `t` aqui
  // recriaria `load` e o efeito de fetch entraria em loop.
  const [error, setError] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    return SearchHistory.list(50)
      .then((rows) => setEntries(Array.isArray(rows) ? rows : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Recarrega do backend a cada abertura (fresco) — nunca confia em cache local.
  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  // Fecha ao clicar fora.
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => (e.query || '').toLowerCase().includes(q));
  }, [entries, filter]);

  const handleRerun = React.useCallback(
    (entry: SearchHistoryEntry) => {
      onRerun(entry);
      setOpen(false);
    },
    [onRerun],
  );

  const handleRemove = React.useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await SearchHistory.remove(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setDetailId((d) => (d === id ? null : d));
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleClear = React.useCallback(async () => {
    const ok = await confirmModal({
      title: t('buscar.historico.limparTitulo'),
      description: t('buscar.historico.limparCorpo'),
      tone: 'danger',
      confirmLabel: t('buscar.historico.limparConfirmar'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await SearchHistory.clear();
      setEntries([]);
      setDetailId(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [t]);

  function fontesTxt(n: number): string {
    if (n === 0) return t('buscar.historico.semFontes');
    return `${n} ${n === 1 ? t('buscar.historico.fonteSingular') : t('buscar.historico.fontePlural')}`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="buscar-historico-toggle"
        className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <History className="w-3 h-3" strokeWidth={1.5} />
        {t('buscar.historico.toggle')}
        <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
      </button>

      {open && (
        <div
          data-testid="buscar-historico-painel"
          className="absolute right-0 top-full mt-1 w-[360px] bg-canvas-light border border-border-light z-20 flex flex-col max-h-[70vh]"
        >
          {/* filtro */}
          <div className="p-1.5 border-b border-border-light">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('buscar.historico.filtroPlaceholder')}
              data-testid="buscar-historico-filtro"
              className="w-full h-7 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </div>

          {/* corpo */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {loading ? (
              <p
                data-testid="buscar-historico-carregando"
                className="px-3 py-3 text-[11px] text-muted-on-light italic flex items-center gap-1.5"
              >
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                {t('buscar.historico.carregando')}
              </p>
            ) : error ? (
              <div className="px-3 py-3 text-[11px]">
                <p className="text-danger" data-testid="buscar-historico-erro">
                  {t('buscar.historico.erro')}
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  data-testid="buscar-historico-retry"
                  className="mt-1.5 h-6 px-2 text-[11px] bg-white border border-border-light hover:border-primary"
                >
                  {t('buscar.historico.tentar')}
                </button>
              </div>
            ) : entries.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-on-light italic">
                {t('buscar.historico.vazio')}
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-on-light italic">
                {t('buscar.historico.filtroVazio')}
              </p>
            ) : (
              <ul>
                {filtered.map((entry, i) => {
                  const isOpen = detailId === entry.id;
                  return (
                    <li key={entry.id} className="border-b border-border-light/60 last:border-b-0">
                      <div
                        data-testid={`buscar-historico-item-${i}`}
                        className="px-3 py-2 hover:bg-raised-light"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] text-text-on-light truncate" title={entry.query}>
                              {entry.query}
                            </p>
                            <p className="text-[10px] text-muted-on-light font-mono mt-0.5 flex items-center gap-1.5">
                              <span data-testid={`buscar-historico-item-${i}-fontes`}>
                                {fontesTxt(entry.sources?.length ?? 0)}
                              </span>
                              {entry.created_at && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span>{fmtWhen(entry.created_at)}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleRerun(entry)}
                              title={t('buscar.historico.rerodarTooltip')}
                              data-testid={`buscar-historico-rerodar-${i}`}
                              className="h-6 px-1.5 text-[10px] bg-white border border-border-light hover:border-primary hover:text-primary flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" strokeWidth={1.5} />
                              {t('buscar.historico.rerodar')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetailId((d) => (d === entry.id ? null : entry.id))}
                              aria-label={t('buscar.historico.detalhe')}
                              aria-expanded={isOpen}
                              data-testid={`buscar-historico-detalhe-${i}`}
                              className="h-6 w-6 inline-flex items-center justify-center bg-white border border-border-light hover:border-primary text-muted-on-light hover:text-text-on-light"
                            >
                              <Info className="w-3 h-3" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemove(entry.id)}
                              disabled={busy}
                              aria-label={t('buscar.historico.remover')}
                              data-testid={`buscar-historico-remover-${i}`}
                              className="h-6 w-6 inline-flex items-center justify-center bg-white border border-border-light hover:border-danger text-muted-on-light hover:text-danger disabled:opacity-50"
                            >
                              <X className="w-3 h-3" strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div
                            data-testid={`buscar-historico-detalhe-painel-${i}`}
                            className="mt-2 border border-border-light bg-white p-2 space-y-2 text-[11px]"
                          >
                            <DetailRow label={t('buscar.historico.detalheConsulta')}>
                              <span className="font-mono break-all">{entry.query}</span>
                            </DetailRow>
                            <DetailRow label={t('buscar.historico.detalheFontes')}>
                              {entry.sources?.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {entry.sources.map((s) => (
                                    <span
                                      key={s}
                                      className="px-1 py-0.5 bg-canvas-light border border-border-light font-mono text-[10px]"
                                    >
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-on-light italic">
                                  {t('buscar.historico.semFontes')}
                                </span>
                              )}
                            </DetailRow>
                            {Object.keys(entry.advanced?.fields ?? {}).length > 0 ||
                            entry.advanced?.purpose ||
                            entry.advanced?.caseId ? (
                              <DetailRow label={t('buscar.historico.detalheAvancado')}>
                                <div className="space-y-0.5">
                                  {Object.entries(entry.advanced?.fields ?? {}).map(([k, v]) => (
                                    <div key={k} className="font-mono text-[10px]">
                                      <span className="text-muted-on-light">{k}:</span> {v}
                                    </div>
                                  ))}
                                  {entry.advanced?.purpose && (
                                    <div className="text-[10px]">
                                      <span className="text-muted-on-light">
                                        {t('buscar.historico.detalheFinalidade')}:
                                      </span>{' '}
                                      {entry.advanced.purpose}
                                    </div>
                                  )}
                                  {entry.advanced?.caseId && (
                                    <div className="text-[10px]">
                                      <span className="text-muted-on-light">
                                        {t('buscar.historico.detalheCaso')}:
                                      </span>{' '}
                                      {entry.advanced.caseId}
                                    </div>
                                  )}
                                </div>
                              </DetailRow>
                            ) : (
                              <p className="text-muted-on-light italic">
                                {t('buscar.historico.detalheSemAvancado')}
                              </p>
                            )}
                            {entry.result_summary &&
                              Object.keys(entry.result_summary).length > 0 && (
                                <DetailRow label={t('buscar.historico.detalheResumo')}>
                                  <div className="space-y-0.5">
                                    {Object.entries(entry.result_summary).map(([k, v]) => (
                                      <div key={k} className="font-mono text-[10px]">
                                        <span className="text-muted-on-light">{k}:</span> {v}
                                      </div>
                                    ))}
                                  </div>
                                </DetailRow>
                              )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* rodapé: limpar tudo */}
          {entries.length > 0 && (
            <div className="border-t border-border-light p-1.5">
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={busy}
                data-testid="buscar-historico-limpar"
                className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                {t('buscar.historico.limpar')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-semibold mb-0.5">
        {label}
      </p>
      {children}
    </div>
  );
}
