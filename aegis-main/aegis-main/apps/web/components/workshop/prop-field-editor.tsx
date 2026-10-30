'use client';

/**
 * PropFieldEditor — renderer compartilhado de UM `PropFieldDef` → editor
 * visual nativo, cobrindo TODOS os FieldKinds do registry.
 *
 * Onda L.3 (2026-05-23): extraído de `workshop-editor.tsx` pra ser reusável
 * tanto pelo Workshop full quanto pelo editor de Páginas
 * (`pages-editor/pages-workshop-editor.tsx`). DRY: um único lugar garante
 * que NENHUM FieldKind caia em input de texto cru (memory
 * `feedback_no_manual_technical_input` + `feedback_widget_type_never_raw_in_ui`).
 *
 * FieldKinds cobertos:
 *   string · number · boolean · select · lat-lng · variable-ref ·
 *   variable-path · node-type · format-rules · form-fields · perm-key ·
 *   action-type
 *
 * Cada kind tem seu picker visual:
 *   - variable-ref / variable-path → dropdown das variables declaradas
 *     (`VariableRefPicker` / `VariablePathPicker`) + CTA pra abrir o painel.
 *   - node-type                    → dropdown carregando `/ontology/node-types`.
 *   - format-rules                 → builder visual com fallback JSON.
 *   - form-fields                  → editor visual dos campos do Form Widget.
 *   - perm-key / action-type       → dropdown do catálogo IAM / ActionTypes.
 */
import * as React from 'react';
import { cn } from '@/lib/cn';
import type { PropFieldDef } from './WorkshopV2Renderer';
import { FormatRulesEditor } from './format-rules-editor';
// Onda K.2 (2026-05-23): editores visuais do Form Widget (FieldKinds
// `form-fields` / `perm-key` / `action-type`). JAMAIS JSON manual.
import { FormFieldsEditor } from './widgets/form-fields-editor';
import { PermKeyPicker, ActionTypePicker } from './widgets/form-config-pickers';
import type { FormFieldSpec } from '@/lib/api';
import type { WorkshopVariable, ObjectSetSpec } from '@/lib/workshop/types';
import { Ontology, type OntologyNodeType, type ObjectTypeProperty } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';

