'use client';

/**
 * NumberField — inteiro compacto SEM unidade (P1 FUNDAÇÃO, kind 'number').
 * Campo numérico de fonte (ex.: limit/count/ano/mês/dias) que o upstream honra.
 * Valor CANÔNICO: só DÍGITOS — vira `p_<tool>__<prop>=<n>` na URL do SSE.
 *
 * Difere do DurationField por NÃO ter sufixo de unidade. Respeita min/max/step
 * vindos do `ui_fields` do adapter (sobrepostos no FormatSpec via fieldUIForKind).
 * Erro de FAIXA inline (span text-danger) no blur — nunca diálogo nativo.
 *
 * Regras duras: cantos retos (0px), sem rounded-*, lucide neutro/sem cor, sem
 * emoji, i18n via useT. data-testid={`buscar-campo-${name}`} no input (e2e).
 */
import * as React from 'react';
import { fieldUIForKind } from '@/lib/buscar/field-ui';
import { useT } from '@/lib/i18n/provider';

const FIELD_CLS =
  'h-9 px-2 bg-canvas-light border border-border-light text-[12px] text-text-on-light outline-none focus:border-primary disabled:opacity-60 font-mono w-28';

type Props = {
  /** Nome do campo — chave do estado e do data-testid. */
  name: string;
  label: string;
  /** Valor CANÔNICO (só dígitos). */
  value: string;
  /** Emite o canônico (só dígitos). */
  onChange: (canonical: string) => void;
  /** Faixa/passo — de `ui_fields[propKey]`. */
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
};

export function NumberField({
  name,
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: Props) {
  const t = useT();
  const testId = `buscar-campo-${name}`;
  // Reusa o motor data-driven: kind 'number' com overrides de faixa.
  const ui = React.useMemo(
    () => fieldUIForKind('number', { min, max, step }),
    [min, max, step],
  );
  const [error, setError] = React.useState<string>('');

  const handle = (raw: string) => {
    const canonical = ui.unmask(raw);
    if (error) setError('');
    onChange(canonical);
  };

  const handleBlur = () => {
    const res = ui.validate(value);
    setError(res.ok ? '' : t(res.errorKey));
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => handle(e.target.value)}
        onBlur={handleBlur}
        data-testid={testId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={FIELD_CLS}
      />
      {error && (
        <span className="text-[10px] text-danger" data-testid={`${testId}-erro`}>
          {error}
        </span>
      )}
    </label>
  );
}
