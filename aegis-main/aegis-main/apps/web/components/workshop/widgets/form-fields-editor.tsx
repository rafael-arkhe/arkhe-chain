'use client';

/**
 * Form Fields Editor — Onda K.2 (2026-05-23).
 *
 * Editor VISUAL dos campos do Form Widget, renderizado no Inspetor.
 * JAMAIS JSON manual (memory `feedback_no_manual_technical_input`):
 *   - adicionar / remover / reordenar campos (drag via @dnd-kit)
 *   - escolher tipo por DROPDOWN (label humano, nunca o valor cru)
 *   - configurar validação por seletores (required/min/max/len/pattern/msg)
 *   - construir regras condicionais por seletores
 *     (`quando <campo> <operador> <valor> → <efeito>`)
 *   - configurar default dinâmico + opções de enum + fórmula de computed
 *
 * Recebe/devolve `FormFieldSpec[]` (o widget guarda como array no config).
 * Estética Palantir-sharp: sem rounded, sem emojis, sem Sparkles.
 */
import * as React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FormFieldSpec, FormFieldType, FormConditionalRule } from '@/lib/api';

// Labels humanos por tipo (feedback_widget_type_never_raw_in_ui).
const FIELD_TYPE_LABELS: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'date', label: 'Data' },
  { value: 'datetime', label: 'Data e hora' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'select', label: 'Seleção (lista)' },
  { value: 'multi_select', label: 'Múltipla seleção' },
  { value: 'radio', label: 'Opção única' },
  { value: 'checkbox_group', label: 'Caixas de seleção' },
  { value: 'lookup', label: 'Busca na ontologia' },
  { value: 'file', label: 'Arquivo' },
  { value: 'hidden', label: 'Oculto' },
  { value: 'section', label: 'Divisor de seção' },
  { value: 'computed', label: 'Valor calculado' },
];

const OPERATOR_LABELS: { value: FormConditionalRule['operator']; label: string }[] = [
  { value: 'eq', label: 'é igual a' },
  { value: 'neq', label: 'é diferente de' },
  { value: 'gt', label: 'é maior que' },
  { value: 'lt', label: 'é menor que' },
  { value: 'gte', label: 'é maior ou igual a' },
  { value: 'lte', label: 'é menor ou igual a' },
  { value: 'contains', label: 'contém' },
  { value: 'in', label: 'está em (lista)' },
  { value: 'is_empty', label: 'está vazio' },
  { value: 'is_not_empty', label: 'não está vazio' },
];

const EFFECT_LABELS: { value: FormConditionalRule['effect']; label: string }[] = [
  { value: 'show', label: 'mostrar' },
  { value: 'hide', label: 'ocultar' },
  { value: 'require', label: 'tornar obrigatório' },
];

const TYPES_WITH_OPTIONS: FormFieldType[] = [
  'select',
  'multi_select',
  'radio',
  'checkbox_group',
];
const TYPES_WITH_LENGTH: FormFieldType[] = ['text', 'textarea'];
const TYPES_WITH_BOUNDS: FormFieldType[] = ['number', 'integer'];
const STRUCTURAL_TYPES: FormFieldType[] = ['section'];

const SELECT_CLS =
  'h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary text-text-on-light';
const INPUT_CLS =
  'h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary text-text-on-light w-full';

function slugifyKey(label: string, existing: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'campo';
  let key = base;
  let i = 2;
  while (existing.has(key)) key = `${base}_${i++}`;
  return key;
}

