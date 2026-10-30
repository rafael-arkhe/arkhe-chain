'use client';

/**
 * HistoryPanel — "Histórico do AIP Arquiteto" (#5).
 *
 * Read-only drawer that surfaces the audit trail of AIP Architect activity in
 * /solutions. The backend audits every generation/build as a LineageEvent:
 *   - ``solution.design``     → a diagram was generated (who/when/which model,
 *     node/edge + element counts, the wizard/brief).
 *   - ``solution.materialize`` → a stack was built from a blueprint (counts of
 *     what was created + the Operação it attached to).
 *
 * It fetches both event types via the existing ``Lineage.listEvents`` client
 * (``/lineage/events?event_type=…``), merges + sorts newest-first, and renders
 * when / who (actor) / the brief / the model (via the AIP codename) / counts of
 * what was generated. Strictly read-only — no mutations, no provider/model id.
 */
import * as React from 'react';
import { Loader2, X, RefreshCw, RotateCcw } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Lineage, type LineageEvent } from '@/lib/api';
import { aipModelLabel } from '@/lib/aip/modelLabels';
import { formatDataHoraBR } from '@/lib/datetime';
import { humanizeKind } from '@/components/solution-designer/nodeMeta';

/** Event metadata — defensively widened: real rows may have no metadata_. */
type Meta = Record<string, unknown> | null | undefined;

/** Reads a string field from the event metadata (or ``''``). */
function metaStr(m: Meta, key: string): string {
  const v = m?.[key];
  return typeof v === 'string' ? v : '';
}

/** Reads a nested counts object (``metadata_.counts``) safely. */
function metaCounts(m: Meta): Record<string, number> {
  const c = m?.counts;
  if (!c || typeof c !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
    if (typeof v === 'number' && v > 0) out[k] = v;
  }
  return out;
}

/** Humaniza um slug de domínio ("gestao-de-denuncias" → "gestao de denuncias"). */
function humanizeDomain(s: string): string {
  return s.replace(/[-_]/g, ' ').trim();
}

/**
 * Extrai a INTENÇÃO da geração p/ o histórico (#12).
 *
 * Em eventos REAIS, `wizard.requirements` costuma ser um JSON estruturado
 * stringificado (o plano decomposto pelo AIP: coleta/processamento/…), NÃO um
 * briefing humano — exibi-lo cru poluiria o card e seria um péssimo seed de
 * chat. Então só usamos `requirements` quando é uma string humana curta; senão
 * caímos no domínio humanizado (+ produto-fim), que é a intenção legível.
 */
function eventBrief(m: Meta): string {
  const wizard = m?.wizard;
  if (wizard && typeof wizard === 'object') {
    const w = wizard as Record<string, unknown>;
    const req = typeof w.requirements === 'string' ? w.requirements.trim() : '';
    const looksJson = req.startsWith('{') || req.startsWith('[');
    if (req && !looksJson && req.length <= 280) return req;
    const dom = humanizeDomain(String(w.domain || metaStr(m, 'domain') || ''));
    const prod = typeof w.end_product === 'string' ? w.end_product.trim() : '';
    if (dom) return prod ? `${dom} (${prod})` : dom;
  }
  return humanizeDomain(metaStr(m, 'domain'));
}

/** Maps a counts key to its pt-BR/en-US dict label key (jargon-free). */
const COUNT_LABEL_KEY: Record<string, string> = {
  ontology_types: 'solutions.histObjectTypes',
  logic_functions: 'solutions.histLogicFunctions',
  action_types: 'solutions.histActionTypes',
  widgets: 'solutions.histWidgets',
  workspaces: 'solutions.histWorkspaceRow',
  projects: 'solutions.histProjects',
  agents: 'solutions.histAgents',
  flows: 'solutions.histFlows',
  pages: 'solutions.histPages',
  apps: 'solutions.histApps',
};

/** Ordem estável das contagens no "Resultado" (mais relevante primeiro). */
const COUNT_ORDER = [
  'ontology_types',
  'logic_functions',
  'action_types',
  'agents',
  'widgets',
  'flows',
  'pages',
  'apps',
  'workspaces',
  'projects',
];

/** Quantos eventos renderizar por "página" — a lista completa (até 100) estoura
 *  o design; o operador expande sob demanda com "Mostrar mais". */
const PAGE_SIZE = 15;

