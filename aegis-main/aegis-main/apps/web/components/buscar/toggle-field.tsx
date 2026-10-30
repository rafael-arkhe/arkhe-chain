'use client';

/**
 * ToggleField — switch reto (FRENTE FE-A). Campo booleano de fonte (ex.: maigret
 * `incluir_derivados`, `nsfw`). Valor CANÔNICO string: '1' (ligado) | '' (desligado)
 * — o mesmo formato que vira `p_<tool>__<prop>=1` (ou vazio) na URL do SSE.
 *
 * Regras duras: cantos retos (0px), sem rounded-* (o "switch" é um trilho/knob
 * QUADRADO), lucide neutro/sem cor, sem emoji, sem diálogo nativo, i18n via useT.
 * data-testid={`buscar-campo-${name}`} no botão (e2e existentes).
 */
import * as React from 'react';
import { useT } from '@/lib/i18n/provider';

type Props = {
  /** Nome do campo — chave do estado e do data-testid. */
  name: string;
  label: string;
  /** Valor CANÔNICO: '1' (ligado) | '' (desligado). */
  value: string;
  /** Emite o canônico ('1' | ''). */
  onChange: (canonical: string) => void;
  disabled?: boolean;
};

export function ToggleField({ name, label, value, onChange, disabled }: Props) {
  const t = useT();
  const testId = `buscar-campo-${name}`;
  const on = value === '1';

  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        onClick={() => onChange(on ? '' : '1')}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 items-center border transition-colors outline-none',
          'focus:border-primary disabled:opacity-60',
          on ? 'bg-primary border-primary' : 'bg-canvas-light border-border-light',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'block h-3.5 w-3.5 bg-white transition-transform',
            on ? 'translate-x-[18px]' : 'translate-x-[2px]',
          ].join(' ')}
        />
        <span className="sr-only">{on ? t('buscar.toggle.ligado') : t('buscar.toggle.desligado')}</span>
      </button>
    </label>
  );
}
