'use client';

/**
 * Onda I.5 (2026-05-23) — ComunicadoStatusBadge.
 *
 * Deriva o status temporal de um ComunicadoOut a partir dos campos
 * `schedule_start`, `schedule_end` e `deleted_at`. NÃO consulta backend —
 * é puro client-side derivation. Backend é a source of truth.
 *
 * 5 estados visuais (espelho do filtro `status_temporal` do router):
 *  - ``active``   — em janela vigente (default quando schedule_start/end nulos).
 *  - ``future``   — schedule_start no futuro.
 *  - ``past``     — schedule_end no passado.
 *  - ``deleted``  — soft-delete preserva linha no histórico.
 *  - ``draft``    — não usado hoje (todo comunicado salvo já é publicado),
 *                   reservado para Onda I.5+.
 *
 * Memórias honradas:
 *  - feedback_no_rounded_no_sparkles · zero rounded-*.
 *  - feedback_no_emojis_in_ui · só ícones lucide.
 *  - feedback_no_palantir_product_names · zero produto Foundry/Slate.
 */
import * as React from 'react';
import {
  Activity,
  Clock,
  History,
  Trash2,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ComunicadoOut } from '@/lib/api';

export type ComunicadoStatus =
  | 'active'
  | 'future'
  | 'past'
  | 'deleted'
  | 'draft';

export function deriveStatus(
  c: Pick<ComunicadoOut, 'schedule_start' | 'schedule_end' | 'deleted_at'>,
  now: Date = new Date(),
): ComunicadoStatus {
  if (c.deleted_at) return 'deleted';
  const nowMs = now.getTime();
  if (c.schedule_start) {
    const start = Date.parse(c.schedule_start);
    if (!Number.isNaN(start) && start > nowMs) return 'future';
  }
  if (c.schedule_end) {
    const end = Date.parse(c.schedule_end);
    if (!Number.isNaN(end) && end < nowMs) return 'past';
  }
  return 'active';
}

interface StatusMeta {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Tailwind class — borda + cor do texto + fundo suave. */
  cls: string;
}

const STATUS_META: Record<ComunicadoStatus, StatusMeta> = {
  active: {
    label: 'Ativo',
    icon: Activity,
    cls: 'border-success text-success bg-success/10',
  },
  future: {
    label: 'Agendado',
    icon: Clock,
    cls: 'border-warning text-warning bg-warning/10',
  },
  past: {
    label: 'Expirado',
    icon: History,
    cls: 'border-muted-on-light text-muted-on-light bg-canvas-light',
  },
  deleted: {
    label: 'Excluído',
    icon: Trash2,
    cls: 'border-danger text-danger bg-danger/10',
  },
  draft: {
    label: 'Rascunho',
    icon: FileText,
    cls: 'border-border-light text-muted-on-light bg-canvas-light',
  },
};

export function ComunicadoStatusBadge({
  status,
  className,
  testId,
}: {
  status: ComunicadoStatus;
  className?: string;
  testId?: string;
}) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span
      data-testid={testId ?? `comunicado-status-${status}`}
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 h-5 text-[10px] font-semibold uppercase tracking-[0.1em] border',
        m.cls,
        className,
      )}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={1.5} aria-hidden />
      <span>{m.label}</span>
    </span>
  );
}
