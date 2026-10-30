'use client';

/**
 * alert_list — lista de alertas do tenant (inbox unificado, 2026-06-12).
 *
 * Consome a API REAL do núcleo (`Alerts.inbox.list` → GET /alerts/inbox,
 * store na ontologia: OntologyNode node_type='Alert'). Config editável no
 * inspetor: {kinds, severities, status, limit, mostrar_origem} — canais e
 * severidades em DROPDOWN populado (nunca input técnico manual). Ack
 * inline via confirmModal (gesto auditado no backend — LineageEvent
 * alert.acknowledged), gated pela perm `security.alertas.resolve`.
 *
 * BACKLOG #6a (gestão/auditoria — ELO 2):
 *  - ATRIBUIÇÃO: alertas resolvidos mostram "resolvido por {ack_by} em
 *    {ack_at}" (dado já vem no dict);
 *  - FILTRO de status em runtime (todos / pendentes / resolvidos /
 *    escalados) — client-side sobre a página carregada;
 *  - TRILHA por alerta: clicar o alerta (ou o botão "Auditoria") abre um
 *    drawer com a trilha (`Alerts.inbox.trail` → GET /alerts/{id}/trail):
 *    emitido → entregue → reconhecido → escalado/silenciado, com ícone
 *    NEUTRO + ator + horário + canal. A ficha do alerta no drawer expõe o
 *    MTTR por-alerta (`ack_latency_s`).
 *
 * Estados honestos: vazio e erro explícitos — nunca dado inventado. Na
 * paleta/editor renderiza dados de EXEMPLO via mockVariables
 * (`alertas_demo`), sem fetch — regra: paleta nunca mostra "água".
 */
import * as React from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Bell,
  BellOff,
  Check,
  Circle,
  ClipboardList,
  Lock,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Alerts } from '@/lib/api';
import type { BackendAlert, AlertTrailEvent } from '@/lib/api/alerts-map';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { fmtDurationSeconds } from '@/lib/format/number';
import { cn } from '@/lib/cn';

// ── Mocks da paleta (regra: widget data-driven SEM mock = placeholder) ─────
// Dados claramente de exemplo — nenhum nome/local real.
const MOCK_ALERTS: BackendAlert[] = [
  {
    id: 'exemplo-1',
    kind: 'geofence',
    fired_at: '2026-01-05T10:30:00Z',
    classification: 'U',
    status: 'pending',
    severity: 'critical',
    title: 'Cerca de exemplo violada',
    payload: { geofence_name: 'Cerca de exemplo', event: 'enter' },
    redacted: false,
    escalated: true,
  },
  {
    id: 'exemplo-2',
    kind: 'search_feed',
    fired_at: '2026-01-05T09:10:00Z',
    classification: 'U',
    status: 'acknowledged',
    severity: 'low',
    title: 'Feed de exemplo: 3 novos resultados',
    payload: {},
    redacted: false,
    ack_by: 'operador-exemplo',
    ack_at: '2026-01-05T09:20:00Z',
    ack_latency_s: 600,
  },
];

type Cfg = {
  kinds?: string[] | string;
  severities?: string[] | string;
  status?: string;
  limit?: number;
  mostrar_origem?: boolean;
};

/** Filtro de status em runtime (gestão). 'todos' = sem filtro. */
type StatusFilter = 'todos' | 'pending' | 'acknowledged' | 'escalated';
const STATUS_FILTERS: { value: StatusFilter; key: string }[] = [
  { value: 'todos', key: 'alertas.filter.all' },
  { value: 'pending', key: 'alertas.filter.pending' },
  { value: 'acknowledged', key: 'alertas.filter.resolved' },
  { value: 'escalated', key: 'alertas.filter.escalated' },
];

/** ''/null → undefined; 'a' → ['a']; ['a','b'] → ['a','b']. */
function toList(v: string[] | string | undefined): string[] | undefined {
  if (Array.isArray(v)) {
    const vals = v.filter((s) => typeof s === 'string' && s.trim() !== '');
    return vals.length ? vals : undefined;
  }
  if (typeof v === 'string' && v.trim() !== '') return [v.trim()];
  return undefined;
}

// Rótulo humano por família conhecida (i18n) — kind desconhecido (domínio
// novo) cai no próprio valor, que É dado da ontologia.
const KIND_LABEL_KEYS: Record<string, string> = {
  search_feed: 'alertas.canal.feed',
  object_watch: 'alertas.canal.watch',
  geofence: 'alertas.canal.geofence',
  share: 'alertas.canal.share',
  lpr_hotlist: 'alertas.canal.hotlist',
};