export function FormFieldsEditor({
  value,
  onChange,
  label,
  description,
}: {
  value: FormFieldSpec[] | unknown;
  onChange: (v: FormFieldSpec[]) => void;
  label: string;
  description?: string;
}) {
  const fields: FormFieldSpec[] = Array.isArray(value)
    ? (value as FormFieldSpec[])
    : [];
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const update = (idx: number, patch: Partial<FormFieldSpec>) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(fields.filter((_, i) => i !== idx));
  };

  const add = () => {
    const existing = new Set(fields.map((f) => f.key));
    const key = slugifyKey(`campo ${fields.length + 1}`, existing);
    const nf: FormFieldSpec = {
      key,
      label: `Campo ${fields.length + 1}`,
      type: 'text',
      required: false,
    };
    onChange([...fields, nf]);
    setExpanded(key);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.key === active.id);
    const to = fields.findIndex((f) => f.key === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(fields, from, to));
  };

  const fieldKeysForRules = fields.map((f) => f.key);

  return (
    <div data-testid="form-fields-editor">
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
        {label}
      </label>
      {description && (
        <p className="mb-1.5 text-[10px] text-muted-on-light leading-snug">
          {description}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={fields.map((f) => f.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1">
            {fields.map((f, idx) => (
              <SortableFieldCard
                key={f.key}
                field={f}
                expanded={expanded === f.key}
                onToggle={() =>
                  setExpanded((cur) => (cur === f.key ? null : f.key))
                }
                onChange={(patch) => update(idx, patch)}
                onRemove={() => remove(idx)}
                otherFieldKeys={fieldKeysForRules.filter((k) => k !== f.key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {fields.length === 0 && (
        <p className="text-[10px] text-muted-on-light italic py-1">
          Nenhum campo ainda.
        </p>
      )}

      <button
        type="button"
        onClick={add}
        data-testid="form-fields-add"
        className="mt-1.5 h-7 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 text-text-on-light"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} />
        Adicionar campo
      </button>
    </div>
  );
}

function SortableFieldCard({
  field,
  expanded,
  onToggle,
  onChange,
  onRemove,
  otherFieldKeys,
}: {
  field: FormFieldSpec;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<FormFieldSpec>) => void;
  onRemove: () => void;
  otherFieldKeys: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const typeLabel =
    FIELD_TYPE_LABELS.find((t) => t.value === field.type)?.label ?? field.type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border-light bg-white"
      data-testid={`form-fields-card-${field.key}`}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <button
          type="button"
          aria-label="Reordenar campo"
          className="text-muted-on-light hover:text-text-on-light cursor-grab touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          data-testid={`form-fields-toggle-${field.key}`}
          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
          )}
          <span className="text-[11px] text-text-on-light truncate">
            {field.label || field.key}
          </span>
          <span className="text-[9px] font-mono uppercase text-muted-on-light shrink-0">
            {typeLabel}
          </span>
          {field.required && (
            <span className="text-danger text-[11px] shrink-0">*</span>
          )}
          {(field.rules?.length ?? 0) > 0 && (
            <GitBranch className="w-3 h-3 text-primary shrink-0" strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover campo"
          data-testid={`form-fields-remove-${field.key}`}
          className="text-muted-on-light hover:text-danger"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border-light p-2 flex flex-col gap-2">
          <FieldBasics field={field} onChange={onChange} />
          {!STRUCTURAL_TYPES.includes(field.type) &&
            field.type !== 'computed' && (
              <FieldValidation field={field} onChange={onChange} />
            )}
          {TYPES_WITH_OPTIONS.includes(field.type) && (
            <FieldOptions field={field} onChange={onChange} />
          )}
          {field.type === 'lookup' && (
            <FieldLookupConfig field={field} onChange={onChange} />
          )}
          {field.type === 'computed' && (
            <FieldComputedConfig field={field} onChange={onChange} />
          )}
          {!STRUCTURAL_TYPES.includes(field.type) && (
            <FieldDefault field={field} onChange={onChange} />
          )}
          <FieldRules
            field={field}
            onChange={onChange}
            otherFieldKeys={otherFieldKeys}
          />
        </div>
      )}
    </div>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] uppercase tracking-wider text-muted-on-light font-semibold block mb-0.5">
      {children}
    </span>
  );
}

function FieldBasics({
  field,
  onChange,
}: {
  field: FormFieldSpec;
  onChange: (patch: Partial<FormFieldSpec>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <MiniLabel>Rótulo</MiniLabel>
        <input
          type="text"
          value={field.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          data-testid={`form-field-label-${field.key}`}
          className={INPUT_CLS}
        />
      </label>
      <label className="block">
        <MiniLabel>Tipo</MiniLabel>
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FormFieldType })}
          data-testid={`form-field-type-${field.key}`}
          className={cn(SELECT_CLS, 'w-full')}
        >
          {FIELD_TYPE_LABELS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {field.type !== 'section' && field.type !== 'computed' && (
        <>
          <label className="block">
            <MiniLabel>Placeholder</MiniLabel>
            <input
              type="text"
              value={field.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
              className={INPUT_CLS}
            />
          </label>
          <label className="flex items-end gap-1.5 pb-1">
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
              data-testid={`form-field-required-${field.key}`}
              className="w-3 h-3 accent-primary"
            />
            <span className="text-[11px] text-text-on-light">Obrigatório</span>
          </label>
        </>
      )}
    </div>
  );
}

function FieldValidation({
  field,
  onChange,
}: {
  field: FormFieldSpec;
  onChange: (patch: Partial<FormFieldSpec>) => void;
}) {
  const showBounds = TYPES_WITH_BOUNDS.includes(field.type);
  const showLength = TYPES_WITH_LENGTH.includes(field.type);
  const numOrNull = (v: string) => (v === '' ? null : Number(v));
  return (
    <div className="border border-border-light bg-canvas-light p-1.5 flex flex-col gap-1.5">
      <MiniLabel>Validação</MiniLabel>
      {showBounds && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <MiniLabel>Mínimo</MiniLabel>
            <input
              type="number"
              value={field.minimum ?? ''}
              onChange={(e) => onChange({ minimum: numOrNull(e.target.value) })}
              data-testid={`form-field-min-${field.key}`}
              className={cn(INPUT_CLS, 'font-mono')}
            />
          </label>
          <label className="block">
            <MiniLabel>Máximo</MiniLabel>
            <input
              type="number"
              value={field.maximum ?? ''}
              onChange={(e) => onChange({ maximum: numOrNull(e.target.value) })}
              data-testid={`form-field-max-${field.key}`}
              className={cn(INPUT_CLS, 'font-mono')}
            />
          </label>
        </div>
      )}
      {showLength && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <MiniLabel>Mín. caracteres</MiniLabel>
            <input
              type="number"
              value={field.min_length ?? ''}
              onChange={(e) => onChange({ min_length: numOrNull(e.target.value) })}
              className={cn(INPUT_CLS, 'font-mono')}
            />
          </label>
          <label className="block">
            <MiniLabel>Máx. caracteres</MiniLabel>
            <input
              type="number"
              value={field.max_length ?? ''}
              onChange={(e) => onChange({ max_length: numOrNull(e.target.value) })}
              className={cn(INPUT_CLS, 'font-mono')}
            />
          </label>
        </div>
      )}
      {showLength && (
        <label className="block">
          <MiniLabel>Padrão (regex)</MiniLabel>
          <input
            type="text"
            value={field.pattern ?? ''}
            onChange={(e) => onChange({ pattern: e.target.value || null })}
            data-testid={`form-field-pattern-${field.key}`}
            placeholder="ex.: \d{11}"
            className={cn(INPUT_CLS, 'font-mono')}
          />
        </label>
      )}
      <label className="block">
        <MiniLabel>Mensagem de erro personalizada</MiniLabel>
        <input
          type="text"
          value={field.custom_message ?? ''}
          onChange={(e) => onChange({ custom_message: e.target.value || null })}
          placeholder="Opcional — substitui a mensagem padrão"
          className={INPUT_CLS}
        />
      </label>
    </div>
  );
}

function FieldOptions({
  field,
  onChange,
}: {
  field: FormFieldSpec;
  onChange: (patch: Partial<FormFieldSpec>) => void;
}) {
  // Opções uma por linha (UX simples — não é "JSON manual"; é lista).
  const text = (field.options ?? []).map((o) => String(o)).join('\n');
  return (
    <label className="block">
      <MiniLabel>Opções (uma por linha)</MiniLabel>
      <textarea
        value={text}
        onChange={(e) =>
          onChange({
            options: e.target.value
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
          })
        }
        rows={3}
        data-testid={`form-field-options-${field.key}`}
        className="w-full px-2 py-1 text-[11px] bg-white border border-border-light outline-none focus:border-primary text-text-on-light"
      />
    </label>
  );
}

function FieldLookupConfig({
  field,
  onChange,
}: {
  field: FormFieldSpec;
  onChange: (patch: Partial<FormFieldSpec>) => void;
}) {
  return (
    <label className="block">
      <MiniLabel>Tipo de objeto para buscar</MiniLabel>
      <input
        type="text"
        value={field.ref_node_type ?? ''}
        onChange={(e) => onChange({ ref_node_type: e.target.value || null })}
        data-testid={`form-field-ref-${field.key}`}
        placeholder="ex.: Person, Vehicle, Event"
        className={INPUT_CLS}
      />
      <span className="mt-0.5 text-[9px] text-muted-on-light block">
        Restringe a busca a um tipo. Vazio = todos os tipos.
      </span>
    </label>
  );
}

function FieldComputedConfig({
  field,
  onChange,
}: {
  field: FormFieldSpec;
  onChange: (patch: Partial<FormFieldSpec>) => void;
}) {
  return (
    <label className="block">
      <MiniLabel>Fórmula (use {'{campo}'} para referenciar valores)</MiniLabel>
      <input
        type="text"
        value={field.compute_expr ?? ''}
        onChange={(e) => onChange({ compute_expr: e.target.value || undefined })}
        data-testid={`form-field-compute-${field.key}`}
        placeholder="ex.: {nome} ({cpf})"
        className={cn(INPUT_CLS, 'font-mono')}
      />
    </label>
  );
}

function FieldDefault({
  field,
  onChange,
}: {
  field: FormFieldSpec;
  onChange: (patch: Partial<FormFieldSpec>) => void;
}) {
  // Dropdown de fontes dinâmicas comuns + campo livre para variável/literal.
  const presets = [
    { value: '', label: '— sem valor inicial —' },
    { value: '@today', label: 'Data de hoje' },
    { value: '@now', label: 'Data e hora atuais' },
    { value: '@user', label: 'Usuário atual' },
  ];
  const cur = field.default_source ?? '';
  const isPreset = presets.some((p) => p.value === cur);
  return (
    <div className="border border-border-light bg-canvas-light p-1.5">
      <MiniLabel>Valor inicial (dinâmico)</MiniLabel>
      <select
        value={isPreset ? cur : '__var__'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__var__') onChange({ default_source: cur && !isPreset ? cur : ' ' });
          else onChange({ default_source: v || undefined });
        }}
        data-testid={`form-field-default-${field.key}`}
        className={cn(SELECT_CLS, 'w-full')}
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value="__var__">De uma variável / valor fixo…</option>
      </select>
      {!isPreset && (
        <input
          type="text"
          value={cur.trim()}
          onChange={(e) => onChange({ default_source: e.target.value || undefined })}
          placeholder="ex.: objeto_selecionado.name  ou  texto fixo"
          className={cn(INPUT_CLS, 'mt-1')}
        />
      )}
    </div>
  );
}

function FieldRules({
  field,
  onChange,
  otherFieldKeys,
}: {
  field: FormFieldSpec;
  onChange: (patch: Partial<FormFieldSpec>) => void;
  otherFieldKeys: string[];
}) {
  const rules = field.rules ?? [];
  const setRule = (idx: number, patch: Partial<FormConditionalRule>) => {
    onChange({ rules: rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  };
  const addRule = () => {
    const when = otherFieldKeys[0] ?? '';
    onChange({
      rules: [
        ...rules,
        { when_field: when, operator: 'eq', value: '', effect: 'show' },
      ],
    });
  };
  const removeRule = (idx: number) => {
    onChange({ rules: rules.filter((_, i) => i !== idx) });
  };
  const noValueOp = (op: FormConditionalRule['operator']) =>
    op === 'is_empty' || op === 'is_not_empty';

  return (
    <div className="border border-border-light bg-canvas-light p-1.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <MiniLabel>Regras condicionais</MiniLabel>
      </div>
      {rules.length === 0 && (
        <p className="text-[9px] text-muted-on-light italic">
          Sem regras — o campo sempre aparece.
        </p>
      )}
      {rules.map((r, idx) => (
        <div
          key={idx}
          className="border border-border-light bg-white p-1.5 flex flex-col gap-1"
          data-testid={`form-rule-${field.key}-${idx}`}
        >
          <div className="flex items-center gap-1 text-[10px] text-muted-on-light">
            <span className="font-semibold uppercase">Quando</span>
            <select
              value={r.when_field}
              onChange={(e) => setRule(idx, { when_field: e.target.value })}
              data-testid={`form-rule-when-${field.key}-${idx}`}
              className={cn(SELECT_CLS, 'flex-1 min-w-0')}
            >
              {otherFieldKeys.length === 0 && <option value="">(sem campos)</option>}
              {otherFieldKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={r.operator}
              onChange={(e) =>
                setRule(idx, {
                  operator: e.target.value as FormConditionalRule['operator'],
                })
              }
              data-testid={`form-rule-op-${field.key}-${idx}`}
              className={cn(SELECT_CLS, 'flex-1 min-w-0')}
            >
              {OPERATOR_LABELS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {!noValueOp(r.operator) && (
              <input
                type="text"
                value={r.value == null ? '' : String(r.value)}
                onChange={(e) => setRule(idx, { value: e.target.value })}
                data-testid={`form-rule-value-${field.key}-${idx}`}
                placeholder="valor"
                className={cn(INPUT_CLS, 'flex-1')}
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase text-muted-on-light">
              Então
            </span>
            <select
              value={r.effect}
              onChange={(e) =>
                setRule(idx, {
                  effect: e.target.value as FormConditionalRule['effect'],
                })
              }
              data-testid={`form-rule-effect-${field.key}-${idx}`}
              className={cn(SELECT_CLS, 'flex-1 min-w-0')}
            >
              {EFFECT_LABELS.map((ef) => (
                <option key={ef.value} value={ef.value}>
                  {ef.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeRule(idx)}
              aria-label="Remover regra"
              className="text-muted-on-light hover:text-danger shrink-0"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRule}
        data-testid={`form-rule-add-${field.key}`}
        className="h-6 px-2 text-[10px] bg-white border border-border-light hover:border-primary flex items-center gap-1 self-start text-text-on-light"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} />
        Adicionar regra
      </button>
    </div>
  );
}
