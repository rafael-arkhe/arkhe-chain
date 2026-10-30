"use client"

/**
 * FlowCanvas — wrapper read-only do reactflow para o flow-builder.
 * Mostra o graph e pinta cada node de acordo com o status da run
 * selecionada (done / failed / skipped / running / pending).
 *
 * Portado de politicians-app/components/campaign/flows/FlowCanvas.tsx.
 */

import * as React from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "reactflow"
import "reactflow/dist/style.css"

import type { FlowGraph } from "@/lib/api/flows"
import {
  NODE_TYPE_FAMILY_LABEL,
  NODE_TYPE_LABEL,
  RUN_STATUS_LABEL,
} from "@/lib/api/flowMeta"


type NodeStatus =
  | "done"
  | "failed"
  | "skipped"
  | "running"
  | "pending"
  | "idle"


interface NodeResultMap {
  [nodeId: string]: {
    status: string
    error?: string
    branch?: string
    output?: unknown
    reason?: string
  }
}


function statusOf(nid: string, results: NodeResultMap): NodeStatus {
  const r = results[nid]
  if (!r) return "idle"
  if (r.status === "done") return "done"
  if (r.status === "failed") return "failed"
  if (r.status === "skipped") return "skipped"
  if (r.status === "running") return "running"
  return "idle"
}


const STATUS_BG: Record<NodeStatus, string> = {
  done: "border-success bg-success/10",
  failed: "border-danger bg-danger/10",
  skipped: "border-border-light bg-raised-light/40",
  running: "border-primary bg-primary/10",
  pending: "border-border-light bg-canvas-light",
  idle: "border-border-light bg-canvas-light",
}


const TYPE_TONE: Record<string, string> = {
  trigger: "text-warning",
  agent: "text-success",
  xform: "text-blue-700",
  cond: "text-violet-700",
  var: "text-text-on-light",
  out: "text-danger",
}


function FlowNodeView(props: NodeProps) {
  const { data } = props
  const status: NodeStatus = data.status || "idle"
  const rawType = String(data.type || "")
  const family = rawType.split(".")[0]
  const tone = TYPE_TONE[family] || "text-text-on-light"
  const familyLabel = NODE_TYPE_FAMILY_LABEL[family] || family
  const typeLabel = NODE_TYPE_LABEL[rawType] || rawType
  const stepName = data.label && data.label !== typeLabel ? data.label : typeLabel
  return (
    <div
      className={`min-w-[170px] max-w-[230px] border ${STATUS_BG[status]} px-3 py-2 shadow-sm`}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-on-light !w-1.5 !h-1.5" />
      <div className={`text-[9px] uppercase tracking-widest ${tone}`}>
        {familyLabel}
      </div>
      <div className="text-[12px] font-semibold text-text-on-light mt-0.5 leading-tight">
        {stepName}
      </div>
      {data.config_summary && (
        <div className="text-[10px] text-muted-on-light mt-1 line-clamp-2">
          {data.config_summary}
        </div>
      )}
      {status !== "idle" && (
        <div className="text-[9px] mt-1 uppercase tracking-wider text-muted-on-light">
          {RUN_STATUS_LABEL[status] || status}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-muted-on-light !w-1.5 !h-1.5" />
    </div>
  )
}


const NODE_TYPES = { campaignFlow: FlowNodeView }


// Resumo PT-BR do que cada passo está configurado a fazer.
function summarizeConfig(type: string, config: Record<string, unknown> | undefined): string {
  if (!config) return ""
  const t = type.split(".")[0]
  if (t === "agent") {
    const kw = config.keywords
    return kw ? `palavras-chave: ${String(kw).slice(0, 50)}` : ""
  }
  if (t === "trigger" && type === "trigger.cron") {
    const preset = String(config.preset || "?")
    const labels: Record<string, string> = {
      every_15m: "a cada 15 minutos",
      every_hour: "toda hora",
      every_6h: "a cada 6 horas",
      daily_morning_6am_brt: "diário · 06:00 BRT",
      daily_evening_6pm_brt: "diário · 18:00 BRT",
      weekly_monday_6am_brt: "segunda · 06:00 BRT",
    }
    return labels[preset] || preset
  }
  if (t === "cond") {
    const ast = config.condition as { var?: string; op?: string; value?: unknown } | undefined
    if (!ast?.var) return "verifica uma condição"
    const opLabels: Record<string, string> = {
      eq: "igual a", neq: "diferente de",
      gt: "maior que", lt: "menor que", gte: "≥", lte: "≤",
      contains: "contém", starts_with: "começa com", ends_with: "termina com",
      in: "está em", empty: "vazio",
    }
    const opLabel = opLabels[ast.op || ""] || ast.op || "?"
    return `${ast.var} ${opLabel} ${String(ast.value ?? "")}`
  }
  if (t === "out" && type === "out.task.create") {
    const p = String(config.priority || "normal")
    const labels: Record<string, string> = {
      normal: "prioridade normal",
      high: "prioridade alta",
      urgent: "prioridade urgente",
    }
    return labels[p] || p
  }
  return ""
}


export function FlowCanvas({
  graph,
  nodeResults,
  readonly = true,
}: {
  graph: FlowGraph
  nodeResults?: NodeResultMap
  readonly?: boolean
}) {
  const results = nodeResults || {}
  const nodes: Node[] = React.useMemo(
    () =>
      (graph.nodes || []).map((n, i) => ({
        id: n.id,
        type: "campaignFlow",
        position: n.position || { x: 80 + (i % 4) * 220, y: 60 + Math.floor(i / 4) * 140 },
        draggable: !readonly,
        data: {
          id: n.id,
          type: n.type,
          label: n.label,
          status: statusOf(n.id, results),
          config_summary: summarizeConfig(n.type, n.config as Record<string, unknown>),
        },
      })),
    [graph, results, readonly],
  )
  const edges: Edge[] = React.useMemo(
    () =>
      (graph.edges || []).map((e, i) => ({
        id: `e${i}-${e.from_node}-${e.to_node}-${e.branch || ""}`,
        source: e.from_node,
        target: e.to_node,
        label: e.branch ? (e.branch === "yes" ? "sim" : "não") : undefined,
        labelStyle: { fontSize: 10, fontFamily: "monospace" },
        style: e.branch === "no"
          ? { stroke: "#ef4444" }
          : e.branch === "yes"
          ? { stroke: "#10b981" }
          : { stroke: "#71717a" },
      })),
    [graph],
  )

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        edgesFocusable={!readonly}
        elementsSelectable={!readonly}
      >
        <Background gap={16} size={1} color="#e4e4e7" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#10b981" maskColor="rgba(244,244,245,0.7)" />
      </ReactFlow>
    </div>
  )
}