/** Renderer de UM PropFieldDef → input nativo. */
export function PropFieldEditor({
  field,
  value,
  appVariables,
  siblingConfig,
  onOpenVariablesPanel,
  onChange,
}: {
  field: PropFieldDef;
  value: unknown;
  appVariables: WorkshopVariable[];
  /**
   * Config IRMÃ — os valores de TODOS os campos do mesmo widget (props
   * completo). Usado pelo FieldKind `property` para resolver o Object Type a
   * partir do campo apontado por `field.typeFrom`. Opcional/backwards-compat:
   * sem ele, o picker de property cai no input manual.
   */
  siblingConfig?: Record<string, unknown>;
  onOpenVariablesPanel: () => void;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
      {field.label}
    </label>
  );
  const hint = field.description ? (
    <p className="mt-1 text-[10px] text-muted-on-light leading-snug">
      {field.description}
    </p>
  ) : null;

  switch (field.field) {
    case 'string':
      return (
        <div>
          {label}
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
          />
          {hint}
        </div>
      );

    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value || undefined)}
            rows={4}
            className="w-full p-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary resize-y leading-relaxed font-mono"
            spellCheck
          />
          {hint}
        </div>
      );

    case 'number':
      return (
        <div>
          {label}
          <div className="relative">
            <input
              type="number"
              value={typeof value === 'number' ? value : ''}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              placeholder={field.placeholder}
              onChange={(e) => {
                const v = e.target.value;
                onChange(v === '' ? undefined : Number(v));
              }}
              className={cn(
                'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono',
                field.unit && 'pr-7',
              )}
            />
            {field.unit && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-on-light font-mono pointer-events-none">
                {field.unit}
              </span>
            )}
          </div>
          {hint}
        </div>
      );

    case 'boolean': {
      const on = value === true;
      return (
        <div>
          <button
            type="button"
            onClick={() => onChange(!on)}
            className="w-full flex items-center gap-2 group"
            aria-pressed={on}
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
                  on ? 'translate-x-3 border-primary' : 'translate-x-0 border-border-light',
                )}
              />
            </span>
            <span className="text-[11px] text-text-on-light">{field.label}</span>
          </button>
          {hint}
        </div>
      );
    }

    case 'select':
      return (
        <div>
          {label}
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
          >
            <option value="">— escolher —</option>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint}
        </div>
      );

    case 'lat-lng': {
      const v = (value as { lat?: number; lng?: number }) ?? {};
      return (
        <div>
          {label}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="relative">
              <input
                type="number"
                value={typeof v.lat === 'number' ? v.lat : ''}
                step={0.0001}
                placeholder="lat"
                onChange={(e) =>
                  onChange({ ...v, lat: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="w-full h-7 px-2 pr-9 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-on-light font-mono pointer-events-none">
                lat
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={typeof v.lng === 'number' ? v.lng : ''}
                step={0.0001}
                placeholder="lng"
                onChange={(e) =>
                  onChange({ ...v, lng: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="w-full h-7 px-2 pr-10 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-on-light font-mono pointer-events-none">
                lng
              </span>
            </div>
          </div>
          {hint}
        </div>
      );
    }

    case 'variable-ref':
      // Sprint G (closure UX): dropdown das variables declaradas + CTA pra criar.
      return (
        <div>
          {label}
          <VariableRefPicker
            value={typeof value === 'string' ? value : ''}
            variables={appVariables}
            onChange={(v) => onChange(v || undefined)}
            onOpenVariablesPanel={onOpenVariablesPanel}
          />
          {hint}
        </div>
      );

    case 'variable-path':
      // Dropdown da variable + autocomplete de path (.properties, .id, etc).
      return (
        <div>
          {label}
          <VariablePathPicker
            value={typeof value === 'string' ? value : ''}
            variables={appVariables}
            onChange={(v) => onChange(v || undefined)}
            onOpenVariablesPanel={onOpenVariablesPanel}
          />
          {hint}
        </div>
      );

    case 'node-type':
      // Dropdown carregando /ontology/node-types.
      return (
        <div>
          {label}
          <NodeTypeFieldPicker
            value={typeof value === 'string' ? value : ''}
            onChange={(v) => onChange(v || undefined)}
          />
          {hint}
        </div>
      );

    case 'format-rules':
      // Sprint F3: builder visual com fallback "Avançado (JSON)".
      // O valor canônico armazenado em props continua sendo string JSON.
      return (
        <FormatRulesEditor
          value={value as string | undefined}
          onChange={(v) => onChange(v)}
          label={field.label}
          description={field.description}
        />
      );

    case 'form-fields':
      // Onda K.2: editor visual dos campos do Form Widget. Devolve um
      // array de FormFieldSpec — nunca JSON manual.
      return (
        <FormFieldsEditor
          value={value as FormFieldSpec[] | undefined}
          onChange={(v) => onChange(v)}
          label={field.label}
          description={field.description}
        />
      );

    case 'perm-key':
      // Onda K.2: dropdown de permissão do catálogo IAM.
      return (
        <PermKeyPicker
          value={typeof value === 'string' ? value : undefined}
          onChange={(v) => onChange(v)}
          label={field.label}
          description={field.description}
        />
      );

    case 'action-type':
      // Onda K.2: dropdown de ActionType para write-back via ação.
      return (
        <ActionTypePicker
          value={typeof value === 'string' ? value : undefined}
          onChange={(v) => onChange(v)}
          label={field.label}
          description={field.description}
        />
      );

    case 'property': {
      // Débito Onda 4: property validada em design-time contra o contrato do
      // Object Type. Resolve o kind pelo campo irmão `typeFrom`.
      const typeFromValue = field.typeFrom ? siblingConfig?.[field.typeFrom] : undefined;
      const kind = field.typeFrom
        ? resolveKindFromSibling(typeFromValue, appVariables)
        : null;
      const typeFromLabel = field.typeFrom ?? '';
      return (
        <div>
          {label}
          <PropertyFieldPicker
            value={value}
            onChange={onChange}
            kind={kind}
            multi={field.multi}
            typeFromLabel={typeFromLabel}
          />
          {hint}
        </div>
      );
    }

    case 'object-columns': {
      // Builder estruturado: cada coluna escolhe a property pelo contrato.
      const kind = field.typeFrom
        ? resolveKindFromSibling(siblingConfig?.[field.typeFrom], appVariables)
        : null;
      return (
        <div>
          {label}
          <ColumnsFieldEditor value={value} onChange={onChange} kind={kind} />
          {hint}
        </div>
      );
    }

    case 'object-groups': {
      const kind = field.typeFrom
        ? resolveKindFromSibling(siblingConfig?.[field.typeFrom], appVariables)
        : null;
      return (
        <div>
          {label}
          <GroupsFieldEditor value={value} onChange={onChange} kind={kind} />
          {hint}
        </div>
      );
    }

    case 'button-list':
      // F2: editor visual de botões — Ação via ActionTypePicker (nunca id digitado).
      return (
        <div>
          {label}
          <ButtonListFieldEditor value={value} onChange={onChange} />
          {hint}
        </div>
      );

    case 'option-list':
      // F2: editor visual de opções (pills/tabs) — substitui o JSON cru.
      return (
        <div>
          {label}
          <OptionListFieldEditor
            value={value}
            onChange={onChange}
            itemShape={field.itemShape ?? 'pills'}
          />
          {hint}
        </div>
      );
  }
}

/* -------------------------------------------------------------------------- */
/* PropertyFieldPicker — Débito Onda 4 (OSDK, 2026-05-30)                     */
/* -------------------------------------------------------------------------- */
/**
 * Resolve o Object Type (kind) a partir do valor de um campo IRMÃO:
 *   - se o valor casa o `external_id` de uma variável objectSet → o kind é
 *     `spec.object_type` dessa variável (caso variável-bound);
 *   - se o valor casa uma variável de outro kind (static/function/…) sem tipo
 *     resolvível → null (picker cai no manual);
 *   - se NÃO casa nenhuma variável → o valor JÁ é o kind (campo `node-type`).
 * Faz strip de sufixo `.path` (variable-path guarda `<external_id>.x.y`).
 */
export function resolveKindFromSibling(
  siblingValue: unknown,
  appVariables: WorkshopVariable[],
): string | null {
  if (typeof siblingValue !== 'string') return null;
  const raw = siblingValue.trim();
  if (!raw) return null;
  const externalId = raw.split('.')[0];
  const v = appVariables.find((x) => x.external_id === externalId);
  if (v) {
    if (v.kind === 'objectSet') {
      const ot = (v.spec as ObjectSetSpec | undefined)?.object_type;
      // typeof guard: o cast é só compile-time; dado corrompido (número/bool)
      // não pode estourar `.trim()`. Sem object_type válido → manual.
      return typeof ot === 'string' && ot.trim() ? ot : null;
    }
    // variável conhecida mas sem Object Type resolvível
    return null;
  }
  // não é variável → o valor é o próprio kind (veio de um campo node-type)
  return raw;
}

const _typeSchemaCache = new Map<string, ObjectTypeProperty[]>();

/**
 * Picker de property validado contra o contrato tipado do Object Type. Lista
 * `Ontology.objectTypeSchema(kind).properties` num dropdown (single) ou
 * checklist (`multi`). Degrada graciosamente:
 *   - sem kind resolvido → hint "escolha o tipo" + input manual;
 *   - tipo legado sem contrato (404) ou erro de rede → input manual.
 * Nunca bloqueia o operador (mesma filosofia do NodeTypeFieldPicker).
 */
export function PropertyFieldPicker({
  value,
  onChange,
  kind,
  multi,
  typeFromLabel,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  kind: string | null;
  multi?: boolean;
  typeFromLabel?: string;
}) {
  const [props, setProps] = React.useState<ObjectTypeProperty[] | null>(
    kind ? _typeSchemaCache.get(kind) ?? null : null,
  );
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!kind) {
      setProps(null);
      setFailed(false);
      return;
    }
    const cached = _typeSchemaCache.get(kind);
    if (cached) {
      setProps(cached);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    Ontology.objectTypeSchema(kind)
      .then((schema) => {
        if (cancelled) return;
        _typeSchemaCache.set(kind, schema.properties);
        setProps(schema.properties);
      })
      .catch(() => {
        // 404 (tipo legado sem contrato) ou rede → fallback manual.
        if (cancelled) return;
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  // Sem tipo escolhido ainda → hint + manual (não bloqueia).
  if (!kind) {
    return (
      <div data-testid="property-picker" className="space-y-1">
        <p
          data-testid="property-picker-no-type"
          className="text-[10px] text-muted-on-light italic leading-snug"
        >
          {typeFromLabel
            ? `Escolha o tipo em "${typeFromLabel}" para listar as propriedades.`
            : 'Escolha o tipo de objeto para listar as propriedades.'}
        </p>
        <ManualPropertyInput value={value} onChange={onChange} multi={multi} />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        data-testid="property-picker"
        className="w-full h-7 px-2 text-[11px] flex items-center text-muted-on-light italic border border-border-light bg-canvas-light"
      >
        Carregando propriedades…
      </div>
    );
  }

  // Tipo legado/erro → manual, com nota.
  if (failed || !props) {
    return (
      <div data-testid="property-picker" className="space-y-1">
        <p className="text-[10px] text-warning leading-snug">
          Tipo sem contrato declarado. Digite a propriedade manualmente.
        </p>
        <ManualPropertyInput value={value} onChange={onChange} multi={multi} />
      </div>
    );
  }

  if (multi) {
    const selected: string[] = Array.isArray(value)
      ? (value as string[])
      : typeof value === 'string' && value
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const toggle = (key: string) => {
      const next = selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key];
      onChange(next);
    };
    return (
      <div
        data-testid="property-picker"
        className="border border-border-light bg-white divide-y divide-border-light/60 max-h-48 overflow-y-auto"
      >
        {props.map((p) => {
          const checked = selected.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              data-testid={`property-picker-opt-${p.key}`}
              onClick={() => toggle(p.key)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-left transition-colors',
                checked ? 'bg-primary/5' : 'hover:bg-canvas-light',
              )}
            >
              <span
                className={cn(
                  'w-3 h-3 shrink-0 border flex items-center justify-center',
                  checked ? 'bg-primary border-primary text-white' : 'border-border-light',
                )}
              >
                {checked ? '✓' : ''}
              </span>
              <span className="font-mono text-text-on-light truncate flex-1">
                {p.label || p.key}
              </span>
              {p.is_title ? (
                <span className="text-[9px] uppercase tracking-wider px-1 bg-primary/10 text-primary border border-primary/30 shrink-0">
                  Título
                </span>
              ) : null}
              <span className="text-[9px] font-mono text-muted-on-light shrink-0">
                {p.type}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Single: dropdown das properties do contrato.
  const current = typeof value === 'string' ? value : '';
  const valueExists = !current || props.some((p) => p.key === current);
  return (
    <select
      data-testid="property-picker-select"
      value={current}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={cn(
        'w-full h-7 px-2 text-[11px] font-mono bg-white border outline-none focus:border-primary truncate',
        valueExists ? 'border-border-light' : 'border-warning',
      )}
      title={current || 'Escolha uma propriedade'}
    >
      <option value="">— Escolha uma propriedade —</option>
      {!valueExists && current && (
        <option value={current}>{current} (não está no contrato)</option>
      )}
      {props.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label || p.key} · {p.type}
          {p.is_title ? ' · Título' : ''}
        </option>
      ))}
    </select>
  );
}

/** Input manual de property (fallback): single = texto; multi = lista CSV. */
function ManualPropertyInput({
  value,
  onChange,
  multi,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  multi?: boolean;
}) {
  if (multi) {
    // Preserva valor legado salvo como string CSV (campo era 'string' antes da
    // migração p/ 'property') — senão o input apareceria vazio escondendo dados.
    const text = Array.isArray(value)
      ? (value as string[]).join(', ')
      : typeof value === 'string'
        ? value
        : '';
    return (
      <input
        type="text"
        data-testid="property-picker-manual"
        value={text}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder="propriedades separadas por vírgula"
        className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light font-mono outline-none focus:border-primary"
      />
    );
  }
  return (
    <input
      type="text"
      data-testid="property-picker-manual"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder="nome da propriedade"
      className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light font-mono outline-none focus:border-primary"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* ColumnsFieldEditor / GroupsFieldEditor — propagação OSDK (2026-05-30)      */
/* -------------------------------------------------------------------------- */
/**
 * Builders visuais que substituem os textarea de JSON cru dos widgets
 * estruturados (object_table.columns / object_view.groups). Cada linha escolhe
 * a PROPERTY pelo contrato do Object Type (PropertyFieldPicker) — fim do JSON
 * manual (memory feedback_no_manual_technical_input). Aceitam valor legado
 * salvo como string JSON (quando o campo ainda era 'string') e SEMPRE devolvem
 * um array. Quando o `kind` não resolve, o PropertyFieldPicker degrada pro
 * input manual (não bloqueia).
 */

type ColumnDef = { field: string; label?: string; width?: number };

/** Normaliza array | string-JSON | undefined → ColumnDef[]. Nunca estoura. */
function coerceColumns(value: unknown): ColumnDef[] {
  let raw: unknown = value;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => {
      const col: ColumnDef = { field: typeof c.field === 'string' ? c.field : '' };
      if (typeof c.label === 'string' && c.label) col.label = c.label;
      if (typeof c.width === 'number') col.width = c.width;
      return col;
    });
}

export function ColumnsFieldEditor({
  value,
  onChange,
  kind,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  kind: string | null;
}) {
  const cols = coerceColumns(value);
  const emit = (next: ColumnDef[]) => onChange(next);
  const update = (i: number, patch: Partial<ColumnDef>) => {
    const next = cols.map((c, idx) => (idx === i ? cleanColumn({ ...c, ...patch }) : c));
    emit(next);
  };
  return (
    <div data-testid="object-columns-editor" className="space-y-1.5">
      {cols.length === 0 && (
        <p className="text-[10px] text-muted-on-light italic">
          Sem colunas — mostra Nome + Tipo por padrão.
        </p>
      )}
      {cols.map((c, i) => (
        <div
          key={i}
          data-testid={`object-columns-row-${i}`}
          className="border border-border-light bg-canvas-light p-1.5 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-muted-on-light w-4 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <PropertyFieldPicker
                value={c.field}
                onChange={(v) => update(i, { field: typeof v === 'string' ? v : '' })}
                kind={kind}
              />
            </div>
            <button
              type="button"
              data-testid={`object-columns-remove-${i}`}
              onClick={() => emit(cols.filter((_, idx) => idx !== i))}
              aria-label="Remover coluna"
              className="h-7 px-2 text-[11px] text-muted-on-light hover:text-danger border border-border-light bg-white shrink-0"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-1.5 pl-5">
            <input
              type="text"
              data-testid={`object-columns-label-${i}`}
              value={c.label ?? ''}
              placeholder="Rótulo (opcional)"
              onChange={(e) => update(i, { label: e.target.value })}
              className="flex-1 min-w-0 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
            />
            <input
              type="number"
              data-testid={`object-columns-width-${i}`}
              value={typeof c.width === 'number' ? c.width : ''}
              placeholder="largura"
              onChange={(e) =>
                update(i, { width: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              className="w-20 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        data-testid="object-columns-add"
        onClick={() => emit([...cols, { field: '' }])}
        className="w-full h-7 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
      >
        + Adicionar coluna
      </button>
    </div>
  );
}

function cleanColumn(c: ColumnDef): ColumnDef {
  const out: ColumnDef = { field: c.field };
  if (c.label) out.label = c.label;
  if (typeof c.width === 'number') out.width = c.width;
  return out;
}

type GroupFieldDef = { key: string; label?: string; type?: string };
type GroupDef = { title: string; fields: GroupFieldDef[] };

const GROUP_FIELD_TYPES: { value: string; label: string }[] = [
  { value: '', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'url', label: 'Link' },
  { value: 'boolean', label: 'Sim/Não' },
];

function coerceGroups(value: unknown): GroupDef[] {
  let raw: unknown = value;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({
      title: typeof g.title === 'string' ? g.title : '',
      fields: Array.isArray(g.fields)
        ? (g.fields as unknown[])
            .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
            .map((f) => cleanGroupField({
              key: typeof f.key === 'string' ? f.key : '',
              label: typeof f.label === 'string' ? f.label : undefined,
              type: typeof f.type === 'string' ? f.type : undefined,
            }))
        : [],
    }));
}

function cleanGroupField(f: GroupFieldDef): GroupFieldDef {
  const out: GroupFieldDef = { key: f.key };
  if (f.label) out.label = f.label;
  if (f.type) out.type = f.type;
  return out;
}

export function GroupsFieldEditor({
  value,
  onChange,
  kind,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  kind: string | null;
}) {
  const groups = coerceGroups(value);
  const emit = (next: GroupDef[]) => onChange(next);
  const updateGroup = (gi: number, patch: Partial<GroupDef>) =>
    emit(groups.map((g, idx) => (idx === gi ? { ...g, ...patch } : g)));
  const updateField = (gi: number, fi: number, patch: Partial<GroupFieldDef>) =>
    emit(
      groups.map((g, idx) =>
        idx === gi
          ? {
              ...g,
              fields: g.fields.map((f, fidx) =>
                fidx === fi ? cleanGroupField({ ...f, ...patch }) : f,
              ),
            }
          : g,
      ),
    );
  return (
    <div data-testid="object-groups-editor" className="space-y-1.5">
      {groups.map((g, gi) => (
        <div
          key={gi}
          data-testid={`object-groups-group-${gi}`}
          className="border border-border-light bg-canvas-light p-1.5 space-y-1.5"
        >
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              data-testid={`object-groups-title-${gi}`}
              value={g.title}
              placeholder="Título da seção"
              onChange={(e) => updateGroup(gi, { title: e.target.value })}
              className="flex-1 min-w-0 h-7 px-2 text-[11px] font-semibold bg-white border border-border-light outline-none focus:border-primary"
            />
            <button
              type="button"
              data-testid={`object-groups-remove-group-${gi}`}
              onClick={() => emit(groups.filter((_, idx) => idx !== gi))}
              aria-label="Remover seção"
              className="h-7 px-2 text-[11px] text-muted-on-light hover:text-danger border border-border-light bg-white shrink-0"
            >
              ×
            </button>
          </div>
          {g.fields.map((f, fi) => (
            <div
              key={fi}
              data-testid={`object-groups-field-${gi}-${fi}`}
              className="flex items-center gap-1.5 pl-2"
            >
              <div className="flex-1 min-w-0">
                <PropertyFieldPicker
                  value={f.key}
                  onChange={(v) => updateField(gi, fi, { key: typeof v === 'string' ? v : '' })}
                  kind={kind}
                />
              </div>
              <input
                type="text"
                data-testid={`object-groups-field-label-${gi}-${fi}`}
                value={f.label ?? ''}
                placeholder="Rótulo"
                onChange={(e) => updateField(gi, fi, { label: e.target.value })}
                className="w-24 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
              />
              <select
                data-testid={`object-groups-field-type-${gi}-${fi}`}
                value={f.type ?? ''}
                onChange={(e) => updateField(gi, fi, { type: e.target.value || undefined })}
                className="w-20 h-7 px-1 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
              >
                {GROUP_FIELD_TYPES.map((t) => (
                  <option key={t.value || '_text'} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid={`object-groups-remove-field-${gi}-${fi}`}
                onClick={() =>
                  updateGroup(gi, { fields: g.fields.filter((_, idx) => idx !== fi) })
                }
                aria-label="Remover campo"
                className="h-7 px-2 text-[11px] text-muted-on-light hover:text-danger border border-border-light bg-white shrink-0"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            data-testid={`object-groups-add-field-${gi}`}
            onClick={() => updateGroup(gi, { fields: [...g.fields, { key: '' }] })}
            className="ml-2 h-6 px-2 text-[10px] bg-white border border-border-light hover:border-primary hover:text-primary"
          >
            + Campo
          </button>
        </div>
      ))}
      <button
        type="button"
        data-testid="object-groups-add-group"
        onClick={() => emit([...groups, { title: '', fields: [] }])}
        className="w-full h-7 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
      >
        + Adicionar seção
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* VariableRefPicker — Sprint G (closure UX 2026-05-21)                       */
/* -------------------------------------------------------------------------- */
/**
 * Substitui `<input type="text">` por dropdown das variables declaradas
 * no app. Operador NÃO precisa mais decorar `external_id`.
 *
 * Quando o valor atual aponta pra var inexistente (app importado com refs
 * quebrados), mostra entry "(?)" pra preservar o valor sem perder.
 *
 * CTA "+ Criar nova" abre VariablesPanel pra fluxo direto.
 */
export function VariableRefPicker({
  value,
  variables,
  onChange,
  onOpenVariablesPanel,
}: {
  value: string;
  variables: WorkshopVariable[];
  onChange: (v: string) => void;
  onOpenVariablesPanel: () => void;
}) {
  const valueExists = !value || variables.some((v) => v.external_id === value);
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex-1 min-w-0 h-7 px-2 text-[11px] font-mono bg-white border outline-none focus:border-primary truncate',
          valueExists ? 'border-border-light' : 'border-warning',
        )}
        title={value || 'Escolha um dado'}
      >
        <option value="">— Escolha um dado —</option>
        {!valueExists && (
          <option value={value}>{value} (não declarado)</option>
        )}
        {variables.map((v) => (
          <option key={v.external_id} value={v.external_id}>
            {(v.label || v.external_id) +
              ' (' +
              v.external_id +
              (v.type ? ` · ${v.type}` : '') +
              ')'}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onOpenVariablesPanel}
        aria-label="Abrir Variables Panel"
        title="Criar novo dado ou editar existente"
        className="h-7 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary shrink-0"
      >
        + Novo
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* VariablePathPicker — dropdown + autocomplete de path                       */
/* -------------------------------------------------------------------------- */
export function VariablePathPicker({
  value,
  variables,
  onChange,
  onOpenVariablesPanel,
}: {
  value: string;
  variables: WorkshopVariable[];
  onChange: (v: string) => void;
  onOpenVariablesPanel: () => void;
}) {
  // Separa o "root var" do "path suffix" (ex.: "selected_person.properties" →
  // root="selected_person", suffix="properties").
  const parts = value ? value.split('.') : [];
  const root = parts[0] ?? '';
  const suffix = parts.slice(1).join('.');
  const PATH_SUGGESTIONS = [
    '', 'properties', 'properties.nome', 'properties.cpf',
    'id', 'name', 'node_type',
  ];
  const rootExists = !root || variables.some((v) => v.external_id === root);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <select
          value={root}
          onChange={(e) => {
            const newRoot = e.target.value;
            onChange(suffix ? `${newRoot}.${suffix}` : newRoot);
          }}
          className={cn(
            'flex-1 min-w-0 h-7 px-2 text-[11px] font-mono bg-white border outline-none focus:border-primary truncate',
            rootExists ? 'border-border-light' : 'border-warning',
          )}
          title={root || 'Escolha um dado'}
        >
          <option value="">— Escolha um dado —</option>
          {!rootExists && root && (
            <option value={root}>{root} (não declarado)</option>
          )}
          {variables.map((v) => (
            <option key={v.external_id} value={v.external_id}>
              {(v.label || v.external_id) + ' (' + v.external_id + ')'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenVariablesPanel}
          aria-label="Abrir Variables Panel"
          title="Criar novo dado ou editar existente"
          className="h-7 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary shrink-0"
        >
          + Novo
        </button>
      </div>
      <input
        type="text"
        value={suffix}
        onChange={(e) =>
          onChange(e.target.value ? `${root}.${e.target.value}` : root)
        }
        placeholder="caminho (opcional): properties, properties.nome, id…"
        list="variable-path-suggestions"
        className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
      />
      <datalist id="variable-path-suggestions">
        {PATH_SUGGESTIONS.map((p) => (
          <option key={p || '_root'} value={p} />
        ))}
      </datalist>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* NodeTypeFieldPicker — dropdown carregando /ontology/node-types             */
/* -------------------------------------------------------------------------- */
let _nodeTypesCache: OntologyNodeType[] | null = null;

export function NodeTypeFieldPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [types, setTypes] = React.useState<OntologyNodeType[] | null>(_nodeTypesCache);
  const [loading, setLoading] = React.useState(_nodeTypesCache === null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (_nodeTypesCache) return;
    let cancelled = false;
    setLoading(true);
    Ontology.listNodeTypes()
      .then((list) => {
        if (cancelled) return;
        _nodeTypesCache = list;
        setTypes(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-7 px-2 text-[11px] flex items-center text-muted-on-light italic border border-border-light bg-canvas-light">
        Carregando tipos…
      </div>
    );
  }
  if (error) {
    return (
      <div className="w-full px-2 py-1 text-[11px] text-danger border border-danger/40 bg-danger/5">
        Não foi possível carregar a lista. Digite manualmente.
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full h-6 px-2 text-[11px] bg-canvas-light border border-border-light font-mono"
          placeholder="Nome do tipo"
        />
      </div>
    );
  }

  const opts = types ?? [];
  const valueExists = !value || opts.some((o) => o.name === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full h-7 px-2 text-[11px] font-mono bg-white border outline-none focus:border-primary truncate',
        valueExists ? 'border-border-light' : 'border-warning',
      )}
      title={value || 'Escolha um tipo'}
    >
      <option value="">— Escolha um tipo —</option>
      {!valueExists && value && (
        <option value={value}>{value} (não está na ontologia)</option>
      )}
      {opts.map((t) => (
        <option key={t.name} value={t.name}>
          {t.label} {t.count > 0 ? `· ${t.count}` : ''}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/* ButtonListFieldEditor / OptionListFieldEditor — F2 (2026-06-06)            */
/* Substituem os textarea de JSON cru de button_group/tabs/filter_pills.      */
/* -------------------------------------------------------------------------- */

type BtnDef = { label: string; action_id: string; variant?: 'primary' | 'danger' | 'ghost' };

function coerceButtons(value: unknown): BtnDef[] {
  let raw: unknown = value;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map((b) => {
      const out: BtnDef = {
        label: typeof b.label === 'string' ? b.label : '',
        action_id: typeof b.action_id === 'string' ? b.action_id : '',
      };
      if (b.variant === 'primary' || b.variant === 'danger' || b.variant === 'ghost') {
        out.variant = b.variant;
      }
      return out;
    });
}

export function ButtonListFieldEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = useT();
  const btns = coerceButtons(value);
  const update = (i: number, patch: Partial<BtnDef>) =>
    onChange(btns.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  return (
    <div data-testid="button-list-editor" className="space-y-1.5">
      {btns.length === 0 && (
        <p className="text-[10px] text-muted-on-light italic">
          {t('buttonList.empty')}
        </p>
      )}
      {btns.map((b, i) => (
        <div
          key={i}
          data-testid={`button-list-row-${i}`}
          className="border border-border-light bg-canvas-light p-1.5 space-y-1.5"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-muted-on-light w-4 shrink-0">{i + 1}</span>
            <input
              type="text"
              data-testid={`button-list-label-${i}`}
              value={b.label}
              placeholder={t('buttonList.labelPlaceholder')}
              onChange={(e) => update(i, { label: e.target.value })}
              className="flex-1 min-w-0 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
            />
            <button
              type="button"
              data-testid={`button-list-remove-${i}`}
              onClick={() => onChange(btns.filter((_, idx) => idx !== i))}
              aria-label={t('buttonList.remove')}
              className="h-7 px-2 text-[11px] text-muted-on-light hover:text-danger border border-border-light bg-white shrink-0"
            >
              ×
            </button>
          </div>
          <div className="pl-5">
            <ActionTypePicker
              value={b.action_id || undefined}
              onChange={(v) => update(i, { action_id: v ?? '' })}
              label={t('buttonList.action')}
            />
            {!b.action_id && (
              <p
                data-testid={`button-list-warn-${i}`}
                className="text-[10px] text-warning mt-1"
              >
                {t('buttonList.noActionWarn')}
              </p>
            )}
          </div>
          <div className="pl-5">
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
              {t('buttonList.style')}
            </label>
            <select
              data-testid={`button-list-variant-${i}`}
              value={b.variant ?? 'primary'}
              onChange={(e) => update(i, { variant: e.target.value as BtnDef['variant'] })}
              className="w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
            >
              <option value="primary">{t('buttonList.stylePrimary')}</option>
              <option value="ghost">{t('buttonList.styleGhost')}</option>
              <option value="danger">{t('buttonList.styleDanger')}</option>
            </select>
          </div>
        </div>
      ))}
      <button
        type="button"
        data-testid="button-list-add"
        onClick={() => onChange([...btns, { label: '', action_id: '', variant: 'primary' }])}
        className="w-full h-7 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
      >
        {t('buttonList.add')}
      </button>
    </div>
  );
}

type OptRow = Record<string, unknown>;

function coerceOptions(value: unknown): OptRow[] {
  let raw: unknown = value;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is OptRow => !!o && typeof o === 'object');
}

export function OptionListFieldEditor({
  value,
  onChange,
  itemShape,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  itemShape: 'pills' | 'tabs';
}) {
  const t = useT();
  const rows = coerceOptions(value);
  const isTabs = itemShape === 'tabs';
  const keyName = isTabs ? 'id' : 'value';
  const extraName = isTabs ? 'content' : 'group';
  const extraLabel = isTabs ? t('optionList.contentOptional') : t('optionList.groupOptional');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const update = (i: number, patch: OptRow) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const newRow = (): OptRow => (isTabs ? { id: '', label: '' } : { value: '', label: '' });
  return (
    <div data-testid="option-list-editor" className="space-y-1.5">
      {rows.length === 0 && (
        <p className="text-[10px] text-muted-on-light italic">
          {isTabs ? t('optionList.emptyTabs') : t('optionList.empty')}
        </p>
      )}
      {rows.map((r, i) => (
        <div
          key={i}
          data-testid={`option-list-row-${i}`}
          className="border border-border-light bg-canvas-light p-1.5 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-muted-on-light w-4 shrink-0">{i + 1}</span>
            <input
              type="text"
              data-testid={`option-list-label-${i}`}
              value={str(r.label)}
              placeholder={t('optionList.labelPlaceholder')}
              onChange={(e) => update(i, { label: e.target.value })}
              className="flex-1 min-w-0 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
            />
            <button
              type="button"
              data-testid={`option-list-remove-${i}`}
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              aria-label={t('optionList.remove')}
              className="h-7 px-2 text-[11px] text-muted-on-light hover:text-danger border border-border-light bg-white shrink-0"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-1.5 pl-5">
            <input
              type="text"
              data-testid={`option-list-key-${i}`}
              value={str(r[keyName])}
              placeholder={isTabs ? t('optionList.tabIdPlaceholder') : t('optionList.valuePlaceholder')}
              onChange={(e) => update(i, { [keyName]: e.target.value })}
              className={cn(
                'w-28 h-7 px-2 text-[11px] font-mono bg-white border outline-none focus:border-primary',
                str(r[keyName]) ? 'border-border-light' : 'border-warning',
              )}
              title={str(r[keyName]) ? undefined : t('optionList.keyRequired')}
            />
            <input
              type="text"
              data-testid={`option-list-extra-${i}`}
              value={str(r[extraName])}
              placeholder={extraLabel}
              onChange={(e) => update(i, { [extraName]: e.target.value })}
              className="flex-1 min-w-0 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        data-testid="option-list-add"
        onClick={() => onChange([...rows, newRow()])}
        className="w-full h-7 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
      >
        {isTabs ? t('optionList.addTab') : t('optionList.add')}
      </button>
    </div>
  );
}