// Cores sóbrias por severidade (barra fina + rótulo) — crítico em
// vermelho discreto, nunca alarmista.
const SEVERITY_BAR: Record<string, string> = {
  critical: 'bg-danger',
  high: 'bg-warning',
  medium: 'bg-info',
  low: 'bg-border-light',
};
const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-danger',
  high: 'text-warning',
  medium: 'text-muted-on-light',
  low: 'text-muted-on-light',
};

// Status humano (i18n) — rótulo curto do estado do alerta.
const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'alertas.status.pending',
  acknowledged: 'alertas.status.acknowledged',
  silenced: 'alertas.status.silenced',
};

// Trilha: rótulo humano por gesto `alert.*` (nunca o token cru na UI).
const TRAIL_LABEL_KEYS: Record<string, string> = {
  'alert.emitted': 'alertas.trail.emitted',
  'alert.delivered': 'alertas.trail.delivered',
  'alert.acknowledged': 'alertas.trail.acknowledged',
  'alert.escalated': 'alertas.trail.escalated',
  'alert.silenced': 'alertas.trail.silenced',
};

// Ícone NEUTRO por gesto (cor sempre cinza — cor infantiliza). Gesto novo
// (domínio futuro) cai num ponto neutro, nunca quebra.
const TRAIL_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  'alert.emitted': Bell,
  'alert.delivered': Send,
  'alert.acknowledged': Check,
  'alert.escalated': ArrowUp,
  'alert.silenced': BellOff,
};

function fmtTime(iso: string | undefined | null): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '';
}

type LoadState = 'loading' | 'ready' | 'error';
type TrailState = 'idle' | 'loading' | 'ready' | 'error';

