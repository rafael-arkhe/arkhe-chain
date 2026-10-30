'use client';

/**
 * <CpEmptyState /> — Sprint UX-2.16 (2026-05-22).
 *
 * Estado vazio reusável para listas do painel de controle. Foundry-pattern:
 * ícone + título + descrição + CTA primário.
 *
 * Estilo Palantir-sharp: sem rounded, sem Sparkles, sem emoji.
 */
import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  /** Ícone lucide-react (passar componente, não JSX). */
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Texto + handler do botão principal (CTA). */
  cta?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  /** Action secundário (ex: "Aprender mais"). */
  secondary?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  /** Classes Tailwind extras pro container. */
  className?: string;
}

export function CpEmptyState({
  icon: Icon,
  title,
  description,
  cta,
  secondary,
  className,
}: Props) {
  return (
    <div
      data-testid="cp-empty-state"
      className={cn(
        'bg-canvas-light border border-border-light p-8 flex flex-col items-center justify-center text-center',
        className,
      )}
    >
      <span className="inline-flex w-12 h-12 items-center justify-center bg-white border border-border-light mb-3">
        <Icon className="w-5 h-5 text-muted-on-light" strokeWidth={1.5} />
      </span>
      <h3 className="text-[13px] font-semibold text-text-on-light">{title}</h3>
      {description && (
        <p className="text-[11.5px] text-muted-on-light mt-1 max-w-[420px]">
          {description}
        </p>
      )}
      {(cta || secondary) && (
        <div className="flex items-center gap-2 mt-4">
          {cta && (
            <button
              type="button"
              onClick={cta.onClick}
              data-testid={cta.testId ?? 'cp-empty-cta'}
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover"
            >
              {cta.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              data-testid={secondary.testId ?? 'cp-empty-secondary'}
              className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
