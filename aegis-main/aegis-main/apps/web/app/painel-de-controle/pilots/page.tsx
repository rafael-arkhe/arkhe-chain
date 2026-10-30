'use client';

/**
 * Roteiros — Painel de Controle (Redesign visual · 2026-05-24).
 *
 * Um roteiro é uma sequência de passos; cada passo roda uma ação e passos
 * sensíveis pausam para aprovação humana (finalizada em
 * /painel-de-controle/aprovacoes).
 *
 * Backend: POST /platform/v23/pilots/start · GET /platform/v23/pilots/{id} ·
 * POST /platform/v23/pilots/{id}/resume · GET /platform/v23/pilots ·
 * GET /platform/v23/pilots/templates · POST /platform/v23/action-types/plan.
 *
 * Três modos (ADD alongside — MESMOS endpoints REST nos três):
 *   - Plano (DEFAULT): linha do tempo visual de passos numerados. O operador
 *     escreve o objetivo, escolhe a ação de cada passo num seletor com busca
 *     (nome claro, nunca code_ref cru) e preenche só os campos que a ação
 *     exige (form tipado a partir do input_schema; nunca JSON na visão padrão).
 *     Pré-visualizar valida quem executa/pede aprovação/nega; Executar inicia.
 *   - Conversa: chat guiado (components/wave-h3/pilot-chat.tsx).
 *   - Avançado: builder com entrada JSON por passo + DAG depends_on + reorder
 *     (poder total para quem precisa de controle fino).
 */
import * as React from 'react';
import {
  Workflow,
  Plus,
  Trash2,
  Play,
  Loader2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  ClipboardCheck,
  ShieldOff,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  RotateCw,
  Network,
  Pencil,
  PlayCircle,
  GitBranch,
  Circle,
} from 'lucide-react';
import Link from 'next/link';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { AUTOMACAO_TABS } from '@/components/control-panel/hub-tabs';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpErrorState } from '@/components/control-panel/cp-skeleton';
import { OverflowMenu, type OverflowMenuItem } from '@/components/ui/overflow-menu';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { PilotChatPanel } from '@/components/wave-h3/pilot-chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ActionTypes,
  ControlPanel,
  Pilots,
  type ActionTypeOut,
  type CPApproval,
  type PilotListItem,
  type PilotRunOut,
  type PilotStepIn,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { formatDataHoraBR } from '@/lib/datetime';
import { useIsMobile } from '@/lib/responsive/use-is-mobile';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Tradução amigável do status bruto (vindo do backend) para um rótulo
 * pt-BR que o operador entende. Nunca exibimos o código cru na UI; o
 * fallback Title-case cobre estados novos sem quebrar o visual.
 */
function statusLabel(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'Concluído';
    case 'FAILED':
      return 'Falhou';
    case 'PAUSED':
    case 'PENDING_APPROVAL':
      return 'Aguardando aprovação';
    case 'POLICY_DENIED':
      return 'Bloqueado por política';
    case 'RUNNING':
      return 'Em andamento';
    default:
      return status
        .toLowerCase()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  }
}

/**
 * Wave C.1 — combina runs criados na sessão atual (`history` — vem do
 * POST /start com steps inline) com o archive persistido (vem do GET
 * /pilots — só cabeçalho). Deduplica por pilot_run_id; in-session
 * ganha precedência (operador já tem o detalhe carregado).
 *
 * Retorna lista ordenada por started_at desc.
 */
type MergedPilotEntry =
  | {
      kind: 'session';
      pilot_run_id: string;
      goal: string;
      status: string;
      started_at: string;
      n_steps: number;
      initiated_by: string;
      run: PilotRunOut;
    }
  | {
      kind: 'archive';
      pilot_run_id: string;
      goal: string;
      status: string;
      started_at: string;
      n_steps: number;
      initiated_by: string;
    };

function mergePilots(
  session: PilotRunOut[],
  archive: PilotListItem[],
): MergedPilotEntry[] {
  const sessionIds = new Set(session.map((r) => r.pilot_run_id));
  const sessionEntries: MergedPilotEntry[] = session.map((run) => ({
    kind: 'session' as const,
    pilot_run_id: run.pilot_run_id,
    goal: run.goal,
    status: run.status,
    started_at: run.started_at,
    n_steps: run.steps.length,
    initiated_by: 'você',
    run,
  }));
  const archiveEntries: MergedPilotEntry[] = archive
    .filter((a) => !sessionIds.has(a.pilot_run_id))
    .map((a) => ({
      kind: 'archive' as const,
      pilot_run_id: a.pilot_run_id,
      goal: a.goal,
      status: a.status,
      started_at: a.started_at,
      n_steps: a.n_steps,
      initiated_by: a.initiated_by,
    }));
  return [...sessionEntries, ...archiveEntries].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Forma local do passo no Plano (visão padrão) e no Avançado (builder).     */
/* ════════════════════════════════════════════════════════════════════════ */

/** Campo tipado derivado do input_schema da ação. */
interface PlanField {
  key: string;
  value: string;
  type: string;
}

/** Passo do Plano (visão padrão visual). */
interface PlanStep {
  /** ID local pra key/React; nada a ver com backend. */
  uid: string;
  action_id: string;
  /** Campos derivados do esquema da ação escolhida. */
  fields: PlanField[];
  note: string;
  /**
   * depends_on — índices 0-based dos passos anteriores que devem estar
   * SUCCESS antes desse. Vazio = entra na primeira onda do roteiro.
   */
  depends_on: number[];
}

function newPlanStep(): PlanStep {
  return {
    uid: `p-${Math.random().toString(36).slice(2, 10)}`,
    action_id: '',
    fields: [],
    note: '',
    depends_on: [],
  };
}

/** Materializa campos tipados a partir de ActionType.input_schema. */
function fieldsFromSchema(
  schema: Record<string, unknown> | undefined,
  seed?: Record<string, unknown>,
): PlanField[] {
  if (!schema || typeof schema !== 'object') return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== 'object') return [];
  return Object.entries(props).map(([key, def]) => {
    const d = def as { type?: string };
    const seedV = seed?.[key];
    return {
      key,
      value: seedV === undefined ? '' : String(seedV),
      type: d.type || 'string',
    };
  });
}

