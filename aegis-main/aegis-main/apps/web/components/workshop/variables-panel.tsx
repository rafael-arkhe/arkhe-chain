'use client';

/**
 * VariablesPanel — Tier A + B3/B4 do parity roadmap (2026-05-20).
 *
 * Painel drawer-right que lista variables do app + dependency graph
 * reverso. **Tier B3/B4 adicionou CRUD**: + Adicionar / Editar /
 * Excluir variables, com formulários específicos por `kind`:
 *
 *   - `static`              — value literal
 *   - `objectSet`           — object_type + filter JSON
 *   - `objectAggregation`   — source ObjectSet + op (count/sum/avg/min/max/distinct_count) + field
 *   - `function`            — function_id + args JSON
 *   - `transformation`      — expression
 *
 * Persiste em `workshop_apps.variables` (JSONB) via `Workshop.update`.
 * Seeds locais e local.app.* sumam Salvar; mudanças ficam só em
 * memória (o editor pai cuida do save normal).
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  Braces,
  Calculator,
  Database,
  Equal,
  ExternalLink,
  FunctionSquare,
  Link2,
  Network,
  Pencil,
  Plug,
  Plus,
  Save,
  Sigma,
  Square,
  Table,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Ontology, type OntologyHistogram, type OntologyNodeType } from '@/lib/api';
import type {
  LayoutNode,
  ObjectAggregationSpec,
  VariableKind,
  VariableType,
  WorkshopApp,
  WorkshopVariable,
} from '@/lib/workshop/types';
import { Workshop, type VariableUsage } from '@/lib/workshop/client';
import { getWidgetMeta } from './WorkshopV2Renderer';
import { confirmModal } from '@/components/dialog/confirm-dialog';

interface NodeRef {
  nodeId: string;
  widgetType: string;
  via: string;
}

function collectAllNodes(app: WorkshopApp): LayoutNode[] {
  const out: LayoutNode[] = [];
  if (app.pages && app.pages.length > 0) {
    for (const p of app.pages) out.push(...(p.layout.root ?? []));
  } else if (app.layout) {
    out.push(...(app.layout.root ?? []));
  }
  for (const o of app.overlays ?? []) {
    out.push(...(o.layout.root ?? []));
  }
  return out;
}

function buildDependencyMap(app: WorkshopApp): Map<string, NodeRef[]> {
  const map = new Map<string, NodeRef[]>();
  const allVars = (app.variables ?? []).map((v) => v.external_id || v.id);
  for (const k of allVars) {
    if (!map.has(k)) map.set(k, []);
  }
  for (const node of collectAllNodes(app)) {
    const meta = getWidgetMeta(node.widget.type);
    const props = (node.widget.props as Record<string, unknown>) ?? {};
    if (meta?.mockVariables) {
      for (const k of Object.keys(meta.mockVariables)) {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push({ nodeId: node.id, widgetType: node.widget.type, via: 'mockVariables' });
      }
    }
    if (meta?.config_schema) {
      for (const f of meta.config_schema) {
        if (f.field !== 'variable-ref') continue;
        const v = props[f.name];
        if (typeof v === 'string' && v) {
          if (!map.has(v)) map.set(v, []);
          map.get(v)!.push({ nodeId: node.id, widgetType: node.widget.type, via: `config:${f.name}` });
        }
      }
    }
    if (node.widget.bindings) {
      for (const [varExt, srcWidget] of Object.entries(node.widget.bindings)) {
        if (!map.has(varExt)) map.set(varExt, []);
        map.get(varExt)!.push({ nodeId: node.id, widgetType: node.widget.type, via: `binding:${srcWidget}` });
      }
    }
  }
  return map;
}

/**
 * Metadados de cada `kind`: rótulo PT-BR, ícone lucide, classe de cor.
 * Esses kinds existem no schema do backend e não podem ser renomeados —
 * o `value` continua sendo a chave técnica; a UI só mostra `label`.
 */
const KIND_META: Record<VariableKind, {
  label: string;
  hint: string;
  Icon: LucideIcon;
  chip: string;   // bg + border + text
}> = {
  static: {
    label: 'Valor fixo',
    hint: 'Texto, número ou JSON definido aqui no painel',
    Icon: Square,
    chip: 'bg-raised-light text-muted-on-light border-border-light',
  },
  objectSet: {
    label: 'Busca',
    hint: 'Lista de objetos vinda da ontologia',
    Icon: Table,
    chip: 'bg-primary/10 text-primary border-primary/30',
  },
  objectAggregation: {
    label: 'Cálculo',
    hint: 'Contagem/soma/média/min/máx sobre uma busca',
    Icon: Sigma,
    chip: 'bg-success/10 text-success border-success/30',
  },
  function: {
    label: 'Função externa',
    hint: 'Saída de uma function do backend',
    Icon: FunctionSquare,
    chip: 'bg-warning/10 text-warning border-warning/30',
  },
  transformation: {
    label: 'Fórmula',
    hint: 'Combina outros dados usando aritmética e comparações',
    Icon: Equal,
    chip: 'bg-info/10 text-info border-info/30',
  },
  struct: {
    label: 'Composição',
    hint: 'Junta vários dados em um único objeto com campos nomeados',
    Icon: Braces,
    chip: 'bg-warning/10 text-warning border-warning/30',
  },
};

const VARIABLE_KINDS: { value: VariableKind; label: string; hint: string }[] =
  (Object.keys(KIND_META) as VariableKind[]).map((k) => ({
    value: k,
    label: KIND_META[k].label,
    hint: KIND_META[k].hint,
  }));

const TYPE_LABELS: Record<VariableType, string> = {
  String: 'Texto',
  Numeric: 'Número',
  Boolean: 'Sim/Não',
  Date: 'Data',
  ObjectSet: 'Conjunto de objetos',
  ObjectSetFilter: 'Filtro de busca',
  Struct: 'Composição',
  // Sprint L7 (2026-05-23): tipos de coleção p/ widgets visuais.
  Series: 'Série de gráfico',
  Events: 'Eventos de timeline',
  GeoPoints: 'Pontos geográficos',
  Calendar: 'Mapa de calendário',
  // Wave F.2 (2026-05-23) — slate parity MVP.
  ObjectReference: 'Referência de objeto',
  Json: 'JSON livre',
};

const VARIABLE_TYPES: VariableType[] = [
  'String',
  'Numeric',
  'Boolean',
  'Date',
  'ObjectSet',
  'ObjectSetFilter',
  'Struct',
  'Series',
  'Events',
  'GeoPoints',
  'Calendar',
  // Wave F.2 (2026-05-23) — slate parity MVP.
  'ObjectReference',
  'Json',
];

/**
 * Sprint C3 (Parity Audit): tipos suportados como `StructField.type`
 * (nested structs NÃO suportados — paridade Foundry).
 */
const STRUCT_FIELD_TYPES: { value: 'String' | 'Numeric' | 'Boolean' | 'Date' | 'ObjectSet' | 'ObjectSetFilter'; label: string }[] = [
  { value: 'String', label: 'Texto' },
  { value: 'Numeric', label: 'Número' },
  { value: 'Boolean', label: 'Sim/Não' },
  { value: 'Date', label: 'Data' },
  { value: 'ObjectSet', label: 'Conjunto de objetos' },
  { value: 'ObjectSetFilter', label: 'Filtro de busca' },
];

const AGG_OPS: { value: ObjectAggregationSpec['aggregation']['op']; label: string }[] = [
  { value: 'count', label: 'Contar registros' },
  { value: 'sum', label: 'Somar' },
  { value: 'avg', label: 'Média' },
  { value: 'min', label: 'Mínimo' },
  { value: 'max', label: 'Máximo' },
  { value: 'distinct_count', label: 'Contar únicos' },
];

/**
 * Deriva um identificador técnico (snake_case ASCII) a partir do nome amigável.
 * Operador escreve "Total de alertas" → external_id = "total_de_alertas".
 */
function slugifyForExternalId(label?: string | null): string {
  if (!label) return '';
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, '_$1')         // backend exige começar com letra
    .slice(0, 64);
}

