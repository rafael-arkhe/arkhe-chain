'use client';

/**
 * DurationField — número + sufixo de unidade (FRENTE FE-A). Campo de duração de
 * fonte (ex.: maigret/sherlock/wmn `timeout`, em segundos, faixa 5..240). Valor
 * CANÔNICO: só DÍGITOS — vira `p_<tool>__timeout=<n>` na URL do SSE.
 *
 * Respeita min/max/step e a unidade (useT(unitKey ?? 'unit.seconds')) vindos do
 * `ui_fields` do adapter (sobrepostos no FormatSpec via fieldUIForKind). Erro de
 * FAIXA inline (span text-danger) no blur — nunca diálogo nativo.
 *
 * Regras duras: cantos retos (0px), sem rounded-*, neutro, sem emoji, i18n via
 * useT. data-testid={`buscar-campo-${name}`} no input (e2e existentes).
 */
import * as React from 'react';
import { fieldUIForKind } from '@/lib/buscar/field-ui';
import { useT } from '@/lib/i18n/provider';

const FIELD_CLS =
  'h-9 px-2 bg-canvas-light border border-border-light text-[12px] outline-none focus:border-primary disabled:opacity-60 font-mono w-24';

type Props = {
  /** Nome do campo — chave do estado e do data-testid. */
  name: string;
  label: string;
  /** Valor CANÔNICO (só dígitos). */
  value: string;
  /** Emite o canônico (só dígitos). */
  onChange: (canonical: string) => void;
  /** Faixa/passo/unidade — de `ui_fields[propKey]`. */
  min?: number;
  max?: number;
  step?: number;
  unitKey?: string;
  disabled?: boolean;
};

export function DurationField({
  name,
  label,
  value,
  onChange,
  min,
  max,
  step,
  unitKey,
  disabled,
}: Props) {
  const t = useT();
  const testId = `buscar-campo-${name}`;
  // Reusa o motor data-driven: kind 'duration' com overrides de faixa.
  const ui = React.useMemo(
    () => fieldUIForKind('duration', { min, max, step, unitKey }),
    [min, max, step, unitKey],
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
      <span className="flex items-center gap-2">
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
        <span className="text-[10px] text-muted-on-light">
          {t(unitKey ?? ui.unitKey ?? 'unit.seconds')}
        </span>
      </span>
      {error && (
        <span className="text-[10px] text-danger" data-testid={`${testId}-erro`}>
          {error}
        </span>
      )}
    </label>
  );
}
