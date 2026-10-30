'use client';

/**
 * Onda I.3 — chips compactos de tipos da Ontologia usados pelo produto.
 *
 * Aparece no card de catálogo (variant="compact": até N visíveis + "+X").
 * No detail pane usa variant="full" pra mostrar quantidade + descrição.
 *
 * `feedback_no_rounded_no_sparkles`: sem rounded; sharp Palantir-style.
 * `feedback_no_palantir_product_names`: zero nome interno aqui.
 */
import * as React from 'react';
import { Network } from 'lucide-react';
import type { MarketplaceOntologyType } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface OntologyContextChipsProps {
  tipos: MarketplaceOntologyType[];
  variant?: 'compact' | 'full';
  maxVisible?: number;
  testIdPrefix?: string;
}

export function OntologyContextChips({
  tipos,
  variant = 'compact',
  maxVisible = 3,
  testIdPrefix = 'loja-ontology',
}: OntologyContextChipsProps): React.ReactElement | null {
  if (!tipos || tipos.length === 0) {
    return variant === 'full' ? (
      <p
        data-testid={`${testIdPrefix}-empty`}
        className="text-[11.5px] text-muted-on-light italic"
      >
        Não usa tipos da ontologia.
      </p>
    ) : null;
  }

  if (variant === 'compact') {
    const visible = tipos.slice(0, maxVisible);
    const overflow = tipos.length - visible.length;
    return (
      <div
        data-testid={`${testIdPrefix}-chips`}
        className="flex flex-wrap items-center gap-1"
      >
        {visible.map((t) => (
          <span
            key={t.node_type}
            data-testid={`${testIdPrefix}-chip-${t.node_type}`}
            className="h-5 px-1.5 text-[10px] bg-primary/5 text-primary border border-primary/20 flex items-center gap-1"
            title={`${t.node_type} — ${t.descricao_uso || 'tipo da ontologia'}`}
          >
            <Network className="w-2.5 h-2.5" strokeWidth={1.5} aria-hidden />
            {t.node_type}
          </span>
        ))}
        {overflow > 0 && (
          <span
            data-testid={`${testIdPrefix}-overflow`}
            className="h-5 px-1.5 text-[10px] bg-canvas-light text-text-on-light border border-border-light flex items-center"
          >
            +{overflow}
          </span>
        )}
      </div>
    );
  }

  return (
    <ul
      data-testid={`${testIdPrefix}-full`}
      className="space-y-1.5"
    >
      {tipos.map((t) => (
        <li
          key={t.node_type}
          data-testid={`${testIdPrefix}-full-${t.node_type}`}
          className={cn(
            'flex items-start gap-2 text-[11.5px] text-text-on-light',
            'bg-canvas-light border border-border-light px-2 py-1.5',
          )}
        >
          <Network
            className="w-3 h-3 text-primary mt-[2px] shrink-0"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold">{t.node_type}</span>
              {t.quantidade_aprox > 0 && (
                <span className="text-[10px] text-muted-on-light">
                  ≈ {t.quantidade_aprox.toLocaleString('pt-BR')} objeto(s)
                </span>
              )}
            </div>
            {t.descricao_uso && (
              <p className="text-[11px] text-muted-on-light mt-0.5">
                {t.descricao_uso}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