function emptyVariable(): WorkshopVariable {
  return {
    id: `var_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    external_id: '',
    type: 'String',
    kind: 'static',
    recompute_mode: 'auto',
    spec: {},
  };
}

export function VariablesPanel({
  app,
  open,
  onClose,
  onChange,
}: {
  app: WorkshopApp;
  open: boolean;
  onClose: () => void;
  onChange: (next: WorkshopApp) => void;
}) {
  const depMap = React.useMemo(() => buildDependencyMap(app), [app]);
  const [editing, setEditing] = React.useState<WorkshopVariable | null>(null);
  const [isNew, setIsNew] = React.useState(false);

  if (!open || typeof document === 'undefined') return null;

  const declared = app.variables ?? [];
  const undeclaredKeys = Array.from(depMap.keys()).filter(
    (k) => !declared.some((v) => (v.external_id || v.id) === k),
  );

  const addNew = (preset?: Partial<WorkshopVariable>) => {
    const v = { ...emptyVariable(), ...(preset ?? {}) };
    setEditing(v);
    setIsNew(true);
  };

  const saveVar = (next: WorkshopVariable) => {
    const ext = (next.external_id || '').trim();
    if (!ext) return;
    const list = (app.variables ?? []).filter((v) => v.id !== next.id);
    list.push({ ...next, external_id: ext });
    onChange({ ...app, variables: list });
    setEditing(null);
    setIsNew(false);
  };

  const removeVar = async (id: string) => {
    if (!(await confirmModal({ title: 'Remover este dado do painel?', tone: 'danger', confirmLabel: 'Remover' }))) return;
    onChange({
      ...app,
      variables: (app.variables ?? []).filter((v) => v.id !== id),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]" data-testid="variables-panel-root">
      {/* Backdrop escuro semi-opaco — sem `surface-light` aqui senão sobrescreve. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 ds-overlay"
      />
      <div
        role="dialog"
        aria-label="Variables panel"
        className="absolute top-0 bottom-0 right-0 w-[560px] surface-light bg-canvas-light border-l border-border-light shadow-2xl flex flex-col overflow-hidden"
      >
        <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <Database className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
            Dados do painel · {declared.length}
          </p>
          <button
            type="button"
            onClick={() => addNew()}
            data-testid="variables-panel-add"
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} /> Novo dado
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="variables-panel-close"
            className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {declared.length === 0 && undeclaredKeys.length === 0 && (
            <p className="p-4 text-[11px] text-muted-on-light italic text-center">
              Este painel ainda não tem dados. Use o botão "+ Novo dado" pra criar o primeiro.
            </p>
          )}

          {declared.length > 0 && (
            <section>
              <header className="px-3 py-2 bg-raised-light/40 border-b border-border-light">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono font-semibold">
                  Disponíveis neste painel
                </p>
              </header>
              <ul className="divide-y divide-border-light/60">
                {declared.map((v) => (
                  <VariableRow
                    key={v.id ?? v.external_id}
                    variable={v}
                    consumers={depMap.get(v.external_id || v.id) ?? []}
                    onEdit={() => {
                      setEditing(v);
                      setIsNew(false);
                    }}
                    onRemove={() => removeVar(v.id)}
                  />
                ))}
              </ul>
            </section>
          )}

          {undeclaredKeys.length > 0 && (
            <section>
              <header className="px-3 py-2.5 bg-warning/25 border-y border-warning/60">
                <p className="text-[10px] uppercase tracking-[0.14em] text-text-on-light font-mono font-semibold flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 bg-warning rounded-none" />
                  Faltando configurar · {undeclaredKeys.length}
                </p>
                <p className="text-[10.5px] text-text-on-light/75 mt-1 normal-case tracking-normal leading-snug">
                  Estes widgets esperam um dado que ainda não foi criado.
                  Sem ele, o widget mostra valor de exemplo.
                </p>
              </header>
              <ul className="divide-y divide-border-light/60">
                {undeclaredKeys.map((k) => (
                  <li key={k} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-mono font-semibold text-text-on-light">{k}</p>
                      <p className="text-[10px] text-muted-on-light mt-0.5">
                        usado por {(depMap.get(k) ?? []).length} widget
                        {(depMap.get(k) ?? []).length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addNew({ external_id: k })}
                      className="h-6 px-2 text-[10px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1"
                      data-testid={`variables-panel-create-${k}`}
                    >
                      <Plus className="w-3 h-3" strokeWidth={1.5} /> Criar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {editing && (
        <VariableEditor
          appId={app.id}
          variable={editing}
          isNew={isNew}
          existingExternalIds={declared.map((v) => v.external_id).filter((x) => x !== editing.external_id)}
          onSave={saveVar}
          onCancel={() => {
            setEditing(null);
            setIsNew(false);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

function VariableRow({
  variable,
  consumers,
  onEdit,
  onRemove,
}: {
  variable: WorkshopVariable;
  consumers: NodeRef[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  const meta = KIND_META[variable.kind];
  const Icon = meta.Icon;
  const displayTitle = variable.label || variable.external_id || variable.id;
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'shrink-0 h-6 w-6 flex items-center justify-center border',
            meta.chip,
          )}
          title={meta.label}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-text-on-light truncate">
            {displayTitle}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <span
              className={cn(
                'px-1.5 h-4 inline-flex items-center text-[9px] uppercase tracking-wide border',
                meta.chip,
              )}
            >
              {meta.label}
            </span>
            <span className="px-1.5 h-4 inline-flex items-center text-[9px] uppercase tracking-wide border border-border-light bg-canvas-light text-muted-on-light">
              {TYPE_LABELS[variable.type]}
            </span>
          </div>
          {variable.description && (
            <p className="text-[10px] text-muted-on-light mt-1 leading-snug">{variable.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar dado"
          data-testid={`variable-edit-${variable.external_id || variable.id}`}
          className="h-6 w-6 shrink-0 flex items-center justify-center text-muted-on-light hover:text-primary border border-transparent hover:border-primary"
        >
          <Pencil className="w-3 h-3" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover dado"
          className="h-6 w-6 shrink-0 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger"
        >
          <Trash2 className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
      <ConsumersList consumers={consumers} />
    </li>
  );
}

function ConsumersList({ consumers }: { consumers: NodeRef[] }) {
  if (consumers.length === 0) {
    return (
      <p className="mt-1 text-[10px] italic text-muted-on-light/70">
        Ainda não usado por nenhum widget.
      </p>
    );
  }
  return (
    <div className="mt-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
        Usado por {consumers.length} widget{consumers.length === 1 ? '' : 's'}
      </p>
      <ul className="space-y-0.5 max-h-32 overflow-y-auto">
        {consumers.map((c, i) => (
          <li
            key={`${c.nodeId}-${i}`}
            className={cn(
              'text-[10px] font-mono flex items-center gap-1.5 px-1.5 py-0.5 border-l-2 border-border-light hover:border-primary',
            )}
          >
            <ExternalLink className="w-2.5 h-2.5 text-muted-on-light" strokeWidth={1.5} />
            <span className="text-text-on-light truncate flex-1">{c.widgetType}</span>
            <span className="text-muted-on-light/70 text-[9px]">{c.via}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* VariableEditor — form modal nested sobre o panel                           */
/* -------------------------------------------------------------------------- */

function VariableEditor({
  appId,
  variable,
  isNew,
  existingExternalIds,
  onSave,
  onCancel,
}: {
  appId: string;
  variable: WorkshopVariable;
  isNew: boolean;
  existingExternalIds: string[];
  onSave: (v: WorkshopVariable) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState<WorkshopVariable>(variable);
  const [error, setError] = React.useState<string | null>(null);
  // Sprint A2 (Parity Audit) — dual-tab Definition | Settings, espelhando
  // Foundry Variable Editor. `Definition` = spec (kind+type+source);
  // `Settings` = cross-cutting (routing, state saving, identificador).
  const [activeTab, setActiveTab] = React.useState<'definition' | 'settings'>('definition');

  const update = <K extends keyof WorkshopVariable>(k: K, v: WorkshopVariable[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const updateSpec = (next: Record<string, unknown>) => {
    setDraft((d) => ({ ...d, spec: { ...(d.spec as Record<string, unknown> | undefined), ...next } as WorkshopVariable['spec'] }));
  };

  const submit = () => {
    setError(null);
    // Se o operador não preencher identificador interno, derivar do nome amigável.
    const ext = (draft.external_id || slugifyForExternalId(draft.label) || '').trim();
    if (!ext) {
      setError('Preencha o nome do dado (ou abra "Avançado" e defina o identificador).');
      return;
    }
    if (existingExternalIds.includes(ext)) {
      setError('Já existe um dado com este identificador. Escolha outro nome.');
      return;
    }
    onSave({ ...draft, external_id: ext });
  };

  return createPortal(
    // Wrapper TRANSPARENTE (sem `surface-light` — pintava a viewport de branco
    // opaco e o backdrop escurecia o branco, não o app; bug do operador
    // 2026-06-04). O contexto claro vai no container do dialog.
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      data-testid="variable-editor-modal"
    >
      <div
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 ds-overlay"
      />
      <div
        role="dialog"
        aria-label={isNew ? 'Adicionar variable' : 'Editar variable'}
        className={cn(
          'relative surface-light bg-canvas-light border border-border-light max-h-[88vh] flex overflow-hidden',
          isNew ? 'w-[520px]' : 'w-[840px]',
        )}
      >
        <div className="flex flex-col w-[520px] shrink-0 overflow-hidden">
        <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
            {isNew ? 'Novo dado' : 'Editar dado'}
          </p>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
            className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>
        <nav className="flex border-b border-border-light bg-canvas-light shrink-0" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'definition'}
            onClick={() => setActiveTab('definition')}
            data-testid="variable-editor-tab-definition"
            className={cn(
              'h-8 px-3 text-[11px] border-b-2 -mb-px',
              activeTab === 'definition'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-on-light hover:text-text-on-light',
            )}
          >
            Definição
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            data-testid="variable-editor-tab-settings"
            className={cn(
              'h-8 px-3 text-[11px] border-b-2 -mb-px',
              activeTab === 'settings'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-on-light hover:text-text-on-light',
            )}
          >
            Configurações
          </button>
        </nav>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[11px]">
          {activeTab === 'definition' ? (
            <>
              <Field
                label="Nome"
                required
                value={draft.label ?? ''}
                onChange={(v) => update('label', v)}
                placeholder="Ex.: Total de alertas"
              />
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label="Origem do dado"
                  value={draft.kind}
                  onChange={(v) => update('kind', v as VariableKind)}
                  options={VARIABLE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
                />
                <SelectField
                  label="Tipo do valor"
                  value={draft.type}
                  onChange={(v) => update('type', v as VariableType)}
                  options={VARIABLE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
                />
              </div>
              <p className="text-[10px] text-muted-on-light leading-snug -mt-1">
                {KIND_META[draft.kind].hint}
              </p>
              <Field
                label="Descrição (opcional)"
                value={draft.description ?? ''}
                onChange={(v) => update('description', v)}
                placeholder="Para que serve? Quando o operador olha, o que ele entende?"
                multiline
              />
              <KindSpecificFields
                draft={draft}
                onSpec={updateSpec}
                onDraftPatch={(p) => setDraft((d) => ({ ...d, ...p }))}
              />
            </>
          ) : (
            <SettingsTab
              draft={draft}
              onPatch={(p) => setDraft((d) => ({ ...d, ...p }))}
            />
          )}

          {error && (
            <p className="text-[11px] text-danger border border-danger/40 bg-danger/5 px-2 py-1">
              {error}
            </p>
          )}
        </div>
        <footer className="px-3 py-2 border-t border-border-light bg-raised-light/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            data-testid="variable-editor-save"
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover"
          >
            {isNew ? 'Criar dado' : 'Salvar alterações'}
          </button>
        </footer>
        </div>
        {!isNew && (
          <VariableUsageSidebar
            appId={appId}
            externalId={variable.external_id}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* VariableUsageSidebar — P5 Parity Audit (2026-05-21)                        */
/* Sidebar direita do VariableEditor mostrando onde a variable é usada.       */
/* -------------------------------------------------------------------------- */

interface UsageState {
  loading: boolean;
  data: VariableUsage | null;
  error: string | null;
}

function useVariableUsage(appId: string, externalId: string): UsageState {
  const [state, setState] = React.useState<UsageState>({
    loading: true,
    data: null,
    error: null,
  });
  React.useEffect(() => {
    if (!appId || !externalId) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    Workshop.getVariableUsage(appId, externalId)
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Falha ao calcular uso da variável.';
        setState({ loading: false, data: null, error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [appId, externalId]);
  return state;
}

const USAGE_CHIP_VARIANTS = {
  warning: 'bg-warning/15 text-warning border-warning/40',
  primary: 'bg-primary/10 text-primary border-primary/30',
  success: 'bg-success/15 text-success border-success/40',
  info: 'bg-info/15 text-info border-info/40',
  neutral: 'bg-raised-light text-muted-on-light border-border-light',
} as const;

type UsageChipVariant = keyof typeof USAGE_CHIP_VARIANTS;

function UsageChip({
  label,
  variant,
}: {
  label: string;
  variant: UsageChipVariant;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 h-5 text-[10px] uppercase tracking-wide border font-mono',
        USAGE_CHIP_VARIANTS[variant],
      )}
    >
      {label}
    </span>
  );
}

function VariableUsageSidebar({
  appId,
  externalId,
}: {
  appId: string;
  externalId: string;
}) {
  const { loading, data, error } = useVariableUsage(appId, externalId);
  const totalWidgets = data?.widgets.length ?? 0;
  const totalEvents = data?.events.length ?? 0;
  const flags = data
    ? {
        moduleInterface: data.is_module_interface,
        routing: data.is_routing,
        stateSaving: data.is_state_saving,
        activePage: data.is_active_page_variable,
        overlays: data.is_active_open_variable_of ?? [],
      }
    : null;
  const hasAnyFlag =
    flags &&
    (flags.moduleInterface ||
      flags.routing ||
      flags.stateSaving ||
      flags.activePage ||
      flags.overlays.length > 0);
  const hasAny = totalWidgets + totalEvents > 0 || hasAnyFlag;

  return (
    <aside
      data-testid="variable-usage-sidebar"
      className="w-[320px] shrink-0 border-l border-border-light bg-raised-light/30 flex flex-col overflow-hidden"
    >
      <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
        <Network className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
          Usado em
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[11px]">
        {loading && (
          <p
            data-testid="variable-usage-loading"
            className="text-[11px] italic text-muted-on-light"
          >
            Calculando uso…
          </p>
        )}
        {!loading && error && (
          <p
            data-testid="variable-usage-error"
            className="text-[11px] text-danger border border-danger/40 bg-danger/5 px-2 py-1 leading-snug"
          >
            Não foi possível carregar o uso desta variável. {error}
          </p>
        )}
        {!loading && !error && data && (
          <>
            {!hasAny && (
              <p
                data-testid="variable-usage-empty"
                className="text-[11px] italic text-muted-on-light leading-snug"
              >
                Esta variável ainda não é usada por nenhum widget ou evento.
              </p>
            )}
            {totalWidgets > 0 && (
              <section data-testid="variable-usage-widgets">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono font-semibold mb-1.5">
                  Widgets ({totalWidgets})
                </p>
                <ul className="space-y-1">
                  {data.widgets.map((w, i) => (
                    <li
                      key={`${w.node_id}-${i}`}
                      className="border-l-2 border-border-light hover:border-primary px-2 py-1 bg-canvas-light"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-text-on-light truncate flex-1">
                          {w.widget_type}
                        </span>
                        <span className="px-1 text-[9px] font-mono uppercase tracking-wide bg-raised-light border border-border-light text-muted-on-light">
                          {w.via}
                        </span>
                      </div>
                      <p className="text-[9.5px] font-mono text-muted-on-light truncate">
                        {w.node_id}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {totalEvents > 0 && (
              <section data-testid="variable-usage-events">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono font-semibold mb-1.5">
                  Eventos ({totalEvents})
                </p>
                <ul className="space-y-1">
                  {data.events.map((ev, i) => (
                    <li
                      key={`${ev.node_id}-${i}`}
                      className="border-l-2 border-border-light hover:border-primary px-2 py-1 bg-canvas-light"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-text-on-light truncate flex-1">
                          {ev.widget_type}
                        </span>
                        <span className="px-1 text-[9px] font-mono uppercase tracking-wide bg-raised-light border border-border-light text-muted-on-light">
                          {ev.via}
                        </span>
                      </div>
                      <p className="text-[9.5px] font-mono text-muted-on-light truncate">
                        {ev.node_id}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {hasAnyFlag && flags && (
              <section data-testid="variable-usage-flags">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono font-semibold mb-1.5">
                  Flags
                </p>
                <div className="flex flex-wrap gap-1">
                  {flags.moduleInterface && (
                    <UsageChip label="Interface do painel" variant="warning" />
                  )}
                  {flags.routing && (
                    <UsageChip label="Roteamento URL" variant="primary" />
                  )}
                  {flags.stateSaving && (
                    <UsageChip label="Estado salvo" variant="success" />
                  )}
                  {flags.activePage && (
                    <UsageChip label="Página ativa do painel" variant="info" />
                  )}
                  {flags.overlays.map((id) => (
                    <UsageChip
                      key={id}
                      label={`Janela #${id}`}
                      variant="neutral"
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function KindSpecificFields({
  draft,
  onSpec,
  onDraftPatch,
}: {
  draft: WorkshopVariable;
  onSpec: (next: Record<string, unknown>) => void;
  onDraftPatch: (p: Partial<WorkshopVariable>) => void;
}) {
  const spec = (draft.spec as Record<string, unknown> | undefined) ?? {};

  if (draft.kind === 'static') {
    return (
      <div className="space-y-2 border-t border-border-light pt-3">
        <SectionHeader meta={KIND_META.static} />
        <Field
          label="Valor"
          value={
            draft.default !== undefined
              ? typeof draft.default === 'string'
                ? draft.default
                : JSON.stringify(draft.default)
              : ''
          }
          onChange={(v) => {
            let parsed: unknown = v;
            try {
              parsed = JSON.parse(v);
            } catch {
              parsed = v;
            }
            onDraftPatch({ default: parsed });
          }}
          placeholder='Ex.: 42, texto livre, ou ["item1","item2"]'
          mono
        />
        <p className="text-[10px] text-muted-on-light leading-snug">
          Para texto ou número, escreva direto. Para lista ou tabela, use formato JSON.
        </p>
      </div>
    );
  }

  if (draft.kind === 'objectSet') {
    return (
      <div className="space-y-2 border-t border-border-light pt-3">
        <SectionHeader meta={KIND_META.objectSet} />
        <NodeTypePicker
          value={(spec.object_type as string) ?? ''}
          onChange={(v) => onSpec({ object_type: v })}
        />
        <FilterBuilder
          objectType={(spec.object_type as string) ?? ''}
          value={(spec.filter as FilterPredicate | null | undefined) ?? null}
          onChange={(v) => onSpec({ filter: v })}
        />
        <Field
          label="Limite de resultados (opcional)"
          value={spec.limit != null ? String(spec.limit) : ''}
          onChange={(v) => onSpec({ limit: v ? Number(v) : undefined })}
          placeholder="Ex.: 100"
          mono
        />
      </div>
    );
  }

  if (draft.kind === 'objectAggregation') {
    const aggRaw = (spec as { aggregation?: ObjectAggregationSpec['aggregation'] }).aggregation;
    const agg: ObjectAggregationSpec['aggregation'] = aggRaw ?? { op: 'count' };
    return (
      <div className="space-y-2 border-t border-border-light pt-3">
        <SectionHeader meta={KIND_META.objectAggregation} />
        <Field
          label="De onde vem (busca)"
          required
          value={(spec.object_set as string) ?? ''}
          onChange={(v) => onSpec({ object_set: v })}
          placeholder="Identificador de uma busca já criada (ex.: parlamentares_ativos)"
          mono
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Operação"
            value={agg.op}
            onChange={(v) =>
              onSpec({
                aggregation: { ...agg, op: v as ObjectAggregationSpec['aggregation']['op'] },
              })
            }
            options={AGG_OPS}
          />
          <Field
            label="Campo do número"
            value={agg.field ?? ''}
            onChange={(v) =>
              onSpec({ aggregation: { ...agg, field: v || null } })
            }
            placeholder='Vazio para "Contar registros"'
            mono
          />
        </div>
      </div>
    );
  }

  if (draft.kind === 'function') {
    return (
      <div className="space-y-2 border-t border-border-light pt-3">
        <SectionHeader meta={KIND_META.function} />
        <Field
          label="Nome da função"
          required
          value={(spec.function_id as string) ?? ''}
          onChange={(v) => onSpec({ function_id: v })}
          placeholder="Ex.: count_alertas_abertos"
          mono
        />
        <Field
          label="Parâmetros (opcional)"
          value={spec.args !== undefined ? JSON.stringify(spec.args, null, 0) : ''}
          onChange={(v) => {
            try {
              onSpec({ args: v.trim() ? JSON.parse(v) : undefined });
            } catch {
              /* ignore */
            }
          }}
          placeholder='Ex.: {"uf":"SP","janela_dias":30}'
          mono
          multiline
        />
      </div>
    );
  }

  if (draft.kind === 'transformation') {
    const chain = ((spec as { chain?: TransformationStep[] }).chain ?? []) as TransformationStep[];
    return (
      <div className="space-y-2 border-t border-border-light pt-3">
        <SectionHeader meta={KIND_META.transformation} />
        <TransformationExpressionField
          value={((spec as { expression?: string }).expression ?? '') as string}
          onChange={(v) => onSpec({ expression: v })}
        />
        <Field
          label="Campos usados"
          value={Array.isArray(draft.inputs) ? draft.inputs.join(', ') : ''}
          onChange={(v) =>
            onDraftPatch({
              inputs: v.split(',').map((s) => s.trim()).filter(Boolean),
            })
          }
          placeholder="Ex.: peso, altura (separe por vírgula)"
          mono
        />
        <p className="text-[10px] text-muted-on-light leading-snug">
          Use os nomes acima diretamente na fórmula. Suporta <code>+ - * /</code>,
          comparações (<code>=</code>, <code>&gt;</code>), <code>e/ou</code>,
          listas e tabelas. Pra pegar um campo de uma <strong>Composição</strong>,
          use a sintaxe <code>{'nome["campo"]'}</code>. Funções suportadas via
          picker abaixo da fórmula.
        </p>
        {/* Wave G.2 (2026-05-23) — Canon de 8 transformações puras. */}
        <TransformationChainEditor
          chain={chain}
          onChange={(next) => onSpec({ chain: next })}
        />
      </div>
    );
  }

  if (draft.kind === 'struct') {
    return <StructFieldsEditor draft={draft} onSpec={onSpec} />;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* StructFieldsEditor — Sprint C3 (Parity Audit, 2026-05-21)                  */
/* -------------------------------------------------------------------------- */
/**
 * Editor visual da `StructSpec`. Operador adiciona campos com:
 *   - nome (snake_case)
 *   - tipo (Texto/Número/Sim-Não/Data/Conjunto/Filtro — NUNCA Struct,
 *     nested structs não suportados por paridade Foundry)
 *   - source (external_id de outra variável; opcional)
 *
 * Cada campo mostra ícone tipográfico (mimicando Foundry):
 *   `""` String · `123` Numeric · `📅` Date (via lucide CalendarDays) ·
 *   toggle Boolean · Table ObjectSet · Filter ObjectSetFilter.
 */
function StructFieldsEditor({
  draft,
  onSpec,
}: {
  draft: WorkshopVariable;
  onSpec: (next: Record<string, unknown>) => void;
}) {
  const spec = (draft.spec as { fields?: unknown } | undefined) ?? {};
  const fields: Array<{ name?: string; type?: string; source?: string | null; label?: string }> =
    Array.isArray(spec.fields) ? (spec.fields as Array<{ name?: string; type?: string; source?: string | null; label?: string }>) : [];

  const updateField = (idx: number, patch: Record<string, unknown>) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onSpec({ fields: next });
  };
  const addField = () => {
    onSpec({ fields: [...fields, { name: '', type: 'String' }] });
  };
  const removeField = (idx: number) => {
    onSpec({ fields: fields.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2 border-t border-border-light pt-3">
      <SectionHeader meta={KIND_META.struct} />
      {fields.length === 0 ? (
        <p className="text-[10.5px] text-muted-on-light italic leading-snug">
          Sem campos ainda. Use o botão abaixo pra adicionar o primeiro.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {fields.map((f, idx) => (
            <li
              key={idx}
              data-testid={`struct-field-row-${idx}`}
              className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-1.5 items-center border border-border-light/60 bg-canvas-light p-1.5"
            >
              <StructFieldIcon type={f.type ?? 'String'} />
              <input
                type="text"
                value={f.name ?? ''}
                onChange={(e) => updateField(idx, { name: e.target.value.trim() })}
                placeholder="nome_do_campo"
                className="h-7 px-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
              <select
                value={f.type ?? 'String'}
                onChange={(e) => updateField(idx, { type: e.target.value })}
                className="h-7 px-1.5 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
              >
                {STRUCT_FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={f.source ?? ''}
                onChange={(e) => updateField(idx, { source: e.target.value || null })}
                placeholder="ID do dado (opcional)"
                className="h-7 px-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => removeField(idx)}
                aria-label={`Remover campo ${f.name || idx}`}
                className="h-7 w-7 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={addField}
        data-testid="struct-add-field"
        className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary flex items-center gap-1"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} /> Adicionar campo
      </button>
      <p className="text-[10px] text-muted-on-light leading-snug">
        Cada campo aceita um valor de outro dado (via ID) ou fica vazio até ser
        preenchido em runtime. Use <strong>Composição dentro de Composição</strong> não
        é suportado.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TransformationExpressionField + FunctionsPicker — PD1 (2026-05-20)         */
/* -------------------------------------------------------------------------- */
/**
 * Editor de expressão da transformation com picker visual de funções.
 *
 * O backend `transformation_eval` aceita 17 funções (paridade com Foundry
 * Variable Editor). Cada opção tem um `template` com `$` indicando onde
 * cai o cursor após inserção. Click insere o template no offset corrente
 * da textarea, posicionando o cursor onde `$` estava.
 */
interface FunctionDef {
  category: string;
  label: string;
  /** Snippet inserido na textarea. `$` marca posição final do cursor. */
  template: string;
  /** Hint humano sobre semântica. */
  hint: string;
}

const TRANSFORM_FUNCTIONS: FunctionDef[] = [
  // -- Math --
  { category: 'Math', label: 'abs', template: 'abs($)', hint: 'Valor absoluto: abs(-5) = 5' },
  { category: 'Math', label: 'round', template: 'round($, 0)', hint: 'Arredonda: round(3.7, 0) = 4' },
  { category: 'Math', label: 'ceil', template: 'ceil($)', hint: 'Teto: ceil(3.2) = 4' },
  { category: 'Math', label: 'floor', template: 'floor($)', hint: 'Piso: floor(3.8) = 3' },
  { category: 'Math', label: 'max', template: 'max($, b)', hint: 'Maior valor entre dois números' },
  { category: 'Math', label: 'min', template: 'min($, b)', hint: 'Menor valor entre dois números' },
  // -- Texto --
  { category: 'Texto', label: 'starts_with', template: 'starts_with($, "prefixo")', hint: 'Verifica prefixo' },
  { category: 'Texto', label: 'ends_with', template: 'ends_with($, "sufixo")', hint: 'Verifica sufixo' },
  { category: 'Texto', label: 'contains', template: 'contains($, "sub")', hint: 'Substring' },
  { category: 'Texto', label: 'slice', template: 'slice($, 0, 5)', hint: 'Recorte por índice' },
  // -- Lista --
  { category: 'Lista', label: 'length', template: 'length($)', hint: 'Tamanho de lista ou texto' },
  { category: 'Lista', label: 'element_at', template: 'element_at($, 0)', hint: 'Item pelo índice (zero-based)' },
  { category: 'Lista', label: 'intersect', template: 'intersect($, [1,2,3])', hint: 'Itens em comum entre listas' },
  // -- Geral --
  { category: 'Geral', label: 'concat', template: 'concat($, b)', hint: 'Junta texto ou lista' },
  // -- Data --
  { category: 'Data', label: 'current_date', template: 'current_date()$', hint: 'Data de hoje (sem argumentos)' },
  { category: 'Data', label: 'add_days', template: 'add_days($, 30)', hint: 'Soma dias a uma data' },
  { category: 'Data', label: 'days_between', template: 'days_between($, b)', hint: 'Diferença em dias entre datas' },
];

function TransformationExpressionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const insertTemplate = (tpl: string) => {
    const ta = textareaRef.current;
    const cursorMarker = '$';
    const hasMarker = tpl.includes(cursorMarker);
    const cleanTpl = hasMarker ? tpl.replace(cursorMarker, '') : tpl;
    if (!ta) {
      onChange(value + cleanTpl);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = before + cleanTpl + after;
    // Cursor: posição do `$` se havia, senão fim do template.
    const offsetInTpl = hasMarker
      ? tpl.indexOf(cursorMarker)
      : cleanTpl.length;
    const nextCursor = before.length + offsetInTpl;
    onChange(next);
    // Defer focus + selection pra depois do re-render.
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold mb-1">
          Fórmula<span className="text-danger ml-1">*</span>
        </span>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'Ex.: peso * 2  ·  round(media, 1)  ·  profile["name"]'}
          className="w-full px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary py-1 min-h-[60px] resize-y font-mono"
        />
      </label>
      <FunctionsPicker onInsert={insertTemplate} />
    </div>
  );
}

function FunctionsPicker({ onInsert }: { onInsert: (template: string) => void }) {
  const [selected, setSelected] = React.useState('');
  const grouped = React.useMemo(() => {
    const m = new Map<string, FunctionDef[]>();
    for (const f of TRANSFORM_FUNCTIONS) {
      if (!m.has(f.category)) m.set(f.category, []);
      m.get(f.category)!.push(f);
    }
    return Array.from(m.entries());
  }, []);

  const hint = React.useMemo(() => {
    if (!selected) return 'Selecione uma função pra ver a sintaxe.';
    const f = TRANSFORM_FUNCTIONS.find((x) => x.label === selected);
    return f?.hint ?? '';
  }, [selected]);

  return (
    <div
      data-testid="functions-picker"
      className="border border-border-light bg-raised-light/30 px-2 py-1.5 space-y-1"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold">
        Funções suportadas
      </p>
      <div className="flex items-center gap-1.5">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          data-testid="functions-picker-select"
          className="flex-1 h-7 px-1.5 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
        >
          <option value="">— escolha uma função —</option>
          {grouped.map(([cat, funcs]) => (
            <optgroup key={cat} label={cat}>
              {funcs.map((f) => (
                <option key={f.label} value={f.label}>
                  {f.label}({categoryArgs(f.label)})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            const f = TRANSFORM_FUNCTIONS.find((x) => x.label === selected);
            if (f) onInsert(f.template);
          }}
          data-testid="functions-picker-insert"
          className="h-7 px-2 text-[10px] uppercase tracking-wider bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Inserir
        </button>
      </div>
      <p className="text-[10px] text-muted-on-light leading-snug">{hint}</p>
    </div>
  );
}

/** Hint visual da assinatura de cada função no dropdown. */
function categoryArgs(label: string): string {
  switch (label) {
    case 'abs':
    case 'ceil':
    case 'floor':
    case 'length':
      return 'x';
    case 'round':
      return 'x, casas';
    case 'max':
    case 'min':
      return 'a, b';
    case 'starts_with':
    case 'ends_with':
    case 'contains':
      return 'texto, sub';
    case 'slice':
      return 'texto, ini, fim';
    case 'element_at':
      return 'lista, idx';
    case 'intersect':
      return 'a, b';
    case 'concat':
      return 'a, b';
    case 'current_date':
      return '';
    case 'add_days':
      return 'data, n';
    case 'days_between':
      return 'a, b';
    default:
      return '';
  }
}

function StructFieldIcon({ type }: { type: string }) {
  const label =
    type === 'String' ? 'ab' :
    type === 'Numeric' ? '#' :
    type === 'Boolean' ? '✓' :
    type === 'Date' ? '📅' :
    type === 'ObjectSet' ? '▤' :
    type === 'ObjectSetFilter' ? '▽' :
    '?';
  return (
    <span
      className="h-6 w-6 flex items-center justify-center text-[10px] font-mono font-semibold border border-border-light bg-raised-light/40 text-muted-on-light"
      title={type}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* SettingsTab — Sprint A2 (Parity Audit) Variable Editor "Configurações"     */
/* -------------------------------------------------------------------------- */
/**
 * Tab "Configurações" do Variable Editor — cross-cutting:
 *   - Identificador interno + Quando recalcular (sempre visíveis)
 *   - Roteamento na URL (toggleável)
 *   - Estado salvo (toggleável)
 *   - Module interface: NÃO IMPLEMENTADO ainda — Sprint B.
 */
function SettingsTab({
  draft,
  onPatch,
}: {
  draft: WorkshopVariable;
  onPatch: (p: Partial<WorkshopVariable>) => void;
}) {
  const routing = draft.routing ?? { enabled: false, mode: 'when_used' as const };
  const stateSaving = draft.state_saving ?? { enabled: false };
  const moduleInterface = draft.module_interface ?? { enabled: false };
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold">
          Identificação
        </h3>
        <Field
          label="Identificador interno"
          value={draft.external_id ?? ''}
          onChange={(v) => onPatch({ external_id: v })}
          placeholder={slugifyForExternalId(draft.label) || 'auto a partir do nome'}
          mono
        />
        <p className="text-[10px] text-muted-on-light leading-snug">
          Usado em fórmulas e na URL. Se vazio ao salvar, é gerado a partir do nome.
        </p>
        <SelectField
          label="Quando recalcular"
          value={draft.recompute_mode}
          onChange={(v) => onPatch({ recompute_mode: v as WorkshopVariable['recompute_mode'] })}
          options={[
            { value: 'auto', label: 'Sempre que algo mudar (padrão)' },
            { value: 'event_only', label: 'Só quando o painel pedir' },
          ]}
        />
      </section>

      <SettingsToggleSection
        title="Roteamento na URL"
        icon={Link2}
        enabled={routing.enabled}
        onToggle={(v) =>
          onPatch({ routing: { ...routing, enabled: v } })
        }
        hint="Persiste o valor desta variável na URL do painel — operador compartilha link e o destinatário cai já com o filtro aplicado."
        testIdPrefix="variable-routing"
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold mb-1.5">
          Inclusão na URL
        </p>
        <label className="flex items-start gap-2 cursor-pointer mb-1.5">
          <input
            type="radio"
            name="routing-mode"
            checked={(routing.mode ?? 'when_used') === 'when_used'}
            onChange={() => onPatch({ routing: { ...routing, mode: 'when_used' } })}
            className="accent-primary mt-0.5"
            data-testid="variable-routing-mode-when-used"
          />
          <span className="flex-1">
            <span className="text-[11px] text-text-on-light block">Na URL quando algum widget visível usar</span>
            <span className="text-[10px] text-muted-on-light leading-snug">
              Compromisso entre URL limpa e shareable — recomendado.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="routing-mode"
            checked={routing.mode === 'always'}
            onChange={() => onPatch({ routing: { ...routing, mode: 'always' } })}
            className="accent-primary mt-0.5"
            data-testid="variable-routing-mode-always"
          />
          <span className="flex-1">
            <span className="text-[11px] text-text-on-light block">Sempre na URL</span>
            <span className="text-[10px] text-muted-on-light leading-snug">
              Útil pra valores que devem estar disponíveis em qualquer página do painel.
            </span>
          </span>
        </label>
      </SettingsToggleSection>

      <SettingsToggleSection
        title="Estado salvo"
        icon={Save}
        enabled={stateSaving.enabled}
        onToggle={(v) => onPatch({ state_saving: { enabled: v } })}
        hint="Inclui esta variável quando operador salva uma 'cópia do painel' (filtros + página ativa) para retomar depois."
        testIdPrefix="variable-state-saving"
      >
        <p className="text-[10px] text-muted-on-light leading-snug">
          Quando o operador chamar &quot;Salvar este estado&quot;, o valor atual de{' '}
          <code className="font-mono text-text-on-light">{draft.external_id || slugifyForExternalId(draft.label) || '<id>'}</code>{' '}
          é incluído no snapshot.
        </p>
      </SettingsToggleSection>

      <SettingsToggleSection
        title="Interface do painel"
        icon={Plug}
        enabled={moduleInterface.enabled}
        onToggle={(v) =>
          onPatch({ module_interface: { ...moduleInterface, enabled: v } })
        }
        hint="Expõe esta variável quando este painel é embarcado dentro de outro. O painel-pai mapeia suas próprias variáveis pra esta."
        testIdPrefix="variable-module-interface"
      >
        <div className="space-y-2">
          <Field
            label="Nome de exibição"
            value={moduleInterface.display_name ?? ''}
            onChange={(v) =>
              onPatch({ module_interface: { ...moduleInterface, display_name: v || undefined } })
            }
            placeholder={draft.label || 'Como o operador-pai vê este dado'}
          />
          <Field
            label="Descrição (opcional)"
            value={moduleInterface.description ?? ''}
            onChange={(v) =>
              onPatch({ module_interface: { ...moduleInterface, description: v || undefined } })
            }
            placeholder="O que o pai deve passar aqui?"
            multiline
          />
          {(draft.kind === 'objectSet' || draft.type === 'ObjectSet') && (
            <>
              <Field
                label="Tipo de objeto esperado (opcional)"
                value={moduleInterface.object_type ?? ''}
                onChange={(v) =>
                  onPatch({ module_interface: { ...moduleInterface, object_type: v || undefined } })
                }
                placeholder="ex.: parlamentar, alerta"
                mono
              />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold mb-1.5">
                  Tamanho do conjunto
                </p>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onPatch({
                        module_interface: { ...moduleInterface, object_set_size: 'any_size' },
                      })
                    }
                    data-testid="variable-module-interface-size-any"
                    className={cn(
                      'h-7 text-[11px] border',
                      (moduleInterface.object_set_size ?? 'any_size') === 'any_size'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-canvas-light text-text-on-light border-border-light hover:border-primary',
                    )}
                  >
                    Qualquer tamanho
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onPatch({
                        module_interface: { ...moduleInterface, object_set_size: 'single_object' },
                      })
                    }
                    data-testid="variable-module-interface-size-single"
                    className={cn(
                      'h-7 text-[11px] border',
                      moduleInterface.object_set_size === 'single_object'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-canvas-light text-text-on-light border-border-light hover:border-primary',
                    )}
                  >
                    Um único objeto
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </SettingsToggleSection>
    </div>
  );
}

function SettingsToggleSection({
  title,
  icon: Icon,
  enabled,
  onToggle,
  hint,
  testIdPrefix,
  children,
}: {
  title: string;
  icon: LucideIcon;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  hint?: string;
  testIdPrefix?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border-light">
      <header className="px-2.5 py-2 bg-raised-light/40 border-b border-border-light flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-on-light shrink-0 mt-0.5" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-text-on-light">{title}</p>
          {hint && (
            <p className="text-[10px] text-muted-on-light leading-snug mt-0.5">
              {hint}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          data-testid={testIdPrefix ? `${testIdPrefix}-toggle` : undefined}
          className={cn(
            'shrink-0 h-4 w-7 relative border transition-colors mt-0.5',
            enabled ? 'bg-primary border-primary' : 'bg-canvas-light border-border-light',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-3 w-3 transition-transform',
              enabled ? 'translate-x-3 bg-white' : 'translate-x-0.5 bg-muted-on-light',
            )}
          />
        </button>
      </header>
      {enabled && <div className="p-2.5 bg-canvas-light">{children}</div>}
    </section>
  );
}

function SectionHeader({ meta }: { meta: typeof KIND_META[VariableKind] }) {
  const Icon = meta.Icon;
  return (
    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold">
      <Icon className="w-3 h-3" strokeWidth={1.5} />
      Configuração · {meta.label}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* NodeTypePicker — dropdown carregado de /ontology/node-types                */
/* -------------------------------------------------------------------------- */
/**
 * Cache mod-level pra não rebuscar a lista a cada keystroke. A lista de tipos
 * raramente muda; basta carregar 1x por sessão.
 */
let _nodeTypesCache: OntologyNodeType[] | null = null;

function NodeTypePicker({
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

  // Quando o valor atual não está na lista, mostra no select mesmo assim
  // (apps importados podem referenciar tipos antigos).
  const options = React.useMemo(() => {
    const opts = types ?? [];
    if (value && !opts.some((o) => o.name === value)) {
      return [{ name: value, label: value, count: 0 }, ...opts];
    }
    return opts;
  }, [types, value]);

  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold mb-1">
        Tipo de objeto<span className="text-danger ml-1">*</span>
      </span>
      {loading ? (
        <div className="w-full h-7 px-2 text-[11px] flex items-center text-muted-on-light italic border border-border-light bg-canvas-light">
          Carregando tipos da ontologia…
        </div>
      ) : error ? (
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
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-7 px-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
        >
          <option value="">— escolha um tipo —</option>
          {options.map((t) => (
            <option key={t.name} value={t.name}>
              {t.label} {t.count > 0 ? `· ${t.count}` : ''}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* FilterBuilder — UI visual pra construir FilterPredicate                    */
/* -------------------------------------------------------------------------- */

interface FilterClause {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: string;
}

interface FilterPredicate {
  op?: 'and' | 'or' | string;
  clauses?: FilterClause[];
  // Forma single-clause legacy: {op:'eq', field:'uf', value:'SP'}
  field?: string;
  value?: unknown;
}

const FILTER_OPS: { value: FilterClause['op']; label: string }[] = [
  { value: 'eq', label: 'igual a' },
  { value: 'neq', label: 'diferente de' },
  { value: 'gt', label: 'maior que' },
  { value: 'gte', label: 'maior ou igual a' },
  { value: 'lt', label: 'menor que' },
  { value: 'lte', label: 'menor ou igual a' },
  { value: 'contains', label: 'contém' },
  { value: 'in', label: 'está em (lista, separada por vírgula)' },
];

/** Normaliza um predicate vindo do backend para sempre ter `clauses[]`. */
function predicateToClauses(p: FilterPredicate | null | undefined): {
  clauses: FilterClause[];
  combinator: 'and' | 'or';
} {
  if (!p) return { clauses: [], combinator: 'and' };
  // Single-clause legacy: {op:'eq', field, value}
  if (p.field && p.op && p.op !== 'and' && p.op !== 'or') {
    return {
      clauses: [{ field: p.field, op: p.op as FilterClause['op'], value: String(p.value ?? '') }],
      combinator: 'and',
    };
  }
  return {
    clauses: (p.clauses ?? []).map((c) => ({ ...c, value: String(c.value ?? '') })),
    combinator: p.op === 'or' ? 'or' : 'and',
  };
}

function clausesToPredicate(
  clauses: FilterClause[],
  combinator: 'and' | 'or',
): FilterPredicate | null {
  const valid = clauses.filter((c) => c.field.trim() && c.value.trim());
  if (valid.length === 0) return null;
  if (valid.length === 1) {
    return { op: valid[0].op, field: valid[0].field, value: valid[0].value };
  }
  return { op: combinator, clauses: valid };
}

function FilterBuilder({
  objectType,
  value,
  onChange,
}: {
  /** Sprint PC1: tipo do node sendo filtrado — usado pra buscar amostra
   *  de valores reais e renderizar histograma quando op for numérica. */
  objectType?: string;
  value: FilterPredicate | null | undefined;
  onChange: (next: FilterPredicate | null) => void;
}) {
  const { clauses, combinator } = predicateToClauses(value);
  const [rawMode, setRawMode] = React.useState(false);

  const update = (next: FilterClause[], combo: 'and' | 'or') => {
    onChange(clausesToPredicate(next, combo));
  };

  const addClause = () => {
    update([...clauses, { field: '', op: 'eq', value: '' }], combinator);
  };

  const removeClause = (idx: number) => {
    update(clauses.filter((_, i) => i !== idx), combinator);
  };

  const patchClause = (idx: number, patch: Partial<FilterClause>) => {
    update(
      clauses.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
      combinator,
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold">
          Filtro (opcional)
        </span>
        <button
          type="button"
          onClick={() => setRawMode((r) => !r)}
          className="text-[10px] text-muted-on-light hover:text-primary underline-offset-2 hover:underline"
        >
          {rawMode ? 'voltar pro modo visual' : 'avançado (JSON)'}
        </button>
      </div>

      {rawMode ? (
        <textarea
          value={value ? JSON.stringify(value, null, 2) : ''}
          onChange={(e) => {
            const v = e.target.value;
            try {
              onChange(v.trim() ? JSON.parse(v) : null);
            } catch {
              /* digitando */
            }
          }}
          placeholder='Ex.: {"op":"and","clauses":[{"op":"eq","field":"uf","value":"SP"}]}'
          className="w-full px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary py-1 min-h-[70px] resize-y font-mono"
        />
      ) : (
        <>
          {clauses.length === 0 ? (
            <p className="text-[10px] text-muted-on-light italic">
              Nenhum filtro — a busca retorna todos os objetos do tipo.
            </p>
          ) : (
            <>
              {clauses.length > 1 && (
                <label className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-on-light">Combinar com:</span>
                  <select
                    value={combinator}
                    onChange={(e) => update(clauses, e.target.value as 'and' | 'or')}
                    className="h-6 px-1.5 text-[10px] font-mono bg-canvas-light border border-border-light"
                  >
                    <option value="and">E (todas verdadeiras)</option>
                    <option value="or">OU (alguma verdadeira)</option>
                  </select>
                </label>
              )}
              <ul className="space-y-1.5">
                {clauses.map((c, idx) => (
                  <li key={idx} className="space-y-1">
                    <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center">
                      <input
                        type="text"
                        value={c.field}
                        onChange={(e) => patchClause(idx, { field: e.target.value })}
                        placeholder="Campo (ex.: uf)"
                        className="h-7 px-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
                      />
                      <select
                        value={c.op}
                        onChange={(e) =>
                          patchClause(idx, { op: e.target.value as FilterClause['op'] })
                        }
                        className="h-7 px-1.5 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
                      >
                        {FILTER_OPS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={c.value}
                        onChange={(e) => patchClause(idx, { value: e.target.value })}
                        placeholder="Valor"
                        className="h-7 px-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeClause(idx)}
                        aria-label="Remover condição"
                        className="h-7 w-7 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger"
                      >
                        <X className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </div>
                    <FilterHistogram
                      objectType={objectType}
                      field={c.field}
                      op={c.op}
                      threshold={c.value}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={addClause}
            className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary flex items-center gap-1"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} /> Adicionar condição
          </button>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FilterHistogram — PC1 (2026-05-20) / PF1 (2026-05-20, endpoint dedicado)   */
/* -------------------------------------------------------------------------- */
/**
 * Preview de densidade pra ops numéricas no FilterBuilder. Quando o
 * operador escolhe `field` + `op ∈ {gt,gte,lt,lte}` em um node_type, chama
 * `GET /ontology/node-types/{name}/histogram/{field}?bins=12` no backend —
 * agregação acontece server-side, sem scan client-side.
 *
 * Quando node_type vazio / field vazio / op não-numérica → skip silente.
 * Quando endpoint retorna `total === 0` → mensagem amigável + skip render.
 */
const NUMERIC_OPS = new Set<FilterClause['op']>(['gt', 'gte', 'lt', 'lte']);
const HIST_BINS = 12;
/** Cache mod-level por `${node_type}::${field}::${bins}` — refetch só
 *  quando o trio muda. Mantém o histograma vivo entre keystrokes do
 *  threshold (apenas o highlight é re-derivado).  */
const _histogramCache = new Map<string, OntologyHistogram>();

function FilterHistogram({
  objectType,
  field,
  op,
  threshold,
}: {
  objectType?: string;
  field: string;
  op: FilterClause['op'];
  threshold: string;
}) {
  const enabled = !!objectType && !!field.trim() && NUMERIC_OPS.has(op);
  const cacheKey = enabled ? `${objectType}::${field}::${HIST_BINS}` : '';
  const [hist, setHist] = React.useState<OntologyHistogram | null>(
    enabled ? _histogramCache.get(cacheKey) ?? null : null,
  );
  const [loading, setLoading] = React.useState(false);

  // Debounce: re-fetch só quando objectType+field estabilizam.
  React.useEffect(() => {
    if (!enabled || !objectType) {
      setHist(null);
      return;
    }
    const key = `${objectType}::${field}::${HIST_BINS}`;
    const cached = _histogramCache.get(key);
    if (cached) {
      setHist(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      Ontology.getNodeTypeHistogram(objectType, field, HIST_BINS)
        .then((res) => {
          if (cancelled) return;
          _histogramCache.set(key, res);
          setHist(res);
        })
        .catch(() => {
          if (!cancelled) setHist(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, objectType, field]);

  if (!enabled) return null;
  if (loading && !hist) {
    return (
      <p
        data-testid="filter-histogram"
        className="text-[10px] text-muted-on-light italic pl-1"
      >
        Calculando distribuição…
      </p>
    );
  }
  if (!hist) return null;
  if (hist.total === 0 || hist.bins.length === 0) {
    return (
      <p
        data-testid="filter-histogram-empty"
        className="text-[10px] text-muted-on-light italic pl-1"
      >
        Sem dados numéricos para mostrar distribuição
      </p>
    );
  }

  const minV = hist.min;
  const maxV = hist.max;
  if (minV === maxV) return null;
  const counts = hist.bins.map((b) => b.count);
  const maxBin = counts.reduce((a, b) => Math.max(a, b), 0) || 1;

  // Posição da threshold (se for número).
  const thresholdNum = Number(threshold);
  const hasThreshold = Number.isFinite(thresholdNum);
  const thresholdPct = hasThreshold
    ? ((thresholdNum - minV) / (maxV - minV)) * 100
    : null;

  const W = 100; // svg viewBox unidades
  const H = 80;
  const barW = W / hist.bins.length;

  return (
    <div
      data-testid="filter-histogram"
      className="border border-border-light/60 bg-raised-light/30 px-2 py-1"
    >
      <div className="flex items-center justify-between text-[9px] text-muted-on-light font-mono mb-0.5">
        <span>{minV.toLocaleString('pt-BR')}</span>
        <span className="text-text-on-light/70">
          {hist.total.toLocaleString('pt-BR')} valores
        </span>
        <span>{maxV.toLocaleString('pt-BR')}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full h-[80px]"
      >
        {hist.bins.map((b, i) => {
          const h = (b.count / maxBin) * (H - 4);
          const x = i * barW;
          // Highlight bins que satisfazem a regra.
          let matches = false;
          if (hasThreshold) {
            if (op === 'gt') matches = b.max > thresholdNum;
            else if (op === 'gte') matches = b.max >= thresholdNum;
            else if (op === 'lt') matches = b.min < thresholdNum;
            else if (op === 'lte') matches = b.min <= thresholdNum;
          }
          return (
            <rect
              key={i}
              x={x + 0.25}
              y={H - h}
              width={barW - 0.5}
              height={h}
              className={cn(
                hasThreshold
                  ? matches
                    ? 'fill-primary'
                    : 'fill-border-light'
                  : 'fill-primary/60',
              )}
            />
          );
        })}
        {thresholdPct != null && thresholdPct >= 0 && thresholdPct <= 100 && (
          <line
            x1={thresholdPct}
            x2={thresholdPct}
            y1={0}
            y2={H}
            className="stroke-danger"
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
        )}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs reutilizáveis                                                       */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
  multiline?: boolean;
}) {
  const cls = cn(
    'w-full px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary',
    mono && 'font-mono',
    multiline ? 'py-1 min-h-[60px] resize-y' : 'h-7',
  );
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold mb-1">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-muted-on-light font-mono font-semibold mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 px-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* TransformationChainEditor — Wave G.2 (2026-05-23)                          */
/* -------------------------------------------------------------------------- */
/**
 * Editor visual da chain canônica de 8 transformações. Cada step é uma
 * `Transformation` (engine.ts). Persiste em `spec.chain: Transformation[]`
 * (coexiste com `spec.expression` legado).
 */
export type TransformationStep =
  | { op: 'pick'; path: string }
  | { op: 'map'; path: string }
  | { op: 'filter'; path: string; value: unknown }
  | { op: 'group_by'; path: string }
  | { op: 'sort_by'; path: string; order?: 'asc' | 'desc' }
  | {
      op: 'aggregate';
      agg?: 'count' | 'sum' | 'avg' | 'min' | 'max';
      path?: string;
    }
  | { op: 'cast'; target_type: string }
  | { op: 'merge'; other?: unknown };

const T_OPS: { value: TransformationStep['op']; label: string; hint: string }[] = [
  { value: 'pick', label: 'pick (campo)', hint: 'extrai campo do objeto' },
  { value: 'map', label: 'map (projetar)', hint: 'projeta cada item via campo' },
  { value: 'filter', label: 'filter (filtrar)', hint: 'mantém itens onde campo = valor' },
  { value: 'group_by', label: 'group_by (agrupar)', hint: 'agrupa array por campo' },
  { value: 'sort_by', label: 'sort_by (ordenar)', hint: 'ordena array por campo' },
  { value: 'aggregate', label: 'aggregate (contar/somar)', hint: 'count/sum/avg/min/max' },
  { value: 'cast', label: 'cast (mudar tipo)', hint: 'coage para outro tipo' },
  { value: 'merge', label: 'merge (combinar)', hint: 'combina com outro valor' },
];

function TransformationChainEditor({
  chain,
  onChange,
}: {
  chain: TransformationStep[];
  onChange: (next: TransformationStep[]) => void;
}) {
  const add = (op: TransformationStep['op']) => {
    const next = [...chain];
    if (op === 'pick' || op === 'map' || op === 'group_by') next.push({ op, path: '' });
    else if (op === 'filter') next.push({ op, path: '', value: '' });
    else if (op === 'sort_by') next.push({ op, path: '', order: 'asc' });
    else if (op === 'aggregate') next.push({ op, agg: 'count' });
    else if (op === 'cast') next.push({ op, target_type: 'text' });
    else if (op === 'merge') next.push({ op, other: {} });
    onChange(next);
  };
  const removeAt = (idx: number) => {
    onChange(chain.filter((_, i) => i !== idx));
  };
  const patchAt = (idx: number, patch: Record<string, unknown>) => {
    onChange(
      chain.map((s, i) =>
        i === idx ? ({ ...(s as object), ...patch } as TransformationStep) : s,
      ),
    );
  };

  return (
    <div className="space-y-2" data-testid="transformation-chain-editor">
      <header className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Cadeia de transformações
        </p>
        <span
          className="text-[10px] font-mono text-muted-on-light"
          data-testid="transformation-chain-count"
        >
          {chain.length} step{chain.length === 1 ? '' : 's'}
        </span>
      </header>

      {chain.length === 0 && (
        <p className="text-[10.5px] italic text-muted-on-light" data-testid="transformation-chain-empty">
          Sem passos. Use o seletor abaixo para adicionar a primeira transformação.
        </p>
      )}

      <ul className="space-y-1.5">
        {chain.map((step, idx) => (
          <li
            key={idx}
            data-testid={`transformation-step-${idx}`}
            className="border border-border-light bg-canvas-light p-2 space-y-1.5"
          >
            <header className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-primary">
                #{idx + 1} · {step.op}
              </span>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                aria-label={`Remover step ${idx + 1}`}
                data-testid={`transformation-step-${idx}-remove`}
                className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </header>
            <TransformationStepFields
              step={step}
              onPatch={(patch) => patchAt(idx, patch)}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-1.5">
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value as TransformationStep['op'];
            if (v) {
              add(v);
              e.target.value = '';
            }
          }}
          data-testid="transformation-add-select"
          className="h-7 px-1.5 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary"
        >
          <option value="">+ adicionar transformação…</option>
          {T_OPS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TransformationStepFields({
  step,
  onPatch,
}: {
  step: TransformationStep;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  if (step.op === 'pick' || step.op === 'map' || step.op === 'group_by') {
    return (
      <input
        type="text"
        value={step.path}
        onChange={(e) => onPatch({ path: e.target.value })}
        placeholder="dot.path (ex: meta.uf)"
        data-testid={`transformation-step-${step.op}-path`}
        className="w-full h-7 px-2 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
      />
    );
  }
  if (step.op === 'filter') {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="text"
          value={step.path}
          onChange={(e) => onPatch({ path: e.target.value })}
          placeholder="dot.path"
          data-testid="transformation-step-filter-path"
          className="h-7 px-2 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        />
        <input
          type="text"
          value={String(step.value ?? '')}
          onChange={(e) => onPatch({ value: e.target.value })}
          placeholder="valor"
          data-testid="transformation-step-filter-value"
          className="h-7 px-2 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        />
      </div>
    );
  }
  if (step.op === 'sort_by') {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <input
          type="text"
          value={step.path}
          onChange={(e) => onPatch({ path: e.target.value })}
          placeholder="dot.path"
          data-testid="transformation-step-sort-path"
          className="h-7 px-2 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        />
        <select
          value={step.order ?? 'asc'}
          onChange={(e) => onPatch({ order: e.target.value })}
          data-testid="transformation-step-sort-order"
          className="h-7 px-1.5 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        >
          <option value="asc">asc</option>
          <option value="desc">desc</option>
        </select>
      </div>
    );
  }
  if (step.op === 'aggregate') {
    return (
      <div className="grid grid-cols-[auto_1fr] gap-1.5">
        <select
          value={step.agg ?? 'count'}
          onChange={(e) => onPatch({ agg: e.target.value })}
          data-testid="transformation-step-aggregate-op"
          className="h-7 px-1.5 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        >
          <option value="count">count</option>
          <option value="sum">sum</option>
          <option value="avg">avg</option>
          <option value="min">min</option>
          <option value="max">max</option>
        </select>
        <input
          type="text"
          value={step.path ?? ''}
          onChange={(e) => onPatch({ path: e.target.value })}
          placeholder="campo (vazio para count)"
          data-testid="transformation-step-aggregate-path"
          className="h-7 px-2 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
        />
      </div>
    );
  }
  if (step.op === 'cast') {
    return (
      <select
        value={step.target_type}
        onChange={(e) => onPatch({ target_type: e.target.value })}
        data-testid="transformation-step-cast-target-type"
        className="w-full h-7 px-1.5 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
      >
        <option value="text">text</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
        <option value="multi-select">multi-select</option>
        <option value="object-ref">object-ref</option>
        <option value="json">json</option>
      </select>
    );
  }
  if (step.op === 'merge') {
    return (
      <textarea
        value={JSON.stringify(step.other ?? {}, null, 0)}
        onChange={(e) => {
          try {
            onPatch({ other: JSON.parse(e.target.value || 'null') });
          } catch {
            // keep state vazio até JSON ser válido
          }
        }}
        rows={2}
        placeholder='{"other": "value"} ou [1,2,3]'
        data-testid="transformation-step-merge-other"
        className="w-full px-2 py-1 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary"
      />
    );
  }
  return null;
}
