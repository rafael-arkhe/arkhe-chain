'use client';

/**
 * <TableCountBadge /> — Sprint L1.2 (2026-05-23).
 *
 * Foundry best-practice "Always include counts to indicate the length of
 * tables and lists by configuring a Metric Card widget in the table's
 * section header. Choose Tag as your layout style."
 *
 * Use em headers de listas/tabelas para indicar contagem total + filtro
 * ativo. Estilo Palantir-sharp tag.
 *
 * Uso:
 *   <TableCountBadge total={150} filtered={42} />
 *   <TableCountBadge total={3} singular="Sala" plural="Salas" />
 */
import * as React from 'react';
import { cn } from '@/lib/cn';

interface Props {
  /** Total absoluto (sem filtro). */
  total: number;
  /** Quando há filtro ativo, mostra `42 / 150`. */
  filtered?: number;
  /** Label singular pt-BR (ex.: "Sala"). */
  singular?: string;
  /** Label plural pt-BR (ex.: "Salas"). */
  plural?: string;
  /** Tom visual: default (cinza), primary (azul), muted (apagado). */
  tone?: 'default' | 'primary' | 'muted';
  className?: string;
  'data-testid'?: string;
}

export function TableCountBadge({
  total,
  filtered,
  singular,
  plural,
  tone = 'default',
  className,
  'data-testid': testId = 'table-count-badge',
}: Props) {
  const hasFilter = filtered !== undefined && filtered !== total;
  const noun =
    singular && plural ? (total === 1 ? singular : plural) : undefined;

  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-mono uppercase tracking-wide border',
        tone === 'primary' && 'bg-white border-primary text-primary',
        tone === 'default' && 'bg-canvas-light border-border-light text-text-on-light',
        tone === 'muted' && 'bg-canvas-light border-border-light text-muted-on-light',
        className,
      )}
    >
      {hasFilter ? (
        <>
          <span className="font-semibold">{filtered}</span>
          <span className="opacity-60">/</span>
          <span>{total}</span>
        </>
      ) : (
        <span className="font-semibold">{total}</span>
      )}
      {noun && <span className="opacity-80">{noun}</span>}
    </span>
  );
}
