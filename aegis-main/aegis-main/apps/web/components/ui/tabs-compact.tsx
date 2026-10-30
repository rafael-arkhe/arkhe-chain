'use client';

/**
 * TabsCompact — Wave I.4 (2026-05-23).
 *
 * Tabs com icon + label curto + badge count + truncate + tooltip nativo.
 * Resolve "as tabs, os textos estão tão grandes que quebram linha"
 * em Marcações por Propriedade — agora linha unica garantida via
 * truncate, scroll horizontal em viewports estreitas, e tooltip via
 * atributo `title` quando o label é maior que o container.
 *
 * Honra DS:
 *   - feedback_no_rounded_no_sparkles · ZERO rounded-*; lucide-react
 *   - role="tablist" + role="tab" + aria-selected
 *   - whitespace-nowrap + truncate em label garantem nunca-quebra-linha
 *   - flex-shrink-0 em cada tab, overflow-x-auto no container
 *   - touch ≥ 36px (h-9) confortável em desktop e funcional em mobile
 *   - focus-visible:ring-2 ring-primary
 */
import * as React from 'react';
import { type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface TabsCompactItem<TValue extends string = string> {
  value: TValue;
  /** Label curto (visível na tab). */
  label: string;
  /** Tooltip + aria-label completo quando label foi encurtado. */
  fullLabel?: string;
  icon?: LucideIcon;
  /** Contador opcional renderizado como badge. */
  count?: number;
  testId?: string;
  disabled?: boolean;
}

export interface TabsCompactProps<TValue extends string = string> {
  items: TabsCompactItem<TValue>[];
  value: TValue;
  onChange: (v: TValue) => void;
  /** ClassName aplicado no container <div role="tablist">. */
  className?: string;
  /** aria-label do tablist (ex: "Eixo de navegação"). */
  ariaLabel?: string;
  /** Max width por tab — default 200px (truncate se label maior). */
  maxTabWidth?: number;
}

export function TabsCompact<TValue extends string = string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
  maxTabWidth = 200,
}: TabsCompactProps<TValue>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-stretch border-b border-border-light bg-white',
        'overflow-x-auto whitespace-nowrap scrollbar-hide',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        const fullText = item.fullLabel ?? item.label;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={fullText}
            title={fullText}
            disabled={item.disabled}
            data-testid={item.testId}
            onClick={() => onChange(item.value)}
            style={{ maxWidth: `${maxTabWidth}px` }}
            className={cn(
              'h-9 px-3 flex items-center gap-1.5 shrink-0',
              'text-[11px] uppercase tracking-wider font-semibold',
              'border-b-2 transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              active
                ? 'bg-canvas-light text-primary border-primary'
                : 'border-transparent text-muted-on-light hover:text-text-on-light',
            )}
          >
            {Icon && (
              <Icon
                className="w-3.5 h-3.5 shrink-0"
                strokeWidth={1.5}
                aria-hidden
              />
            )}
            <span className="truncate">{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                aria-label={`${item.count} itens`}
                className={cn(
                  'shrink-0 inline-flex items-center justify-center',
                  'min-w-[18px] h-[16px] px-1',
                  'text-[10px] font-mono leading-none',
                  'border',
                  active
                    ? 'border-primary text-primary bg-white'
                    : 'border-border-light text-muted-on-light bg-canvas-light',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
