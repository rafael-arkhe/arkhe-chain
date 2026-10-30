'use client';

/**
 * <PropertyMarkingPill /> — Sprint Foundry-F (2026-05-22).
 *
 * Renderiza um badge "shield + label" representando uma Marcação aplicada
 * a uma propriedade de objeto, no estilo Palantir-sharp do AEGIS:
 *   - sem rounded-* (memória `feedback_no_rounded_no_sparkles`)
 *   - sem emojis (memória `feedback_no_emojis_in_ui`)
 *   - sem citar "Foundry"/"Palantir"
 *
 * Modos de exibição (Foundry parity):
 *   - 'responsive' (default): pill condensada com ícone + label truncado
 *   - 'full':      pill completa com ícone + label sem truncate
 *   - 'icon':      apenas o ícone shield; label aparece em title (hover)
 *
 * Strings via useT() em iteração futura. MVP: strings inline.
 */
import { Shield } from 'lucide-react';
import { cn } from '@/lib/cn';

export type PropertyMarkingDisplay = 'responsive' | 'full' | 'icon';

export interface PropertyMarkingItem {
  marking_id: string;
  marking_slug: string;
  marking_display_name: string;
}

interface Props {
  marking: PropertyMarkingItem;
  display?: PropertyMarkingDisplay;
  className?: string;
}

export function PropertyMarkingPill({
  marking,
  display = 'responsive',
  className,
}: Props) {
  const title = `${marking.marking_display_name} · ${marking.marking_slug}`;
  return (
    <span
      data-testid={`property-marking-${marking.marking_slug}`}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-mono uppercase tracking-wide',
        'bg-canvas-light border border-border-light text-text-on-light',
        className,
      )}
    >
      <Shield className="w-3 h-3 shrink-0" strokeWidth={1.5} />
      {display !== 'icon' && (
        <span
          className={cn(
            display === 'responsive' && 'max-w-[80px] truncate',
          )}
        >
          {marking.marking_display_name}
        </span>
      )}
    </span>
  );
}

interface ListProps {
  markings: PropertyMarkingItem[];
  display?: PropertyMarkingDisplay;
  emptyLabel?: string;
}

export function PropertyMarkingPillList({
  markings,
  display = 'responsive',
  emptyLabel,
}: ListProps) {
  if (markings.length === 0) {
    return emptyLabel ? (
      <span className="text-[10px] text-muted-on-light italic">{emptyLabel}</span>
    ) : null;
  }
  return (
    <div className="flex flex-wrap gap-1" data-testid="property-marking-list">
      {markings.map((m) => (
        <PropertyMarkingPill key={m.marking_id} marking={m} display={display} />
      ))}
    </div>
  );
}
