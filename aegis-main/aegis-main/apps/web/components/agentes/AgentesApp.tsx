"use client";

/**
 * /agentes — Agentes 24/7.
 *
 * Kanban da frota de agentes da tenant — workers (coletores) e AIPs
 * (síntese / broadcast). Mostra cron, status e histórico ao vivo.
 * Polling a cada 8s.
 *
 * Layout: 3 colunas agrupadas pelo último status (em execução /
 * ocioso / falhou). Cada card mostra: tipo, status, cron, último
 * run, botão "Rodar agora" e selector de cron.
 *
 * Cron é definido server-side via `security.agentes.edit`; execução
 * manual via `security.agentes.run`. Toda mudança emite LineageEvent.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  AppWindow,
  Clock,
  Cpu,
  Loader2,
  PlayCircle,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { PageShell } from "@/components/shell/page-shell";
import { CpEmptyState } from "@/components/control-panel/cp-empty-state";
import { CpHubSubnav } from "@/components/control-panel/cp-hub-subnav";
import { AGENTES_TABS } from "@/components/control-panel/hub-tabs";
import { RequirePerm } from "@/components/auth/require-perm";
import { ModalPortal } from "@/components/ui/modal-backdrop";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import {
  ConfirmProvider,
  useConfirm,
} from "@/components/dialog/confirm-dialog";
import { AgentConfigEditor } from "@/components/agentes/AgentConfigEditor";
import {
  friendlyAgentDescription,
  friendlyAgentDisplayName,
} from "@/lib/agentes/agentMeta";
import {
  AGENTES_SLUG,
  AGENTES_VIEW_PERM,
  readAgentsExperienceParams,
} from "@/lib/agentes/experience-defaults";
import { registerAppRoute } from "@/lib/pages/app-route-registry";
import { readPageChrome } from "@/components/pages-editor/page-config-adapter";
import {
  Agentes,
  type AgentOut,
  type AgentRunOut,
  type CronPreset,
} from "@/lib/api/agentes";
import { Pages, type RegisteredPage } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/auth/useAuth";
import { useT } from "@/lib/i18n/provider";
import { aipModelLabel } from "@/lib/aip/modelLabels";
import { cn } from "@/lib/cn";


/**
 * Fallback local da Page `agentes` — espelha o seed do backend
 * (`DEFAULT_PAGES['agentes']`). Resolve OTIMISTA: a rota parte daqui e refina
 * com a Page salva quando ela chega (status/perm/params editados em Páginas
 * passam a valer assim que o fetch resolve). Mantém a /agentes funcional
 * offline e sem flash de skeleton. Mesma forma da /aip-threads.
 */
const FALLBACK_PAGE: RegisteredPage = {
  slug: AGENTES_SLUG,
  title: "Agentes",
  route: "/agentes",
  status: "published",
  workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
  marking_requirements: [],
  iam_perm_required: AGENTES_VIEW_PERM,
  config: {
    mode: "app_route",
    experience_kind: "agents",
    note: "Frota de agentes 24/7 — kanban + execução em tempo real; não montável por widgets.",
  },
  last_edited_by: null,
  last_edited_at: null,
  created_at: null,
};


const CRON_LABELS: { key: CronPreset; label: string }[] = [
  { key: "off", label: "Sem cron" },
  { key: "every_15m", label: "A cada 15 min" },
  { key: "every_hour", label: "Toda hora" },
  { key: "every_6h", label: "A cada 6 h" },
  { key: "daily_6am_brt", label: "06:00 BRT diário" },
  { key: "daily_6pm_brt", label: "18:00 BRT diário" },
  { key: "weekly_monday_6am_brt", label: "Segunda 06:00 BRT" },
];


function humanise(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "Sem permissão para esta operação.";
    return e.message || `Erro HTTP ${e.status}`;
  }
  return e instanceof Error ? e.message : "Erro desconhecido.";
}


function agentLastStatus(a: AgentOut): string {
  // O backend exporta `status` (idle/running/failed/archived) e
  // `last_run_status` (run individual). Pra kanban a gente prefere
  // status corrente do agente; cai pro último run se vazio.
  return (a.status || a.last_run_status || "idle") as string;
}


