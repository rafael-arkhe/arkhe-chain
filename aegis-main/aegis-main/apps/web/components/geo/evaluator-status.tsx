'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { Atlas, type AtlasEvaluatorStatus } from '@/lib/api';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/**
 * G10 — status do avaliador de geocercas no /geo (security-app).
 *
 * Mostra se o motor de cercas do Atlas está vivo (active-dot + último tick +
 * contadores) e deixa o operador re-rodar o tick AGORA (run-once, escopado ao
 * tenant dele no backend). Gated por atlas.evaluation.read (some sem perm).
 */
export function EvaluatorStatusCard() {
  const t = useT();
  const canRead = useCan('atlas.evaluation.read');
  const canRun = useCan('atlas.evaluation.manage');
  const [status, setStatus] = useState<AtlasEvaluatorStatus | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await Atlas.evaluation.status());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [canRead, load]);

  if (!canRead) return null;

  const runOnce = async () => {
    if (running) return;
    setRunning(true);
    try {
      setStatus(await Atlas.evaluation.runOnce());
      toast.success(t('geo.evaluator.ranOnce'));
    } catch {
      toast.error(t('geo.evaluator.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const active = !!status?.active;
  const lastTick = status?.last_tick_at
    ? new Date(status.last_tick_at).toLocaleTimeString()
    : t('geo.evaluator.never');

  return (
    <section className="border-t border-border-light px-3 py-2" data-testid="evaluator-status">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold mb-1.5">
        {t('geo.evaluator.title')}
      </p>
      <div className="flex items-center gap-2 text-[12px] font-mono">
        <span
          data-testid="evaluator-dot"
          className={cn('inline-block w-2 h-2', active ? 'bg-success' : 'bg-muted-on-light')}
        />
        <span className={active ? 'text-success' : 'text-muted-on-light'}>
          {active ? t('geo.evaluator.active') : t('geo.evaluator.inactive')}
        </span>
        <span className="ml-auto text-muted-on-light">{lastTick}</span>
      </div>
      <div className="text-[10px] font-mono text-muted-on-light mt-1 space-y-0.5">
        <div>{t('geo.evaluator.geofences')}: {status?.geofences_evaluated ?? 0}</div>
        <div>{t('geo.evaluator.objects')}: {status?.objects_scanned ?? 0}</div>
      </div>
      {canRun && (
        <button
          type="button"
          data-testid="evaluator-run-once"
          disabled={running}
          onClick={runOnce}
          className="mt-2 w-full h-7 text-[11px] bg-raised-light border border-border-light text-text-on-light hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Play className="w-3 h-3" strokeWidth={1.5} /> {t('geo.evaluator.runOnce')}
        </button>
      )}
    </section>
  );
}
