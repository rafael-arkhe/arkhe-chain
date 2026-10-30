'use client';

/**
 * <TourRunner /> — Wave H.1 (2026-05-23).
 *
 * Runtime headless do Tour. Monta no <AuthShell />, detecta tours
 * ativos e não-vistos pelo usuário atual, e dispara <TourPreview /> em
 * preview-mode-OFF (marca seen) quando o operador entra numa página
 * que casa com ``trigger.target_pages``.
 *
 * Critérios de exibição (todos precisam ser true):
 *   1. Existe Sala ativa no escopo (precisa de hint via prop ou env;
 *      MVP: olha pra ``/sala/{slug}`` na pathname e usa o slug)
 *   2. ``WorkspaceUpdates.listUnseen`` retorna ≥ 1 item
 *   3. Tour.trigger.target_pages está vazio OU contém pathname atual
 *      (prefix match)
 *   4. Tour.trigger.start_at <= now <= end_at (se ambos definidos)
 *
 * Quando dispara: marca seen + dismissed=false → ao concluir/fechar,
 * o usuário não vê mais até ser arquivado/recriado.
 *
 * Honra DS:
 *   - feedback_no_rounded_no_sparkles · sharp edges
 *   - feedback_no_emojis_in_ui · zero emoji
 *   - feedback_no_phase_status_in_ui · sem "Fase X" / "Em desenvolvimento"
 */
import * as React from 'react';
import { usePathname } from 'next/navigation';
import { WorkspaceUpdates, Workspaces, type WorkspaceUpdate } from '@/lib/api';
import { TourPreview } from './tour-preview';

interface TourRunnerProps {
  /** Override do workspace alvo. Útil em testes. */
  workspaceId?: string;
  /** Se true, desliga o runner (modo painel de controle, login, etc.). */
  disabled?: boolean;
}

export function TourRunner({ workspaceId, disabled }: TourRunnerProps) {
  const pathname = usePathname() || '';
  const [activeTour, setActiveTour] = React.useState<WorkspaceUpdate | null>(null);
  const [resolvedId, setResolvedId] = React.useState<string | null>(workspaceId ?? null);

  // Step 1: resolve workspaceId from pathname `/sala/{slug}` if not provided.
  React.useEffect(() => {
    if (workspaceId) {
      setResolvedId(workspaceId);
      return;
    }
    if (disabled) return;
    const match = pathname.match(/^\/sala\/([^/?#]+)/);
    if (!match) {
      setResolvedId(null);
      return;
    }
    const slug = match[1];
    Workspaces.list({ limit: 200 })
      .then((rows) => {
        const found = rows.find((w) => w.slug === slug);
        setResolvedId(found?.id ?? null);
      })
      .catch(() => setResolvedId(null));
  }, [workspaceId, pathname, disabled]);

  // Step 2: fetch unseen tours when we have a workspace + pathname.
  React.useEffect(() => {
    if (disabled || !resolvedId) {
      setActiveTour(null);
      return;
    }
    let cancelled = false;
    WorkspaceUpdates.listUnseen(resolvedId)
      .then((tours) => {
        if (cancelled) return;
        const now = new Date();
        const eligible = tours.find((t) => isTourEligible(t, pathname, now));
        setActiveTour(eligible ?? null);
      })
      .catch(() => {
        if (!cancelled) setActiveTour(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedId, pathname, disabled]);

  const markSeen = React.useCallback(
    (dismissed: boolean) => {
      if (!activeTour || !resolvedId) return;
      WorkspaceUpdates.markSeen(resolvedId, activeTour.id, { dismissed }).catch(
        () => undefined,
      );
    },
    [activeTour, resolvedId],
  );

  if (!activeTour) return null;

  return (
    <div data-testid="tour-runner-active">
      <TourPreview
        title={activeTour.title}
        summary={activeTour.summary}
        pages={activeTour.pages}
        previewOnly={false}
        onClose={() => {
          markSeen(true);
          setActiveTour(null);
        }}
        onComplete={() => {
          markSeen(false);
        }}
      />
    </div>
  );
}

/**
 * Wave H.1 (2026-05-23) — predicate isolada pra ser testável.
 *
 * Retorna true se o Tour ``t`` deve aparecer para o operador na
 * ``pathname`` no momento ``now``.
 */
export function isTourEligible(
  t: WorkspaceUpdate,
  pathname: string,
  now: Date,
): boolean {
  if (t.status !== 'active') return false;
  const trigger = t.trigger ?? null;
  if (trigger) {
    if (trigger.start_at) {
      const start = new Date(trigger.start_at);
      if (!Number.isNaN(start.getTime()) && now < start) return false;
    }
    if (trigger.end_at) {
      const end = new Date(trigger.end_at);
      if (!Number.isNaN(end.getTime()) && now >= end) return false;
    }
    const targets = trigger.target_pages ?? [];
    if (targets.length > 0) {
      const match = targets.some((p) =>
        pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'),
      );
      if (!match) return false;
    }
  }
  return true;
}
