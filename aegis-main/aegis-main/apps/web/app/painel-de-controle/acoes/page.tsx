'use client';

/**
 * Ações — Painel de Controle. Wave H.2 (2026-05-23).
 *
 * Atualizado: Solicitar/Executar agora abrem um FORM DINÂMICO renderizado
 * a partir do `input_schema` do ActionType (não JSON manual). Inclui:
 *   - fields tipados (string/number/boolean/enum/array/date/object_ref)
 *   - validação inline (required, min/max, pattern, enum)
 *   - dropdowns Operação alvo + Espaço
 *   - bloco "Marcações exigidas" com checkmark
 *   - switch "Modo dry-run (Plan)"
 *   - botão "Pedir ajuda ao AIP" abrindo AipAssistSidebar
 *   - confirm dialog com resumo antes do submit
 *   - histórico tabular com expand input/output
 */
import * as React from 'react';
import {
  Zap,
  Plus,
  Play,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  ShieldOff,
  History,
  ClipboardCheck,
  Wand2,
  ChevronDown,
  ChevronRight,
  Check,
  Globe,
  Square,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { TableCountBadge } from '@/components/data-table/table-count-badge';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { AipAssistSidebar } from '@/components/aip-assist/aip-assist-sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/lib/responsive/use-is-mobile';
import {
  ActionTypes,
  Ontology,
  Projects,
  Spaces,
  OntologyNodes,
  type ActionTypeOut,
  type ActionExecuteResult,
  type ActionExecutionOut,
  type ActionPlanResult,
  type ActionFormField,
  type ActionFormSchemaOut,
  type ActionValidationError,
  type ProjectListItem,
  type OntologyNodeSearchItem,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { formatDataHoraBR } from '@/lib/datetime';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

export default function AcoesPage() {
  return (
    <RequirePerm perm="ontology.actions.read">
      <AcoesInner />
    </RequirePerm>
  );
}

// Onda 3 — rule typing: a Action é tipada e ligada ao Object Type que edita. O
// binding (x_rule / x_target_kind) vive no input_schema; surfaçamos como badge
// amigável ("Cria · Veículo"), nunca o rule/kind cru.
const RULE_VERB: Record<string, string> = {
  create_object: 'Cria',
  modify_object: 'Edita',
  delete_object: 'Remove',
  create_link: 'Vincula',
  delete_link: 'Desvincula',
  notify: 'Notifica',
  service: 'Aciona',
  insight: 'Analisa',
  guest: 'Libera acesso',
};

function actionBinding(a: ActionTypeOut): { verb: string; kind?: string } | null {
  const sch = a.input_schema as Record<string, unknown> | undefined;
  const rule = typeof sch?.x_rule === 'string' ? (sch.x_rule as string) : undefined;
  if (!rule) return null;
  const kind = typeof sch?.x_target_kind === 'string' ? (sch.x_target_kind as string) : undefined;
  return { verb: RULE_VERB[rule] ?? rule, kind: kind || undefined };
}

function AcoesInner() {
  const [items, setItems] = React.useState<ActionTypeOut[] | null>(null);
  const [typeLabels, setTypeLabels] = React.useState<Map<string, string>>(new Map());
  const [err, setErr] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ActionTypeOut | null>(null);
  const [executing, setExecuting] = React.useState<ActionTypeOut | null>(null);
  const [historyOf, setHistoryOf] = React.useState<ActionTypeOut | null>(null);
  const [showTargets, setShowTargets] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const isMobile = useIsMobile();
  const askConfirm = useConfirm();

  const refresh = React.useCallback(() => {
    setErr(null);
    ActionTypes.list()
      .then(setItems)
      .catch((e) => setErr(humanise(e)));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Mapa kind→display_name (do contrato do Object Type) p/ rotular o binding.
  React.useEffect(() => {
    Ontology.listNodeTypes()
      .then((rows) => setTypeLabels(new Map(rows.map((r) => [r.name, r.label || r.name]))))
      .catch(() => { /* badge cai pro kind cru se indisponível */ });
  }, []);

  const filtered = React.useMemo(() => {
    if (!items) return null;
    if (!filter.trim()) return items;
    const q = filter.toLowerCase();
    return items.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.code_ref.toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q),
    );
  }, [items, filter]);

  async function onDelete(a: ActionTypeOut) {
    const ok = await askConfirm({
      title: 'Excluir ação',
      description: `Tem certeza? "${a.name}" será removida permanentemente do catálogo.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await ActionTypes.delete(a.id);
      refresh();
    } catch (e) {
      setErr(humanise(e));
    }
  }

  return (
    <div data-testid="acoes-page">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            Ações
            {items && <TableCountBadge total={items.length} filtered={filtered?.length} tone="primary" />}
          </span>
        }
        subtitle="Catálogo de Action Types. Solicitar/Executar usam form dinâmico (não JSON). Cada execução registra LineageEvent + ActionExecution."
        actions={
          <RequirePerm perm="ontology.actions.write" fallback={null}>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowTargets(true)}
                data-testid="acoes-targets"
                className="h-8 text-[12px]"
                title="Destinos externos permitidos (HTTP)"
              >
                <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
                Destinos externos
              </Button>
              <Button
                onClick={() => setCreating(true)}
                data-testid="acoes-new"
                className="h-8 text-[12px]"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                Nova ação
              </Button>
            </div>
          </RequirePerm>
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar por nome, descrição ou code_ref…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-[420px] h-8 text-[12px]"
            data-testid="acoes-filter"
            aria-label="Filtrar ações"
          />
        </div>

        {err && (
          <CpErrorState
            title="Falha ao carregar Ações"
            description={err}
            retry={refresh}
            diagnostic={{ path: '/platform/v23/action-types', message: err }}
          />
        )}

        {!items && !err && <CpSkeleton rows={5} />}

        {items && filtered && filtered.length === 0 && (
          <CpEmptyState
            icon={Zap}
            title={filter ? 'Nenhuma ação corresponde ao filtro' : 'Nenhuma ação cadastrada'}
            description={
              filter
                ? 'Tente outro termo, limpe o filtro ou crie uma nova ação.'
                : 'Cadastre Action Types reusáveis: cada uma vira um botão executável + auditado.'
            }
          />
        )}

        {filtered && filtered.length > 0 && (
          <ul
            className="space-y-2"
            data-testid="acoes-list"
            data-mobile={isMobile ? 'true' : 'false'}
          >
            {filtered.map((a) => {
              const isExpanded = expanded.has(a.id);
              const toggleExpand = () =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(a.id)) next.delete(a.id);
                  else next.add(a.id);
                  return next;
                });
              return (
                <li
                  key={a.id}
                  className={
                    isMobile
                      ? 'bg-white border border-border-light p-3 flex flex-col gap-2'
                      : 'bg-white border border-border-light p-3 flex flex-row items-start justify-between gap-3'
                  }
                  data-testid={`acoes-row-${a.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-text-on-light">
                        {a.name}
                      </span>
                      {a.auto_approvable && (
                        <span className="text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 bg-success/10 text-success border border-success/30">
                          auto-aprovável
                        </span>
                      )}
                      {(() => {
                        const b = actionBinding(a);
                        if (!b) return null;
                        const label = b.kind ? (typeLabels.get(b.kind) || b.kind) : '';
                        return (
                          <span
                            className="text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30"
                            data-testid={`acoes-binding-${a.id}`}
                          >
                            {b.verb}{label ? ` · ${label}` : ''}
                          </span>
                        );
                      })()}
                      {a.requires_markings.length > 0 && (
                        <span className="text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 bg-warning/10 text-warning border border-warning/30">
                          marcações: {a.requires_markings.join(', ')}
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p className="text-[12px] text-text-on-light mt-0.5 leading-snug">
                        {a.description}
                      </p>
                    )}
                    <p className="text-[10px] font-mono text-muted-on-light mt-1 truncate">
                      {a.code_ref} · v{a.version}
                    </p>
                    {isMobile && (
                      <button
                        type="button"
                        onClick={toggleExpand}
                        className="mt-2 text-[10px] uppercase tracking-wider text-primary font-semibold"
                        data-testid={`acoes-toggle-actions-${a.id}`}
                      >
                        {isExpanded ? 'Ocultar ações' : 'Mostrar ações'}
                      </button>
                    )}
                  </div>
                  {(!isMobile || isExpanded) && (
                    <div
                      className={
                        isMobile
                          ? 'flex flex-wrap items-center gap-1 pt-2 border-t border-border-light'
                          : 'flex items-center gap-1 shrink-0'
                      }
                      data-testid={`acoes-actions-${a.id}`}
                    >
                      <RequirePerm perm="ontology.actions.execute" fallback={null}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setExecuting(a)}
                          data-testid={`acoes-exec-${a.id}`}
                          title={a.auto_approvable ? 'Executar' : 'Solicitar execução (requer aprovação)'}
                        >
                          {a.auto_approvable ? (
                            <>
                              <Play className="w-3 h-3" strokeWidth={1.5} />
                              Executar
                            </>
                          ) : (
                            <>
                              <ClipboardCheck className="w-3 h-3" strokeWidth={1.5} />
                              Solicitar
                            </>
                          )}
                        </Button>
                      </RequirePerm>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setHistoryOf(a)}
                        data-testid={`acoes-history-${a.id}`}
                        title="Histórico"
                        aria-label={`Histórico de ${a.name}`}
                      >
                        <History className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </Button>
                      <RequirePerm perm="ontology.actions.write" fallback={null}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditing(a)}
                          data-testid={`acoes-edit-${a.id}`}
                          title="Editar"
                          aria-label={`Editar ${a.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-danger hover:bg-danger/10"
                          onClick={() => onDelete(a)}
                          data-testid={`acoes-delete-${a.id}`}
                          title="Excluir"
                          aria-label={`Excluir ${a.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                      </RequirePerm>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <ActionEditor
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {executing && (
        <ActionExecutor
          action={executing}
          onClose={() => setExecuting(null)}
        />
      )}

      {historyOf && (
        <ActionHistory
          action={historyOf}
          onClose={() => setHistoryOf(null)}
        />
      )}

      {showTargets && (
        <ExternalTargetsDialog onClose={() => setShowTargets(false)} />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function ActionEditor({
  existing,
  onClose,
  onSaved,
}: {
  existing: ActionTypeOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(existing?.name ?? '');
  const [description, setDescription] = React.useState(existing?.description ?? '');
  const [codeRef, setCodeRef] = React.useState(existing?.code_ref ?? '');
  const [inputSchema, setInputSchema] = React.useState(
    JSON.stringify(existing?.input_schema ?? {}, null, 2),
  );
  const [validations, setValidations] = React.useState(
    JSON.stringify(existing?.validations ?? [], null, 2),
  );
  const [requiresMarkings, setRequiresMarkings] = React.useState(
    (existing?.requires_markings ?? []).join(', '),
  );
  const [timeoutSeconds, setTimeoutSeconds] = React.useState(existing?.timeout_seconds ?? 60);
  const [autoApprovable, setAutoApprovable] = React.useState(existing?.auto_approvable ?? false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    setErr(null);
    let inputSchemaObj: Record<string, unknown> = {};
    try {
      inputSchemaObj = inputSchema.trim() ? JSON.parse(inputSchema) : {};
    } catch {
      setErr('JSON Schema inválido em "Schema de entrada".');
      return;
    }
    let validationsArr: Record<string, unknown>[] = [];
    try {
      const parsed = validations.trim() ? JSON.parse(validations) : [];
      if (!Array.isArray(parsed)) throw new Error('lista');
      validationsArr = parsed;
    } catch {
      setErr('Validações inválidas: use uma lista JSON de {type, params}.');
      return;
    }
    const markings = requiresMarkings
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      if (existing) {
        await ActionTypes.update(existing.id, {
          description,
          code_ref: codeRef,
          input_schema: inputSchemaObj,
          validations: validationsArr,
          requires_markings: markings,
          timeout_seconds: timeoutSeconds,
          auto_approvable: autoApprovable,
        });
      } else {
        await ActionTypes.create({
          name,
          description,
          code_ref: codeRef,
          input_schema: inputSchemaObj,
          validations: validationsArr,
          requires_markings: markings,
          timeout_seconds: timeoutSeconds,
          auto_approvable: autoApprovable,
        });
      }
      onSaved();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex justify-end"
      onClick={onClose}
      data-testid="acao-editor"
      role="dialog"
      aria-modal="true"
    >
      <aside
        className="w-full max-w-[520px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-light p-4 flex items-start justify-between">
          <h2 className="text-sm font-semibold text-text-on-light">
            {existing ? `Editar — ${existing.name}` : 'Nova ação'}
          </h2>
          <button onClick={onClose} aria-label="Fechar editor">
            <X className="h-4 w-4 text-muted-on-light hover:text-text-on-light" strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {err && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30" role="alert">
              {err}
            </div>
          )}
          {!existing && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                Nome (único)
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="rede.fechar_caso"
                className="bg-white font-mono"
                data-testid="acao-name"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Descrição
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fecha um caso e arquiva nós relacionados."
              className="bg-white"
              data-testid="acao-description"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              code_ref (módulo Python executor)
            </Label>
            <Input
              value={codeRef}
              onChange={(e) => setCodeRef(e.target.value)}
              placeholder="app.actions.fechar_caso"
              className="bg-white font-mono"
              data-testid="acao-code-ref"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Schema de entrada (JSON Schema)
            </Label>
            <textarea
              value={inputSchema}
              onChange={(e) => setInputSchema(e.target.value)}
              rows={6}
              aria-label="Schema de entrada"
              className="w-full font-mono text-[11px] bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
              data-testid="acao-input-schema"
            />
            <p className="text-[10px] text-muted-on-light italic">
              O formulário operador é gerado automaticamente a partir deste schema.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Validações de escrita (JSON — opcional)
            </Label>
            <textarea
              value={validations}
              onChange={(e) => setValidations(e.target.value)}
              rows={4}
              aria-label="Validações de escrita"
              placeholder='[{"type":"temporal_exclusivity","params":{"entity_kind":"Reserva","group_by":["resource_id"],"start_key":"start","end_key":"end","capacity":1}}]'
              className="w-full font-mono text-[11px] bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
              data-testid="acao-validations"
            />
            <p className="text-[10px] text-muted-on-light italic">
              Regras genéricas checadas antes de executar (ex.: exclusividade temporal + capacidade). Em geral o AIP preenche isto.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Marcações exigidas (csv)
            </Label>
            <Input
              value={requiresMarkings}
              onChange={(e) => setRequiresMarkings(e.target.value)}
              placeholder="SIGILOSO, OPERACAO-X"
              className="bg-white font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                Timeout (s)
              </Label>
              <Input
                type="number"
                min={1}
                max={3600}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                className="bg-white"
              />
            </div>
            <label className="flex items-center gap-2 text-[12px] text-text-on-light pt-5">
              <input
                type="checkbox"
                checked={autoApprovable}
                onChange={(e) => setAutoApprovable(e.target.checked)}
              />
              Auto-aprovável
            </label>
          </div>
        </div>
        <div className="border-t border-border-light p-4 flex justify-end gap-2 sticky bottom-0 bg-canvas-light">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="success"
            onClick={save}
            disabled={saving || !codeRef || (!existing && !name)}
            data-testid="acao-save"
          >
            {saving ? 'Salvando…' : existing ? 'Salvar alterações' : 'Criar ação'}
          </Button>
        </div>
      </aside>
    </div>
    </ModalPortal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Dynamic form executor (Wave H.2)
// ───────────────────────────────────────────────────────────────────────────

interface SpaceListItem {
  id: string;
  slug: string;
  display_name: string;
}

function ActionExecutor({
  action,
  onClose,
}: {
  action: ActionTypeOut;
  onClose: () => void;
}) {
  const askConfirm = useConfirm();
  // Form state
  const [schema, setSchema] = React.useState<ActionFormSchemaOut | null>(null);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<ActionValidationError[]>([]);
  const [note, setNote] = React.useState('');
  // Operational context
  const [projects, setProjects] = React.useState<ProjectListItem[]>([]);
  const [spaces, setSpaces] = React.useState<SpaceListItem[]>([]);
  const [spaceId, setSpaceId] = React.useState<string>('');
  const [projectId, setProjectId] = React.useState<string>('');
  // Modes
  const [dryRun, setDryRun] = React.useState(false);
  const [aipOpen, setAipOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const [result, setResult] = React.useState<ActionExecuteResult | null>(null);
  const [plan, setPlan] = React.useState<ActionPlanResult | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);

  // Principal markings (best-effort; fall back to empty array).
  const [principalMarkings, setPrincipalMarkings] = React.useState<string[]>([]);

  // Load schema + projects + spaces.
  React.useEffect(() => {
    let live = true;
    setLoadErr(null);
    Promise.all([
      ActionTypes.formSchema(action.id),
      Projects.list().catch(() => [] as ProjectListItem[]),
      Spaces.list().catch(() => [] as SpaceListItem[]),
      fetch('/api/whoami', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([s, p, sp, who]) => {
        if (!live) return;
        setSchema(s);
        // Seed defaults
        const init: Record<string, unknown> = {};
        for (const f of s.fields) {
          if (f.default !== null && f.default !== undefined) init[f.key] = f.default;
        }
        setValues(init);
        setProjects(p);
        setSpaces(sp as SpaceListItem[]);
        if (who && Array.isArray(who.markings)) setPrincipalMarkings(who.markings);
      })
      .catch((e) => live && setLoadErr(humanise(e)));
    return () => {
      live = false;
    };
  }, [action.id]);

  const filteredProjects = React.useMemo(() => {
    if (!spaceId) return projects;
    return projects.filter((p) => (p as ProjectListItem & { space_id?: string }).space_id === spaceId);
  }, [spaceId, projects]);

  function setField(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function validate(): Promise<boolean> {
    try {
      const r = await ActionTypes.validateInput(action.id, values);
      setErrors(r.errors);
      return r.valid;
    } catch (e) {
      setErrors([{ key: '_global', message: humanise(e) }]);
      return false;
    }
  }

  async function onPlan() {
    setSubmitErr(null);
    const valid = await validate();
    if (!valid) return;
    setPlanning(true);
    try {
      const r = await ActionTypes.plan([{ action_id: action.id, input: values }]);
      setPlan(r);
      setResult(null);
    } catch (e) {
      setSubmitErr(humanise(e));
    } finally {
      setPlanning(false);
    }
  }

  async function onExecute() {
    setSubmitErr(null);
    const valid = await validate();
    if (!valid) return;
    // Confirm before submit, with summary.
    const proj = projects.find((p) => p.id === projectId);
    const space = spaces.find((s) => s.id === spaceId);
    const summary = [
      `Ação: ${action.name}`,
      proj ? `Operação: ${proj.display_name}` : 'Operação: (tenant-wide)',
      space ? `Espaço: ${space.display_name}` : '',
      action.requires_markings.length
        ? `Marcações: ${action.requires_markings.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    const ok = await askConfirm({
      title: action.auto_approvable ? 'Executar ação?' : 'Solicitar execução?',
      description: summary,
      confirmLabel: action.auto_approvable ? 'Executar' : 'Solicitar',
      tone: action.auto_approvable ? 'default' : 'warning',
    });
    if (!ok) return;
    setRunning(true);
    try {
      const r = await ActionTypes.execute(
        action.id,
        // Carregar contexto operacional sob _context para o backend (opcional).
        {
          ...values,
          _context: {
            project_id: projectId || null,
            space_id: spaceId || null,
          },
        },
        note || undefined,
      );
      setResult(r);
      setPlan(null);
    } catch (e) {
      setSubmitErr(humanise(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex justify-end"
      onClick={onClose}
      data-testid="acao-executor"
      role="dialog"
      aria-modal="true"
      aria-label={`${action.auto_approvable ? 'Executar' : 'Solicitar'} ${action.name}`}
    >
      <aside
        className="w-full max-w-[640px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-light p-4 flex items-start justify-between bg-white">
          <div>
            <h2 className="text-sm font-semibold text-text-on-light">
              {action.auto_approvable ? 'Executar' : 'Solicitar'} — {action.name}
            </h2>
            <p className="text-[10px] text-muted-on-light mt-0.5 font-mono">
              {action.code_ref}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAipOpen(true)}
              data-testid="acao-aip-open"
              aria-label="Pedir ajuda ao AIP"
              title="Pedir ajuda ao AIP"
              className="h-8 px-2 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <Wand2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Pedir ajuda ao AIP
            </button>
            <button onClick={onClose} aria-label="Fechar executor" className="ml-1 p-1">
              <X className="h-4 w-4 text-muted-on-light hover:text-text-on-light" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {action.description && (
            <p className="text-[12px] text-text-on-light leading-relaxed bg-white border border-border-light p-2.5">
              {action.description}
            </p>
          )}

          {loadErr && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30" role="alert">
              {loadErr}
            </div>
          )}

          {/* Operational context: Operation + Space dropdowns */}
          <div className="grid grid-cols-2 gap-3" data-testid="acao-context">
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
              Espaço
              <select
                value={spaceId}
                onChange={(e) => {
                  setSpaceId(e.target.value);
                  setProjectId('');
                }}
                data-testid="acao-space"
                className="mt-1 w-full h-9 px-2 text-[12px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— qualquer —</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
              Operação alvo
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                data-testid="acao-project"
                className="mt-1 w-full h-9 px-2 text-[12px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— tenant-wide —</option>
                {filteredProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Markings checklist */}
          {action.requires_markings.length > 0 && (
            <div className="bg-white border border-border-light p-3" data-testid="acao-markings">
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1.5">
                Marcações exigidas
              </p>
              <ul className="space-y-1">
                {action.requires_markings.map((m) => {
                  const ok = principalMarkings.includes(m);
                  return (
                    <li
                      key={m}
                      className="flex items-center gap-2 text-[11.5px]"
                      data-testid={`acao-marking-${m}`}
                    >
                      {ok ? (
                        <Check className="w-3.5 h-3.5 text-success" strokeWidth={1.5} />
                      ) : (
                        <X className="w-3.5 h-3.5 text-danger" strokeWidth={1.5} />
                      )}
                      <span className="font-mono">{m}</span>
                      <span
                        className={
                          'text-[10px] ' +
                          (ok ? 'text-success' : 'text-danger')
                        }
                      >
                        {ok ? 'atendida' : 'não atendida'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Dynamic form */}
          <div className="space-y-3" data-testid="acao-form">
            {schema === null && !loadErr && (
              <p className="text-[11px] text-muted-on-light italic">Carregando formulário…</p>
            )}
            {schema && schema.fields.length === 0 && (
              <p className="text-[11px] text-muted-on-light italic">
                Esta ação não declara parâmetros de entrada.
              </p>
            )}
            {schema &&
              schema.fields.map((f) => (
                <DynamicField
                  key={f.key}
                  field={f}
                  value={values[f.key]}
                  onChange={(v) => setField(f.key, v)}
                  error={errors.find((e) => e.key === f.key)?.message}
                />
              ))}
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Nota (auditoria)
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motivo da execução…"
              className="bg-white"
              data-testid="acao-exec-note"
            />
          </div>

          {/* Dry-run toggle (sharp, no rounded) */}
          <button
            type="button"
            onClick={() => setDryRun((v) => !v)}
            role="switch"
            aria-checked={dryRun}
            data-testid="acao-dryrun-toggle"
            className="flex items-center gap-2 text-[12px] cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span
              aria-hidden
              className={
                'inline-flex w-4 h-4 items-center justify-center border ' +
                (dryRun
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-border-light')
              }
            >
              {dryRun && <Check className="w-3 h-3" strokeWidth={2} />}
            </span>
            Modo dry-run (Plan) — simula sem efeitos colaterais
          </button>

          {submitErr && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30" role="alert">
              {submitErr}
            </div>
          )}

          {errors.length > 0 && (
            <div
              className="px-3 py-2 text-[11px] font-mono text-warning bg-warning/5 border border-warning/30"
              role="alert"
              aria-live="polite"
              data-testid="acao-form-errors"
            >
              {errors.length} campo{errors.length === 1 ? '' : 's'} com erro. Corrija antes de submeter.
            </div>
          )}

          {plan && (
            <div className="p-3 bg-white border border-border-light" data-testid="acao-plan-result">
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-2">
                Plano (dry-run, sem efeitos colaterais)
              </p>
              {plan.steps.map((s, i) => (
                <div key={i} className="text-[11px] mb-1.5">
                  <span className="font-mono text-muted-on-light">{s.action_name}</span>
                  {' · '}
                  {s.will_execute && <span className="text-success">executaria agora</span>}
                  {s.will_request_approval && <span className="text-primary">requer aprovação</span>}
                  {s.deny_reason && <span className="text-danger">negado: {s.deny_reason}</span>}
                </div>
              ))}
              <p className="text-[10px] font-mono text-muted-on-light mt-2">
                total={plan.total} · exec={plan.will_execute} · aprovar={plan.will_request_approval} · negar={plan.will_deny}
              </p>
            </div>
          )}

          {result && (
            <div
              className={
                'p-3 border ' +
                (result.status === 'SUCCESS'
                  ? 'border-success/40 bg-success/5'
                  : result.status === 'POLICY_DENIED'
                  ? 'border-warning/40 bg-warning/5'
                  : result.status === 'PENDING_APPROVAL'
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-danger/40 bg-danger/5')
              }
              data-testid="acao-exec-result"
            >
              <div className="flex items-center gap-2 text-[12px] font-semibold">
                {result.status === 'SUCCESS' && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-success" strokeWidth={1.5} />
                    Sucesso ({result.duration_ms ?? 0} ms)
                  </>
                )}
                {result.status === 'POLICY_DENIED' && (
                  <>
                    <ShieldOff className="w-4 h-4 text-warning" strokeWidth={1.5} />
                    Negado por política
                  </>
                )}
                {result.status === 'PENDING_APPROVAL' && (
                  <>
                    <ClipboardCheck className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Solicitação enviada — aguardando aprovação
                  </>
                )}
                {result.status === 'FAILED' && (
                  <>
                    <AlertCircle className="w-4 h-4 text-danger" strokeWidth={1.5} />
                    Falhou
                  </>
                )}
              </div>
              <pre className="text-[10.5px] font-mono mt-2 text-text-on-light whitespace-pre-wrap break-all">
                {JSON.stringify(result.output, null, 2)}
              </pre>
              <p className="text-[10px] font-mono text-muted-on-light mt-2">
                execution_id={result.execution_id}
                {result.lineage_event_id && ` · lineage=${result.lineage_event_id}`}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border-light p-4 flex justify-end gap-2 sticky bottom-0 bg-canvas-light">
          <Button variant="outline" onClick={onClose} disabled={running || planning}>
            Fechar
          </Button>
          {dryRun ? (
            <Button onClick={onPlan} disabled={planning} data-testid="acao-exec-plan">
              {planning ? 'Planejando…' : 'Plan (dry-run)'}
            </Button>
          ) : (
            <Button
              onClick={onExecute}
              disabled={running}
              data-testid="acao-exec-run"
            >
              {running ? 'Enviando…' : action.auto_approvable ? 'Executar' : 'Solicitar'}
            </Button>
          )}
        </div>
      </aside>

      {aipOpen && (
        <AipAssistSidebar
          scope="workshop"
          resourceId={action.id}
          onClose={() => setAipOpen(false)}
        />
      )}
    </div>
    </ModalPortal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// DynamicField — renderiza um único field do schema
// ───────────────────────────────────────────────────────────────────────────

function DynamicField({
  field,
  value,
  onChange,
  error,
}: {
  field: ActionFormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const testid = `acao-field-${field.key}`;
  const labelTxt = field.title + (field.required ? ' *' : '');
  return (
    <div className="space-y-1" data-testid={testid}>
      <Label
        className="text-[10px] uppercase tracking-wider text-muted-on-light"
        title={field.description || undefined}
        htmlFor={testid + '-input'}
      >
        {labelTxt}
      </Label>
      {field.description && (
        <p className="text-[10px] text-muted-on-light italic">{field.description}</p>
      )}
      {renderControl(field, value, onChange, testid + '-input')}
      {error && (
        <p
          className="text-[10.5px] font-mono text-danger"
          role="alert"
          data-testid={`${testid}-err`}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function renderControl(
  field: ActionFormField,
  value: unknown,
  onChange: (v: unknown) => void,
  id: string,
) {
  const common = 'w-full h-9 px-2 text-[12px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
  switch (field.type) {
    case 'enum':
      return (
        <select
          id={id}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        >
          <option value="">— escolha —</option>
          {(field.enum || []).map((opt, i) => (
            <option key={i} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-[12px]">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.placeholder || 'Ativar'}
        </label>
      );
    case 'number':
    case 'integer':
      return (
        <input
          id={id}
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') {
              onChange(undefined);
              return;
            }
            onChange(field.type === 'integer' ? parseInt(v, 10) : Number(v));
          }}
          min={field.minimum ?? undefined}
          max={field.maximum ?? undefined}
          placeholder={field.placeholder || ''}
          className={common}
        />
      );
    case 'date':
      return (
        <input
          id={id}
          type={field.format === 'date-time' ? 'datetime-local' : 'date'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        />
      );
    case 'array':
      return <ArrayTagsInput id={id} value={value} onChange={onChange} field={field} />;
    case 'object_ref':
      return <ObjectRefPicker id={id} value={value} onChange={onChange} field={field} />;
    case 'string':
    default:
      return (
        <input
          id={id}
          type="text"
          value={typeof value === 'string' ? value : value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          minLength={field.min_length ?? undefined}
          maxLength={field.max_length ?? undefined}
          pattern={field.pattern ?? undefined}
          className={common}
        />
      );
  }
}

function ArrayTagsInput({
  id,
  value,
  onChange,
  field,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  field: ActionFormField;
}) {
  const arr: string[] = Array.isArray(value) ? value.map((v) => String(v)) : [];
  const [draft, setDraft] = React.useState('');
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...arr, t]);
    setDraft('');
  }
  function remove(i: number) {
    onChange(arr.filter((_, j) => j !== i));
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 mb-1">
        {arr.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10.5px] font-mono bg-canvas-light border border-border-light"
            data-testid={`${id}-tag-${i}`}
          >
            {t}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remover ${t}`}
              className="hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={field.placeholder || 'pressione Enter pra adicionar'}
          className="flex-1 h-8 px-2 text-[12px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={add}
          className="h-8 px-2 text-[11px] bg-white border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        >
          + adicionar
        </button>
      </div>
    </div>
  );
}

function ObjectRefPicker({
  id,
  value,
  onChange,
  field,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  field: ActionFormField;
}) {
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<OntologyNodeSearchItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<OntologyNodeSearchItem | null>(
    typeof value === 'object' && value !== null && 'id' in value
      ? (value as OntologyNodeSearchItem)
      : null,
  );

  React.useEffect(() => {
    if (!open || !search.trim()) {
      setResults([]);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      OntologyNodes.search({
        q: search.trim(),
        node_type: field.ref_node_type ?? undefined,
        limit: 15,
      })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, open, field.ref_node_type]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          id={id}
          type="button"
          onClick={() => setOpen(true)}
          data-testid={`${id}-open`}
          className="flex-1 h-9 px-2 text-[12px] bg-white border border-border-light text-left hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {picked ? (
            <span>
              <span className="font-semibold">{picked.name}</span>
              <span className="ml-2 text-[10px] font-mono text-muted-on-light">
                {picked.node_type}
              </span>
            </span>
          ) : (
            <span className="text-muted-on-light italic">
              {field.placeholder || `Escolher objeto${field.ref_node_type ? ` (${field.ref_node_type})` : ''}…`}
            </span>
          )}
        </button>
        {picked && (
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              onChange(undefined);
            }}
            aria-label="Limpar seleção"
            className="h-9 w-9 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>
      {open && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[60] ds-overlay flex items-center justify-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white border border-border-light w-full max-w-md p-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[13px] font-semibold mb-2">
              Buscar objeto{field.ref_node_type ? ` (${field.ref_node_type})` : ''}
            </h3>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Digite ao menos 2 caracteres…"
              data-testid={`${id}-search`}
              className="h-9 px-2 text-[12px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary mb-2"
            />
            <ul className="flex-1 overflow-y-auto border border-border-light">
              {busy && (
                <li className="px-3 py-2 text-[11px] text-muted-on-light italic">
                  Buscando…
                </li>
              )}
              {!busy && results.length === 0 && search.trim() && (
                <li className="px-3 py-2 text-[11px] text-muted-on-light italic">
                  Nenhum objeto encontrado.
                </li>
              )}
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    data-testid={`${id}-result-${r.id}`}
                    onClick={() => {
                      setPicked(r);
                      onChange({ id: r.id, name: r.name, node_type: r.node_type });
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-canvas-light focus:bg-canvas-light focus:outline-none"
                  >
                    <span className="block text-[12px] font-semibold truncate">{r.name}</span>
                    <span className="block text-[10px] font-mono text-muted-on-light truncate">
                      {r.node_type} · urn:{r.id.slice(0, 8)}…
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 px-3 text-[12px] bg-white border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ActionHistory — tabular com expand input/output
// ───────────────────────────────────────────────────────────────────────────

function ActionHistory({
  action,
  onClose,
}: {
  action: ActionTypeOut;
  onClose: () => void;
}) {
  const [items, setItems] = React.useState<ActionExecutionOut[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [actorFilter, setActorFilter] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    ActionTypes.executions(action.id)
      .then(setItems)
      .catch((e) => setErr(humanise(e)));
  }, [action.id]);

  const filtered = (items || []).filter((ex) => {
    if (statusFilter && ex.status !== statusFilter) return false;
    if (actorFilter && !ex.initiated_by.toLowerCase().includes(actorFilter.toLowerCase()))
      return false;
    return true;
  });

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex justify-end"
      onClick={onClose}
      data-testid="acao-history"
      role="dialog"
      aria-modal="true"
      aria-label={`Histórico de ${action.name}`}
    >
      <aside
        className="w-full max-w-[680px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-light p-4 bg-white flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-on-light">
              Histórico — {action.name}
            </h2>
            <p className="text-[10px] text-muted-on-light mt-0.5 font-mono">
              Últimas execuções (até 50)
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar histórico">
            <X className="h-4 w-4 text-muted-on-light hover:text-text-on-light" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-3 border-b border-border-light bg-white flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="acao-history-status"
            aria-label="Filtrar por status"
            className="h-8 px-2 text-[11.5px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— todos status —</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="POLICY_DENIED">POLICY_DENIED</option>
            <option value="PENDING">PENDING</option>
            <option value="ABORTED">ABORTED</option>
          </select>
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="filtrar por ator"
            aria-label="Filtrar por ator"
            data-testid="acao-history-actor"
            className="h-8 px-2 text-[11.5px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="p-4 space-y-2">
          {err && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30" role="alert">
              {err}
            </div>
          )}
          {!items && !err && <CpSkeleton rows={5} />}
          {items && filtered.length === 0 && (
            <p className="text-[12px] text-muted-on-light">Nenhuma execução corresponde aos filtros.</p>
          )}
          {filtered.length > 0 && (
            <table className="w-full text-[11.5px]" data-testid="acao-history-table">
              <thead className="bg-canvas-light">
                <tr className="text-left">
                  <th className="p-2 text-[10px] uppercase tracking-wider text-muted-on-light">Status</th>
                  <th className="p-2 text-[10px] uppercase tracking-wider text-muted-on-light">Ator</th>
                  <th className="p-2 text-[10px] uppercase tracking-wider text-muted-on-light">Duração</th>
                  <th className="p-2 text-[10px] uppercase tracking-wider text-muted-on-light">Início</th>
                  <th className="p-2 w-7" aria-label="Expandir" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ex) => {
                  const isOpen = expanded.has(ex.id);
                  const toggle = () =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(ex.id)) next.delete(ex.id);
                      else next.add(ex.id);
                      return next;
                    });
                  return (
                    <React.Fragment key={ex.id}>
                      <tr
                        className="border-b border-border-light cursor-pointer hover:bg-canvas-light"
                        onClick={toggle}
                        data-testid={`acao-history-row-${ex.id}`}
                      >
                        <td className="p-2">
                          <span
                            className={
                              'text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 border ' +
                              (ex.status === 'SUCCESS'
                                ? 'border-success/40 text-success bg-success/5'
                                : ex.status === 'POLICY_DENIED'
                                ? 'border-warning/40 text-warning bg-warning/5'
                                : 'border-danger/40 text-danger bg-danger/5')
                            }
                          >
                            {ex.status}
                          </span>
                        </td>
                        <td className="p-2">{ex.initiated_by}</td>
                        <td className="p-2 font-mono">{ex.duration_ms ?? '—'} ms</td>
                        <td className="p-2 font-mono text-[10px] text-muted-on-light">
                          {ex.started_at ? formatDataHoraBR(ex.started_at) : '—'}
                        </td>
                        <td className="p-2 text-muted-on-light">
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr
                          className="border-b border-border-light bg-canvas-light"
                          data-testid={`acao-history-expand-${ex.id}`}
                        >
                          <td colSpan={5} className="p-3 space-y-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                                Input
                              </p>
                              <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-all bg-white border border-border-light p-2">
                                {JSON.stringify(ex.input_payload, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                                Output
                              </p>
                              <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-all bg-white border border-border-light p-2">
                                {JSON.stringify(ex.output_payload, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
    </ModalPortal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ExternalTargetsDialog — Onda 1: SSRF allowlist for service (HTTP) Actions.
// The operator manages allowed hosts here; the backend refuses any service
// Action whose host isn't on this list (and always refuses private IPs).
// ───────────────────────────────────────────────────────────────────────────
function ExternalTargetsDialog({ onClose }: { onClose: () => void }) {
  const [targets, setTargets] = React.useState<string[] | null>(null);
  const [draft, setDraft] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    ActionTypes.getTargets()
      .then((r) => setTargets(r.targets))
      .catch((e) => setErr(humanise(e)));
  }, []);

  function add() {
    const t = draft.trim().toLowerCase();
    if (!t || !targets) return;
    if (!targets.includes(t)) setTargets([...targets, t]);
    setDraft('');
  }
  function remove(h: string) {
    if (targets) setTargets(targets.filter((x) => x !== h));
  }
  async function save() {
    if (!targets) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await ActionTypes.putTargets(targets);
      setTargets(r.targets);
      onClose();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex justify-end"
      onClick={onClose}
      data-testid="acao-targets-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Destinos externos permitidos"
    >
      <aside
        className="w-full max-w-[480px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-light p-4 flex items-start justify-between bg-white">
          <div>
            <h2 className="text-sm font-semibold text-text-on-light flex items-center gap-2">
              <Globe className="w-4 h-4" strokeWidth={1.5} />
              Destinos externos permitidos
            </h2>
            <p className="text-[11px] text-muted-on-light mt-1 leading-snug">
              Hosts que uma Ação do tipo serviço (HTTP) pode chamar — ex.: a
              controladora do portão. Ações para hosts fora desta lista são
              bloqueadas.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-on-light hover:text-text-on-light" strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {err && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30" role="alert">
              {err}
            </div>
          )}
          {targets === null && !err && <CpSkeleton rows={3} />}
          {targets && (
            <>
              <div className="flex flex-wrap items-center gap-1" data-testid="acao-targets-list">
                {targets.length === 0 && (
                  <span className="text-[11px] text-muted-on-light italic">
                    Nenhum destino permitido. Ações de serviço ficam bloqueadas
                    até você adicionar um host.
                  </span>
                )}
                {targets.map((h) => (
                  <span
                    key={h}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-mono bg-white border border-border-light"
                    data-testid={`acao-target-${h}`}
                  >
                    {h}
                    <button
                      type="button"
                      onClick={() => remove(h)}
                      aria-label={`Remover ${h}`}
                      className="hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
                    >
                      <X className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      add();
                    }
                  }}
                  placeholder="gate.condominio.com.br"
                  className="bg-white font-mono h-8 text-[12px]"
                  data-testid="acao-target-input"
                  aria-label="Novo host permitido"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={add}
                  data-testid="acao-target-add"
                >
                  + adicionar
                </Button>
              </div>
              <p className="text-[10px] text-muted-on-light italic">
                Apenas o host (sem https:// nem caminho). IPs privados/loopback
                são sempre bloqueados.
              </p>
            </>
          )}
        </div>
        <div className="border-t border-border-light p-4 flex justify-end gap-2 sticky bottom-0 bg-canvas-light">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="success"
            onClick={save}
            disabled={saving || targets === null}
            data-testid="acao-targets-save"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </aside>
    </div>
    </ModalPortal>
  );
}

// Silence unused import warning for `Square` retained for future use.
void Square;
