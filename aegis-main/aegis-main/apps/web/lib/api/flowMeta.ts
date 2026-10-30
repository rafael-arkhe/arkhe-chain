/**
 * Apresentação amigável dos fluxos para o operador.
 *
 * Traduz tipos de passo (trigger.cron, agent.worker-news, etc.) para
 * rótulos PT-BR e gera frase humana resumindo o que cada passo
 * produziu — sem JSON na cara do operador, sem nomes técnicos.
 *
 * Portado de politicians-app/lib/campaign/flowMeta.ts.
 */

import type { FlowRunOut } from "./flows"

export const NODE_TYPE_LABEL: Record<string, string> = {
  // Gatilhos
  "trigger.cron":     "Início — agendado",
  "trigger.manual":   "Início — manual",
  "trigger.on-event": "Início — quando entra um sinal",
  "trigger.webhook":  "Início — chamada externa",

  // Agentes (chamam coletores)
  "agent.worker-news":         "Coletor de Notícias",
  "agent.worker-legislativo":  "Coletor do Congresso",
  "agent.worker-x":            "Coletor X (Twitter)",
  "agent.worker-ig":           "Coletor Instagram",
  "agent.aip-call":            "Análise / IA",
  "agent.votacao-detalhada":   "Votação detalhada (Câmara)",
  "agent.mcp.invoke":          "Coletor MCP genérico",

  // Transformações
  "xform.filter":     "Filtro",
  "xform.limit":      "Limitar quantidade",
  "xform.sort":       "Ordenar",
  "xform.summarize":  "Resumo (IA)",
  "xform.classify":   "Classificação (IA)",

  // Lógica
  "cond.if":          "Condição (Se / Senão)",

  // Variáveis
  "var.set":          "Definir variável",

  // Saídas
  "out.task.create":      "Criar tarefa",
  "out.proposal.create":  "Enviar proposta para aprovação",
  "out.brief.append":     "Anexar ao próximo brief",
  "out.broadcast":        "Publicar nos canais",
  "out.toast":            "Notificar o operador",
  "out.email":            "Enviar e-mail",
  "out.entity.upsert":    "Salvar entity na ontologia",
}

export const NODE_TYPE_FAMILY_LABEL: Record<string, string> = {
  trigger: "Gatilho",
  agent:   "Coletor",
  xform:   "Transformação",
  cond:    "Lógica",
  var:     "Variável",
  out:     "Ação",
}


/** Status PT-BR visíveis ao operador. */
export const RUN_STATUS_LABEL: Record<string, string> = {
  queued:    "na fila",
  running:   "em execução",
  done:      "concluída",
  failed:    "falhou",
  cancelled: "cancelada",
  skipped:   "pulada",
  idle:      "aguardando",
}

export const RUN_STATUS_TONE: Record<string, string> = {
  queued:    "bg-zinc-50 text-zinc-700 border-zinc-300",
  running:   "bg-sky-50 text-sky-800 border-sky-300",
  done:      "bg-emerald-50 text-emerald-700 border-emerald-300",
  failed:    "bg-rose-50 text-rose-700 border-rose-300",
  cancelled: "bg-zinc-50 text-zinc-500 border-zinc-300",
  skipped:   "bg-zinc-50 text-zinc-500 border-zinc-300",
  idle:      "bg-white text-zinc-600 border-zinc-300",
}


/** Preset de cron PT-BR. */
export const CRON_PRESET_LABEL: Record<string, string> = {
  off:                   "desligado",
  every_15m:             "a cada 15 minutos",
  every_hour:            "toda hora",
  every_6h:              "a cada 6 horas",
  daily_morning_6am_brt: "diário · 06:00 BRT",
  daily_evening_6pm_brt: "diário · 18:00 BRT",
  weekly_monday_6am_brt: "segunda · 06:00 BRT",
}


/** Frase humana descrevendo o gatilho do fluxo. */
export function describeTrigger(
  trigger: { type?: string; config?: Record<string, unknown> } | undefined,
): string {
  if (!trigger || !trigger.type) return "manual"
  if (trigger.type === "manual") return "execução manual"
  if (trigger.type === "cron") {
    const preset = String((trigger.config || {}).preset || "")
    return CRON_PRESET_LABEL[preset] || "agendado"
  }
  if (trigger.type === "on-event") return "quando entra um sinal"
  if (trigger.type === "webhook") return "chamada externa"
  return trigger.type
}