export function HistoryPanel({
  onClose,
  onReopen,
}: {
  onClose: () => void;
  /** #12 — "Reabrir no Arquiteto": semeia o chat com o briefing da geração
   *  (reabre a INTENÇÃO p/ o operador regenerar). Só p/ eventos de design. */
  onReopen?: (brief: string) => void;
}) {
  const t = useT();
  const [events, setEvents] = React.useState<LineageEvent[] | null>(null);
  const [shown, setShown] = React.useState(PAGE_SIZE);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setErr(null);
    setLoading(true);
    try {
      const [design, materialize] = await Promise.all([
        Lineage.listEvents({ event_type: 'solution.design', limit: 50 }, signal),
        Lineage.listEvents({ event_type: 'solution.materialize', limit: 50 }, signal),
      ]);
      const merged = [...design, ...materialize].sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || ''),
      );
      setEvents(merged);
      setShown(PAGE_SIZE);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return (
    <div
      className="h-full border-l border-border-light bg-white flex flex-col"
      data-testid="solutions-history"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-light">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
            {t('solutions.historyTitle')}
          </p>
          <p className="text-[10.5px] text-muted-on-light truncate">
            {t('solutions.historySubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            aria-label={t('solutions.historyReload')}
            data-testid="history-reload"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            data-testid="history-close"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-hide p-3 space-y-2">
        {loading && !events && (
          <div
            className="flex items-center gap-2 text-[11px] text-muted-on-light"
            data-testid="history-loading"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            {t('solutions.loadingBlueprint')}
          </div>
        )}

        {err && (
          <div
            className="px-2 py-1.5 text-[10.5px] font-mono text-danger bg-danger/5 border border-danger/30"
            data-testid="history-error"
          >
            {err}
          </div>
        )}

        {events && events.length === 0 && !err && (
          <p
            className="text-[11.5px] text-muted-on-light leading-relaxed"
            data-testid="history-empty"
          >
            {t('solutions.historyEmpty')}
          </p>
        )}

        {events &&
          events.slice(0, shown).map((ev) => {
            const md: Meta = ev.metadata_;
            const isDesign = ev.event_type === 'solution.design';
            const kindLabel = isDesign
              ? t('solutions.historyKindDesign')
              : t('solutions.historyKindMaterialize');
            const model = metaStr(md, 'model');
            const modelLabel = model ? aipModelLabel(model) : '';
            const brief = eventBrief(md);
            const counts = metaCounts(md);
            // #12 — ordena as contagens (mais relevante primeiro) p/ o "Resultado".
            const orderedCounts = Object.entries(counts).sort((a, b) => {
              const ia = COUNT_ORDER.indexOf(a[0]);
              const ib = COUNT_ORDER.indexOf(b[0]);
              return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });
            // ``solution.design`` also records node_count at the top level.
            const nodeCount =
              typeof md?.node_count === 'number' ? (md.node_count as number) : 0;
            const canReopen = Boolean(isDesign && brief && onReopen);
            return (
              <div
                key={ev.id}
                className="border border-border-light bg-canvas-light p-2 space-y-1"
                data-testid={`history-event-${ev.id}`}
                data-event-type={ev.event_type}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={
                      'text-[9px] uppercase tracking-widest ' +
                      (isDesign ? 'text-primary' : 'text-success')
                    }
                  >
                    {kindLabel}
                  </span>
                  <span className="text-[9px] font-mono text-muted-on-light">
                    {ev.timestamp ? formatDataHoraBR(ev.timestamp) : '—'}
                  </span>
                </div>

                {ev.actor && (
                  <p className="text-[10.5px] text-muted-on-light">
                    {t('solutions.historyActor')}: {ev.actor}
                  </p>
                )}

                {brief && (
                  <p className="text-[11px] text-text-on-light leading-relaxed line-clamp-2" title={brief}>
                    {t('solutions.historyBrief')}: {brief}
                  </p>
                )}

                {modelLabel && (
                  <p className="text-[10px] font-mono text-muted-on-light">
                    {t('solutions.historyModel')}: {modelLabel}
                  </p>
                )}

                {/* #12 — RESULTADO: o que esta geração efetivamente produziu
                    (tipos · funções · ações · agentes · widgets …), rotulado,
                    p/ o histórico ser rastreável (não só um log de "rodou"). */}
                {(orderedCounts.length > 0 || nodeCount > 0) && (
                  <div
                    className="pt-1.5 mt-0.5 border-t border-border-light"
                    data-testid={`history-results-${ev.id}`}
                  >
                    <p className="text-[9px] uppercase tracking-widest text-muted-on-light mb-1">
                      {t('solutions.historyResult')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {nodeCount > 0 && (
                        <span className="text-[9.5px] font-mono px-1.5 py-0.5 bg-white border border-border-light text-muted-on-light">
                          {nodeCount} {t('solutions.histNodes')}
                        </span>
                      )}
                      {orderedCounts.map(([k, v]) => (
                        <span
                          key={k}
                          className="text-[9.5px] font-mono px-1.5 py-0.5 bg-white border border-border-light text-muted-on-light"
                        >
                          {v}{' '}
                          {COUNT_LABEL_KEY[k]
                            ? t(COUNT_LABEL_KEY[k])
                            : humanizeKind(k)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* #12 — "Reabrir no Arquiteto": traz de volta a INTENÇÃO desta
                    geração (semeia o chat com o briefing) p/ regenerar/iterar. */}
                {canReopen && (
                  <button
                    type="button"
                    onClick={() => onReopen?.(brief)}
                    data-testid={`history-reopen-${ev.id}`}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                    {t('solutions.historyReopen')}
                  </button>
                )}
              </div>
            );
          })}

        {/* Cap de design: a lista renderiza PAGE_SIZE por vez; o restante expande
            sob demanda — nunca os ~100 cards de uma vez estourando a página. */}
        {events && events.length > shown && (
          <Button
            variant="outline"
            className="w-full h-7 text-[10.5px]"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            data-testid="history-show-more"
          >
            {t('solutions.historyShowMore')} ({events.length - shown})
          </Button>
        )}
      </div>
    </div>
  );
}