function bucketByStatus(agents: AgentOut[]): {
  running: AgentOut[];
  idle: AgentOut[];
  failed: AgentOut[];
} {
  const running: AgentOut[] = [];
  const idle: AgentOut[] = [];
  const failed: AgentOut[] = [];
  for (const a of agents) {
    const last = agentLastStatus(a);
    if (last === "running" || last === "queued") {
      running.push(a);
    } else if (last === "error" || last === "failed") {
      failed.push(a);
    } else {
      idle.push(a);
    }
  }
  return { running, idle, failed };
}


/**
 * W8 (2026-06-28) — corpo da Página "Agentes" (frota 24/7 · kanban + execução).
 * Extraído de ``app/agentes/page.tsx`` e registrado como ROTA DE APLICAÇÃO
 * (``app_route``) no registry de Páginas: a Page ``agentes`` (slug salvo no
 * banco) é servida por este componente. A rota canônica passou a ser
 * ``/paginas/agentes/view`` — renderiza no shell do OPERADOR (AuthShell →
 * Sidenav) via ``getAppRouteComponent``. AgentesInner mantém a resolução da
 * Page (status/perm/params) + RequirePerm + estado arquivado.
 */
export function AgentesApp() {
  // ConfirmProvider local — dialog sharp de remoção (não é global no shell).
  return (
    <ConfirmProvider>
      <AgentesInner />
    </ConfirmProvider>
  );
}