/** Resumo humano do output de um passo, por tipo. */
export function describeStepOutput(
  nodeType: string,
  output: unknown,
): { headline: string; details: string[] } {
  if (output == null || typeof output !== "object") {
    return { headline: "Sem dados", details: [] }
  }
  const o = output as Record<string, unknown>

  // Trigger — apenas confirma que disparou
  if (nodeType.startsWith("trigger.")) {
    const kind = String((o as { trigger_kind?: string }).trigger_kind || "")
    if (kind === "cron") return { headline: "Disparado pelo agendamento.", details: [] }
    if (kind === "manual") return { headline: "Disparado manualmente.", details: [] }
    return { headline: "Início do fluxo.", details: [] }
  }

  // Agentes de coleta
  if (nodeType === "agent.worker-news" || nodeType === "agent.worker-legislativo") {
    const fetched = Number(o.fetched ?? 0)
    const matched = Number(o.matched ?? 0)
    const ingested = Number(o.ingested ?? 0)
    const skipped = Number(o.skipped_existing ?? 0)
    const lines = [
      `${fetched} item${fetched === 1 ? "" : "s"} consultado${fetched === 1 ? "" : "s"} na fonte`,
    ]
    if (matched && matched !== fetched) lines.push(`${matched} bateram com as palavras-chave`)
    lines.push(
      ingested > 0
        ? `${ingested} novo${ingested === 1 ? "" : "s"} ingerido${ingested === 1 ? "" : "s"} no feed`
        : "nenhum novo desta vez",
    )
    if (skipped > 0) lines.push(`${skipped} já estava${skipped === 1 ? "" : "m"} no feed (ignorados)`)
    const headline = ingested === 0
      ? "Nenhum sinal novo"
      : ingested === 1
        ? "1 sinal novo"
        : `${ingested} sinais novos`
    return { headline, details: lines }
  }

  if (nodeType === "agent.votacao-detalhada") {
    const count = Number(o.count ?? 0)
    const byVoto = (o.summary_by_voto as Record<string, number>) || {}
    const lines: string[] = []
    if (o.votacao_id) lines.push(`Votação ${String(o.votacao_id)}`)
    for (const [k, v] of Object.entries(byVoto)) {
      lines.push(`${k}: ${v}`)
    }
    return {
      headline: count === 0
        ? "Sem votos retornados (votação não-nominal ou ID inválido)"
        : count === 1 ? "1 voto" : `${count} votos`,
      details: lines,
    }
  }

  if (nodeType === "agent.worker-x" || nodeType === "agent.worker-ig") {
    const ingested = Number(o.ingested ?? 0)
    const lines: string[] = []
    if (o.handle) lines.push(`Conta acompanhada: ${String(o.handle)}`)
    lines.push(
      ingested > 0
        ? `${ingested} post${ingested === 1 ? "" : "s"} novo${ingested === 1 ? "" : "s"}`
        : "nenhum post novo",
    )
    const headline = ingested === 0
      ? "Nenhum post novo"
      : ingested === 1
        ? "1 post novo"
        : `${ingested} posts novos`
    return { headline, details: lines }
  }

  // Transformações
  if (nodeType === "xform.filter") {
    const kept = Number(o.count ?? 0)
    const total = Number(o.kept_of ?? kept)
    return {
      headline: `${kept} item${kept === 1 ? "" : "s"} passou${kept === 1 ? "" : "ram"} no filtro`,
      details: total > kept ? [`de ${total} testados`] : [],
    }
  }
  if (nodeType === "xform.limit" || nodeType === "xform.sort") {
    const count = Number(o.count ?? 0)
    return { headline: `${count} item${count === 1 ? "" : "s"}`, details: [] }
  }

  // Condição
  if (nodeType === "cond.if") {
    const branch = String(o.branch || "")
    if (branch === "yes") return { headline: "Condição verdadeira → seguiu pelo SIM", details: [] }
    if (branch === "no")  return { headline: "Condição falsa → parou aqui", details: [] }
    return { headline: "Condição avaliada", details: [] }
  }

  // Variável
  if (nodeType === "var.set") {
    return {
      headline: `Variável "${String(o.key || "?")}" definida`,
      details: [],
    }
  }

  // Saídas
  if (nodeType === "out.task.create") {
    return {
      headline: `Tarefa criada — prioridade ${String(o.priority || "normal")}`,
      details: o.title ? [`"${String(o.title).slice(0, 100)}"`] : [],
    }
  }
  if (nodeType === "out.proposal.create") {
    return { headline: "Proposta enviada para aprovação", details: [] }
  }
  if (nodeType === "out.brief.append") {
    return { headline: "Item anexado ao próximo brief", details: [] }
  }
  if (nodeType === "out.broadcast") {
    return { headline: "Publicação enfileirada (aguarda aprovação)", details: [] }
  }

  // Fallback genérico
  const keys = Object.keys(o).slice(0, 3)
  return { headline: "Concluído", details: keys.length ? [`Campos: ${keys.join(", ")}`] : [] }
}


/** Resumo do erro de um passo. */
export function describeStepError(error?: string | undefined): string | null {
  if (!error) return null
  const cleaned = String(error)
    .replace(/^Exception:\s*/, "")
    .replace(/^Traceback.*?\n/, "")
    .slice(0, 200)
  return cleaned
}


export interface NodeResultLike {
  status?: string
  started_at?: string
  finished_at?: string
  output?: unknown
  error?: string
  branch?: string
  reason?: string
}


/** Status humano da execução pra usar em headers/labels. */
export function describeRun(run: Pick<FlowRunOut, "status" | "started_at" | "finished_at" | "node_results">): {
  label: string
  durationMs: number | null
  stepsTotal: number
  stepsDone: number
  stepsFailed: number
} {
  const results = (run.node_results || {}) as Record<string, NodeResultLike>
  const stepsTotal = Object.keys(results).length
  let stepsDone = 0
  let stepsFailed = 0
  for (const r of Object.values(results)) {
    if (r?.status === "done") stepsDone += 1
    if (r?.status === "failed") stepsFailed += 1
  }
  let durationMs: number | null = null
  if (run.started_at && run.finished_at) {
    durationMs =
      new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  }
  return {
    label: RUN_STATUS_LABEL[run.status] || run.status,
    durationMs,
    stepsTotal,
    stepsDone,
    stepsFailed,
  }
}


export function formatDuration(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  return `${min} min ${sec} s`
}
