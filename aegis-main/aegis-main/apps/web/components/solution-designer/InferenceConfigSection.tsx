'use client';

/**
 * InferenceConfigSection — inferência do nó de Processamento.
 *
 * Task 2: model metadata card com chips neutros (sem nomes proprietários).
 * Task 3: painel de Variáveis com inserção no cursor e CRUD simplificado.
 *
 * Invariantes: sharp, sem emoji, sem rounded-*, strings via useT().
 */
import * as React from 'react';
import { Cpu, ChevronRight, Plus, Trash2, Variable, AlertTriangle, X } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { Label } from '@/components/ui/label';
import { InfoTip } from '@/components/ui/info-tip';
import { AIPModels, Ontology, type AipCatalogModel, type AipModelDefault, type SolutionNode } from '@/lib/api';
import { aipModelLabel, aipModelNote, isHiddenProvider } from '@/lib/aip/modelLabels';
import {
  modelTier,
  TIER_I18N,
  formatContextWindow,
  capabilityI18nKey,
} from '@/lib/aip/modelMeta';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { objectFieldNames, unresolvedRefs } from './inference-vars';
import { useProposedTypes, mergeObjectTypeOptions } from './proposed-types-context';
import { useSampleFor } from './sample-context';

/** Campos do objeto de entrada (propriedades do tipo enriquecido). */
export interface InferenceInputProp {
  key: string;
  type?: string;
  label?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Variable declared on the inference node (stored in node.config.inference_variables). */
interface InferenceVariable {
  name: string;
  kind: 'static' | 'objectSet' | 'expression';
  /** For kind=objectSet: the chosen object_type kind. */
  object_type?: string;
  /** For kind=objectSet: optional property key (modo Propriedade ou campo da Agregação). */
  property?: string;
  /** For kind=objectSet modo Agregação: operador (Foundry object-set aggregation,
   *  first-class — variables.md/transformations.md). count não usa property. */
  agg_op?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct_count';
  /** v1 (#1): filtros simples AND {field, op, value} sobre as propriedades do objeto. */
  filter?: { field: string; op: string; value?: string }[];
  /** v1 (#1): teto de objetos consultados na resolução. */
  limit?: number;
  /** v2 (#1): relação 1-hop POR-OBJETO — "objetos ligados a ESTE". O enrich anda 1 salto
   *  por ``relation``/``direction`` a partir do objeto atual. ``target_kind`` = tipo alvo. */
  relation?: string;
  direction?: 'outgoing' | 'incoming' | 'both';
  target_kind?: string;
  /** Human description / display value. */
  description?: string;
}

// #1 — operadores de filtro (resolvidos no runtime pelo enrich: _match_filter).
const FILTER_OPS: Array<{ value: string; labelKey: string }> = [
  { value: 'eq', labelKey: 'solutions.filterEq' },
  { value: 'neq', labelKey: 'solutions.filterNeq' },
  { value: 'contains', labelKey: 'solutions.filterContains' },
  { value: 'gt', labelKey: 'solutions.filterGt' },
  { value: 'lt', labelKey: 'solutions.filterLt' },
  { value: 'gte', labelKey: 'solutions.filterGte' },
  { value: 'lte', labelKey: 'solutions.filterLte' },
  { value: 'exists', labelKey: 'solutions.filterExists' },
  { value: 'not_exists', labelKey: 'solutions.filterNotExists' },
];

const AGG_OPS: Array<{ value: NonNullable<InferenceVariable['agg_op']>; labelKey: string }> = [
  { value: 'count', labelKey: 'solutions.aggCount' },
  { value: 'distinct_count', labelKey: 'solutions.aggDistinct' },
  { value: 'sum', labelKey: 'solutions.aggSum' },
  { value: 'avg', labelKey: 'solutions.aggAvg' },
  { value: 'min', labelKey: 'solutions.aggMin' },
  { value: 'max', labelKey: 'solutions.aggMax' },
];

// Built-in variables always available in inference prompts.
const BUILTIN_VARS: Array<{ name: string; desc_pt: string; desc_en: string }> = [
  { name: 'now', desc_pt: 'Data e hora atual (UTC)', desc_en: 'Current date/time (UTC)' },
  { name: 'tenant_slug', desc_pt: 'Identificador do tenant', desc_en: 'Tenant identifier' },
  { name: 'node_id', desc_pt: 'ID deste nó no diagrama', desc_en: 'This node ID in the diagram' },
];

const VARIABLE_KIND_OPTIONS: Array<{ value: InferenceVariable['kind']; labelKey: string; hintKey: string }> = [
  { value: 'static', labelKey: 'solutions.varKindStatic', hintKey: 'solutions.varKindStaticHint' },
  { value: 'objectSet', labelKey: 'solutions.varKindObjectSet', hintKey: 'solutions.varKindObjectSetHint' },
  { value: 'expression', labelKey: 'solutions.varKindExpression', hintKey: 'solutions.varKindExpressionHint' },
];

// ─── Model metadata card ──────────────────────────────────────────────────────

function CapabilityChip({ cap }: { cap: string }) {
  const t = useT();
  const key = capabilityI18nKey(cap);
  if (!key) return null;
  return (
    <span className="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 border border-border-light text-muted-on-light">
      {t(key as Parameters<typeof t>[0])}
    </span>
  );
}

function ModelMetaCard({ model }: { model: AipCatalogModel }) {
  const t = useT();
  const tier = modelTier(model);
  const ctxK = formatContextWindow(model.context_window);
  const note = aipModelNote(model.id);
  const visibleCaps = (model.capabilities ?? []).filter((c) => c !== 'streaming').slice(0, 4);

  return (
    <div
      className="border border-border-light bg-canvas-light p-2 space-y-1.5"
      data-testid="inference-model-meta"
    >
      {/* Tier chip */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 border border-primary/30 bg-primary/5 text-primary">
          {t(TIER_I18N[tier] as Parameters<typeof t>[0])}
        </span>
        {visibleCaps.map((c) => (
          <CapabilityChip key={c} cap={c} />
        ))}
        {ctxK && (
          <span className="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 border border-border-light text-muted-on-light">
            {t('solutions.inferenceModelCtx')}: {ctxK} {t('solutions.inferenceModelCtxUnit')}
          </span>
        )}
      </div>
      {/* Neutral description — only if it doesn't leak a proprietary name */}
      {note && !leaksProprietaryName(note) && (
        <p className="text-[10px] text-muted-on-light leading-snug">{note}</p>
      )}
    </div>
  );
}

/** Heurística simples: varre a nota por nomes proprietários conhecidos. */
function leaksProprietaryName(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    'openai', 'anthropic', 'gpt', 'claude', 'llama', 'mistral', 'groq',
    'cohere', 'deepseek', 'qwen', 'jamba', 'gemini',
  ].some((name) => lower.includes(name));
}

// ─── Variables sub-panel ──────────────────────────────────────────────────────

interface VariablesSubPanelProps {
  variables: InferenceVariable[];
  prompt: string;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (expr: string) => void;
  onAdd: (v: InferenceVariable) => void;
  onRemove: (name: string) => void;
  /** Campos do objeto de entrada — variáveis disponíveis no template. */
  inputProps?: InferenceInputProp[];
}

function VariablesSubPanel({
  variables,
  prompt,
  onInsert,
  onAdd,
  onRemove,
  inputProps,
}: VariablesSubPanelProps) {
  const t = useT();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  // Campos do objeto de entrada — disponíveis como `{{campo}}` (o backend
  // resolve da propriedade do objeto). Mostrados como chips + contam no
  // conjunto "conhecido" (senão {{username}} alertaria como não-resolvido).
  const schemaFields = React.useMemo(() => objectFieldNames(inputProps), [inputProps]);
  // #3 — campos da AMOSTRA REAL (último "Rodar amostra"). O operador vê `posts: [3]` na
  // amostra e quer usar `{{posts}}` — antes isso alertava "sem variável declarada" porque o
  // schema PROPOSTO não listava `posts`. Mesclamos os campos da amostra aos do schema: viram
  // chips clicáveis + entram no conjunto "conhecido" (some o aviso). O backend resolve
  // `{{posts}}` da própria propriedade do objeto coletado.
  const sampleRecords = useSampleFor('*');
  const sampleFields = React.useMemo(() => {
    const first = sampleRecords[0];
    return first ? Object.keys(first).filter((k) => !k.startsWith('_')) : [];
  }, [sampleRecords]);
  const objFields = React.useMemo(
    () => Array.from(new Set<string>([...schemaFields, ...sampleFields])),
    [schemaFields, sampleFields],
  );

  // Warn about unresolved refs: {{xxx}} not in variables, builtins or object/sample fields.
  const refs = React.useMemo(
    () =>
      unresolvedRefs(prompt, [
        ...variables.map((v) => v.name),
        ...BUILTIN_VARS.map((b) => b.name),
        ...objFields,
      ]),
    [prompt, variables, objFields],
  );

  return (
    <div
      className="border border-border-light bg-canvas-light"
      data-testid="inference-variables"
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border-light bg-raised-light/40">
        <Variable className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex-1 font-semibold">
          {t('solutions.inferenceVariables')}
          <InfoTip text={t('solutions.inferenceVariablesHint')} />
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          data-testid="inference-variables-insert-btn"
          className="h-6 px-2 text-[10px] border border-border-light bg-canvas-light hover:border-primary hover:text-primary flex items-center gap-1"
        >
          <Plus className="w-3 h-3" strokeWidth={1.5} />
          {t('solutions.inferenceVariablesInsert')}
        </button>
        {/* TASK 4: "Adicionar variável" opens a modal instead of an inline expanded form */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          data-testid="inference-variables-add-btn"
          className="h-6 px-2 text-[10px] border border-primary bg-primary text-white hover:bg-primary-hover flex items-center gap-1"
        >
          <Plus className="w-3 h-3" strokeWidth={1.5} />
          {t('solutions.inferenceVariablesAdd')}
        </button>
      </div>

      {/* Variable picker popover — stays inline (quick pick, not a form) */}
      {pickerOpen && (
        <VariablePicker
          variables={variables}
          onPick={(expr) => {
            onInsert(expr);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* TASK 4: Add variable Dialog modal — keeps the main panel scannable */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent
          className="max-w-md w-[90vw] border border-border-light bg-canvas-light p-0 gap-0"
          data-testid="inference-variable-add-modal"
        >
          <DialogHeader className="flex flex-row items-center gap-2 px-4 py-3 border-b border-border-light">
            <Variable className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[12px] font-semibold text-text-on-light">
                {t('solutions.variableModalTitle')}
              </DialogTitle>
              <p className="text-[10px] text-muted-on-light mt-0.5">
                {t('solutions.variableModalHint')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              aria-label={t('common.close')}
              className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-text-on-light border border-transparent hover:border-border-light"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </DialogHeader>
          <div className="px-4 py-3">
            <AddVariableForm
              onSave={(v) => {
                onAdd(v);
                setAddOpen(false);
              }}
              onCancel={() => setAddOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Unresolved refs warning */}
      {refs.length > 0 && (
        <div
          className="flex items-start gap-1.5 px-2 py-1.5 bg-warning/10 border-b border-warning/30 text-[10px] text-text-on-light"
          data-testid="inference-variables-unresolved"
        >
          <AlertTriangle className="w-3 h-3 text-warning shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>
            {t('solutions.inferenceVariablesUnresolved').replace('{{refs}}', refs.map((r) => `{{${r}}}`).join(', '))}
          </span>
        </div>
      )}

      {/* Campos do objeto de entrada — as variáveis MAIS úteis (os dados sendo
          processados). Chips clicáveis que inserem `{{campo}}` no cursor. */}
      <div className="px-2 py-1.5 border-b border-border-light/60" data-testid="inference-object-fields">
        <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-1 flex items-center gap-1">
          {t('solutions.inferenceVariablesObjectFields')}
          <InfoTip text={t('solutions.inferenceVariablesObjectFieldsHint')} />
        </p>
        {objFields.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {objFields.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onInsert(`{{${name}}}`)}
                data-testid="inference-object-field-chip"
                data-field={name}
                title={t('solutions.inferenceVariablesInsert')}
                className="inline-flex items-center gap-1 h-6 px-1.5 text-[10px] font-mono bg-white border border-border-light text-primary hover:border-primary hover:bg-primary/5"
              >
                <Plus className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
                {`{{${name}}}`}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-on-light italic" data-testid="inference-object-fields-empty">
            {t('solutions.inferenceVariablesObjectFieldsEmpty')}
          </p>
        )}
      </div>

      {/* Built-in variables */}
      <div className="px-2 py-1 border-b border-border-light/60">
        <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
          {t('solutions.inferenceVariablesBuiltins')}
        </p>
        <div className="space-y-0.5">
          {BUILTIN_VARS.map((b) => (
            <div key={b.name} className="flex items-center gap-1.5 text-[10px]">
              <code className="font-mono text-primary">{`{{${b.name}}}`}</code>
              <span className="text-muted-on-light">{b.desc_pt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Declared variables */}
      <div className="px-2 py-1">
        <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
          {t('solutions.inferenceVariablesDeclared')}
        </p>
        {variables.length === 0 ? (
          <p className="text-[10px] text-muted-on-light italic">
            {t('solutions.inferenceVariablesEmpty')}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {variables.map((v) => (
              <li
                key={v.name}
                className="flex items-center gap-1.5 border border-border-light/60 px-1.5 py-0.5 bg-canvas-light"
                data-testid={`inference-variable-${v.name}`}
              >
                <code className="text-[10px] font-mono text-primary flex-1 truncate">
                  {`{{${v.name}}}`}
                </code>
                <span className="text-[9px] text-muted-on-light uppercase tracking-wide">
                  {(() => {
                    const lk = VARIABLE_KIND_OPTIONS.find((k) => k.value === v.kind)?.labelKey;
                    return lk ? t(lk as Parameters<typeof t>[0]) : v.kind;
                  })()}
                </span>
                {v.object_type && (
                  <span className="text-[9px] font-mono text-muted-on-light">
                    {v.object_type}
                    {v.property ? `.${v.property}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(v.name)}
                  aria-label={t('solutions.inferenceVariablesRemove')}
                  data-testid={`inference-variable-remove-${v.name}`}
                  className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger"
                >
                  <Trash2 className="w-2.5 h-2.5" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VariablePicker({
  variables,
  onPick,
  onClose,
}: {
  variables: InferenceVariable[];
  onPick: (expr: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="border-b border-border-light bg-canvas-light px-2 py-2 space-y-1"
      data-testid="inference-variable-picker"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {t('solutions.inferenceVariablesPickerTitle')}
      </p>
      <p className="text-[9.5px] text-muted-on-light leading-snug">
        {t('solutions.inferenceVariablesPickerHint')}
      </p>
      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {BUILTIN_VARS.map((b) => (
          <button
            key={b.name}
            type="button"
            onClick={() => onPick(`{{${b.name}}}`)}
            className="w-full text-left px-1.5 py-1 hover:bg-primary/10 border border-transparent hover:border-border-light text-[10px]"
            data-testid={`inference-picker-builtin-${b.name}`}
          >
            <code className="text-primary font-mono">{`{{${b.name}}}`}</code>
            <span className="ml-2 text-muted-on-light">{b.desc_pt}</span>
          </button>
        ))}
        {variables.map((v) => (
          <button
            key={v.name}
            type="button"
            onClick={() => onPick(`{{${v.name}}}`)}
            className="w-full text-left px-1.5 py-1 hover:bg-primary/10 border border-transparent hover:border-border-light text-[10px]"
            data-testid={`inference-picker-var-${v.name}`}
          >
            <code className="text-primary font-mono">{`{{${v.name}}}`}</code>
            {v.description && (
              <span className="ml-2 text-muted-on-light">{v.description}</span>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-[9px] text-muted-on-light hover:text-text-on-light"
      >
        {t('solutions.inferenceVariablesCancel')}
      </button>
    </div>
  );
}

function AddVariableForm({
  onSave,
  onCancel,
}: {
  onSave: (v: InferenceVariable) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<InferenceVariable['kind']>('static');
  const [description, setDescription] = React.useState('');
  const [objectType, setObjectType] = React.useState('');
  const [property, setProperty] = React.useState('');
  // Modo de seleção do objeto: inteiro / propriedade / agregação (Foundry object-set).
  const [mode, setMode] = React.useState<'whole' | 'property' | 'aggregation'>('whole');
  const [aggOp, setAggOp] = React.useState<NonNullable<InferenceVariable['agg_op']>>('count');
  // #1 v2 — N predicados de filtro (AND) + limite p/ a variável objectSet (consome a ontologia).
  const [filters, setFilters] = React.useState<Array<{ field: string; op: string; value: string }>>([
    { field: '', op: 'eq', value: '' },
  ]);
  const setFilterAt = (i: number, patch: Partial<{ field: string; op: string; value: string }>) =>
    setFilters((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addFilter = () => setFilters((fs) => [...fs, { field: '', op: 'eq', value: '' }]);
  const removeFilter = (i: number) => setFilters((fs) => (fs.length > 1 ? fs.filter((_, j) => j !== i) : fs));
  const [limit, setLimit] = React.useState('');
  // #1 v2 — modo RELAÇÃO ("objetos ligados a ESTE"). Relações vêm do schema do tipo alvo
  // (link_types); a travessia parte do objeto atual no runtime.
  const [relationMode, setRelationMode] = React.useState(false);
  const [relation, setRelation] = React.useState('');
  const [direction, setDirection] = React.useState<'outgoing' | 'incoming' | 'both'>('both');
  const [links, setLinks] = React.useState<Array<{ relation: string; target_kind?: string; target_label?: string }>>([]);
  const [nodeTypes, setNodeTypes] = React.useState<Array<{ name: string; label: string }>>([]);
  const [properties, setProperties] = React.useState<Array<{ key: string; label: string }>>([]);
  const [loadingProps, setLoadingProps] = React.useState(false);
  // #7 — tipos PROPOSTOS pelo AIP (com properties) p/ o select de tipo + o de
  // propriedade não caírem em vazio quando o tipo ainda não foi materializado.
  const proposed = useProposedTypes();
  const propsForKind = (kindName: string) =>
    proposed.find((p) => p.kind === kindName)?.properties?.map((p) => ({ key: p.key, label: p.label })) || [];
  // Tipos no dropdown: materializados + propostos (mesclados, propostos 1º).
  const typeOptions = React.useMemo(
    () => mergeObjectTypeOptions(nodeTypes.map((n) => ({ value: n.name, label: n.label })), proposed),
    [nodeTypes, proposed],
  );

  React.useEffect(() => {
    if (kind === 'objectSet') {
      void Ontology.listNodeTypes()
        .then((rows) => setNodeTypes(rows.map((r) => ({ name: r.name, label: r.label || r.name }))))
        .catch(() => setNodeTypes([]));
    }
  }, [kind]);

  React.useEffect(() => {
    if (kind === 'objectSet' && objectType) {
      setLoadingProps(true);
      void Ontology.objectTypeSchema(objectType)
        .then((schema) => {
          const real = schema.properties.map((p) => ({ key: p.key, label: p.label || p.key }));
          // #7 — fallback ao tipo PROPOSTO quando não há props materializadas (404).
          setProperties(real.length ? real : propsForKind(objectType));
          // #1 v2 — relações (link_types) deste tipo, p/ o modo RELAÇÃO.
          setLinks((schema.links || []).map((l) => ({
            relation: l.relation, target_kind: l.target_kind, target_label: l.target_label,
          })));
        })
        .catch(() => { setProperties(propsForKind(objectType)); setLinks([]); })
        .finally(() => setLoadingProps(false));
    } else {
      setProperties([]);
      setProperty('');
      setLinks([]);
      setLoadingProps(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, objectType, proposed]);

  const canSave = name.trim().length > 0;

  return (
    <div
      className="border-b border-border-light bg-raised-light/30 px-2.5 py-3 space-y-3"
      data-testid="inference-variable-add-form"
    >
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
          {t('solutions.inferenceVariablesName')} <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s/g, '_'))}
          placeholder={t('solutions.inferenceVariableNamePlaceholder')}
          data-testid="inference-variable-name-input"
          className="h-7 w-full px-2 text-[11px] font-mono bg-white border border-border-light focus:border-primary outline-none"
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
          {t('solutions.inferenceVariablesKind')}
        </label>
        <SearchableSelect
          value={kind}
          onChange={(v) => setKind(v as InferenceVariable['kind'])}
          options={VARIABLE_KIND_OPTIONS.map((o) => ({
            value: o.value,
            label: t(o.labelKey as Parameters<typeof t>[0]),
            hint: t(o.hintKey as Parameters<typeof t>[0]),
          }))}
          searchPlaceholder={t('solutions.searchOption')}
          data-testid="inference-variable-kind-select"
        />
      </div>
      {kind === 'objectSet' && (
        <>
          <div className="space-y-0.5">
            <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
              {t('solutions.inferenceVariablesObjectType')}
            </label>
            <select
              value={objectType}
              onChange={(e) => { setObjectType(e.target.value); setProperty(''); }}
              data-testid="inference-variable-objecttype-select"
              className="h-7 w-full px-2 text-[11px] bg-white border border-border-light focus:border-primary outline-none"
            >
              <option value="">—</option>
              {typeOptions.map((nt) => (
                <option key={nt.value} value={nt.value}>
                  {nt.label}
                </option>
              ))}
            </select>
          </div>
          {objectType && links.length > 0 && (
            <div className="space-y-1 border-t border-border-light/60 pt-2" data-testid="inference-variable-relation">
              <label className="flex items-center gap-1.5 text-[10px] text-text-on-light cursor-pointer">
                <input type="checkbox" checked={relationMode} onChange={(e) => setRelationMode(e.target.checked)}
                  data-testid="inference-variable-relation-toggle" className="accent-primary" />
                {t('solutions.inferenceVariablesRelationMode')}
                <InfoTip text={t('solutions.inferenceVariablesRelationHint')} />
              </label>
              {relationMode && (
                <div className="grid grid-cols-2 gap-1">
                  <select value={relation} onChange={(e) => setRelation(e.target.value)}
                    data-testid="inference-variable-relation-select"
                    className="h-7 px-1 text-[10px] bg-white border border-border-light focus:border-primary outline-none">
                    <option value="">{t('solutions.inferenceVariablesRelationPick')}</option>
                    {links.map((l, i) => (
                      <option key={`${l.relation}-${i}`} value={l.relation}>
                        {l.relation} → {l.target_label || l.target_kind || ''}
                      </option>
                    ))}
                  </select>
                  <select value={direction} onChange={(e) => setDirection(e.target.value as 'outgoing' | 'incoming' | 'both')}
                    data-testid="inference-variable-relation-direction"
                    className="h-7 px-1 text-[10px] bg-white border border-border-light focus:border-primary outline-none">
                    <option value="both">{t('solutions.relationBoth')}</option>
                    <option value="outgoing">{t('solutions.relationOut')}</option>
                    <option value="incoming">{t('solutions.relationIn')}</option>
                  </select>
                </div>
              )}
            </div>
          )}
          {objectType && (
            <div className="space-y-0.5">
              <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
                {t('solutions.inferenceVariablesSelectionMode')}
              </label>
              <select
                value={mode}
                onChange={(e) => {
                  const m = e.target.value as 'whole' | 'property' | 'aggregation';
                  setMode(m);
                  if (m === 'whole') setProperty('');
                }}
                data-testid="inference-variable-mode-select"
                className="h-7 w-full px-2 text-[11px] bg-white border border-border-light focus:border-primary outline-none"
              >
                <option value="whole">{t('solutions.inferenceVariablesModeWhole')}</option>
                <option value="property">{t('solutions.inferenceVariablesModeProperty')}</option>
                <option value="aggregation">{t('solutions.inferenceVariablesModeAggregation')}</option>
              </select>
            </div>
          )}
          {objectType && mode === 'aggregation' && (
            <div className="space-y-0.5">
              <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
                {t('solutions.inferenceVariablesAggOp')}
              </label>
              <SearchableSelect
                value={aggOp}
                onChange={(v) => setAggOp(v as NonNullable<InferenceVariable['agg_op']>)}
                options={AGG_OPS.map((o) => ({
                  value: o.value,
                  label: t(o.labelKey as Parameters<typeof t>[0]),
                  hint: o.value, // token técnico (count/sum/avg…) como contexto mono
                }))}
                searchPlaceholder={t('solutions.searchOption')}
                data-testid="inference-variable-aggop-select"
              />
            </div>
          )}
          {objectType && (mode === 'property' || (mode === 'aggregation' && aggOp !== 'count')) && (
            <div className="space-y-0.5">
              <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
                {mode === 'aggregation'
                  ? t('solutions.inferenceVariablesAggField')
                  : t('solutions.inferenceVariablesProperty')}
              </label>
              {/* NUNCA em branco: carregando → dropdown das propriedades reais do
                  tipo → mensagem clara se o tipo não tiver propriedade declarada. */}
              {loadingProps ? (
                <p className="text-[10px] text-muted-on-light" data-testid="inference-variable-property-loading">
                  {t('common.loading')}
                </p>
              ) : properties.length > 0 ? (
                <select
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                  data-testid="inference-variable-property-select"
                  className="h-7 w-full px-2 text-[11px] bg-white border border-border-light focus:border-primary outline-none"
                >
                  <option value="">—</option>
                  {properties.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] text-warning" data-testid="inference-variable-property-empty">
                  {t('solutions.inferenceVariablesNoProperties')}
                </p>
              )}
            </div>
          )}
          {/* #1 — FILTRO (opcional) + LIMITE: a variável consome a ontologia com condições. */}
          {objectType && (
            <div className="space-y-1.5 border-t border-border-light/60 pt-2" data-testid="inference-variable-filter">
              <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
                {t('solutions.inferenceVariablesFilter')}
              </label>
              {filters.map((f, i) => (
                <div key={i} className="flex items-center gap-1" data-testid="inference-variable-filter-row">
                  <select value={f.field} onChange={(e) => setFilterAt(i, { field: e.target.value })}
                    data-testid={`inference-variable-filter-field-${i}`}
                    className="flex-1 h-7 px-1 text-[10px] bg-white border border-border-light focus:border-primary outline-none">
                    <option value="">{t('solutions.inferenceVariablesFilterField')}</option>
                    {properties.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
                  </select>
                  <select value={f.op} onChange={(e) => setFilterAt(i, { op: e.target.value })}
                    data-testid={`inference-variable-filter-op-${i}`}
                    className="h-7 px-1 text-[10px] bg-white border border-border-light focus:border-primary outline-none">
                    {FILTER_OPS.map((o) => (<option key={o.value} value={o.value}>{t(o.labelKey as Parameters<typeof t>[0])}</option>))}
                  </select>
                  <input type="text" value={f.value} onChange={(e) => setFilterAt(i, { value: e.target.value })}
                    placeholder={t('solutions.inferenceVariablesFilterValue')}
                    disabled={f.op === 'exists' || f.op === 'not_exists'}
                    data-testid={`inference-variable-filter-value-${i}`}
                    className="flex-1 h-7 px-1.5 text-[10px] bg-white border border-border-light focus:border-primary outline-none disabled:opacity-40" />
                  <button type="button" onClick={() => removeFilter(i)} disabled={filters.length <= 1}
                    aria-label={t('solutions.inferenceVariablesCancel')}
                    data-testid={`inference-variable-filter-remove-${i}`}
                    className="text-muted-on-light hover:text-danger shrink-0 disabled:opacity-30">
                    <X className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addFilter} data-testid="inference-variable-filter-add"
                className="text-[10px] uppercase tracking-wide text-primary hover:underline inline-flex items-center gap-1">
                <Plus className="w-2.5 h-2.5" strokeWidth={1.5} /> {t('solutions.inferenceVariablesFilterAdd')}
              </button>
              <div className="flex items-center gap-1.5 pt-1">
                <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
                  {t('solutions.inferenceVariablesLimit')}
                </label>
                <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)}
                  placeholder="1000" min={1}
                  data-testid="inference-variable-limit"
                  className="h-7 w-24 px-1.5 text-[10px] bg-white border border-border-light focus:border-primary outline-none" />
              </div>
            </div>
          )}
        </>
      )}
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono">
          {t('solutions.inferenceVariablesValue')}
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('solutions.inferenceVariableValuePlaceholder')}
          data-testid="inference-variable-description-input"
          className="h-7 w-full px-2 text-[11px] bg-white border border-border-light focus:border-primary outline-none"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              name: name.trim(),
              kind,
              description: description || undefined,
              object_type: kind === 'objectSet' ? objectType || undefined : undefined,
              property:
                kind === 'objectSet' &&
                property &&
                (mode === 'property' || (mode === 'aggregation' && aggOp !== 'count'))
                  ? property
                  : undefined,
              agg_op:
                kind === 'objectSet' && mode === 'aggregation' ? aggOp : undefined,
              filter:
                kind === 'objectSet'
                  ? (() => {
                      const fs = filters
                        .filter((f) => f.field)
                        .map((f) => ({
                          field: f.field,
                          op: f.op,
                          value: f.op === 'exists' || f.op === 'not_exists' ? undefined : f.value,
                        }));
                      return fs.length ? fs : undefined;
                    })()
                  : undefined,
              limit: kind === 'objectSet' && limit ? Number(limit) || undefined : undefined,
              relation: kind === 'objectSet' && relationMode && relation ? relation : undefined,
              direction: kind === 'objectSet' && relationMode && relation ? direction : undefined,
              target_kind:
                kind === 'objectSet' && relationMode && relation
                  ? links.find((l) => l.relation === relation)?.target_kind || objectType
                  : undefined,
            })
          }
          data-testid="inference-variable-save-btn"
          className="h-6 px-2.5 text-[10px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-40"
        >
          {t('solutions.inferenceVariablesSave')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-6 px-2.5 text-[10px] border border-border-light hover:border-danger hover:text-danger"
        >
          {t('solutions.inferenceVariablesCancel')}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function InferenceConfigSection({
  node,
  onPatchNode,
  proposedPrompt = '',
  inputProps,
}: {
  node: SolutionNode;
  onPatchNode: (id: string, patch: Partial<SolutionNode>) => void;
  proposedPrompt?: string;
  /** Campos do objeto de entrada (propriedades do tipo enriquecido) — viram
   *  chips de variável `{{campo}}` no template. */
  inputProps?: InferenceInputProp[];
}) {
  const t = useT();
  const cfg = (node.config || {}) as Record<string, unknown>;
  const prompt = (cfg.inference_prompt as string) ?? proposedPrompt;
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);

  const variables: InferenceVariable[] = Array.isArray(cfg.inference_variables)
    ? (cfg.inference_variables as InferenceVariable[])
    : [];

  // Fase 3c: o nó NÃO escolhe modelo cru — usa o modelo padrão da finalidade
  // "Agentes" (configurado em Dados › Modelos). Buscamos só p/ exibir o codinome.
  const [agentDefault, setAgentDefault] = React.useState<AipModelDefault | null>(null);
  React.useEffect(() => {
    void AIPModels.defaults()
      .then((defs) => setAgentDefault(defs.find((d) => d.purpose === 'agent') ?? null))
      .catch(() => setAgentDefault(null));
  }, []);

  const patch = (next: Record<string, unknown>) =>
    onPatchNode(node.id, { config: { ...cfg, ...next } });

  // Task 3: insert variable at prompt cursor
  const handleInsertVariable = (expr: string) => {
    const ta = promptRef.current;
    if (!ta) {
      patch({ inference_prompt: prompt + expr });
      return;
    }
    const start = ta.selectionStart ?? prompt.length;
    const end = ta.selectionEnd ?? prompt.length;
    const next = prompt.slice(0, start) + expr + prompt.slice(end);
    patch({ inference_prompt: next });
    const nextCursor = start + expr.length;
    requestAnimationFrame(() => {
      if (promptRef.current) {
        promptRef.current.focus();
        promptRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleAddVariable = (v: InferenceVariable) => {
    patch({ inference_variables: [...variables, v] });
  };

  const handleRemoveVariable = (name: string) => {
    patch({ inference_variables: variables.filter((v) => v.name !== name) });
  };

  return (
    <div className="border-t border-border-light pt-3 space-y-2" data-testid="inference-config">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
        <Cpu className="w-3 h-3" strokeWidth={1.5} />
        {t('solutions.inference')}
        <InfoTip text={t('solutions.inferenceHint')} />
      </p>

      {/* Fase 3c: modelo é o padrão da finalidade "Agentes" (config central em
          Dados › Modelos). O nó não escolhe modelo cru — só mostra qual será usado. */}
      <div className="space-y-0.5" data-testid="inference-model-central">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {t('solutions.inferenceModel')}
        </Label>
        <div className="flex items-center justify-between gap-2 border border-border-light bg-canvas-light px-2.5 py-1.5">
          <span className="text-[12px] font-mono text-text-on-light truncate" data-testid="inference-model-name">
            {agentDefault ? aipModelLabel(agentDefault.model) || agentDefault.model : '—'}
          </span>
          <a
            href="/painel-de-controle/dados?aba=modelos"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-primary hover:underline shrink-0"
            data-testid="inference-model-configure"
          >
            {t('solutions.inferenceModelConfigure')}
          </a>
        </div>
        <p className="text-[10px] text-muted-on-light">{t('solutions.inferenceModelCentralHint')}</p>
      </div>

      {/* Prompt textarea */}
      <div className="space-y-0.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {t('solutions.inferencePrompt')}
        </Label>
        <textarea
          ref={promptRef}
          value={prompt}
          onChange={(e) => patch({ inference_prompt: e.target.value })}
          data-testid="inference-prompt"
          rows={5}
          placeholder={proposedPrompt || t('solutions.inferencePromptPlaceholder')}
          className="w-full px-2 py-1.5 text-[11px] font-mono leading-relaxed bg-white border border-border-light focus:border-primary outline-none resize-y"
        />
      </div>

      {/* Task 3: Variables sub-panel */}
      <VariablesSubPanel
        variables={variables}
        prompt={prompt}
        promptRef={promptRef}
        onInsert={handleInsertVariable}
        onAdd={handleAddVariable}
        onRemove={handleRemoveVariable}
        inputProps={inputProps}
      />
    </div>
  );
}
