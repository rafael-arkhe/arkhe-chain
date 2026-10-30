'use client';

/**
 * Wave 1 inc2 — NodeFieldsRenderer: o renderer GENÉRICO de um nó do DAG.
 *
 * Espelho do ParameterInputList do n8n (research/n8n/.../ParameterInputList.vue):
 * itera `fields: NodeFieldSpec[]`, FILTRA por `displayOptions` (motor puro em
 * lib/pipeline/node-fields), despacha por `type` para o widget, e RECURSA em
 * `collection` (grupo repetível). O escape hatch `custom` aponta um widget bespoke
 * por chave (filtro/code/tools/pickers) — o registro declara o comum, delega o raro.
 *
 * Reuso: os leaf widgets espelham a estética do SchemaForm (sharp, sem emoji);
 * refs dinâmicas (colunas/datasets/coleções) vêm de `resolveOptions` injetado pelo
 * caller (que tem acesso a inputCols/datasets/etc.). Zero componente por-nó.
 */
import * as React from 'react';
import { Trash2, Plus } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { InfoTip } from '@/components/ui/info-tip';
import { ColumnSelect, ColumnMultiSelect } from '@/components/dados/column-select';
import {
  shouldDisplayField,
  type NodeFieldSpec,
  type NodeFieldOption,
} from '@/lib/pipeline/node-fields';

const INP =
  'h-7 w-full px-2 text-[11.5px] bg-white border border-border-light focus:border-primary outline-none';

/** Widget bespoke referenciado por `type:'custom'` + `typeOptions.widget`. Recebe
 *  o valor do campo + setter + o config inteiro do nó (p/ pickers cross-field). */
export type CustomFieldWidget = React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
  values: Record<string, unknown>;
  testid: string;
}>;

