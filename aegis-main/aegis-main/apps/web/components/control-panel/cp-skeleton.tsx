'use client';

/**
 * <CpSkeleton /> + <CpErrorState /> — Sprint UX-4.1 (2026-05-22).
 *
 * Estados reusáveis substituindo "Carregando…" italics e error font-mono
 * crus. Estilo Palantir-sharp.
 */
import * as React from 'react';
import { AlertCircle, RotateCcw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DiagnosticButton } from './diagnostic-button';

/**
 * Skeleton de lista — N linhas de placeholder com pulse leve.
 */
export function CpSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <ul
      data-testid="cp-skeleton"
      aria-busy="true"
      aria-label="Carregando"
      className={cn('space-y-2', className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="bg-canvas-light border border-border-light p-3 flex items-start gap-3 animate-pulse"
        >
          <span className="w-9 h-9 bg-white border border-border-light shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 bg-white border border-border-light w-2/3" />
            <div className="h-2.5 bg-white border border-border-light w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Error state com retry button + icon contextual.
 *
 * Sprint L1.10: accepts opcionalmente `diagnostic` (contexto HTTP) que
 * renderiza o `<DiagnosticButton>` ao lado do retry.
 */
export function CpErrorState({
  title = 'Falha ao carregar',
  description,
  retry,
  retryLabel = 'Tentar novamente',
  icon: Icon = AlertCircle,
  diagnostic,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
  retryLabel?: string;
  icon?: LucideIcon;
  diagnostic?: {
    status?: number;
    method?: string;
    path?: string;
    message?: string;
  };
}) {
  return (
    <div
      data-testid="cp-error-state"
      role="alert"
      className="bg-canvas-light border border-danger/40 p-4 flex items-start gap-3"
    >
      <span className="inline-flex w-8 h-8 items-center justify-center bg-white border border-danger/40 text-danger shrink-0">
        <Icon className="w-4 h-4" strokeWidth={1.5} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-danger">{title}</p>
        {description && (
          <p
            className="text-[11px] font-mono text-muted-on-light mt-1 break-all"
            data-testid="cp-error-detail"
          >
            {description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {retry && (
            <button
              type="button"
              onClick={retry}
              data-testid="cp-error-retry"
              className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
              {retryLabel}
            </button>
          )}
          {diagnostic && (
            <DiagnosticButton
              status={diagnostic.status}
              method={diagnostic.method}
              path={diagnostic.path}
              message={diagnostic.message ?? description}
            />
          )}
        </div>
      </div>
    </div>
  );
}
