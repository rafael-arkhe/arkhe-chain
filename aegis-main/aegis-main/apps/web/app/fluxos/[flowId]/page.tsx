"use client"

/**
 * /fluxos/[flowId] — visualização do fluxo.
 *
 * Mostra o desenho (read-only) + últimas execuções + relatório legível
 * em PT-BR de cada passo da execução selecionada. Sem JSON, sem termo
 * técnico. Botões "Editar" e "Rodar agora" no topo.
 */

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  PlayCircle,
  RefreshCw,
} from "lucide-react"

import { PageShell } from "@/components/shell/page-shell"
import { RequirePerm } from "@/components/auth/require-perm"
import { Toaster, toast } from "@/components/ui/toast"
import { cn } from "@/lib/cn"
import { ApiError } from "@/lib/api/client"
import {
  Flows,
  type FlowOut,
  type FlowRunOut,
} from "@/lib/api/flows"
import {
  NODE_TYPE_LABEL,
  RUN_STATUS_LABEL,
  describeRun,
  describeStepError,
  describeStepOutput,
  describeTrigger,
  formatDuration,
  type NodeResultLike,
} from "@/lib/api/flowMeta"


// Reactflow é pesado (~80KB). Lazy load só nessa rota.
const FlowCanvas = dynamic(
  () => import("@/components/fluxos/FlowCanvas").then((m) => m.FlowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-muted-on-light text-[11px] gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando o desenho do fluxo…
      </div>
    ),
  },
)


/* -------------------------------------------------------------------------- */
/* Paleta sharp                                                               */
/* -------------------------------------------------------------------------- */
const STATUS_STYLE: Record<string, string> = {
  draft:    "border-warning text-warning bg-warning/10",
  active:   "border-success text-success bg-success/10",
  archived: "border-border-light text-muted-on-light bg-raised-light/40",
}

const RUN_TONE: Record<string, string> = {
  queued:    "border-border-light text-muted-on-light bg-raised-light/60",
  running:   "border-primary text-primary bg-primary/10",
  done:      "border-success text-success bg-success/10",
  failed:    "border-danger text-danger bg-danger/10",
  cancelled: "border-border-light text-muted-on-light bg-raised-light/60",
  skipped:   "border-border-light text-muted-on-light bg-raised-light/40",
  idle:      "border-border-light text-muted-on-light bg-raised-light/40",
}

const STEP_TONE: Record<string, string> = {
  done:    "border-l-success bg-success/5",
  failed:  "border-l-danger bg-danger/5",
  running: "border-l-primary bg-primary/5",
  skipped: "border-l-border-light bg-raised-light/40",
  idle:    "border-l-border-light bg-canvas-light",
}

const STATUS_LABEL: Record<string, string> = {
  draft:    "rascunho",
  active:   "ativo",
  archived: "arquivado",
}


function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message
  return e instanceof Error ? e.message : String(e)
}


function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—"
  try {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
  } catch { return ts.slice(0, 19) }
}


export default function FlowDetailPage() {
  return (
    <RequirePerm perm="security.fluxos.view">
      <FlowDetailInner />
    </RequirePerm>
  )
}