export interface NodeFieldsRendererProps {
  fields: NodeFieldSpec[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Resolve opções dinâmicas (ex.: 'columns' das colunas de entrada, 'collections').
   *  Retorna null = o caller não sabe a fonte (cai em input livre honesto). */
  resolveOptions?: (source: string, dependsOnValue?: string) => NodeFieldOption[] | null;
  customWidgets?: Record<string, CustomFieldWidget>;
  /** loading das colunas de entrada (p/ os widgets column/column-multi). */
  columnsLoading?: boolean;
  testidPrefix?: string;
}

function FieldShell({ label, help, required, children }: {
  label: string; help?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
        {label}
        {required && <span className="text-danger">*</span>}
        {help && <InfoTip text={help} />}
      </Label>
      {children}
    </div>
  );
}

function optionsFor(
  field: NodeFieldSpec,
  resolveOptions?: NodeFieldsRendererProps['resolveOptions'],
  values?: Record<string, unknown>,
): NodeFieldOption[] | null {
  if (field.options && field.options.length) return field.options;
  const src = field.typeOptions?.loadOptions;
  if (src && resolveOptions) {
    const dep = field.typeOptions?.loadOptionsDependsOn;
    const depVal = dep ? String((values ?? {})[dep] ?? '') : undefined;
    return resolveOptions(src, depVal);
  }
  return null;
}

export function NodeFieldsRenderer({
  fields,
  values,
  onChange,
  resolveOptions,
  customWidgets,
  columnsLoading,
  testidPrefix = 'pb-nf',
}: NodeFieldsRendererProps) {
  const visible = fields.filter((f) => shouldDisplayField(f, values));
  return (
    <div className="space-y-3" data-testid={`${testidPrefix}-form`}>
      {visible.map((f) => {
        const tid = f.testid || `${testidPrefix}-${f.key}`;
        const v = values[f.key];
        const to = f.typeOptions ?? {};

        if (f.type === 'notice') {
          return (
            <p key={f.key} className="text-[10px] text-muted-on-light leading-relaxed" data-testid={tid}>
              {f.help || f.label}
            </p>
          );
        }

        if (f.type === 'boolean') {
          return (
            <label key={f.key} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={!!v} data-testid={tid}
                onChange={(e) => onChange(f.key, e.target.checked)}
                className="h-3.5 w-3.5 accent-primary" />
              <span className="text-[11px] text-text-on-light">{f.label}</span>
              {f.help && <InfoTip text={f.help} />}
            </label>
          );
        }

        if (f.type === 'number') {
          const clamp = (raw: string): number | '' => {
            if (raw === '') return '';
            let n = Number(raw);
            if (Number.isNaN(n)) n = to.minValue ?? 0;
            if (to.minValue != null) n = Math.max(to.minValue, n);
            if (to.maxValue != null) n = Math.min(to.maxValue, n);
            return n;
          };
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              {/* valor ausente → cai no default declarado (idioma `?? default`). */}
              <input type="number" data-testid={tid} className={INP}
                value={v == null ? (f.default == null ? '' : Number(f.default)) : Number(v)}
                min={to.minValue} max={to.maxValue} step={to.step}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, clamp(e.target.value))} />
            </FieldShell>
          );
        }

        if (f.type === 'json') {
          const jsonText = typeof v === 'string' ? v : v != null ? JSON.stringify(v, null, 2) : '';
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <textarea data-testid={tid} rows={to.rows ?? 3} spellCheck={false}
                value={jsonText} placeholder={f.placeholder}
                className="w-full px-2 py-1 text-[11px] font-mono bg-white border border-border-light focus:border-primary outline-none resize-y scrollbar-hide"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === '') { onChange(f.key, undefined); return; }
                  try { onChange(f.key, JSON.parse(raw)); } catch { onChange(f.key, raw); }
                }} />
            </FieldShell>
          );
        }

        if (f.type === 'column') {
          const cols = (optionsFor(f, resolveOptions, values) ?? []).map((o) => String(o.value));
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <ColumnSelect testid={tid} value={v == null ? '' : String(v)}
                onChange={(val) => onChange(f.key, val)} cols={cols}
                loading={columnsLoading} placeholder={f.placeholder} />
            </FieldShell>
          );
        }

        if (f.type === 'column-multi') {
          const cols = (optionsFor(f, resolveOptions, values) ?? []).map((o) => String(o.value));
          const arr = Array.isArray(v) ? (v as unknown[]).map(String) : [];
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <ColumnMultiSelect testid={tid} values={arr}
                onChange={(val) => onChange(f.key, val)} cols={cols} loading={columnsLoading} />
            </FieldShell>
          );
        }

        if (f.type === 'options') {
          const opts = optionsFor(f, resolveOptions, values);
          // Sem opções resolvidas E com loader → input livre honesto (rede fora).
          if (opts === null) {
            return (
              <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
                <input type="text" data-testid={tid} className={INP}
                  value={v == null ? '' : String(v)} placeholder={f.placeholder}
                  onChange={(e) => onChange(f.key, e.target.value)} />
              </FieldShell>
            );
          }
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <select data-testid={tid} className={INP} value={String(v ?? f.default ?? '')}
                onChange={(e) => onChange(f.key, e.target.value)}>
                {/* opção vazia só quando NÃO há default real (picker de recurso, ex.
                    board_id): rotulada pelo placeholder. Enum com default (mode/algo)
                    não mostra '—' nem asterisco. */}
                {!f.required && (f.default == null || f.default === '') && (
                  <option value="">{f.placeholder || '—'}</option>
                )}
                {opts.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>{o.name}</option>
                ))}
              </select>
            </FieldShell>
          );
        }

        if (f.type === 'multiOptions') {
          const opts = optionsFor(f, resolveOptions, values) ?? [];
          const arr = Array.isArray(v) ? (v as unknown[]).map(String) : [];
          const toggle = (val: string) => {
            const s = new Set(arr);
            if (s.has(val)) s.delete(val); else s.add(val);
            onChange(f.key, Array.from(s));
          };
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <div className="max-h-40 overflow-y-auto scrollbar-hide border border-border-light bg-white" data-testid={tid}>
                {opts.length === 0 ? (
                  <p className="p-2 text-[11px] text-muted-on-light italic">—</p>
                ) : opts.map((o) => {
                  const val = String(o.value);
                  return (
                    <label key={val} data-testid={`${tid}-${val}`}
                      className="flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer hover:bg-raised-light border-t border-border-light/50 first:border-t-0">
                      <input type="checkbox" checked={arr.includes(val)} onChange={() => toggle(val)} className="accent-primary" />
                      <span className="text-text-on-light">{o.name}</span>
                    </label>
                  );
                })}
              </div>
            </FieldShell>
          );
        }

        if (f.type === 'collection') {
          const itemFields = to.itemFields ?? [];
          const items = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
          const setItem = (i: number, k: string, val: unknown) => {
            const next = items.map((it, idx) => (idx === i ? { ...it, [k]: val } : it));
            onChange(f.key, next);
          };
          const addItem = () => {
            const blank: Record<string, unknown> = {};
            for (const sf of itemFields) if (sf.default !== undefined) blank[sf.key] = sf.default;
            onChange(f.key, [...items, blank]);
          };
          const removeItem = (i: number) => onChange(f.key, items.filter((_, idx) => idx !== i));
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <div className="space-y-2" data-testid={tid}>
                {items.map((it, i) => (
                  <div key={i} className="border border-border-light bg-canvas-light p-2 space-y-2 relative" data-testid={`${tid}-item-${i}`}>
                    <button type="button" onClick={() => removeItem(i)} aria-label="remover"
                      data-testid={`${tid}-remove-${i}`}
                      className="absolute top-1 right-1 text-muted-on-light hover:text-danger">
                      <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <NodeFieldsRenderer
                      fields={itemFields}
                      values={it}
                      onChange={(k, val) => setItem(i, k, val)}
                      resolveOptions={resolveOptions}
                      customWidgets={customWidgets}
                      testidPrefix={`${tid}-${i}`}
                    />
                  </div>
                ))}
                <button type="button" onClick={addItem} data-testid={`${tid}-add`}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                  <Plus className="w-3 h-3" strokeWidth={1.5} /> {to.addButtonText || 'Adicionar'}
                </button>
              </div>
            </FieldShell>
          );
        }

        if (f.type === 'custom') {
          const key = to.widget || '';
          const Widget = customWidgets?.[key];
          if (!Widget) {
            return (
              <p key={f.key} className="text-[10px] text-danger" data-testid={`${tid}-missing`}>
                widget custom &apos;{key}&apos; não registrado
              </p>
            );
          }
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <Widget value={v} onChange={(val) => onChange(f.key, val)} values={values} testid={tid} />
            </FieldShell>
          );
        }

        // default: string (input | textarea | password)
        const multiline = to.multiline || (to.rows && to.rows > 1);
        if (multiline) {
          return (
            <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
              <textarea data-testid={tid} rows={to.rows ?? 3}
                value={v == null ? '' : String(v)} placeholder={f.placeholder}
                className="w-full px-2 py-1 text-[11.5px] bg-white border border-border-light focus:border-primary outline-none resize-y scrollbar-hide"
                onChange={(e) => onChange(f.key, e.target.value)} />
            </FieldShell>
          );
        }
        return (
          <FieldShell key={f.key} label={f.label} help={f.help} required={f.required}>
            <input type={to.password ? 'password' : 'text'} data-testid={tid} className={INP}
              value={v == null ? '' : String(v)} placeholder={f.placeholder}
              onChange={(e) => onChange(f.key, e.target.value)} />
          </FieldShell>
        );
      })}
    </div>
  );
}