function fieldsToInput(fields: PlanField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.key.trim()) continue;
    const raw = f.value.trim();
    if (f.type === 'number' || f.type === 'integer') {
      const n = Number(raw);
      out[f.key] = Number.isFinite(n) ? n : raw;
    } else if (f.type === 'boolean') {
      out[f.key] = raw === 'true';
    } else {
      out[f.key] = raw;
    }
  }
  return out;
}

/** Forma local do step no builder Avançado (entrada JSON crua). */
interface BuilderStep {
  uid: string;
  action_id: string;
  input_text: string;
  note: string;
  depends_on: number[];
}

function newBuilderStep(): BuilderStep {
  return {
    uid: Math.random().toString(36).slice(2, 10),
    action_id: '',
    input_text: '{}',
    note: '',
    depends_on: [],
  };
}

export default function PilotsPage() {
  return (
    <RequirePerm perm="ontology.actions.execute">
      <PilotsInner />
    </RequirePerm>
  );
}

type PilotView = 'plan' | 'chat' | 'advanced';

function PilotsInner() {
  // Redesign — três modos (ADD alongside; MESMOS endpoints REST):
  //   Plano (DEFAULT) = linha do tempo visual, poucos passos, clareza.
  //   Conversa        = chat guiado.
  //   Avançado        = builder JSON + DAG depends_on (poder total).
  const [view, setView] = React.useState<PilotView>('plan');
  const [actions, setActions] = React.useState<ActionTypeOut[] | null>(null);
  const [actionsErr, setActionsErr] = React.useState<string | null>(null);

  // Estado COMPARTILHADO de histórico/aprovações (igual nos modos Plano e
  // Avançado) — extraído pra hook pra não duplicar lógica de polling/resume.
  const hist = usePilotHistory();
  const isMobile = useIsMobile();

  const refreshActions = React.useCallback(() => {
    setActionsErr(null);
    ActionTypes.list()
      .then(setActions)
      .catch((e) => setActionsErr(humanise(e)));
  }, []);

  React.useEffect(() => {
    refreshActions();
  }, [refreshActions]);

  return (
    <div data-testid="pilots-page">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            Roteiros
          </span>
        }
        subtitle="Monte um roteiro: descreva o objetivo, escolha os passos e execute. Passos sensíveis pausam para a sua aprovação."
      />
      <CpHubSubnav group="Automação" tabs={AUTOMACAO_TABS} />

      <ModeToggle view={view} onChange={setView} />

      {view === 'plan' && (
        <PilotPlanView
          actions={actions}
          actionsErr={actionsErr}
          refreshActions={refreshActions}
          hist={hist}
          isMobile={isMobile}
        />
      )}

      {view === 'chat' && <PilotChatPanel />}

      {view === 'advanced' && (
        <PilotAdvancedView
          actions={actions}
          actionsErr={actionsErr}
          refreshActions={refreshActions}
          hist={hist}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Mode toggle — Plano (default) · Conversa · Avançado                       */
/* ════════════════════════════════════════════════════════════════════════ */
function ModeToggle({
  view,
  onChange,
}: {
  view: PilotView;
  onChange: (v: PilotView) => void;
}) {
  const tabs: Array<{ id: PilotView; label: string; testId: string }> = [
    { id: 'plan', label: 'Plano', testId: 'pilots-mode-plan' },
    { id: 'chat', label: 'Conversa', testId: 'pilots-mode-chat' },
    { id: 'advanced', label: 'Avançado', testId: 'pilots-mode-advanced' },
  ];
  return (
    <div
      className="px-6 py-3 border-b border-border-light bg-white flex items-center gap-3"
      data-testid="pilots-mode-toggle"
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Modo
      </span>
      <div
        role="tablist"
        aria-label="Modo de montagem do roteiro"
        className="inline-flex border border-border-light bg-canvas-light"
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            onClick={() => onChange(t.id)}
            data-testid={t.testId}
            className={
              'px-3 py-1.5 text-[11.5px] uppercase tracking-wider font-semibold transition-colors ' +
              (i > 0 ? 'border-l border-border-light ' : '') +
              (view === t.id
                ? 'bg-primary text-white'
                : 'text-muted-on-light hover:text-text-on-light')
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <span className="text-[10.5px] text-muted-on-light leading-snug ml-1 hidden sm:block">
        Plano: monte visualmente em poucos passos. Avançado: controle fino com
        entrada técnica e pré-requisitos.
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Hook compartilhado: histórico persistido + sessão + aprovações + resume   */
/* ════════════════════════════════════════════════════════════════════════ */
interface PilotHistory {
  history: PilotRunOut[];
  archive: PilotListItem[] | null;
  archiveErr: string | null;
  expandedId: string | null;
  archiveDetail: Record<string, PilotRunOut>;
  archiveLoading: string | null;
  approvals: Record<string, CPApproval>;
  resuming: string | null;
  refreshArchive: () => void;
  pushRun: (run: PilotRunOut) => void;
  setExpandedId: (id: string | null) => void;
  expandArchive: (id: string) => Promise<void>;
  resumePilot: (id: string) => Promise<void>;
  detailFor: (entry: MergedPilotEntry) => PilotRunOut | null;
  count: number;
}

function usePilotHistory(): PilotHistory {
  const [history, setHistory] = React.useState<PilotRunOut[]>([]);
  const [archive, setArchive] = React.useState<PilotListItem[] | null>(null);
  const [archiveErr, setArchiveErr] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [archiveDetail, setArchiveDetail] = React.useState<
    Record<string, PilotRunOut>
  >({});
  const [archiveLoading, setArchiveLoading] = React.useState<string | null>(
    null,
  );
  const [approvals, setApprovals] = React.useState<Record<string, CPApproval>>(
    {},
  );
  const [resuming, setResuming] = React.useState<string | null>(null);

  const refreshArchive = React.useCallback(() => {
    setArchiveErr(null);
    Pilots.listMine(50)
      .then(setArchive)
      .catch((e) => setArchiveErr(humanise(e)));
  }, []);

  const refreshApprovals = React.useCallback(() => {
    ControlPanel.approvals
      .list({ bucket: 'all' })
      .then((rows) => {
        const map: Record<string, CPApproval> = {};
        for (const a of rows) map[a.id] = a;
        setApprovals(map);
      })
      .catch(() => {
        // Falha silenciosa — operador pode tentar de novo expandindo.
      });
  }, []);

  React.useEffect(() => {
    refreshArchive();
    refreshApprovals();
  }, [refreshArchive, refreshApprovals]);

  const pushRun = React.useCallback(
    (run: PilotRunOut) => {
      setHistory((cur) => [run, ...cur]);
      setExpandedId(run.pilot_run_id);
      refreshArchive();
    },
    [refreshArchive],
  );

  const expandArchive = React.useCallback(
    async (id: string) => {
      // Toggle: se já está expandido, colapsa. Senão expande e busca o
      // detalhe sob demanda (cache em archiveDetail).
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (archiveDetail[id]) return;
      setArchiveLoading(id);
      try {
        const r = await Pilots.get(id);
        setArchiveDetail((cur) => ({ ...cur, [id]: r }));
      } catch {
        // Falha silenciosa — operador pode tentar novamente clicando.
      } finally {
        setArchiveLoading(null);
      }
    },
    [expandedId, archiveDetail],
  );

  const resumePilot = React.useCallback(
    async (pilotRunId: string) => {
      setResuming(pilotRunId);
      try {
        await Pilots.resume(pilotRunId);
        setArchiveDetail((cur) => {
          const copy = { ...cur };
          delete copy[pilotRunId];
          return copy;
        });
        refreshArchive();
        refreshApprovals();
        setExpandedId(pilotRunId);
        try {
          const r = await Pilots.get(pilotRunId);
          setArchiveDetail((cur) => ({ ...cur, [pilotRunId]: r }));
        } catch {
          // Se falhar, operador pode clicar pra reexpandir.
        }
      } catch {
        // Erro silencioso aqui; a barra de resume some no próximo refresh.
      } finally {
        setResuming(null);
      }
    },
    [refreshArchive, refreshApprovals],
  );

  const detailFor = React.useCallback(
    (entry: MergedPilotEntry): PilotRunOut | null =>
      entry.kind === 'session'
        ? entry.run
        : archiveDetail[entry.pilot_run_id] ?? null,
    [archiveDetail],
  );

  return {
    history,
    archive,
    archiveErr,
    expandedId,
    archiveDetail,
    archiveLoading,
    approvals,
    resuming,
    refreshArchive,
    pushRun,
    setExpandedId,
    expandArchive,
    resumePilot,
    detailFor,
    count: archive?.length ?? 0,
  };
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  VISÃO PADRÃO — Plano (linha do tempo visual)                              */
/* ════════════════════════════════════════════════════════════════════════ */
function PilotPlanView({
  actions,
  actionsErr,
  refreshActions,
  hist,
  isMobile,
}: {
  actions: ActionTypeOut[] | null;
  actionsErr: string | null;
  refreshActions: () => void;
  hist: PilotHistory;
  isMobile: boolean;
}) {
  const [goal, setGoal] = React.useState('');
  const [steps, setSteps] = React.useState<PlanStep[]>([newPlanStep()]);
  // Qual passo está em edição inline (uid). Default: o primeiro, pra que o
  // operador caia direto na escolha da ação sem clique extra.
  const [editingUid, setEditingUid] = React.useState<string | null>(
    () => steps[0]?.uid ?? null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);

  const [planning, setPlanning] = React.useState(false);
  const [planResult, setPlanResult] = React.useState<Awaited<
    ReturnType<typeof ActionTypes.plan>
  > | null>(null);

  const [run, setRun] = React.useState<PilotRunOut | null>(null);

  // Live-poll do run em andamento/pausado (3s), como no chat.
  React.useEffect(() => {
    if (!run || run.status === 'SUCCESS' || run.status === 'FAILED') return;
    const t = window.setInterval(async () => {
      try {
        const r = await Pilots.get(run.pilot_run_id);
        setRun(r);
      } catch {
        // silencioso — operador pode reabrir do histórico.
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [run]);

  const actionOptions: SelectOption[] = React.useMemo(
    () =>
      (actions ?? []).map((a) => ({
        value: a.id,
        label: a.name,
        hint: a.auto_approvable ? 'automático' : 'requer aprovação',
      })),
    [actions],
  );

  function updateStep(uid: string, patch: Partial<PlanStep>) {
    setSteps((cur) => cur.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  }

  function onActionChange(uid: string, actionId: string) {
    const a = (actions ?? []).find((x) => x.id === actionId);
    setSteps((cur) =>
      cur.map((s) =>
        s.uid === uid
          ? {
              ...s,
              action_id: actionId,
              fields: a
                ? fieldsFromSchema(
                    a.input_schema,
                    Object.fromEntries(s.fields.map((f) => [f.key, f.value])),
                  )
                : [],
            }
          : s,
      ),
    );
  }

  function addStep() {
    const s = newPlanStep();
    setSteps((cur) => [...cur, s]);
    setEditingUid(s.uid);
    setPlanResult(null);
  }

  function removeStep(uid: string) {
    setSteps((cur) => {
      if (cur.length <= 1) return cur;
      const next = cur.filter((s) => s.uid !== uid);
      // Reindexa depends_on: índices que apontavam pra steps removidos/
      // movidos somem.
      return next.map((s, i) => ({
        ...s,
        depends_on: s.depends_on.filter((d) => d < i),
      }));
    });
    setEditingUid((cur) => (cur === uid ? null : cur));
    setPlanResult(null);
  }

  function moveStep(uid: string, dir: -1 | 1) {
    setSteps((cur) => {
      const idx = cur.findIndex((s) => s.uid === uid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= cur.length) return cur;
      const copy = cur.slice();
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      // depends_on é por step_index; após reorder limpamos dependências
      // que ficariam inválidas.
      return copy.map((s, i) => ({
        ...s,
        depends_on: s.depends_on.filter((d) => d < i),
      }));
    });
    setPlanResult(null);
  }

  function toggleDep(uid: string, depIdx: number) {
    setSteps((cur) =>
      cur.map((s) => {
        if (s.uid !== uid) return s;
        const exists = s.depends_on.includes(depIdx);
        return {
          ...s,
          depends_on: exists
            ? s.depends_on.filter((d) => d !== depIdx)
            : [...s.depends_on, depIdx].sort((a, b) => a - b),
        };
      }),
    );
  }

  function applyTemplate(actionIdsByHint: PilotStepIn[], newGoal: string) {
    setGoal(newGoal);
    setSteps(
      actionIdsByHint.map((st) => {
        const a = (actions ?? []).find((x) => x.id === st.action_id);
        return {
          uid: `p-${Math.random().toString(36).slice(2, 10)}`,
          action_id: st.action_id,
          fields: a
            ? fieldsFromSchema(a.input_schema, st.input)
            : Object.entries(st.input ?? {}).map(([k, v]) => ({
                key: k,
                value: String(v),
                type: 'string',
              })),
          note: st.note ?? '',
          depends_on: st.depends_on ?? [],
        };
      }),
    );
    setEditingUid(null);
    setPlanResult(null);
  }

  function buildSteps(): PilotStepIn[] | null {
    const parsed: PilotStepIn[] = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.action_id) {
        setSubmitErr(`Passo ${i + 1}: escolha o que fazer.`);
        setEditingUid(s.uid);
        return null;
      }
      const deps = s.depends_on.filter((d) => d >= 0 && d < i);
      parsed.push({
        action_id: s.action_id,
        input: fieldsToInput(s.fields),
        note: s.note.trim() || undefined,
        depends_on: deps.length > 0 ? deps : undefined,
      });
    }
    return parsed;
  }

  async function preview() {
    setSubmitErr(null);
    setPlanResult(null);
    const parsed = buildSteps();
    if (!parsed) return;
    setPlanning(true);
    try {
      const r = await ActionTypes.plan(
        parsed.map((s) => ({ action_id: s.action_id, input: s.input })),
      );
      setPlanResult(r);
    } catch (e) {
      setSubmitErr(humanise(e));
    } finally {
      setPlanning(false);
    }
  }

  async function execute() {
    setSubmitErr(null);
    if (goal.trim().length < 3) {
      setSubmitErr('Descreva o objetivo (mínimo 3 caracteres).');
      return;
    }
    const parsed = buildSteps();
    if (!parsed) return;
    setSubmitting(true);
    try {
      const r = await Pilots.start(goal.trim(), parsed);
      setRun(r);
      hist.pushRun(r);
    } catch (e) {
      setSubmitErr(humanise(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="pilots-plan">
      <div
        className={
          isMobile
            ? 'flex flex-col gap-0'
            : 'grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-0'
        }
        data-testid="pilots-plan-grid"
        data-mobile={isMobile ? 'true' : 'false'}
      >
        {/* ───────────── ESQUERDA: objetivo + linha do tempo ───────────── */}
        <section
          className={
            isMobile
              ? 'p-4 border-b border-border-light space-y-5 min-w-0'
              : 'p-6 border-r border-border-light space-y-5 min-w-0'
          }
          data-testid="pilots-plan-composer"
        >
          {/* Objetivo */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Objetivo
            </Label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex.: descreva o objetivo do roteiro"
              className="h-10 bg-white text-[13px]"
              data-testid="pilots-plan-goal"
            />
          </div>

          {actionsErr && (
            <CpErrorState
              title="Falha ao carregar catálogo de ações"
              description={actionsErr}
              retry={refreshActions}
              diagnostic={{
                path: '/platform/v23/action-types',
                message: actionsErr,
              }}
            />
          )}

          {/* Linha do tempo de passos */}
          <ol className="space-y-0" data-testid="pilots-plan-steps">
            {steps.map((s, idx) => (
              <PlanStepCard
                key={s.uid}
                step={s}
                idx={idx}
                total={steps.length}
                actions={actions}
                actionOptions={actionOptions}
                editing={editingUid === s.uid}
                onToggleEdit={() =>
                  setEditingUid((cur) => (cur === s.uid ? null : s.uid))
                }
                onActionChange={(id) => onActionChange(s.uid, id)}
                onFieldsChange={(fields) => updateStep(s.uid, { fields })}
                onNoteChange={(note) => updateStep(s.uid, { note })}
                onRemove={() => removeStep(s.uid)}
                onMove={(dir) => moveStep(s.uid, dir)}
                onToggleDep={(depIdx) => toggleDep(s.uid, depIdx)}
              />
            ))}
          </ol>

          <button
            type="button"
            onClick={addStep}
            className="w-full flex items-center justify-center gap-2 h-10 border border-dashed border-border-light text-[12px] text-muted-on-light hover:border-primary hover:text-primary transition-colors"
            data-testid="pilots-plan-add-step"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Adicionar passo
          </button>

          {/* Modelos prontos */}
          <PlanTemplatesRow actions={actions} onApply={applyTemplate} />

          {submitErr && (
            <div
              className="px-3 py-2 text-[11.5px] text-danger bg-danger/5 border border-danger/30 flex items-center gap-2"
              data-testid="pilots-plan-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {submitErr}
            </div>
          )}

          {planResult && (
            <div
              className="bg-white border border-primary/30 p-3"
              data-testid="pilots-plan-preview-result"
            >
              <p className="text-[11px] font-semibold text-text-on-light mb-2">
                Pré-visualização
              </p>
              <ul className="space-y-1 text-[11.5px] text-text-on-light">
                <li className="flex items-center gap-2">
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-success"
                    strokeWidth={1.5}
                  />
                  Executam direto: {planResult.will_execute}/{planResult.total}
                </li>
                <li className="flex items-center gap-2">
                  <ClipboardCheck
                    className="w-3.5 h-3.5 text-primary"
                    strokeWidth={1.5}
                  />
                  Pedem aprovação: {planResult.will_request_approval}/
                  {planResult.total}
                </li>
                <li className="flex items-center gap-2">
                  <ShieldOff
                    className="w-3.5 h-3.5 text-warning"
                    strokeWidth={1.5}
                  />
                  Bloqueadas: {planResult.will_deny}/{planResult.total}
                </li>
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-3 border-t border-border-light">
            <Button
              variant="outline"
              onClick={() => void preview()}
              disabled={planning}
              className="h-10 text-[12.5px]"
              data-testid="pilots-plan-preview"
            >
              {planning ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <PlayCircle className="w-4 h-4" strokeWidth={1.5} />
              )}
              Pré-visualizar
            </Button>
            <Button
              variant="success"
              onClick={() => void execute()}
              disabled={submitting}
              className="h-10 text-[12.5px] flex-1 sm:flex-none"
              data-testid="pilots-plan-execute"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  Executando…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" strokeWidth={1.5} />
                  Executar roteiro
                </>
              )}
            </Button>
          </div>

          {/* Execução em curso desta sessão */}
          {run && (
            <div className="pt-2" data-testid="pilots-plan-run">
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
                Execução
              </p>
              <PilotTimeline
                run={run}
                approvals={hist.approvals}
                onResume={() => void hist.resumePilot(run.pilot_run_id)}
                resuming={hist.resuming === run.pilot_run_id}
              />
            </div>
          )}
        </section>

        {/* ───────────── DIREITA: histórico persistido ───────────── */}
        <PilotHistoryPanel hist={hist} isMobile={isMobile} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card de um passo na linha do tempo (Plano).                                */
/* -------------------------------------------------------------------------- */
function PlanStepCard({
  step,
  idx,
  total,
  actions,
  actionOptions,
  editing,
  onToggleEdit,
  onActionChange,
  onFieldsChange,
  onNoteChange,
  onRemove,
  onMove,
  onToggleDep,
}: {
  step: PlanStep;
  idx: number;
  total: number;
  actions: ActionTypeOut[] | null;
  actionOptions: SelectOption[];
  editing: boolean;
  onToggleEdit: () => void;
  onActionChange: (id: string) => void;
  onFieldsChange: (fields: PlanField[]) => void;
  onNoteChange: (note: string) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggleDep: (depIdx: number) => void;
}) {
  const selected = (actions ?? []).find((a) => a.id === step.action_id);
  const [showDeps, setShowDeps] = React.useState(step.depends_on.length > 0);

  const menuItems: OverflowMenuItem[] = [
    {
      key: 'up',
      label: 'Mover para cima',
      icon: ArrowUp,
      onSelect: () => onMove(-1),
      disabled: idx === 0,
    },
    {
      key: 'down',
      label: 'Mover para baixo',
      icon: ArrowDown,
      onSelect: () => onMove(1),
      disabled: idx === total - 1,
    },
    ...(idx > 0
      ? [
          {
            key: 'deps',
            label: showDeps ? 'Ocultar pré-requisitos' : 'Só começa depois de…',
            icon: GitBranch,
            onSelect: () => setShowDeps((v) => !v),
          } as OverflowMenuItem,
        ]
      : []),
    {
      key: 'remove',
      label: 'Remover passo',
      icon: Trash2,
      onSelect: onRemove,
      tone: 'danger',
      disabled: total <= 1,
    },
  ];

  return (
    <li className="relative pl-10" data-testid={`pilots-plan-step-${idx}`}>
      {/* Conector vertical entre passos */}
      {idx < total - 1 && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 bottom-0 w-px bg-border-light"
        />
      )}
      {/* Badge numerado */}
      <span
        aria-hidden
        className="absolute left-0 top-1 w-8 h-8 flex items-center justify-center border border-border-light bg-white text-[13px] font-semibold text-text-on-light"
      >
        {idx + 1}
      </span>

      <div className="bg-white border border-border-light mb-4">
        {/* Cabeçalho do card: título + editar + menu */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={onToggleEdit}
            className="min-w-0 flex-1 text-left flex items-center gap-2 group"
            data-testid={`pilots-plan-step-${idx}-edit`}
            aria-expanded={editing}
          >
            <span
              className={
                'text-[13px] font-semibold truncate ' +
                (selected ? 'text-text-on-light' : 'text-muted-on-light')
              }
            >
              {selected ? selected.name : 'Escolher ação'}
            </span>
            {!selected && (
              <Circle className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
            )}
            {step.depends_on.length > 0 && (
              <span
                className="text-[10px] text-muted-on-light flex items-center gap-1 shrink-0"
                data-testid={`pilots-plan-step-${idx}-deps-chip`}
              >
                <Network className="w-3 h-3" strokeWidth={1.5} />
                depois de{' '}
                {step.depends_on.map((d) => `passo ${d + 1}`).join(', ')}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onToggleEdit}
            className="p-1.5 text-muted-on-light hover:text-primary"
            title={editing ? 'Fechar edição' : 'Editar passo'}
            aria-label={editing ? 'Fechar edição' : 'Editar passo'}
            data-testid={`pilots-plan-step-${idx}-edit-icon`}
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <OverflowMenu
            ariaLabel={`Mais ações do passo ${idx + 1}`}
            items={menuItems}
            testIdPrefix={`pilots-plan-step-${idx}-menu`}
          />
        </div>

        {/* Corpo editável inline */}
        {editing && (
          <div
            className="border-t border-border-light p-3 space-y-3 bg-canvas-light"
            data-testid={`pilots-plan-step-${idx}-body`}
          >
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                O que fazer
              </Label>
              <SearchableSelect
                value={step.action_id}
                onChange={onActionChange}
                options={actionOptions}
                placeholder="Escolher ação"
                searchPlaceholder="Buscar ação…"
                emptyLabel="Nenhuma ação encontrada"
                data-testid={`pilots-plan-step-${idx}-action`}
              />
              {selected?.description && (
                <p className="text-[10.5px] text-muted-on-light leading-snug">
                  {selected.description}
                </p>
              )}
            </div>

            {/* Campos tipados — só quando a ação exige */}
            {selected && step.fields.length > 0 && (
              <div
                className="space-y-2"
                data-testid={`pilots-plan-step-${idx}-fields`}
              >
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  Informações do passo
                </Label>
                {step.fields.map((f, i) => (
                  <div key={f.key} className="space-y-0.5">
                    <Label className="text-[10.5px] text-muted-on-light normal-case tracking-normal">
                      {f.key}
                    </Label>
                    <Input
                      value={f.value}
                      onChange={(e) => {
                        const next = step.fields.slice();
                        next[i] = { ...next[i], value: e.target.value };
                        onFieldsChange(next);
                      }}
                      className="h-8 bg-white text-[12px]"
                      data-testid={`pilots-plan-step-${idx}-field-${f.key}`}
                    />
                  </div>
                ))}
              </div>
            )}
            {selected && step.fields.length === 0 && (
              <p className="text-[10.5px] text-muted-on-light italic">
                Este passo não precisa de informações extras.
              </p>
            )}

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                Nota (opcional)
              </Label>
              <Input
                value={step.note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Motivo da execução…"
                className="h-8 bg-white text-[12px]"
                data-testid={`pilots-plan-step-${idx}-note`}
              />
            </div>

            {/* Pré-requisitos — só pra passos depois do primeiro */}
            {idx > 0 && showDeps && (
              <div
                className="space-y-1.5"
                data-testid={`pilots-plan-step-${idx}-depends-wrap`}
              >
                <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
                  <GitBranch className="w-3 h-3" strokeWidth={1.5} />
                  Só começa depois de…
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: idx }).map((_, depIdx) => {
                    const active = step.depends_on.includes(depIdx);
                    return (
                      <button
                        key={depIdx}
                        type="button"
                        onClick={() => onToggleDep(depIdx)}
                        className={
                          'text-[11px] px-2 py-1 border ' +
                          (active
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border-light bg-white text-muted-on-light hover:text-text-on-light')
                        }
                        data-testid={`pilots-plan-step-${idx}-dep-${depIdx}`}
                        data-active={active ? 'true' : 'false'}
                      >
                        Passo {depIdx + 1}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-on-light leading-snug">
                  Deixe vazio para começar junto com os primeiros passos.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Linha de modelos prontos (Plano).                                          */
/* -------------------------------------------------------------------------- */
function PlanTemplatesRow({
  actions,
  onApply,
}: {
  actions: ActionTypeOut[] | null;
  onApply: (steps: PilotStepIn[], goal: string) => void;
}) {
  const [templates, setTemplates] = React.useState<
    Awaited<ReturnType<typeof Pilots.templates>> | null
  >(null);

  React.useEffect(() => {
    Pilots.templates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  if (!templates || templates.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="pilots-plan-templates">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Modelos prontos
      </span>
      <div className="flex flex-wrap gap-1.5">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => {
              const stepsIn: PilotStepIn[] = tpl.steps.map((s) => {
                const a = (actions ?? []).find(
                  (x) =>
                    s.action_code_ref_hint &&
                    x.code_ref
                      .toLowerCase()
                      .includes(s.action_code_ref_hint.toLowerCase()),
                );
                return {
                  action_id: a?.id ?? '',
                  input: s.input_hint,
                  note: s.note,
                };
              });
              onApply(stepsIn, tpl.goal);
            }}
            className="text-[11.5px] px-2.5 py-1 border border-border-light bg-white text-text-on-light hover:border-primary hover:text-primary"
            data-testid={`pilots-plan-template-${tpl.id}`}
            title={tpl.description}
          >
            {tpl.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Painel de histórico (compartilhado entre Plano e Avançado)                 */
/* ════════════════════════════════════════════════════════════════════════ */
function PilotHistoryPanel({
  hist,
  isMobile,
}: {
  hist: PilotHistory;
  isMobile: boolean;
}) {
  const merged = mergePilots(hist.history, hist.archive ?? []);
  return (
    <section
      className={
        isMobile ? 'p-4 space-y-3 min-w-0' : 'p-6 space-y-3 min-w-0'
      }
      data-testid="pilots-history"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-text-on-light">
          Roteiros executados
        </h2>
        <span className="text-[10px] font-mono text-muted-on-light">
          {hist.count} roteiro{hist.count === 1 ? '' : 's'}
        </span>
      </div>

      {hist.archiveErr && (
        <p
          className="text-[10.5px] font-mono text-danger"
          data-testid="pilots-archive-error"
        >
          {hist.archiveErr}
        </p>
      )}

      {hist.archive !== null &&
      hist.archive.length === 0 &&
      hist.history.length === 0 ? (
        <CpEmptyState
          icon={Workflow}
          title="Nenhum roteiro executado ainda"
          description="Monte um roteiro à esquerda: escreva o objetivo, escolha os passos e execute. Os roteiros executados ficam salvos e aparecem aqui quando você voltar."
        />
      ) : (
        <ul className="space-y-2" data-testid="pilots-history-list">
          {merged.map((entry) => {
            const id = entry.pilot_run_id;
            const expanded = hist.expandedId === id;
            const detail = hist.detailFor(entry);
            return (
              <li
                key={id}
                className="bg-white border border-border-light"
                data-testid={`pilots-run-${id}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    entry.kind === 'session'
                      ? hist.setExpandedId(expanded ? null : id)
                      : void hist.expandArchive(id)
                  }
                  className="w-full p-3 flex items-center justify-between gap-2 text-left hover:bg-canvas-light"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={entry.status} />
                      <span className="text-[12.5px] font-semibold text-text-on-light truncate">
                        {entry.goal}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-on-light mt-1">
                      {id.slice(0, 8)} · {formatDataHoraBR(entry.started_at)} ·{' '}
                      {entry.n_steps} passo{entry.n_steps === 1 ? '' : 's'} ·{' '}
                      {entry.initiated_by}
                    </p>
                  </div>
                  {expanded ? (
                    <ChevronUp
                      className="w-4 h-4 text-muted-on-light shrink-0"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <ChevronDown
                      className="w-4 h-4 text-muted-on-light shrink-0"
                      strokeWidth={1.5}
                    />
                  )}
                </button>

                {expanded && (
                  <div
                    className="border-t border-border-light p-3 bg-canvas-light"
                    data-testid={`pilots-run-${id}-detail`}
                  >
                    {detail ? (
                      <PilotTimeline
                        run={detail}
                        approvals={hist.approvals}
                        onResume={() => void hist.resumePilot(id)}
                        resuming={hist.resuming === id}
                      />
                    ) : hist.archiveLoading === id ? (
                      <p className="text-[11px] font-mono text-muted-on-light flex items-center gap-2">
                        <Loader2
                          className="w-3 h-3 animate-spin"
                          strokeWidth={1.5}
                        />
                        Carregando passos…
                      </p>
                    ) : (
                      <p className="text-[11px] font-mono text-muted-on-light">
                        Detalhe indisponível.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  MODO AVANÇADO — builder JSON + DAG depends_on (poder total)                */
/* ════════════════════════════════════════════════════════════════════════ */
function PilotAdvancedView({
  actions,
  actionsErr,
  refreshActions,
  hist,
  isMobile,
}: {
  actions: ActionTypeOut[] | null;
  actionsErr: string | null;
  refreshActions: () => void;
  hist: PilotHistory;
  isMobile: boolean;
}) {
  const [goal, setGoal] = React.useState('');
  const [steps, setSteps] = React.useState<BuilderStep[]>([newBuilderStep()]);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);

  function updateStep(uid: string, patch: Partial<BuilderStep>) {
    setSteps((cur) => cur.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  }
  function removeStep(uid: string) {
    setSteps((cur) =>
      cur.length <= 1 ? cur : cur.filter((s) => s.uid !== uid),
    );
  }
  function addStep() {
    setSteps((cur) => [...cur, newBuilderStep()]);
  }
  function moveStep(uid: string, dir: -1 | 1) {
    setSteps((cur) => {
      const idx = cur.findIndex((s) => s.uid === uid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= cur.length) return cur;
      const copy = cur.slice();
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy.map((s, i) => ({
        ...s,
        depends_on: s.depends_on.filter((d) => d < i),
      }));
    });
  }
  function toggleDep(uid: string, depIdx: number) {
    setSteps((cur) =>
      cur.map((s) => {
        if (s.uid !== uid) return s;
        const exists = s.depends_on.includes(depIdx);
        return {
          ...s,
          depends_on: exists
            ? s.depends_on.filter((d) => d !== depIdx)
            : [...s.depends_on, depIdx].sort((a, b) => a - b),
        };
      }),
    );
  }

  async function submit() {
    setSubmitErr(null);
    if (goal.trim().length < 3) {
      setSubmitErr('Descreva o objetivo (mínimo 3 caracteres).');
      return;
    }
    if (steps.length === 0) {
      setSubmitErr('Adicione pelo menos um passo.');
      return;
    }
    const parsed: PilotStepIn[] = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.action_id) {
        setSubmitErr(`Passo ${i + 1}: selecione o que fazer.`);
        return;
      }
      let payload: Record<string, unknown> = {};
      try {
        payload = s.input_text.trim() ? JSON.parse(s.input_text) : {};
      } catch {
        setSubmitErr(`Passo ${i + 1}: JSON de entrada inválido.`);
        return;
      }
      const deps = s.depends_on.filter((d) => d >= 0 && d < i);
      parsed.push({
        action_id: s.action_id,
        input: payload,
        note: s.note.trim() || undefined,
        depends_on: deps.length > 0 ? deps : undefined,
      });
    }

    setSubmitting(true);
    try {
      const run = await Pilots.start(goal.trim(), parsed);
      hist.pushRun(run);
    } catch (e) {
      setSubmitErr(humanise(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={
        isMobile
          ? 'flex flex-col gap-0'
          : 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-0'
      }
      data-testid="pilots-grid"
      data-mobile={isMobile ? 'true' : 'false'}
    >
      {/* ─────────────────────── ESQUERDA: Builder ─────────────────────── */}
      <section
        className={
          isMobile
            ? 'p-4 border-b border-border-light space-y-4 min-w-0'
            : 'p-6 border-r border-border-light space-y-4 min-w-0'
        }
        data-testid="pilots-builder"
      >
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            Objetivo do roteiro
          </Label>
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Ex.: descreva o objetivo do roteiro"
            className="h-9 bg-white"
            data-testid="pilots-goal"
          />
        </div>

        {actionsErr && (
          <CpErrorState
            title="Falha ao carregar catálogo de ações"
            description={actionsErr}
            retry={refreshActions}
            diagnostic={{
              path: '/platform/v23/action-types',
              message: actionsErr,
            }}
          />
        )}

        <div className="space-y-3" data-testid="pilots-steps">
          {steps.map((s, idx) => {
            const selectedAction = actions?.find((a) => a.id === s.action_id);
            return (
              <div
                key={s.uid}
                className="bg-white border border-border-light p-3 space-y-2"
                data-testid={`pilots-step-${idx}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono">
                    Passo {idx + 1}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveStep(s.uid, -1)}
                      disabled={idx === 0}
                      className="p-1 text-muted-on-light hover:text-text-on-light disabled:opacity-30"
                      title="Mover para cima"
                      data-testid={`pilots-step-${idx}-up`}
                    >
                      <ArrowUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(s.uid, 1)}
                      disabled={idx === steps.length - 1}
                      className="p-1 text-muted-on-light hover:text-text-on-light disabled:opacity-30"
                      title="Mover para baixo"
                      data-testid={`pilots-step-${idx}-down`}
                    >
                      <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(s.uid)}
                      disabled={steps.length <= 1}
                      className="p-1 text-danger hover:bg-danger/10 disabled:opacity-30"
                      title="Remover passo"
                      data-testid={`pilots-step-${idx}-remove`}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    O que fazer
                  </Label>
                  <select
                    value={s.action_id}
                    onChange={(e) =>
                      updateStep(s.uid, { action_id: e.target.value })
                    }
                    className="h-9 bg-white border border-border-light px-2 text-[12px] w-full font-mono rounded-none focus:border-primary outline-none"
                    data-testid={`pilots-step-${idx}-action`}
                  >
                    <option value="">— selecione —</option>
                    {(actions ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.auto_approvable ? ' · auto' : ' · requer aprovação'}
                      </option>
                    ))}
                  </select>
                  {selectedAction && (
                    <p className="text-[10px] font-mono text-muted-on-light mt-1">
                      {selectedAction.code_ref}
                      {selectedAction.description &&
                        ` · ${selectedAction.description}`}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Entrada (JSON, opcional)
                  </Label>
                  <textarea
                    value={s.input_text}
                    onChange={(e) =>
                      updateStep(s.uid, { input_text: e.target.value })
                    }
                    rows={3}
                    className="w-full font-mono text-[11px] bg-white border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
                    data-testid={`pilots-step-${idx}-input`}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Nota (opcional)
                  </Label>
                  <Input
                    value={s.note}
                    onChange={(e) => updateStep(s.uid, { note: e.target.value })}
                    placeholder="Motivo da execução…"
                    className="h-8 bg-white"
                    data-testid={`pilots-step-${idx}-note`}
                  />
                </div>

                {/* pré-requisitos (passos que precisam concluir antes) */}
                {idx > 0 && (
                  <div
                    className="space-y-1"
                    data-testid={`pilots-step-${idx}-depends-wrap`}
                  >
                    <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                      Só começa depois de…
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: idx }).map((_, depIdx) => {
                        const active = s.depends_on.includes(depIdx);
                        return (
                          <button
                            key={depIdx}
                            type="button"
                            onClick={() => toggleDep(s.uid, depIdx)}
                            className={
                              'text-[10.5px] font-mono px-1.5 py-0.5 border ' +
                              (active
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border-light bg-white text-muted-on-light hover:text-text-on-light')
                            }
                            data-testid={`pilots-step-${idx}-dep-${depIdx}`}
                            data-active={active ? 'true' : 'false'}
                          >
                            #{depIdx + 1}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-on-light leading-snug">
                      Deixe vazio para começar junto com os primeiros passos.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          onClick={addStep}
          className="h-8 text-[12px]"
          data-testid="pilots-add-step"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          Adicionar passo
        </Button>

        {submitErr && (
          <div
            className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30"
            data-testid="pilots-submit-error"
          >
            {submitErr}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border-light">
          <Button
            variant="success"
            onClick={submit}
            disabled={submitting}
            className="h-9"
            data-testid="pilots-submit"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                Executando…
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
                Executar roteiro
              </>
            )}
          </Button>
        </div>
      </section>

      {/* ─────────────────────── DIREITA: Histórico ─────────────────────── */}
      <PilotHistoryPanel hist={hist} isMobile={isMobile} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Componentes de status / timeline (compartilhados)                          */
/* ════════════════════════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: string }) {
  const style =
    status === 'SUCCESS'
      ? 'border-success/40 text-success bg-success/5'
      : status === 'FAILED'
        ? 'border-danger/40 text-danger bg-danger/5'
        : status === 'PAUSED'
          ? 'border-primary/40 text-primary bg-primary/5'
          : 'border-border-light text-muted-on-light bg-canvas-light';
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 border ${style}`}
      data-testid="pilots-status-badge"
    >
      {statusLabel(status)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
function PilotTimeline({
  run,
  approvals,
  onResume,
  resuming,
}: {
  run: PilotRunOut;
  approvals: Record<string, CPApproval>;
  onResume: () => void;
  resuming: boolean;
}) {
  // Operador só pode retomar quando o pilot está PAUSED e o approval
  // correspondente ao step pendente foi resolvido (=approved).
  const pendingStep = run.steps.find((s) => s.status === 'PENDING_APPROVAL');
  const pendingApproval = pendingStep?.approval_id
    ? approvals[pendingStep.approval_id]
    : undefined;
  const canResume =
    run.status === 'PAUSED' &&
    pendingStep != null &&
    pendingApproval?.status === 'approved';
  const approvalStatusHint =
    run.status === 'PAUSED' && pendingApproval ? pendingApproval.status : null;

  return (
    <div className="space-y-2" data-testid="pilots-timeline-wrap">
      {run.status === 'PAUSED' && (
        <div
          className="flex items-center justify-between gap-3 px-2.5 py-2 bg-primary/5 border border-primary/30"
          data-testid="pilots-resume-bar"
        >
          <div className="text-[11px] text-text-on-light leading-snug flex items-center gap-1.5">
            <ClipboardCheck
              className="w-3.5 h-3.5 text-primary"
              strokeWidth={1.5}
            />
            {canResume ? (
              <>
                Aprovação concluída — pronto para retomar do passo{' '}
                {(pendingStep?.step_index ?? 0) + 1}.
              </>
            ) : (
              <>
                Roteiro pausado, aguardando a sua aprovação
                {approvalStatusHint === 'rejected'
                  ? ' (aprovação recusada)'
                  : ''}
                .
              </>
            )}
          </div>
          <Button
            variant="success"
            onClick={onResume}
            disabled={!canResume || resuming}
            className="h-7 text-[11px]"
            data-testid="pilots-resume-btn"
          >
            {resuming ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                Retomando…
              </>
            ) : (
              <>
                <RotateCw className="w-3 h-3" strokeWidth={1.5} />
                Retomar
              </>
            )}
          </Button>
        </div>
      )}

      <ol className="space-y-0" data-testid="pilots-timeline">
        {run.steps.map((step, i) => (
          <li
            key={step.step_index}
            className="relative pl-9"
            data-testid={`pilots-step-detail-${step.step_index}`}
          >
            {/* Conector vertical */}
            {i < run.steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 bottom-0 w-px bg-border-light"
              />
            )}
            {/* Ícone/badge numerado de status */}
            <span
              aria-hidden
              className="absolute left-0 top-0.5 w-7 h-7 flex items-center justify-center bg-white border border-border-light"
            >
              {stepIcon(step.status)}
            </span>

            <div className="bg-white border border-border-light p-2.5 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-text-on-light">
                  Passo {step.step_index + 1} · {step.action_name}
                </span>
                <StatusBadge status={step.status} />
                {step.duration_ms != null && (
                  <span className="text-[10px] font-mono text-muted-on-light">
                    {step.duration_ms} ms
                  </span>
                )}
                {step.depends_on && step.depends_on.length > 0 && (
                  <span
                    className="text-[10px] text-muted-on-light flex items-center gap-1"
                    data-testid={`pilots-step-detail-${step.step_index}-deps`}
                  >
                    <Network className="w-3 h-3" strokeWidth={1.5} />
                    depende de{' '}
                    {step.depends_on.map((d) => `passo ${d + 1}`).join(', ')}
                  </span>
                )}
              </div>
              {((step.output && Object.keys(step.output).length > 0) ||
                step.execution_id ||
                step.lineage_event_id) && (
                <details className="mt-1.5 group">
                  <summary className="text-[10px] uppercase tracking-wider text-muted-on-light cursor-pointer select-none hover:text-text-on-light list-none flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" strokeWidth={1.5} />
                    Detalhes técnicos
                  </summary>
                  {step.output && Object.keys(step.output).length > 0 && (
                    <pre className="text-[10.5px] font-mono mt-1.5 text-text-on-light whitespace-pre-wrap break-all bg-canvas-light border border-border-light p-1.5">
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  )}
                  {(step.execution_id || step.lineage_event_id) && (
                    <p className="text-[10px] font-mono text-muted-on-light mt-1.5">
                      {step.execution_id && (
                        <>execution={step.execution_id.slice(0, 8)} · </>
                      )}
                      {step.lineage_event_id && (
                        <>lineage={step.lineage_event_id.slice(0, 8)}</>
                      )}
                    </p>
                  )}
                </details>
              )}
              {step.status === 'PENDING_APPROVAL' && step.approval_id && (
                <div className="mt-2">
                  <Link
                    href={`/painel-de-controle/aprovacoes?approval_id=${encodeURIComponent(step.approval_id)}`}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    data-testid={`pilots-step-${step.step_index}-approval-link`}
                  >
                    <ClipboardCheck className="w-3 h-3" strokeWidth={1.5} />
                    Ver aprovação
                  </Link>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function stepIcon(status: string) {
  if (status === 'SUCCESS') {
    return <CheckCircle2 className="w-4 h-4 text-success" strokeWidth={1.5} />;
  }
  if (status === 'FAILED') {
    return <AlertCircle className="w-4 h-4 text-danger" strokeWidth={1.5} />;
  }
  if (status === 'PENDING_APPROVAL') {
    return <ClipboardCheck className="w-4 h-4 text-primary" strokeWidth={1.5} />;
  }
  if (status === 'POLICY_DENIED') {
    return <ShieldOff className="w-4 h-4 text-warning" strokeWidth={1.5} />;
  }
  return <Clock className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />;
}
