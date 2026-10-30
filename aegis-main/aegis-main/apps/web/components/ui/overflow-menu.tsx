'use client';

/**
 * OverflowMenu — Wave I.4 (2026-05-23).
 *
 * Botão "..." que agrupa ações secundárias em row densos. Resolve o
 * feedback do operador: "Em 'Salas' tem tanto botão inline que quebrou
 * a visualização do título" — agora só 2 primários ficam visíveis e o
 * restante mora aqui.
 *
 * Honra DS:
 *   - feedback_no_rounded_no_sparkles · ZERO rounded-*; lucide-react MoreHorizontal
 *   - touch target >= 28px (alinha h-7 com h-7 dos primários adjacentes)
 *   - aria-label obrigatório no botão `...`
 *   - focus ring; ESC fecha; click-outside fecha
 *   - itens com tone 'danger' renderizam em vermelho com hover/focus consistente
 */
import * as React from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface OverflowMenuItem {
  /** Identifier estável p/ data-testid + key. */
  key: string;
  /** Texto visível no item. */
  label: string;
  /** Ícone lucide opcional. */
  icon?: LucideIcon;
  /** Handler do clique — recebe close() pra fechar o menu antes/depois. */
  onSelect: () => void;
  /** Render em tom destrutivo (vermelho). */
  tone?: 'default' | 'danger';
  /** Desabilita o item. */
  disabled?: boolean;
}

export interface OverflowMenuProps {
  /** Lista de ações. ORDEM importa — primária primeiro, destrutiva por último. */
  items: OverflowMenuItem[];
  /** aria-label do botão `...` (ex: "Mais ações de Sala Aurora"). */
  ariaLabel: string;
  /** testid do botão `...`. Os itens herdam `${testIdPrefix}-${item.key}`. */
  testIdPrefix?: string;
  /** Altura do botão trigger; default h-7 alinha com botões adjacentes. */
  size?: 'sm' | 'md';
  /** Alinhamento do menu relativo ao trigger. */
  align?: 'start' | 'end';
  /** ClassName extra no trigger. */
  className?: string;
}

export function OverflowMenu({
  items,
  ariaLabel,
  testIdPrefix,
  size = 'sm',
  align = 'end',
  className,
}: OverflowMenuProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const firstItemRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    // Focus first item for keyboard nav.
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerHeight = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testIdPrefix ? `${testIdPrefix}-trigger` : undefined}
        className={cn(
          triggerHeight,
          'inline-flex items-center justify-center bg-white border border-border-light',
          'hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary',
          'text-text-on-light',
          className,
        )}
      >
        <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          data-testid={testIdPrefix ? `${testIdPrefix}-menu` : undefined}
          className={cn(
            'absolute top-full mt-1 z-50 min-w-[200px]',
            'bg-white border border-border-light shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <ul className="py-1">
            {items.map((item, idx) => {
              const Icon = item.icon;
              const itemTestId = testIdPrefix
                ? `${testIdPrefix}-${item.key}`
                : undefined;
              return (
                <li key={item.key} role="none">
                  <button
                    ref={idx === 0 ? firstItemRef : undefined}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    data-testid={itemTestId}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-[12px]',
                      'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                      item.tone === 'danger'
                        ? 'text-danger hover:bg-danger/5'
                        : 'text-text-on-light hover:bg-canvas-light',
                    )}
                  >
                    {Icon && (
                      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
