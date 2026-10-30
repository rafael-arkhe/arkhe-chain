'use client';

/**
 * FormatRulesEditor — Sprint F3 do Parity Audit (2026-05-21).
 *
 * Substitui o textarea JSON cru do prop `format_rules` (consumido pelo
 * `object_table_v2` e pelo `metric_card`) por uma UI visual com linhas
 * `[field?] [op▾] [threshold] [color chip▾] [X]`.
 *
 * Decisões técnicas:
 *   - Não muda `config_schema` do widget de forma quebrável: continua
 *     sendo um único item de schema; só o `field` virou `'format-rules'`
 *     e o renderer do Inspetor decide montar este componente em vez do
 *     textarea genérico.
 *   - O valor canônico armazenado em `widget.props.format_rules`
 *     continua sendo uma STRING JSON. Aceitamos `string | FormatRule[]`
 *     na entrada (tolerância pra apps antigos onde a coluna foi salva
 *     como array no JSONB) mas sempre serializamos pra string ao chamar
 *     `onChange`. Mantém o contrato com os widgets que fazem
 *     `parseFormatRules(cfg.format_rules)` antes de avaliar.
 *   - Toggle "Avançado (JSON)" expõe textarea bruta como fallback —
 *     operadores que copiaram regras de outro painel não precisam
 *     desmontar item a item.
 *   - Suporta dois shapes: regras com `field` (usadas pelo
 *     `object_table_v2`, formatação por célula) e regras sem `field`
 *     (usadas pelo `metric_card`, formatação do valor único). O input
 *     "Coluna" aparece em ambos casos; vazio = sem field (compatível
 *     com metric_card).
 *
 * Ops suportadas: gt, gte, lt, lte, eq.
 * Cores suportadas: success, warning, danger, info, neutral.
 */

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type FormatColor =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';
export type FormatOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface FormatRule {
  /** Opcional — usado por widgets multi-coluna (tabela). */
  field?: string;
  op: FormatOp;
  threshold: number | string;
  color: FormatColor;
}

const OPS: { value: FormatOp; label: string }[] = [
  { value: 'gt', label: 'maior que (>)' },
  { value: 'gte', label: 'maior ou igual (≥)' },
  { value: 'lt', label: 'menor que (<)' },
  { value: 'lte', label: 'menor ou igual (≤)' },
  { value: 'eq', label: 'igual a (=)' },
];

const COLORS: { value: FormatColor; label: string; swatch: string; chipCls: string }[] = [
  {
    value: 'success',
    label: 'Verde',
    swatch: '#16a34a',
    chipCls: 'bg-success/15 text-success border-success/50',
  },
  {
    value: 'warning',
    label: 'Âmbar',
    swatch: '#d97706',
    chipCls: 'bg-warning/15 text-warning border-warning/50',
  },
  {
    value: 'danger',
    label: 'Vermelho',
    swatch: '#dc2626',
    chipCls: 'bg-danger/15 text-danger border-danger/50',
  },
  {
    value: 'info',
    label: 'Azul',
    swatch: '#2563eb',
    chipCls: 'bg-info/15 text-info border-info/50',
  },
  {
    value: 'neutral',
    label: 'Cinza',
    swatch: '#6b7280',
    chipCls: 'bg-raised-light text-muted-on-light border-border-light',
  },
];

function parseRules(value: string | FormatRule[] | undefined | null): FormatRule[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(isPlausible);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(isPlausible);
  } catch {
    // raw inválido — devolve vazio
  }
  return [];
}

function isPlausible(r: unknown): r is FormatRule {
  if (!r || typeof r !== 'object') return false;
  const obj = r as Record<string, unknown>;
  return (
    typeof obj.op === 'string' &&
    'threshold' in obj &&
    typeof obj.color === 'string'
  );
}

function serializeRules(rules: FormatRule[]): string | undefined {
  // Drop campos undefined antes de serializar pra manter o JSON limpo.
  const clean = rules.map((r) => {
    const out: FormatRule = { op: r.op, threshold: r.threshold, color: r.color };
    if (typeof r.field === 'string' && r.field.trim()) out.field = r.field.trim();
    return out;
  });
  if (clean.length === 0) return undefined;
  return JSON.stringify(clean);
}

/** Coerção do input de threshold: tenta number, senão mantém string. */
function coerceThreshold(raw: string): number | string {
  if (raw === '') return '';
  const n = Number(raw);
  if (!Number.isNaN(n) && raw.trim() !== '') return n;
  return raw;
}