function AlertListWidget({ appId, config, variables }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  const canResolve = useCan('security.alertas.resolve');

  // Paleta/editor: dados de exemplo via mockVariables — sem fetch.
  const isDesignSurface = appId === 'palette-preview' || appId === 'editor';
  const demo = isDesignSurface && Array.isArray(variables.alertas_demo)
    ? (variables.alertas_demo as BackendAlert[])
    : null;

  const [rows, setRows] = React.useState<BackendAlert[]>(demo ?? []);
  const [state, setState] = React.useState<LoadState>(demo ? 'ready' : 'loading');
  const [ackBusy, setAckBusy] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('todos');

  // Drawer de Auditoria (trilha) — alerta selecionado + estado da trilha.
  const [trailFor, setTrailFor] = React.useState<BackendAlert | null>(null);
  const [trail, setTrail] = React.useState<AlertTrailEvent[]>([]);
  const [trailState, setTrailState] = React.useState<TrailState>('idle');

  const kinds = toList(cfg.kinds);
  const severities = toList(cfg.severities);
  const status = cfg.status && cfg.status !== '' ? cfg.status : undefined;
  const limit = typeof cfg.limit === 'number' && cfg.limit > 0 ? cfg.limit : 50;
  const mostrarOrigem = cfg.mostrar_origem !== false;

  const filterKey = JSON.stringify({ kinds, severities, status, limit });

  const load = React.useCallback(() => {
    if (demo) return;
    setState('loading');
    Alerts.inbox
      .list({ kinds, severities, status, limit })
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setState('ready');
      })
      .catch(() => {
        setRows([]);
        setState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, demo]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function ack(a: BackendAlert) {
    if (ackBusy) return;
    const ok = await confirmModal({
      title: t('alertas.widget.confirmTitle'),
      description: t('alertas.widget.confirmBody'),
      confirmLabel: t('alertas.resolve'),
    });
    if (!ok) return;
    setAckBusy(a.id);
    try {
      const updated = await Alerts.inbox.ack(a.id);
      setRows((prev) =>
        prev.map((r) =>
          r.id === a.id
            ? {
                ...r,
                status: 'acknowledged',
                ack_by: updated?.ack_by ?? r.ack_by,
                ack_at: updated?.ack_at ?? r.ack_at,
                ack_latency_s: updated?.ack_latency_s ?? r.ack_latency_s,
              }
            : r,
        ),
      );
    } catch {
      // estado honesto: nada muda; o operador pode tentar de novo
    } finally {
      setAckBusy(null);
    }
  }

  // Abre o drawer e carrega a trilha do alerta (perm + ABAC aplicados no
  // backend). Na paleta/editor não há fetch — mostra estado honesto vazio.
  const openTrail = React.useCallback(
    (a: BackendAlert) => {
      setTrailFor(a);
      if (demo) {
        setTrail([]);
        setTrailState('ready');
        return;
      }
      setTrailState('loading');
      Alerts.inbox
        .trail(a.id)
        .then((events) => {
          setTrail(Array.isArray(events) ? events : []);
          setTrailState('ready');
        })
        .catch(() => {
          setTrail([]);
          setTrailState('error');
        });
    },
    [demo],
  );

  const closeTrail = React.useCallback(() => {
    setTrailFor(null);
    setTrail([]);
    setTrailState('idle');
  }, []);

  // ESC fecha o drawer.
  React.useEffect(() => {
    if (!trailFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTrail();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [trailFor, closeTrail]);

  const kindLabel = (a: BackendAlert) => {
    const key = KIND_LABEL_KEYS[a.kind];
    return key ? t(key) : a.kind;
  };

  const statusLabel = (s: string | undefined) => {
    const key = s ? STATUS_LABEL_KEYS[s] : undefined;
    return key ? t(key) : (s ?? '');
  };

  // Filtro de gestão (client-side sobre a página carregada).
  const visible = React.useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter === 'todos') return true;
        if (statusFilter === 'escalated') return r.escalated === true;
        return r.status === statusFilter;
      }),
    [rows, statusFilter],
  );

  return (
    <div
      className="bg-panel-light border border-border-light h-full flex flex-col overflow-hidden"
      data-testid="alert-list"
    >
      <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 shrink-0">
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light">
          {t('alertas.title')}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-on-light">
          {state === 'ready' ? visible.length : ''}
        </span>
        {!demo && (
          <button
            type="button"
            data-testid="alert-list-reload"
            onClick={load}
            title={t('alertas.retry')}
            className="w-6 h-6 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Filtro de status (gestão) — segmented control, cantos retos. */}
      <div
        data-testid="alert-status-filter"
        className="h-8 px-2 border-b border-border-light flex items-center gap-1 shrink-0"
        role="group"
        aria-label={t('alertas.filter.label')}
      >
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              data-testid={`alert-filter-${f.value}`}
              aria-pressed={active}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'h-6 px-2 text-[10px] font-mono uppercase tracking-wide border',
                active
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-white border-border-light text-muted-on-light hover:border-primary/60',
              )}
            >
              {t(f.key)}
            </button>
          );
        })}
      </div>

      {state === 'error' && (
        <div
          data-testid="alert-list-error"
          className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <AlertTriangle className="w-5 h-5 text-danger" strokeWidth={1.5} />
          <p className="text-[12px] font-semibold">{t('alertas.error.title')}</p>
          <p className="text-[11px] text-muted-on-light">{t('alertas.error.body')}</p>
          <button
            type="button"
            onClick={load}
            className="mt-1 h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} /> {t('alertas.retry')}
          </button>
        </div>
      )}

      {state === 'ready' && rows.length === 0 && (
        <div
          data-testid="alert-list-empty"
          className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <BellOff className="w-5 h-5 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[12px] font-semibold">{t('alertas.empty.title')}</p>
          <p className="text-[11px] text-muted-on-light">{t('alertas.empty.body')}</p>
        </div>
      )}

      {state === 'ready' && rows.length > 0 && visible.length === 0 && (
        <div
          data-testid="alert-list-filter-empty"
          className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <BellOff className="w-5 h-5 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[11px] text-muted-on-light">{t('alertas.filter.empty')}</p>
        </div>
      )}

      {state !== 'error' && visible.length > 0 && (
        <ul className="flex-1 overflow-y-auto">
          {visible.map((a) => {
            const acked = a.status === 'acknowledged';
            return (
              <li
                key={a.id}
                data-testid={`alert-row-${a.id}`}
                className={cn(
                  'px-3 py-2 border-b border-border-light flex items-start gap-2.5',
                  acked && 'opacity-60',
                )}
              >
                <span
                  className={cn(
                    'w-1 self-stretch shrink-0',
                    SEVERITY_BAR[a.severity ?? 'medium'] ?? 'bg-info',
                  )}
                />
                <button
                  type="button"
                  data-testid={`alert-open-${a.id}`}
                  onClick={() => openTrail(a)}
                  title={t('alertas.trail.open')}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <p className="text-[12px] font-semibold truncate flex items-center gap-1.5">
                      {a.redacted && (
                        <Lock className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                      )}
                      {a.redacted ? t('alertas.detail.restricted') : a.title}
                    </p>
                    <span className="ml-auto font-mono text-[10px] text-muted-on-light shrink-0">
                      {fmtTime(a.fired_at)}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono mt-0.5 uppercase tracking-wide flex items-center gap-2 flex-wrap">
                    <span className={SEVERITY_TEXT[a.severity ?? 'medium']}>
                      {t(`alertas.severity.${a.severity ?? 'medium'}`)}
                    </span>
                    {mostrarOrigem && (
                      <span className="text-muted-on-light/70">{kindLabel(a)}</span>
                    )}
                    {a.escalated && (
                      <span className="text-muted-on-light flex items-center gap-1">
                        <ArrowUp className="w-3 h-3" strokeWidth={1.5} />
                        {t('alertas.trail.escalated')}
                      </span>
                    )}
                  </p>
                  {/* ATRIBUIÇÃO — resolvido por {ack_by} em {ack_at}. */}
                  {acked && (a.ack_by || a.ack_at) ? (
                    <p
                      data-testid={`alert-attribution-${a.id}`}
                      className="text-[10px] font-mono mt-0.5 text-muted-on-light flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                      {t('alertas.attribution.by')} {a.ack_by ?? '—'}
                      {a.ack_at ? ` · ${fmtTime(a.ack_at)}` : ''}
                    </p>
                  ) : (
                    acked && (
                      <p className="text-[10px] font-mono mt-0.5 text-muted-on-light flex items-center gap-1">
                        <Check className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                        {t('alertas.resolved')}
                      </p>
                    )
                  )}
                </button>
                <div className="flex flex-col items-stretch gap-1 shrink-0">
                  <button
                    type="button"
                    data-testid={`alert-audit-${a.id}`}
                    onClick={() => openTrail(a)}
                    title={t('alertas.trail.open')}
                    className="h-6 px-2 text-[10px] bg-white border border-border-light hover:border-primary flex items-center gap-1 text-muted-on-light"
                  >
                    <ClipboardList className="w-3 h-3" strokeWidth={1.5} />
                    {t('alertas.trail.open')}
                  </button>
                  {canResolve && !acked && (
                    <button
                      type="button"
                      data-testid={`alert-ack-${a.id}`}
                      disabled={ackBusy === a.id}
                      onClick={() => void ack(a)}
                      className="h-6 px-2 text-[10px] bg-white border border-border-light hover:border-primary disabled:opacity-50"
                    >
                      {t('alertas.resolve')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Drawer de Auditoria (trilha do alerta). */}
      {trailFor && (
        <ModalPortal>
        <div className="fixed inset-0 z-[80] flex" data-testid="alert-trail-drawer">
          <div
            aria-hidden="true"
            onClick={closeTrail}
            className="flex-1 ds-overlay"
            data-testid="alert-trail-backdrop"
          />
          <aside
            role="dialog"
            aria-label={t('alertas.trail.title')}
            className="w-[420px] max-w-[90vw] bg-canvas-light border-l border-border-light flex flex-col"
          >
            <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
              <ClipboardList className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
              <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1 truncate">
                {t('alertas.trail.title')}
              </p>
              <button
                type="button"
                onClick={closeTrail}
                aria-label={t('common.close')}
                data-testid="alert-trail-close"
                className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {/* Ficha do alerta — identificação + MTTR por-alerta. */}
              <section className="p-3 border-b border-border-light">
                <p className="text-[12px] font-semibold flex items-center gap-1.5">
                  {trailFor.redacted && (
                    <Lock className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                  )}
                  {trailFor.redacted
                    ? t('alertas.detail.restricted')
                    : trailFor.title}
                </p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
                  <dt className="text-muted-on-light">{t('alertas.detail.severity')}</dt>
                  <dd className={SEVERITY_TEXT[trailFor.severity ?? 'medium']}>
                    {t(`alertas.severity.${trailFor.severity ?? 'medium'}`)}
                  </dd>
                  <dt className="text-muted-on-light">{t('alertas.detail.status')}</dt>
                  <dd>{statusLabel(trailFor.status)}</dd>
                  <dt className="text-muted-on-light">{t('alertas.detail.firedAt')}</dt>
                  <dd>{fmtTime(trailFor.fired_at)}</dd>
                  {trailFor.ack_by && (
                    <>
                      <dt className="text-muted-on-light">{t('alertas.attribution.by')}</dt>
                      <dd>{trailFor.ack_by}</dd>
                    </>
                  )}
                  {trailFor.ack_latency_s != null && (
                    <>
                      <dt className="text-muted-on-light">{t('alertas.detail.ackLatency')}</dt>
                      <dd data-testid="alert-ack-latency">
                        {fmtDurationSeconds(trailFor.ack_latency_s)}
                      </dd>
                    </>
                  )}
                </dl>
              </section>

              {/* Trilha cronológica. */}
              <section className="p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light mb-2">
                  {t('alertas.trail.heading')}
                </p>

                {trailState === 'loading' && (
                  <p
                    data-testid="alert-trail-loading"
                    className="text-[11px] text-muted-on-light font-mono"
                  >
                    {t('alertas.trail.loading')}
                  </p>
                )}

                {trailState === 'error' && (
                  <div
                    data-testid="alert-trail-error"
                    className="text-[11px] text-muted-on-light flex flex-col items-start gap-2"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-danger" strokeWidth={1.5} />
                      {t('alertas.trail.error')}
                    </span>
                    <button
                      type="button"
                      onClick={() => openTrail(trailFor)}
                      className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" strokeWidth={1.5} /> {t('alertas.retry')}
                    </button>
                  </div>
                )}

                {trailState === 'ready' && trail.length === 0 && (
                  <p
                    data-testid="alert-trail-empty"
                    className="text-[11px] text-muted-on-light font-mono"
                  >
                    {t('alertas.trail.empty')}
                  </p>
                )}

                {trailState === 'ready' && trail.length > 0 && (
                  <ol className="flex flex-col gap-0">
                    {trail.map((ev, i) => {
                      const Icon = TRAIL_ICON[ev.event_type] ?? Circle;
                      const labelKey = TRAIL_LABEL_KEYS[ev.event_type];
                      const last = i === trail.length - 1;
                      return (
                        <li
                          key={ev.id}
                          data-testid={`trail-event-${ev.id}`}
                          className="flex gap-2.5"
                        >
                          {/* Coluna do ícone + linha vertical (timeline). */}
                          <div className="flex flex-col items-center shrink-0">
                            <span className="w-6 h-6 flex items-center justify-center border border-border-light bg-white">
                              <Icon className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
                            </span>
                            {!last && <span className="w-px flex-1 bg-border-light" />}
                          </div>
                          <div className={cn('min-w-0 pb-3', last && 'pb-0')}>
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] font-semibold">
                                {labelKey ? t(labelKey) : ev.event_type}
                              </span>
                              {ev.status === 'failed' && (
                                <span className="text-[10px] font-mono text-danger uppercase">
                                  {t('alertas.trail.failed')}
                                </span>
                              )}
                              <span className="ml-auto text-[10px] font-mono text-muted-on-light shrink-0">
                                {fmtTime(ev.at)}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-muted-on-light mt-0.5 flex flex-wrap gap-x-2">
                              {ev.actor && (
                                <span>
                                  {t('alertas.trail.actor')}: {ev.actor}
                                </span>
                              )}
                              {ev.channel && (
                                <span>
                                  {t('alertas.trail.channel')}: {ev.channel}
                                </span>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          </aside>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}

registerWidget('alert_list', AlertListWidget, {
  group: 'data',
  label: 'Lista de alertas',
  description:
    'Lista os alertas do tenant (caixa unificada) com filtros por canal, severidade e status. Resolve inline e abre a trilha de auditoria por alerta.',
  icon: 'bell',
  defaultColSpan: 12,
  mockConfig: { limit: 5, mostrar_origem: true },
  mockVariables: { alertas_demo: MOCK_ALERTS },
  previewWidth: 480,
  previewHeight: 240,
  config_schema: [
    {
      name: 'kinds',
      label: 'Canal',
      description: 'Filtra por uma família de alertas. Vazio = todas.',
      field: 'select',
      options: [
        { value: '', label: 'Todos os canais' },
        { value: 'search_feed', label: 'Feeds de busca' },
        { value: 'object_watch', label: 'Objetos observados' },
        { value: 'geofence', label: 'Cercas virtuais' },
        { value: 'share', label: 'Compartilhados' },
        { value: 'lpr_hotlist', label: 'Placas procuradas' },
      ],
      default: '',
    },
    {
      name: 'severities',
      label: 'Severidade',
      description: 'Filtra por severidade. Vazio = todas.',
      field: 'select',
      options: [
        { value: '', label: 'Todas' },
        { value: 'critical', label: 'Crítica' },
        { value: 'high', label: 'Alta' },
        { value: 'medium', label: 'Média' },
        { value: 'low', label: 'Baixa' },
      ],
      default: '',
    },
    {
      name: 'status',
      label: 'Status',
      field: 'select',
      options: [
        { value: '', label: 'Todos' },
        { value: 'pending', label: 'Pendentes' },
        { value: 'acknowledged', label: 'Resolvidos' },
      ],
      default: '',
    },
    {
      name: 'limit',
      label: 'Limite de alertas',
      field: 'number',
      min: 1,
      max: 200,
      step: 1,
      default: 50,
    },
    {
      name: 'mostrar_origem',
      label: 'Mostrar origem (canal)',
      field: 'boolean',
      default: true,
    },
  ],
});
