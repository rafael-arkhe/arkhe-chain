'use client';

/**
 * Pipeline de detecções — DLQ operável (2026-06-12), central de Conectores.
 *
 * A espinha de detecções (câmeras/conectores → barramento → grafo) deixa de
 * ser opaca: o operador vê o backlog e a fila-morta (mensagens que falharam
 * repetidamente no processamento) e fecha o ciclo SEM shell:
 *   - cards com os números vivos (aguardando + fila-morta, fonte mono);
 *   - tabela da fila-morta: motivo humano, origem (chave de partição),
 *     evento e quando caiu — mais novas primeiro;
 *   - Reprocessar (volta pra fila principal com o envelope intacto; a
 *     idempotência por event_id absorve duplicata) e Descartar (destrutivo),
 *     ambos via confirmModal (NUNCA diálogo nativo), por linha ou em lote.
 *
 * Perms: a seção existe com events.pipeline.view; os gestos de mutação só
 * aparecem com events.pipeline.manage. i18n via useT() (pt-BR + en-US).
 */
import * as React from 'react';
import {
  Activity, AlertCircle, Loader2, RefreshCw, RotateCcw, Trash2,
} from 'lucide-react';

import { confirmModal } from '@/components/dialog/confirm-dialog';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import {
  EventsPipeline,
  type PipelineDlqItem,
  type PipelineDlqResult,
  type PipelineStatus,
} from '@/lib/api';

// Motivo HUMANO — a fila-morta só tem um produtor hoje (mensagem-veneno após
// max_deliveries entregas falhas); motivo desconhecido cai num rótulo honesto
// com o cru no title= (tooltip nativo).
function humanReason(t: (k: string) => string, reason: string): string {
  if (reason.startsWith('max_deliveries')) return t('pipeline.reason.poison');
  return reason || t('pipeline.reason.unknown');
}

// Quando caiu na fila-morta, humanizado (linguagem de operador).
function fmtWhen(t: (k: string) => string, iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - Date.parse(iso);
  if (diff < 60_000) return t('pipeline.when.now');
  if (diff < 3_600_000) {
    return t('pipeline.when.min').replace('{n}', String(Math.floor(diff / 60_000)));
  }
  if (diff < 86_400_000) {
    return t('pipeline.when.h').replace('{n}', String(Math.floor(diff / 3_600_000)));
  }
  return t('pipeline.when.d').replace('{n}', String(Math.floor(diff / 86_400_000)));
}

function StatCard({
  label, value, alert, testId,
}: {
  label: string;
  value: number | null;
  alert?: boolean;
  testId: string;
}) {
  return (
    <div className="border border-border-light px-3 py-2 flex-1 min-w-0" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-muted-on-light truncate">
        {label}
      </div>
      <div
        className={
          'text-[20px] font-mono leading-tight ' +
          (alert && (value ?? 0) > 0 ? 'text-danger' : 'text-text-on-light')
        }
      >
        {value === null ? '—' : value}
      </div>
    </div>
  );
}