export function FormatRulesEditor({
  value,
  onChange,
  label,
  description,
}: {
  value: string | FormatRule[] | undefined | null;
  onChange: (v: string | undefined) => void;
  label: string;
  description?: string;
}) {
  const [advanced, setAdvanced] = React.useState(false);
  // Raw text controlado APENAS quando o modo avançado tá aberto. Senão,
  // derivamos do prop pra que mudanças externas (paleta sincroniza) reflitam.
  const initialRaw = typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
  const [raw, setRaw] = React.useState(initialRaw);
  const [rawError, setRawError] = React.useState<string | null>(null);

  const rules = React.useMemo(() => parseRules(value), [value]);

  React.useEffect(() => {
    // Sincroniza raw quando o pai muda o valor (ex.: toggle modo simples salva).
    if (!advanced) {
      const next = typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
      setRaw(next);
      setRawError(null);
    }
  }, [value, advanced]);

  const patch = (idx: number, fields: Partial<FormatRule>) => {
    const next = rules.map((r, i) => (i === idx ? { ...r, ...fields } : r));
    onChange(serializeRules(next));
  };

  const removeRow = (idx: number) => {
    const next = rules.filter((_, i) => i !== idx);
    onChange(serializeRules(next));
  };

  const addRow = () => {
    const next: FormatRule[] = [
      ...rules,
      { op: 'gte', threshold: 0, color: 'warning' },
    ];
    onChange(serializeRules(next));
  };

  const commitRaw = () => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange(undefined);
      setRawError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        setRawError('JSON precisa ser uma lista de regras.');
        return;
      }
      const valid = parsed.filter(isPlausible);
      if (valid.length !== parsed.length) {
        setRawError('Algumas regras foram descartadas — verifique campos op/threshold/color.');
      } else {
        setRawError(null);
      }
      onChange(serializeRules(valid));
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'JSON inválido');
    }
  };

  return (
    <div data-testid="format-rules-builder">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          data-testid="format-rules-toggle-advanced"
          className={cn(
            'text-[10px] font-mono px-1.5 py-0.5 border',
            advanced
              ? 'bg-primary/10 text-primary border-primary/40'
              : 'bg-canvas-light text-muted-on-light border-border-light hover:border-primary hover:text-primary',
          )}
        >
          {advanced ? 'Visual' : 'Avançado (JSON)'}
        </button>
      </div>

      {!advanced && (
        <>
          {rules.length === 0 ? (
            <p className="text-[11px] text-muted-on-light italic px-2 py-1.5 border border-dashed border-border-light">
              Nenhuma regra. A primeira que casar com o valor vence.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rules.map((r, i) => (
                <li
                  key={i}
                  data-testid={`format-rules-row-${i}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-1 items-center"
                >
                  <input
                    type="text"
                    value={r.field ?? ''}
                    onChange={(e) => patch(i, { field: e.target.value || undefined })}
                    placeholder="Coluna (vazio = valor único)"
                    data-testid={`format-rules-row-${i}-field`}
                    className="min-w-0 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
                  />
                  <select
                    value={r.op}
                    onChange={(e) => patch(i, { op: e.target.value as FormatOp })}
                    data-testid={`format-rules-row-${i}-op`}
                    className="h-7 px-1 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
                  >
                    {OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={String(r.threshold ?? '')}
                    onChange={(e) =>
                      patch(i, { threshold: coerceThreshold(e.target.value) })
                    }
                    placeholder="valor"
                    data-testid={`format-rules-row-${i}-threshold`}
                    className="w-[80px] h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
                  />
                  <ColorPicker
                    value={r.color}
                    onChange={(c) => patch(i, { color: c })}
                    testId={`format-rules-row-${i}-color`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    data-testid={`format-rules-row-${i}-remove`}
                    aria-label="Remover regra"
                    title="Remover regra"
                    className="h-7 w-7 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger/40"
                  >
                    <X className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={addRow}
            data-testid="format-rules-add"
            className="mt-2 h-7 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} /> Adicionar regra
          </button>
        </>
      )}

      {advanced && (
        <div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={commitRaw}
            rows={6}
            placeholder='[{"field":"valor","op":"gte","threshold":100,"color":"danger"}]'
            className="w-full px-2 py-1.5 text-[10.5px] font-mono bg-white border border-border-light outline-none focus:border-primary resize-y"
          />
          {rawError && (
            <p className="mt-1 text-[10px] text-danger">{rawError}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-on-light leading-snug">
            Editar como JSON puro. Sai do campo (blur) pra aplicar.
          </p>
        </div>
      )}

      {description && (
        <p className="mt-1 text-[10px] text-muted-on-light leading-snug">
          {description}
        </p>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  testId,
}: {
  value: FormatColor;
  onChange: (c: FormatColor) => void;
  testId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = COLORS.find((c) => c.value === value) ?? COLORS[4];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
        title={`Cor: ${current.label}`}
        className={cn(
          'h-7 px-2 text-[10px] border font-mono flex items-center gap-1.5 min-w-[88px]',
          current.chipCls,
        )}
      >
        <span
          className="inline-block w-3 h-3 border border-black/10"
          style={{ backgroundColor: current.swatch }}
        />
        {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-canvas-light border border-border-light w-[140px] surface-light">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                onChange(c.value);
                setOpen(false);
              }}
              className={cn(
                'w-full text-left text-[10.5px] px-2 py-1 flex items-center gap-1.5 hover:bg-raised-light',
                c.value === value && 'bg-primary/5',
              )}
            >
              <span
                className="inline-block w-3 h-3 border border-black/10"
                style={{ backgroundColor: c.swatch }}
              />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
