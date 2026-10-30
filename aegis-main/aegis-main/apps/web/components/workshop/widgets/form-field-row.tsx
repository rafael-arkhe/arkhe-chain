'use client';

/**
 * Form Field Row — Onda K.2 (2026-05-23).
 *
 * Renderiza UM campo do Form Widget no runtime, de acordo com seu
 * `type`. Cobre os 16 tipos do ticket:
 *   text · textarea · number · integer · date · datetime · boolean ·
 *   select · multi_select · radio · checkbox_group · lookup · file ·
 *   hidden · section · computed.
 *
 * O campo `lookup` (o "procv") busca na ontologia via
 * `OntologyNodes.search` — grava o id do nó selecionado como valor.
 * `computed` é read-only e mostra um valor derivado (resolvido pelo
 * widget pai). `section` é um divisor visual. `hidden` não renderiza.
 *
 * Estética Palantir-sharp: sem rounded, sem emojis, sem Sparkles. Labels
 * humanos. Focus rings + aria.
 */
import * as React from 'react';
import { Search, X, Check, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { OntologyNodes, type OntologyNodeSearchItem } from '@/lib/api';
import type { FormFieldSpec } from '@/lib/api';

export interface FormFieldRowProps {
  field: FormFieldSpec;
  value: unknown;
  /** Quando o campo está obrigatório APÓS resolver regras condicionais. */
  effectiveRequired: boolean;
  onChange: (value: unknown) => void;
  /** Mensagem de erro do campo (validação), se houver. */
  error?: string;
  disabled?: boolean;
}

function FieldLabel({
  field,
  required,
}: {
  field: FormFieldSpec;
  required: boolean;
}) {
  return (
    <span className="block mb-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {field.label || field.key}
        {required && (
          <span className="text-danger ml-1" aria-label="obrigatório">
            *
          </span>
        )}
      </span>
      {field.help_text ? (
        <span className="block text-[9px] normal-case tracking-normal text-muted-on-light mt-0.5">
          {field.help_text}
        </span>
      ) : null}
    </span>
  );
}

/** Adorno de input: prefixo (R$) / sufixo (% , unidade). Sharp, sem rounded. */
function Adorned({
  prefix,
  suffix,
  children,
}: {
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  if (!prefix && !suffix) return <>{children}</>;
  return (
    <div className="relative flex items-center">
      {prefix ? (
        <span className="absolute left-2 text-[11px] text-muted-on-light pointer-events-none">
          {prefix}
        </span>
      ) : null}
      <span className={`block w-full ${prefix ? '[&_input]:pl-7' : ''} ${suffix ? '[&_input]:pr-9' : ''}`}>
        {children}
      </span>
      {suffix ? (
        <span className="absolute right-2 text-[11px] text-muted-on-light pointer-events-none">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

const INPUT_CLS =
  'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary text-text-on-light';

/** Lookup ontológico — busca nós e grava o id selecionado ("procv"). */
function LookupField({
  field,
  value,
  onChange,
  required,
  disabled,
}: {
  field: FormFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  required: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<OntologyNodeSearchItem[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [label, setLabel] = React.useState<string>('');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedId = typeof value === 'string' ? value : '';

  const runSearch = React.useCallback(
    async (text: string) => {
      setLoading(true);
      try {
        const items = await OntologyNodes.search({
          q: text,
          node_type: field.ref_node_type || undefined,
          limit: 15,
        });
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [field.ref_node_type],
  );

  const onType = (text: string) => {
    setQuery(text);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(text), 250);
  };

  return (
    <div className="relative">
      <FieldLabel field={field} required={required} />
      {selectedId && label ? (
        <div className="flex items-center gap-1.5 h-7 px-2 bg-canvas-light border border-primary text-[11px]">
          <Check className="w-3 h-3 text-primary shrink-0" strokeWidth={1.5} />
          <span className="flex-1 truncate text-text-on-light">{label}</span>
          <button
            type="button"
            aria-label="Remover seleção"
            disabled={disabled}
            onClick={() => {
              onChange(undefined);
              setLabel('');
              setQuery('');
            }}
            className="hover:text-danger"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light pointer-events-none"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            disabled={disabled}
            placeholder={field.placeholder || 'Buscar na ontologia…'}
            onChange={(e) => onType(e.target.value)}
            onFocus={() => {
              setOpen(true);
              if (results.length === 0) void runSearch('');
            }}
            data-testid={`form-lookup-${field.key}`}
            className={cn(INPUT_CLS, 'pl-7')}
          />
          {loading && (
            <Loader2
              className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light animate-spin"
              strokeWidth={1.5}
            />
          )}
        </div>
      )}
      {open && !selectedId && (
        <ul
          className="absolute z-20 mt-0.5 w-full max-h-44 overflow-auto bg-white border border-border-light shadow-lg"
          data-testid={`form-lookup-results-${field.key}`}
        >
          {results.length === 0 && !loading && (
            <li className="px-2 py-1.5 text-[10px] text-muted-on-light italic">
              Nenhum resultado.
            </li>
          )}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r.id);
                  setLabel(r.name);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-canvas-light border-b border-border-light last:border-0"
              >
                <span className="text-text-on-light">{r.name}</span>
                <span className="ml-1.5 text-[9px] font-mono text-muted-on-light uppercase">
                  {r.node_type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FormFieldRow({
  field,
  value,
  effectiveRequired,
  onChange,
  error,
  disabled,
}: FormFieldRowProps) {
  const testId = `form-field-${field.key}`;
  const options = Array.isArray(field.options) ? field.options : [];

  // --- structural / non-input types -----------------------------------
  if (field.type === 'hidden' || field.visibility === 'hidden') return null;

  if (field.type === 'section') {
    return (
      <div
        className="pt-2 mt-1 border-t border-border-light"
        data-testid={`form-section-${field.key}`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-on-light">
          {field.label || field.key}
        </p>
      </div>
    );
  }

  if (field.type === 'computed') {
    return (
      <label className="block">
        <FieldLabel field={field} required={false} />
        <div
          data-testid={testId}
          className="w-full min-h-7 px-2 py-1 text-[11px] bg-canvas-light border border-border-light text-muted-on-light font-mono"
        >
          {value == null || value === '' ? '—' : String(value)}
        </div>
      </label>
    );
  }

  if (field.type === 'lookup') {
    return (
      <LookupField
        field={field}
        value={value}
        onChange={onChange}
        required={effectiveRequired}
        disabled={disabled}
      />
    );
  }

  // --- boolean (switch) -------------------------------------------------
  if (field.type === 'boolean') {
    const on = value === true;
    return (
      <div data-testid={`${testId}-wrap`}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={disabled}
          onClick={() => onChange(!on)}
          data-testid={testId}
          className="flex items-center gap-2 group"
        >
          <span
            className={cn(
              'inline-flex items-center w-7 h-4 border transition-colors shrink-0',
              on
                ? 'bg-primary border-primary'
                : 'bg-white border-border-light group-hover:border-primary',
            )}
          >
            <span
              className={cn(
                'inline-block w-3 h-3 bg-white border transition-transform',
                on
                  ? 'translate-x-3 border-primary'
                  : 'translate-x-0 border-border-light',
              )}
            />
          </span>
          <span className="text-[11px] text-text-on-light">
            {field.label || field.key}
            {effectiveRequired && <span className="text-danger ml-1">*</span>}
          </span>
        </button>
        {error && <FieldError error={error} />}
      </div>
    );
  }

  // --- radio (single from options) -------------------------------------
  if (field.type === 'radio') {
    return (
      <fieldset data-testid={`${testId}-wrap`}>
        <FieldLabel field={field} required={effectiveRequired} />
        <div className="flex flex-col gap-1">
          {options.map((opt) => {
            const ov = String(opt);
            return (
              <label
                key={ov}
                className="flex items-center gap-2 text-[11px] cursor-pointer"
              >
                <input
                  type="radio"
                  name={field.key}
                  checked={value === opt}
                  disabled={disabled}
                  onChange={() => onChange(opt)}
                  data-testid={`${testId}-${ov}`}
                  className="w-3 h-3 accent-primary"
                />
                <span className="text-text-on-light">{ov}</span>
              </label>
            );
          })}
        </div>
        {error && <FieldError error={error} />}
      </fieldset>
    );
  }

  // --- checkbox_group / multi_select (array of values) -----------------
  if (field.type === 'checkbox_group' || field.type === 'multi_select') {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    const toggle = (opt: unknown) => {
      if (arr.includes(opt)) {
        onChange(arr.filter((x) => x !== opt));
      } else {
        onChange([...arr, opt]);
      }
    };
    return (
      <fieldset data-testid={`${testId}-wrap`}>
        <FieldLabel field={field} required={effectiveRequired} />
        <div className="flex flex-col gap-1">
          {options.map((opt) => {
            const ov = String(opt);
            return (
              <label
                key={ov}
                className="flex items-center gap-2 text-[11px] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={arr.includes(opt)}
                  disabled={disabled}
                  onChange={() => toggle(opt)}
                  data-testid={`${testId}-${ov}`}
                  className="w-3 h-3 accent-primary"
                />
                <span className="text-text-on-light">{ov}</span>
              </label>
            );
          })}
        </div>
        {error && <FieldError error={error} />}
      </fieldset>
    );
  }

  // --- select (enum dropdown) ------------------------------------------
  if (field.type === 'select') {
    return (
      <label className="block">
        <FieldLabel field={field} required={effectiveRequired} />
        <select
          value={typeof value === 'string' ? value : value == null ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || undefined)}
          data-testid={testId}
          className={INPUT_CLS}
        >
          <option value="">— escolher —</option>
          {options.map((opt) => {
            const ov = String(opt);
            return (
              <option key={ov} value={ov}>
                {ov}
              </option>
            );
          })}
        </select>
        {error && <FieldError error={error} />}
      </label>
    );
  }

  // --- textarea --------------------------------------------------------
  if (field.type === 'textarea') {
    return (
      <label className="block">
        <FieldLabel field={field} required={effectiveRequired} />
        <textarea
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          data-testid={testId}
          className="w-full px-2 py-1 text-[11px] bg-white border border-border-light outline-none focus:border-primary text-text-on-light"
        />
        {error && <FieldError error={error} />}
      </label>
    );
  }

  // --- file upload (stores filename + reads as data is out-of-scope) ----
  if (field.type === 'file') {
    const fileName = typeof value === 'string' ? value : '';
    return (
      <label className="block">
        <FieldLabel field={field} required={effectiveRequired} />
        <div className="flex items-center gap-1.5 h-7 px-2 bg-white border border-border-light text-[11px]">
          <Upload className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
          <input
            type="file"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              onChange(f ? f.name : undefined);
            }}
            data-testid={testId}
            className="flex-1 text-[10px] text-text-on-light file:mr-2 file:border file:border-border-light file:bg-canvas-light file:px-1.5 file:py-0.5 file:text-[10px]"
          />
        </div>
        {fileName && (
          <p className="mt-0.5 text-[9px] font-mono text-muted-on-light">{fileName}</p>
        )}
        {error && <FieldError error={error} />}
      </label>
    );
  }

  // --- number / integer ------------------------------------------------
  if (field.type === 'number' || field.type === 'integer') {
    // Adorno por formato: currency → prefixo R$ ; percent → sufixo % ; unit → sufixo.
    const prefix = field.prefix || (field.format === 'currency' ? 'R$' : undefined);
    const suffix =
      field.suffix || (field.format === 'percent' ? '%' : field.unit || undefined);
    return (
      <label className="block">
        <FieldLabel field={field} required={effectiveRequired} />
        <Adorned prefix={prefix} suffix={suffix}>
          <input
            type="number"
            step={field.type === 'integer' ? 1 : 'any'}
            min={field.minimum ?? undefined}
            max={field.maximum ?? undefined}
            value={
              typeof value === 'number'
                ? value
                : value === '' || value == null
                  ? ''
                  : Number(value)
            }
            disabled={disabled}
            placeholder={field.placeholder}
            onChange={(e) =>
              onChange(e.target.value === '' ? undefined : Number(e.target.value))
            }
            data-testid={testId}
            className={cn(INPUT_CLS, 'font-mono')}
          />
        </Adorned>
        {error && <FieldError error={error} />}
      </label>
    );
  }

  // --- date / datetime / time -----------------------------------------
  if (field.type === 'date' || field.type === 'datetime' || field.type === 'time') {
    const inputType =
      field.type === 'datetime' ? 'datetime-local' : field.type === 'time' ? 'time' : 'date';
    return (
      <label className="block">
        <FieldLabel field={field} required={effectiveRequired} />
        <input
          type={inputType}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || undefined)}
          data-testid={testId}
          className={cn(INPUT_CLS, 'font-mono')}
        />
        {error && <FieldError error={error} />}
      </label>
    );
  }

  // --- text (default) — com formato (email/url/phone/cpf) + adorno -----
  const isUrl = field.format === 'url';
  const htmlType = field.format === 'email' ? 'email' : isUrl ? 'url' : 'text';
  return (
    <label className="block">
      <FieldLabel field={field} required={effectiveRequired} />
      <Adorned prefix={field.prefix} suffix={field.suffix || field.unit}>
        <input
          type={htmlType}
          inputMode={field.format === 'phone' ? 'tel' : undefined}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          className={cn(INPUT_CLS, field.identifier ? 'font-mono' : '')}
        />
      </Adorned>
      {error && <FieldError error={error} />}
    </label>
  );
}

function FieldError({ error }: { error: string }) {
  return (
    <p className="mt-0.5 text-[10px] text-danger font-mono" role="alert">
      {error}
    </p>
  );
}
