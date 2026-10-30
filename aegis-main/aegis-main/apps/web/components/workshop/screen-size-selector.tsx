'use client';

/**
 * ScreenSizeSelector — dropdown de tamanho de tela do canvas do editor.
 *
 * Onda M1.d (2026-05-23) — paridade com o "screen size dropdown" do canto
 * superior direito do canvas no editor de apps do Foundry. Permite simular
 * larguras de viewport (desktop / tablet / mobile) sem sair do editor, pra
 * conferir como o layout responsivo se comporta.
 *
 * Estado puramente de visualização (não é domínio): o WorkshopEditor guarda
 * o valor selecionado e restringe a largura do canvas. Default = Full
 * (largura natural do canvas, sem restrição).
 *
 * Visual: light-theme, sharp (sem rounded), focus-visible ring, aria-label.
 */

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Monitor, Smartphone, Tablet } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ScreenSizeValue = 'full' | 'desktop' | 'tablet' | 'mobile';

interface Option {
  value: ScreenSizeValue;
  label: string;
  /** Largura simulada em px; `null` = sem restrição (preenche o canvas). */
  width: number | null;
  icon: typeof Monitor;
}

export const SCREEN_SIZES: readonly Option[] = [
  { value: 'full', label: 'Tela cheia', width: null, icon: Monitor },
  { value: 'desktop', label: 'Desktop · 1280', width: 1280, icon: Monitor },
  { value: 'tablet', label: 'Tablet · 768', width: 768, icon: Tablet },
  { value: 'mobile', label: 'Celular · 375', width: 375, icon: Smartphone },
] as const;

export function widthForScreenSize(value: ScreenSizeValue): number | null {
  return SCREEN_SIZES.find((s) => s.value === value)?.width ?? null;
}

export function ScreenSizeSelector({
  value,
  onChange,
}: {
  value: ScreenSizeValue;
  onChange: (value: ScreenSizeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const current = SCREEN_SIZES.find((s) => s.value === value) ?? SCREEN_SIZES[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="workshop-screen-size"
        aria-label="Tamanho de tela do canvas"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Pré-visualizar o canvas em diferentes larguras de tela"
        className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <CurrentIcon className="w-3 h-3" strokeWidth={1.5} />
        <span>{current.label}</span>
        <ChevronDown
          className={cn('w-3 h-3 transition-transform', open && 'rotate-180')}
          strokeWidth={1.5}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Tamanhos de tela"
          data-testid="workshop-screen-size-menu"
          className="absolute top-full right-0 mt-1 bg-white border border-border-light shadow-xl z-40 w-[180px] py-1 text-text-on-light"
        >
          {SCREEN_SIZES.map((opt) => {
            const Icon = opt.icon;
            const active = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  data-testid={`workshop-screen-size-option-${opt.value}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 h-8 text-[11.5px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                    active
                      ? 'bg-primary/5 text-primary'
                      : 'text-text-on-light hover:bg-canvas-light',
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {active && (
                    <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
