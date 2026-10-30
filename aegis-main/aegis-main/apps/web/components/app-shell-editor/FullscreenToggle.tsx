'use client';

/**
 * FullscreenToggle — Onda I.2 (2026-05-23), Feedback #5.
 *
 * Toggle "Editar em tela cheia" para o composer `/app-shell`. Quando ON,
 * o composer pede ao layout pai pra ocultar a sidenav do Painel de
 * Controle (via prop `data-fullscreen` no root + portal CSS).
 *
 * Componente é puramente apresentacional — a página gerencia o estado
 * e aplica o CSS condicional. Aqui só renderiza o switch.
 */

import * as React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export interface FullscreenToggleProps {
  active: boolean;
  onChange: (next: boolean) => void;
  className?: string;
  testId?: string;
}

export function FullscreenToggle({
  active,
  onChange,
  className,
  testId = 'app-shell-fullscreen-toggle',
}: FullscreenToggleProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      aria-label={
        active ? 'Sair do modo tela cheia' : 'Editar em tela cheia'
      }
      onClick={() => onChange(!active)}
      className={[
        'h-8 px-2.5 text-[12px] border flex items-center gap-1.5 transition-colors',
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-white border-border-light text-text-on-light hover:border-primary',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {active ? (
        <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
      ) : (
        <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
      )}
      <span data-testid={`${testId}-label`}>
        {active ? 'Voltar ao Painel' : 'Editar em tela cheia'}
      </span>
    </button>
  );
}