export function PipelineSection() {
  const t = useT();
  const canView = useCan('events.pipeline.view');
  const canManage = useCan('events.pipeline.manage');
  const [status, setStatus] = React.useState<PipelineStatus | null>(null);
  const [dlq, setDlq] = React.useState<PipelineDlqResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setErr(null);
    try {
      const [st, dl] = await Promise.all([
        EventsPipeline.status(),
        EventsPipeline.dlq(50),
      ]);
      setStatus(st);
      setDlq(dl);
    } catch (e) {
      setErr((e as Error)?.message ?? '');
    }
  }, []);

  React.useEffect(() => {
    if (!canView) return;
    void refresh();
  }, [canView, refresh]);

  // Sem a perm de leitura a seção NÃO existe (mesmo padrão da seção Edge).
  if (!canView) return null;

  const act = async (
    kind: 'retry' | 'purge',
    sel: { ids?: string[]; all?: boolean },
    busyKey: string,
    confirm: { title: string; description: string; confirmLabel: string; tone?: 'danger' },
  ) => {
    const ok = await confirmModal({
      ...confirm,
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(busyKey);
    setErr(null);
    try {
      if (kind === 'retry') await EventsPipeline.retry(sel);
      else await EventsPipeline.purge(sel);
      await refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? '');
    } finally {
      setBusy(null);
    }
  };

  const retryOne = (it: PipelineDlqItem) =>
    act('retry', { ids: [it.id] }, `retry-${it.id}`, {
      title: t('pipeline.confirm.retryTitle'),
      description: t('pipeline.confirm.retryDesc').replace(
        '{event}', it.payload.event_id || it.id,
      ),
      confirmLabel: t('pipeline.retry'),
    });

  const purgeOne = (it: PipelineDlqItem) =>
    act('purge', { ids: [it.id] }, `purge-${it.id}`, {
      title: t('pipeline.confirm.purgeTitle'),
      description: t('pipeline.confirm.purgeDesc').replace(
        '{event}', it.payload.event_id || it.id,
      ),
      confirmLabel: t('pipeline.purge'),
      tone: 'danger',
    });

  const retryAll = () =>
    act('retry', { all: true }, 'retry-all', {
      title: t('pipeline.confirm.retryTitle'),
      description: t('pipeline.confirm.retryAllDesc').replace(
        '{n}', String(dlq?.count ?? 0),
      ),
      confirmLabel: t('pipeline.retry.all'),
    });

  const purgeAll = () =>
    act('purge', { all: true }, 'purge-all', {
      title: t('pipeline.confirm.purgeTitle'),
      description: t('pipeline.confirm.purgeAllDesc').replace(
        '{n}', String(dlq?.count ?? 0),
      ),
      confirmLabel: t('pipeline.purge.all'),
      tone: 'danger',
    });

  const hasDlq = (dlq?.count ?? 0) > 0;
  const consumersTotal = status?.consumers
    ? status.consumers.reduce((acc, g) => acc + g.consumers, 0)
    : null;

  return (
    <section className="space-y-3" data-testid="pipeline-section">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-text-on-light flex items-center gap-1.5">
            <Activity className="w-4 h-4" strokeWidth={1.5} /> {t('pipeline.title')}
          </h2>
          <p className="text-[11px] text-muted-on-light mt-0.5">{t('pipeline.subtitle')}</p>
          {status ? (
            <p className="text-[10px] font-mono text-muted-on-light mt-0.5" data-testid="pipeline-meta">
              {status.topic}
              {' · '}{status.bus_kind}
              {consumersTotal !== null
                ? <> · {t('pipeline.consumers').replace('{n}', String(consumersTotal))}</>
                : null}
            </p>
          ) : null}
        </div>
        <button type="button" onClick={() => void refresh()} data-testid="pipeline-refresh"
          aria-label={t('pipeline.refresh')} title={t('pipeline.refresh')}
          className="h-8 px-2.5 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        {canManage && (
          <>
            <button type="button" onClick={() => void retryAll()} data-testid="pipeline-retry-all"
              disabled={!hasDlq || busy !== null}
              className="h-8 px-3 text-[12px] bg-primary text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60">
              {busy === 'retry-all'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                : <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t('pipeline.retry.all')}
            </button>
            <button type="button" onClick={() => void purgeAll()} data-testid="pipeline-purge-all"
              disabled={!hasDlq || busy !== null}
              className="h-8 px-3 text-[12px] border border-border-light hover:border-danger hover:text-danger flex items-center gap-1.5 disabled:opacity-60">
              {busy === 'purge-all'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t('pipeline.purge.all')}
            </button>
          </>
        )}
      </div>

      {err !== null && (
        <div className="flex items-start gap-2 text-danger text-[13px]" role="alert" data-testid="pipeline-error">
          <AlertCircle className="w-4 h-4 mt-0.5" strokeWidth={1.5} />
          <span>{err || t('pipeline.error')}</span>
        </div>
      )}

      <div className="flex gap-2">
        <StatCard
          label={t('pipeline.cards.pending')}
          value={status ? status.pending : null}
          testId="pipeline-card-pending"
        />
        <StatCard
          label={t('pipeline.cards.dlq')}
          value={status ? status.dlq_count : null}
          alert
          testId="pipeline-card-dlq"
        />
      </div>

      <div className="border border-border-light" data-testid="pipeline-dlq-list">
        {dlq === null && !err && (
          <div className="p-3 text-[12px] text-muted-on-light flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
          </div>
        )}
        {dlq && dlq.items.length === 0 && (
          <div className="p-3 text-[12px] text-muted-on-light italic" data-testid="pipeline-dlq-empty">
            {t('pipeline.dlq.empty')}
          </div>
        )}
        {dlq && dlq.items.length > 0 && (
          <>
            <div className="px-3 py-1.5 border-b border-border-light grid grid-cols-[1fr_1fr_1fr_90px_auto] gap-2 text-[10px] uppercase tracking-wider text-muted-on-light">
              <span>{t('pipeline.col.reason')}</span>
              <span>{t('pipeline.col.origin')}</span>
              <span>{t('pipeline.col.event')}</span>
              <span>{t('pipeline.col.when')}</span>
              <span />
            </div>
            {dlq.items.map((it) => (
              <div key={it.id} data-testid={`pipeline-dlq-row-${it.id}`}
                className="px-3 py-2 border-b border-border-light last:border-b-0 grid grid-cols-[1fr_1fr_1fr_90px_auto] gap-2 items-center text-[12px]">
                <span className="text-text-on-light truncate" title={it.reason}>
                  {humanReason(t, it.reason)}
                </span>
                <span className="font-mono text-[11px] text-muted-on-light truncate" title={it.key}>
                  {it.key || '—'}
                </span>
                <span className="font-mono text-[11px] text-muted-on-light truncate"
                  title={it.payload.preview}>
                  {it.payload.event_id || it.orig_id || it.id}
                </span>
                <span className="font-mono text-[11px] text-muted-on-light truncate" title={it.ts ?? undefined}>
                  {fmtWhen(t, it.ts)}
                </span>
                <span className="flex items-center gap-1 justify-end">
                  {canManage && (
                    <>
                      <button type="button" onClick={() => void retryOne(it)}
                        disabled={busy !== null}
                        data-testid={`pipeline-retry-${it.id}`}
                        title={t('pipeline.retry')}
                        className="h-7 px-2 text-[11px] border border-border-light hover:border-primary hover:text-primary flex items-center gap-1 disabled:opacity-60">
                        {busy === `retry-${it.id}`
                          ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                          : <RotateCcw className="w-3 h-3" strokeWidth={1.5} />}
                        {t('pipeline.retry')}
                      </button>
                      <button type="button" onClick={() => void purgeOne(it)}
                        disabled={busy !== null}
                        data-testid={`pipeline-purge-${it.id}`}
                        title={t('pipeline.purge')}
                        className="h-7 px-2 text-[11px] border border-border-light hover:border-danger hover:text-danger flex items-center gap-1 disabled:opacity-60">
                        {busy === `purge-${it.id}`
                          ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                          : <Trash2 className="w-3 h-3" strokeWidth={1.5} />}
                        {t('pipeline.purge')}
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