function FlowDetailInner() {
  const params = useParams<{ flowId: string }>()
  const flowId = params?.flowId as string

  const [flow, setFlow] = React.useState<FlowOut | null>(null)
  const [runs, setRuns] = React.useState<FlowRunOut[]>([])
  const [selectedRun, setSelectedRun] = React.useState<FlowRunOut | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const [f, rs] = await Promise.all([
        Flows.get(flowId),
        Flows.runs(flowId, 10),
      ])
      setFlow(f)
      setRuns(rs)
      if (rs.length > 0 && !selectedRun) {
        const detail = await Flows.runDetail(flowId, rs[0].id)
        setSelectedRun(detail)
      }
    } catch (e) {
      toast.error(humanise(e))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId])

  React.useEffect(() => {
    if (flowId) void refresh()
  }, [flowId, refresh])

  async function runNow() {
    if (!flow) return
    setBusy(true)
    try {
      const r = await Flows.run(flow.id, {})
      const detail = await Flows.runDetail(flow.id, r.id)
      setSelectedRun(detail)
      const all = await Flows.runs(flow.id, 10)
      setRuns(all)
      const lbl = RUN_STATUS_LABEL[r.status] || r.status
      if (r.status === "done") toast.success(`Execução ${lbl}.`)
      else if (r.status === "failed") toast.error(`Execução ${lbl}: ${r.error_message || "verifique os passos."}`)
      else toast(`Execução ${lbl}.`)
    } catch (e) {
      toast.error(humanise(e))
    } finally { setBusy(false) }
  }

  async function selectRun(rid: string) {
    if (!flow) return
    try {
      const detail = await Flows.runDetail(flow.id, rid)
      setSelectedRun(detail)
    } catch (e) {
      toast.error(humanise(e))
    }
  }

  if (loading || !flow) {
    return (
      <PageShell title="Fluxo" subtitle="Carregando…" theme="light">
        <div className="h-full flex items-center justify-center text-muted-on-light text-[11px] gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
        </div>
      </PageShell>
    )
  }

  const triggerLabel = describeTrigger(flow.trigger)
  const stepsCount = (flow.graph.nodes || []).length

  const subtitle = (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span
        className={cn(
          "px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border",
          STATUS_STYLE[flow.status] ?? STATUS_STYLE.draft,
        )}
      >
        {STATUS_LABEL[flow.status] ?? flow.status}
      </span>
      <span className="text-[10px] font-mono text-muted-on-light">
        gatilho: {triggerLabel}
      </span>
      <span className="text-[10px] font-mono text-muted-on-light">
        {stepsCount} passo{stepsCount === 1 ? "" : "s"}
      </span>
    </span>
  )

  return (
    <PageShell
      title={flow.name}
      subtitle={subtitle}
      theme="light"
      toolbar={
        <>
          <Link
            href="/fluxos"
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3 h-3" strokeWidth={1.5} /> Fluxos
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw
              className={cn("w-3 h-3", loading && "animate-spin")}
              strokeWidth={1.5}
            />
            Atualizar
          </button>
          <RequirePerm perm="security.fluxos.edit" fallback={null}>
            {flow.status !== "active" && (
              <Link
                href={`/fluxos/${flow.id}/editar`}
                className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
              >
                <Pencil className="w-3 h-3" strokeWidth={1.5} /> Editar
              </Link>
            )}
          </RequirePerm>
          <RequirePerm perm="security.fluxos.run" fallback={null}>
            <button
              type="button"
              onClick={() => void runNow()}
              disabled={busy || flow.status === "archived"}
              className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <PlayCircle className="w-3 h-3" strokeWidth={1.5} />
              )}
              {busy ? "Rodando…" : "Rodar agora"}
            </button>
          </RequirePerm>
        </>
      }
    >
      <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 p-3 overflow-hidden bg-panel-light">
        {/* ─── Desenho do fluxo ─────────────────────────── */}
        <section className="bg-canvas-light border border-border-light overflow-hidden flex flex-col min-h-[50vh] lg:min-h-0">
          <header className="h-9 px-3 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
              Desenho do fluxo
            </p>
            <p className="text-[10px] text-muted-on-light ml-2">
              setas verdes seguem quando a condição é verdadeira, vermelhas quando é falsa
            </p>
          </header>
          <div className="flex-1 min-h-[400px]">
            <FlowCanvas
              graph={flow.graph}
              nodeResults={(selectedRun?.node_results || {}) as Record<string, NodeResultLike & { status: string }>}
              readonly
            />
          </div>
        </section>

        {/* ─── Painel lateral ────────────────────────────── */}
        <aside className="flex flex-col gap-3 overflow-y-auto pr-1">
          <RunsList
            runs={runs}
            selectedId={selectedRun?.id || null}
            onSelect={selectRun}
          />
          {selectedRun && <RunReport run={selectedRun} flow={flow} />}
        </aside>
      </div>
      <Toaster theme="light" position="bottom-right" />
    </PageShell>
  )
}


