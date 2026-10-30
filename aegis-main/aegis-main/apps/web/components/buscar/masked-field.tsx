'use client';

/**
 * MaskedField — campo de entrada MODULAR por KIND (FRENTE A).
 *
 * O comportamento (máscara enquanto digita, normalização canônica, validação de
 * dígito verificador, placeholder de fallback, inputMode) é derivado do
 * KIND via fieldUIForKind — ZERO hardcode por fonte/vertical. Um campo `doc`
 * formata 12.345.678/0001-90 ao digitar; CPF inválido mostra erro de DV inline;
 * telefone formata (11) 99999-9999.
 *
 * Contrato: mantém o estado do TEXTO EXIBIDO (mascarado) e emite o valor CANÔNICO
 * (unmask) via onChange — o resto do /buscar nunca vê a máscara. Valida no blur e
 * mostra erro inline (span text-danger), nunca diálogo nativo.
 *
 * inputKind 'select' → UF select; 'date' → input type=date (font-mono); 'masked' →
 * input texto que aplica a máscara do engine. NENHUM branch por tipo de dado —
 * a máscara/validação vêm do motor data-driven (fieldUIForKind).
 * data-testid={`buscar-campo-${name}`} preservado p/ os e2e existentes.
 *
 * Regras duras: cantos retos (0px), ícone neutro/sem ícone, sem emoji, i18n via useT.
 */
import * as React from 'react';
import { fieldUIForKind } from '@/lib/buscar/field-ui';
import { useT } from '@/lib/i18n/provider';
import { MultiselectField } from '@/components/buscar/multiselect-field';
import { ToggleField } from '@/components/buscar/toggle-field';
import { DurationField } from '@/components/buscar/duration-field';
import { NumberField } from '@/components/buscar/number-field';
import { SelectField, type SelectOption } from '@/components/buscar/select-field';

/** UFs do Brasil — movido de buscar-input.tsx; usado pelo input kind `uf`. */
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const FIELD_CLS =
  'h-9 px-2 bg-canvas-light border border-border-light text-[12px] outline-none focus:border-primary disabled:opacity-60';

type Props = {
  /** KIND canônico do campo (vem de fieldKind(name)). */
  kind: string;
  /** Nome do refiner/campo — chave do estado e do data-testid. */
  name: string;
  label: string;
  /** Valor CANÔNICO atual (desmascarado), vindo do store. */
  value: string;
  /** Placeholder da fonte (examples); fallback = ui.placeholderKey via useT. */
  placeholder?: string;
  disabled?: boolean;
  /** Emite o valor CANÔNICO (já desmascarado). */
  onChange: (canonical: string) => void;
  /* ---- Extras dos campos dirigidos por `ui_fields` (FE-B passa) ---- */
  /** Nome do catálogo (multiselect): 'maigret'|'wmn'|'sherlock'… */
  catalog?: string;
  /** Inclui sites NSFW no catálogo (multiselect; gate de FE-B). */
  includeNsfw?: boolean;
  /** Chave i18n de rótulo (labelKey de ui_fields). */
  labelKey?: string;
  /** Faixa/passo/unidade (duration/number). */
  min?: number;
  max?: number;
  step?: number;
  unitKey?: string;
  /** ENUM inline da escolha única (select) — [{value,label}] vindo de ui.options. */
  options?: SelectOption[];
};

export function MaskedField({
  kind,
  name,
  label,
  value,
  placeholder,
  disabled,
  onChange,
  catalog,
  includeNsfw,
  labelKey,
  min,
  max,
  step,
  unitKey,
  options,
}: Props) {
  const t = useT();
  const ui = React.useMemo(
    () => fieldUIForKind(kind, { min, max, step, unitKey }),
    [kind, min, max, step, unitKey],
  );
  const testId = `buscar-campo-${name}`;

  // Estado do TEXTO exibido (mascarado). Sincroniza quando o valor canônico muda
  // por fora (reset do store, autopreenchimento) — re-mascara o valor canônico.
  const [display, setDisplay] = React.useState<string>(() => ui.mask(value));
  React.useEffect(() => {
    // Só re-deriva se o canônico exibido divergir do canônico recebido (evita
    // brigar com a digitação do usuário, que já chama onChange com o canônico).
    if (ui.unmask(display) !== value) setDisplay(ui.mask(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, kind]);

  const [error, setError] = React.useState<string>('');

  const ph = placeholder || t(ui.placeholderKey);

  const handleText = (rawText: string) => {
    const masked = ui.mask(rawText);
    setDisplay(masked);
    if (error) setError(''); // limpa o erro assim que o usuário corrige
    onChange(ui.unmask(masked));
  };

  const handleBlur = () => {
    const res = ui.validate(ui.unmask(display));
    setError(res.ok ? '' : t(res.errorKey));
  };

  // Campos dirigidos por `ui_fields` (ADD): delegam aos componentes dedicados
  // ANTES do fallback. Cada um mantém o contrato value/onChange(string canônica).
  if (ui.inputKind === 'toggle') {
    return (
      <ToggleField name={name} label={label} value={value} onChange={onChange} disabled={disabled} />
    );
  }

  if (ui.inputKind === 'duration') {
    return (
      <DurationField
        name={name}
        label={label}
        value={value}
        onChange={onChange}
        min={ui.min}
        max={ui.max}
        step={ui.step}
        unitKey={ui.unitKey}
        disabled={disabled}
      />
    );
  }

  if (ui.inputKind === 'multiselect') {
    return (
      <MultiselectField
        name={name}
        label={label}
        catalog={catalog ?? ''}
        value={value}
        onChange={onChange}
        includeNsfw={includeNsfw}
        labelKey={labelKey}
        disabled={disabled}
      />
    );
  }

  // number → inteiro compacto com faixa min/max/step (SEM unidade).
  if (ui.inputKind === 'number') {
    return (
      <NumberField
        name={name}
        label={label}
        value={value}
        onChange={onChange}
        min={ui.min}
        max={ui.max}
        step={ui.step}
        disabled={disabled}
      />
    );
  }

  // select → escolha ÚNICA. Com options (enum inline) OU catalog (catálogo
  // dinâmico) delega ao SelectField genérico; SEM nenhum dos dois é o select-uf
  // legado (lista fixa de UFs desenhada aqui dentro — comportamento original).
  if (ui.inputKind === 'select') {
    if ((options && options.length) || catalog) {
      return (
        <SelectField
          name={name}
          label={label}
          value={value}
          onChange={onChange}
          options={options}
          catalog={catalog}
          disabled={disabled}
        />
      );
    }
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          disabled={disabled}
          className={FIELD_CLS}
        >
          <option value="">{t('buscar.input.uf.todas')}</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // date → input type=date (font-mono). O browser valida o formato.
  if (ui.inputKind === 'date') {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{label}</span>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          disabled={disabled}
          className={`${FIELD_CLS} font-mono`}
        />
      </label>
    );
  }

  // demais → input texto mascarado, com validação inline no blur.
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{label}</span>
      <input
        type="text"
        value={display}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
        placeholder={ph}
        data-testid={testId}
        disabled={disabled}
        inputMode={ui.inputMode}
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