function AgentesInner() {
  const t = useT();
  const confirm = useConfirm();
  const [agents, setAgents] = React.useState<AgentOut[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Page do registry (status/perm/params editáveis em Páginas). Resolve
  // OTIMISTA a partir do seed local; refina com a Page salva ao chegar.
  const [page, setPage] = React.useState<RegisteredPage>(FALLBACK_PAGE);
  const [selectedRuns, setSelectedRuns] = React.useState<{
    agent: AgentOut;
    runs: AgentRunOut[];
  } | null>(null);
  const [editingAgent, setEditingAgent] = React.useState<AgentOut | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const canRun = useCan("security.agentes.run");
  const canEdit = useCan("security.agentes.edit");

  const refetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAgents(await Agentes.list());
    } catch (e) {
      setError(humanise(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refetch();
    const t = setInterval(() => void refetch(), 8000);
    return () => clearInterval(t);
  }, [refetch]);

  // Resolve a Page salva (status/perm/params). Offline / sem registro / sem
  // perm de leitura do registry → mantém o seed local (FALLBACK_PAGE).
  React.useEffect(() => {
    let cancelled = false;
    Pages.get(AGENTES_SLUG)
      .then((p) => {
        if (!cancelled) setPage(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Defaults da frota (Page.config.params) — preenchidos com defaults seguros
  // quando ausentes. O board aplica a cadência default a agentes sem agenda.
  const fleet = React.useMemo(
    () => readAgentsExperienceParams(page.config),
    [page.config],
  );

  // LOTE3 — chrome da página (params.chrome): o operador pode ocultar até a
  // barra de título da própria frota em Páginas → "Moldura da página".
  const chrome = React.useMemo(
    () => readPageChrome(page.config),
    [page.config],
  );

  async function handleRun(agent: AgentOut) {
    try {
      await Agentes.manualRun(agent.id, "operator-trigger");
      await refetch();
    } catch (e) {
      setError(humanise(e));
    }
  }

  async function handleCron(agent: AgentOut, preset: CronPreset) {
    try {
      const next = await Agentes.setCron(agent.id, preset);
      setAgents((arr) => arr.map((a) => (a.id === agent.id ? next : a)));
    } catch (e) {
      setError(humanise(e));
    }
  }

  async function handleOpenRuns(agent: AgentOut) {
    try {
      const runs = await Agentes.runs(agent.id, 25);
      setSelectedRuns({ agent, runs });
    } catch (e) {
      setError(humanise(e));
    }
  }

  async function handleRemove(agent: AgentOut) {
    const ok = await confirm({
      title: t("agentes.remove.confirmTitle"),
      description: t("agentes.remove.confirmDescription"),
      dependencies: [friendlyAgentDisplayName(agent.slug, agent.name)],
      tone: "danger",
      confirmLabel: t("agentes.remove.action"),
    });
    if (!ok) return;
    setRemovingId(agent.id);
    try {
      await Agentes.uninstall(agent.id);
      setAgents((arr) => arr.filter((a) => a.id !== agent.id));
      toast.success(t("agentes.remove.success"));
    } catch (e) {
      toast.error(`${t("agentes.remove.error")} ${humanise(e)}`);
      setError(humanise(e));
    } finally {
      setRemovingId(null);
    }
  }

  const lanes = bucketByStatus(agents);

  // Perm da própria Page (editável em Páginas). Sem perm declarada → ainda
  // exige a perm canônica de leitura do kanban.
  const perm = page.iam_perm_required || AGENTES_VIEW_PERM;

  // Page arquivada em Páginas → operador não chega no kanban por esta rota.
  if (page.status === "archived") {
    return (
      <RequirePerm perm={perm}>
        <CpEmptyState
          icon={AppWindow}
          title={t("agentes.archived.title")}
          description={t("agentes.archived.description")}
        />
      </RequirePerm>
    );
  }

  // Rótulo PT-BR da cadência default da frota (reusa o mapa de cron presets).
  const fleetCronLabel =
    CRON_LABELS.find((c) => c.key === fleet.defaultCron)?.label ??
    fleet.defaultCron;

  return (
    <RequirePerm perm={perm}>
      <PageShell
        title="Agentes 24/7"
        subtitle={
          loading
            ? "Carregando…"
            : `${agents.length} agente${agents.length === 1 ? "" : "s"} de ingestão · agendamento e execução manual`
        }
        theme="light"
        hideHeader={chrome.hidePageHeader}
        subnav={<CpHubSubnav group="Agentes" tabs={AGENTES_TABS} />}
        toolbar={
          <>
            {canEdit && (
              <Link
                href="/agentes/catalog"
                data-testid="agentes-catalogo"
                className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
              >
                + Catálogo
              </Link>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
              )}
              Recarregar
            </button>
          </>
        }
      >
        <div className="h-full overflow-y-auto p-4 space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-[11px]">{error}</AlertDescription>
            </Alert>
          )}

          {/* Faixa de política da frota — lê Page.config.params. A cadência
              default é genuinamente aplicada a agentes sem agenda própria
              (ver AgentCard). "Ajustar" abre o configurador em Páginas. */}
          <div
            data-testid="agentes-fleet-policy"
            className="flex items-center gap-2 flex-wrap bg-canvas-light border border-border-light px-3 h-9"
          >
            <SlidersHorizontal
              className="w-3.5 h-3.5 text-muted-on-light shrink-0"
              strokeWidth={1.5}
            />
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
              {t("agents.fleetPolicy.label")}
            </span>
            <span className="text-[11px] text-muted-on-light">
              {t("agents.fleetPolicy.cadence")}:
            </span>
            <span
              data-testid="agentes-fleet-cron"
              className="text-[11px] font-mono text-text-on-light"
            >
              {fleetCronLabel}
            </span>
            {canEdit && (
              <Link
                href="/painel-de-controle/paginas/agentes/edit"
                data-testid="agentes-fleet-configure"
                className="ml-auto text-[11px] text-primary hover:underline underline-offset-2"
              >
                {t("agents.fleetPolicy.configure")}
              </Link>
            )}
          </div>

          {agents.length === 0 && !loading ? (
            <div className="bg-canvas-light border border-border-light p-8 flex flex-col items-center text-center gap-3">
              <Cpu className="w-10 h-10 text-muted-on-light" strokeWidth={1.5} />
              <p className="text-[13px] font-semibold text-text-on-light">
                Sem agentes instalados
              </p>
              <p className="text-[11px] text-muted-on-light max-w-md leading-relaxed">
                Agentes 24/7 puxam dados (RSS, redes sociais, fontes
                oficiais), monitoram fontes-alvo e disparam cenários no
                horário que você definir. Escolha um modelo no catálogo
                para começar.
              </p>
              {canEdit && (
                <Link
                  href="/agentes/catalog"
                  className="h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
                >
                  Catálogo de agentes
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KanbanLane
                title="Em execução"
                tone="info"
                agents={lanes.running}
                canRun={canRun}
                canEdit={canEdit}
                removingId={removingId}
                defaultCron={fleet.defaultCron}
                onRun={handleRun}
                onCron={handleCron}
                onOpen={handleOpenRuns}
                onEdit={setEditingAgent}
                onRemove={handleRemove}
              />
              <KanbanLane
                title="Ocioso / cron"
                tone="muted"
                agents={lanes.idle}
                canRun={canRun}
                canEdit={canEdit}
                removingId={removingId}
                defaultCron={fleet.defaultCron}
                onRun={handleRun}
                onCron={handleCron}
                onOpen={handleOpenRuns}
                onEdit={setEditingAgent}
                onRemove={handleRemove}
              />
              <KanbanLane
                title="Falhou"
                tone="danger"
                agents={lanes.failed}
                canRun={canRun}
                canEdit={canEdit}
                removingId={removingId}
                defaultCron={fleet.defaultCron}
                onRun={handleRun}
                onCron={handleCron}
                onOpen={handleOpenRuns}
                onEdit={setEditingAgent}
                onRemove={handleRemove}
              />
            </div>
          )}
        </div>

        {selectedRuns && (
          <RunsDrawer
            agent={selectedRuns.agent}
            runs={selectedRuns.runs}
            onClose={() => setSelectedRuns(null)}
          />
        )}

        {editingAgent && (
          <AgentConfigEditor
            agent={editingAgent}
            onClose={() => setEditingAgent(null)}
            onSaved={(next) => {
              setAgents((arr) => arr.map((a) => (a.id === next.id ? next : a)));
              setEditingAgent(null);
            }}
          />
        )}
      </PageShell>
    </RequirePerm>
  );
}


function KanbanLane({
  title,
  tone,
  agents,
  canRun,
  canEdit,
  removingId,
  defaultCron,
  onRun,
  onCron,
  onOpen,
  onEdit,
  onRemove,
}: {
  title: string;
  tone: "info" | "muted" | "danger";
  agents: AgentOut[];
  canRun: boolean;
  canEdit: boolean;
  removingId: string | null;
  defaultCron: CronPreset;
  onRun: (a: AgentOut) => void;
  onCron: (a: AgentOut, p: CronPreset) => void;
  onOpen: (a: AgentOut) => void;
  onEdit: (a: AgentOut) => void;
  onRemove: (a: AgentOut) => void;
}) {
  const headTone =
    tone === "info"
      ? "border-info text-info bg-info/10"
      : tone === "danger"
        ? "border-danger text-danger bg-danger/10"
        : "border-border-light text-muted-on-light bg-raised-light/40";
  return (
    <div
      data-testid={`agentes-coluna-${tone}`}
      className="flex flex-col bg-canvas-light border border-border-light"
    >
      <div
        className={cn(
          "h-8 px-3 border-b border-border-light flex items-center gap-2",
        )}
      >
        <span
          className={cn(
            "px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border",
            headTone,
          )}
        >
          {title}
        </span>
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1">
          {agents.length}
        </p>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {agents.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            canRun={canRun}
            canEdit={canEdit}
            removing={removingId === a.id}
            defaultCron={defaultCron}
            onRun={() => onRun(a)}
            onCron={(p) => onCron(a, p)}
            onOpen={() => onOpen(a)}
            onEdit={() => onEdit(a)}
            onRemove={() => onRemove(a)}
          />
        ))}
        {agents.length === 0 && (
          <div className="border border-dashed border-border-light p-3 text-center text-muted-on-light text-[11px] italic">
            Nada nesta coluna.
          </div>
        )}
      </div>
    </div>
  );
}


function AgentCard({
  agent,
  canRun,
  canEdit,
  removing,
  defaultCron,
  onRun,
  onCron,
  onOpen,
  onEdit,
  onRemove,
}: {
  agent: AgentOut;
  canRun: boolean;
  canEdit: boolean;
  removing: boolean;
  defaultCron: CronPreset;
  onRun: () => void;
  onCron: (p: CronPreset) => void;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  // Cards de coleta (worker) ganham botão "fontes"; AIPs ainda
  // usam prompts/system templates e essa edição não está autorizada.
  const isCollector = agent.kind === "worker";
  const friendlyName = friendlyAgentDisplayName(agent.slug, agent.name);
  const friendlyDesc = friendlyAgentDescription(agent.slug, agent.description);
  // W7 (GAP F) — o backend expõe `config.model` (slug cru) na frota. O operador
  // SEMPRE vê o codinome AIP (aipModelLabel), nunca o slug de vendor. Modelo
  // interno/desconhecido cai num placeholder neutro — nunca o slug.
  const rawModel =
    typeof agent.config?.model === "string" ? agent.config.model : null;
  const modelLabel = rawModel ? aipModelLabel(rawModel) || "—" : null;
  // Agente sem agenda própria herda a CADÊNCIA DEFAULT da frota
  // (Page.config.params), em vez do literal "off". Cada card continua
  // editável individualmente; selecionar persiste via onCron.
  const cron = (agent.cron || defaultCron) as CronPreset;
  const lastStatus = agent.last_run_status || "—";

  return (
    <div
      data-testid={`agente-card-${agent.slug}`}
      className="bg-white border border-border-light p-2.5 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-text-on-light truncate">
            {friendlyName}
          </p>
          <p className="text-[10px] font-mono text-muted-on-light truncate">
            {agent.slug}
          </p>
        </div>
        <Badge variant="outline" className="text-[9px] border-border-light text-muted-on-light">
          {agent.kind === "aip" ? "análise" : "coleta"}
        </Badge>
      </div>

      {friendlyDesc && (
        <p className="text-[11px] text-muted-on-light line-clamp-2 leading-relaxed">
          {friendlyDesc}
        </p>
      )}

      {modelLabel && (
        <div
          data-testid={`agente-model-${agent.slug}`}
          className="flex items-center gap-1 text-[10px] font-mono text-muted-on-light"
        >
          <Cpu className="h-3 w-3" strokeWidth={1.5} />
          {modelLabel}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-on-light">
          <Clock className="h-3 w-3" strokeWidth={1.5} />
          {agent.last_run_at
            ? `último: ${new Date(agent.last_run_at).toLocaleTimeString("pt-BR")} · ${lastStatus}`
            : "sem execuções"}
        </div>
        <div className="flex items-center gap-1">
          {isCollector && canEdit && (
            <button
              type="button"
              onClick={onEdit}
              data-testid={`agent-edit-${agent.slug}`}
              title="Editar fontes / palavras-chave"
              className="h-6 px-1.5 text-[10px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1"
            >
              <Settings className="h-3 w-3" strokeWidth={1.5} />
              fontes
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            data-testid={`agent-history-${agent.slug}`}
            className="h-6 px-1.5 text-[10px] bg-canvas-light border border-border-light hover:border-primary"
          >
            histórico
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onRemove}
              disabled={removing}
              data-testid={`agent-remove-${agent.id}`}
              title={t("agentes.remove.action")}
              aria-label={t("agentes.remove.action")}
              className="h-6 px-1.5 text-[10px] bg-canvas-light border border-border-light text-danger hover:border-danger disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {removing ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <Trash2 className="h-3 w-3" strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={cron}
          onChange={(e) => onCron(e.target.value as CronPreset)}
          disabled={!canEdit}
          aria-label="Cron preset"
          className="border border-border-light bg-white text-[11px] px-2 py-1 flex-1 disabled:opacity-60"
        >
          {CRON_LABELS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {canRun && (
          <button
            type="button"
            onClick={onRun}
            data-testid={`agente-run-${agent.id}`}
            className="h-7 px-2 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1"
          >
            <PlayCircle className="h-3 w-3" strokeWidth={1.5} />
            Rodar
          </button>
        )}
      </div>
    </div>
  );
}


// Status do run → rótulo PT-BR + paleta
const RUN_STATUS_META: Record<string, { label: string; tone: string }> = {
  queued: { label: "na fila", tone: "border-border-light text-muted-on-light" },
  running: { label: "em execução", tone: "border-info text-info bg-info/10" },
  done: { label: "concluída", tone: "border-success text-success bg-success/10" },
  error: { label: "falhou", tone: "border-danger text-danger bg-danger/10" },
  failed: { label: "falhou", tone: "border-danger text-danger bg-danger/10" },
  cancelled: { label: "cancelada", tone: "border-border-light text-muted-on-light" },
};


function RunsDrawer({
  agent,
  runs,
  onClose,
}: {
  agent: AgentOut;
  runs: AgentRunOut[];
  onClose: () => void;
}) {
  return (
    <ModalPortal>
    <div
      className="fixed inset-0 ds-overlay z-50 flex justify-end"
      onClick={onClose}
      data-testid="agente-runs-drawer"
    >
      <div
        className="w-full max-w-[520px] h-full bg-canvas-light border-l border-border-light overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-light p-4 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-on-light">
              {friendlyAgentDisplayName(agent.slug, agent.name)}
            </h2>
            <p className="text-[11px] text-muted-on-light">
              Histórico de execuções
            </p>
            <p className="text-[10px] text-muted-on-light mt-0.5">
              {runs.length === 0
                ? "sem execuções"
                : `${runs.length} última${runs.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-primary"
          >
            Fechar
          </button>
        </div>
        <div className="p-4 space-y-3">
          {runs.length === 0 && (
            <p className="text-[11px] text-muted-on-light italic">
              Nenhuma execução registrada ainda. Clique em &quot;Rodar&quot; no
              card do agente para disparar a primeira.
            </p>
          )}
          {runs.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}


function RunCard({ run }: { run: AgentRunOut }) {
  const meta = RUN_STATUS_META[run.status] || RUN_STATUS_META.queued;

  const fmtTs = (ts: string | null | undefined) => {
    if (!ts) return null;
    try {
      return new Date(ts).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts.slice(0, 19);
    }
  };

  const duration =
    run.started_at && run.finished_at
      ? Math.max(0, new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())
      : null;

  return (
    <div className="bg-white border border-border-light p-3 space-y-2">
      {/* Header: status + duração */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border",
            meta.tone,
          )}
        >
          {meta.label}
        </span>
        {duration != null && (
          <span className="ml-auto text-[10px] font-mono text-muted-on-light">
            {duration}ms
          </span>
        )}
      </div>

      {/* Tempos */}
      <div className="text-[11px] text-text-on-light grid grid-cols-2 gap-x-3 gap-y-0.5">
        {run.queued_at && (
          <>
            <span className="text-muted-on-light">Enfileirada</span>
            <span className="font-mono">{fmtTs(run.queued_at)}</span>
          </>
        )}
        {run.started_at && (
          <>
            <span className="text-muted-on-light">Iniciada</span>
            <span className="font-mono">{fmtTs(run.started_at)}</span>
          </>
        )}
        {run.finished_at && (
          <>
            <span className="text-muted-on-light">Finalizada</span>
            <span className="font-mono">{fmtTs(run.finished_at)}</span>
          </>
        )}
      </div>

      {/* Resumo / output */}
      {run.output_summary && (
        <p className="text-[11px] text-text-on-light bg-raised-light/40 border border-border-light px-2 py-1 leading-relaxed">
          {run.output_summary}
        </p>
      )}

      {/* Erro */}
      {run.error_trace && (
        <div className="border border-danger/30 bg-danger/5 px-2 py-1.5">
          <div className="flex items-start gap-1.5 text-danger text-[11px]">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" strokeWidth={1.5} />
            <span className="break-all leading-relaxed font-mono">
              {run.error_trace}
            </span>
          </div>
        </div>
      )}

      {/* Lineage event id */}
      {run.lineage_event_id && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted-on-light hover:text-text-on-light select-none">
            lineage
          </summary>
          <div className="mt-1 font-mono text-muted-on-light">
            event_id: {run.lineage_event_id}
          </div>
        </details>
      )}
    </div>
  );
}

// silence unused imports
void Button;

// Auto-registro: importar este módulo torna o slug ``agentes`` resolvível como
// rota de aplicação. A view canônica ``/paginas/agentes/view`` resolve por aqui
// via getAppRouteComponent (render no shell do operador).
registerAppRoute(AGENTES_SLUG, AgentesApp);