/* -------------------------------------------------------------------------- */
/* Listagem de execuções                                                      */
/* -------------------------------------------------------------------------- */
function RunsList({
  runs, selectedId, onSelect,
}: {
  runs: FlowRunOut[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="bg-canvas-light border border-border-light">
      <header className="h-9 px-3 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light flex-1">
          Últimas execuções · {runs.length}
        </p>
      </header>
      <div className="divide-y divide-border-light/60">
        {runs.length === 0 && (
          <p className="px-3 py-4 text-[11px] text-muted-on-light italic">
            Nenhuma execução ainda. Clique em <span className="font-semibold">Rodar agora</span> no topo.
          </p>
        )}
        {runs.map((r) => {
          const desc = describeRun(r)
          const isSel = selectedId === r.id
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={cn(
                "w-full text-left px-3 py-2 transition-colors",
                isSel ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-raised-light/40 border-l-2 border-l-transparent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border",
                    RUN_TONE[r.status] ?? RUN_TONE.idle,
                  )}
                >
                  {desc.label}
                </span>
                <span className="text-[10px] font-mono text-muted-on-light">
                  {fmtTimestamp(r.started_at)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-text-on-light flex items-center gap-2 flex-wrap">
                <span>{desc.stepsDone}/{desc.stepsTotal} passos</span>
                {desc.stepsFailed > 0 && (
                  <span className="text-danger">· {desc.stepsFailed} com erro</span>
                )}
                {desc.durationMs != null && (
                  <span className="text-muted-on-light">· {formatDuration(desc.durationMs)}</span>
                )}
              </p>
              {r.error_message && (
                <p className="text-[10px] text-danger mt-0.5 line-clamp-2">
                  {describeStepError(r.error_message) || r.error_message}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}


/* -------------------------------------------------------------------------- */
/* Relatório legível por passo                                                */
/* -------------------------------------------------------------------------- */
function RunReport({
  run, flow,
}: {
  run: FlowRunOut
  flow: FlowOut
}) {
  const nodesById = React.useMemo(() => {
    const m = new Map<string, { type: string; label?: string }>()
    for (const n of flow.graph.nodes || []) {
      m.set(n.id, { type: n.type, label: n.label })
    }
    return m
  }, [flow.graph])

  const entries = Object.entries(
    (run.node_results || {}) as Record<string, NodeResultLike>,
  )

  return (
    <section className="bg-canvas-light border border-border-light">
      <header className="h-9 px-3 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light flex-1">
          O que cada passo entregou
        </p>
      </header>
      <div className="p-2 space-y-1.5">
        {entries.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-muted-on-light italic">
            Nenhum passo executado ainda.
          </p>
        )}
        {entries.map(([nid, res]) => (
          <StepReport
            key={nid}
            nodeId={nid}
            nodeType={nodesById.get(nid)?.type || ""}
            nodeLabel={nodesById.get(nid)?.label}
            result={res}
          />
        ))}
      </div>
    </section>
  )
}


function StepReport({
  nodeType, nodeLabel, result,
}: {
  nodeId: string
  nodeType: string
  nodeLabel?: string
  result: NodeResultLike
}) {
  const status = result?.status || "idle"
  const typeLabel = NODE_TYPE_LABEL[nodeType] || nodeType || "passo"
  const stepName =
    nodeLabel && nodeLabel !== typeLabel ? nodeLabel : typeLabel
  const isSkipped = status === "skipped"
  const isFailed = status === "failed"
  const isDone = status === "done"

  const summary = isDone
    ? describeStepOutput(nodeType, result?.output)
    : { headline: "", details: [] as string[] }
  const errorMsg = isFailed ? describeStepError(result?.error) : null

  let durationMs: number | null = null
  if (result?.started_at && result?.finished_at) {
    durationMs =
      new Date(result.finished_at).getTime() -
      new Date(result.started_at).getTime()
  }

  const Icon =
    isFailed  ? AlertTriangle
    : isDone  ? CheckCircle2
    : isSkipped ? Clock
    : Loader2

  const iconTone =
    isFailed   ? "text-danger"
    : isDone   ? "text-success"
    : isSkipped? "text-muted-on-light"
    : "text-primary"

  return (
    <div className={cn("border border-border-light border-l-2 px-2.5 py-2", STEP_TONE[status] ?? STEP_TONE.idle)}>
      <div className="flex items-start gap-2">
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", iconTone, status === "running" && "animate-spin")}
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-text-on-light truncate">
                {stepName}
              </p>
              <p className="text-[10px] text-muted-on-light">{typeLabel}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  "px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border",
                  RUN_TONE[status] ?? RUN_TONE.idle,
                )}
              >
                {RUN_STATUS_LABEL[status] || status}
              </span>
              {durationMs != null && (
                <span className="text-[9px] font-mono text-muted-on-light">
                  {formatDuration(durationMs)}
                </span>
              )}
            </div>
          </div>

          {isDone && summary.headline && (
            <p className="text-[12px] text-text-on-light mt-1.5 leading-relaxed">
              {summary.headline}
            </p>
          )}
          {isDone && summary.details.length > 0 && (
            <ul className="mt-1 text-[11px] text-muted-on-light space-y-0.5">
              {summary.details.map((d, i) => (
                <li key={i}>· {d}</li>
              ))}
            </ul>
          )}

          {isSkipped && (
            <p className="text-[11px] text-muted-on-light mt-1.5 italic">
              {result?.reason
                ? `Pulado: ${result.reason === "no active predecessor" ? "passo anterior não ativou esta saída." : result.reason}`
                : "Passo pulado pela lógica do fluxo."}
            </p>
          )}

          {isFailed && errorMsg && (
            <p className="text-[11px] text-danger mt-1.5 leading-relaxed">
              {errorMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
