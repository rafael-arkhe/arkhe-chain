"use client"

/**
 * /fluxos/[flowId]/editar — editor visual do fluxo.
 *
 * Layout 3-pane (Palantir-style): paleta esquerda · canvas centro
 * (reactflow editável) · inspetor direita (config do passo selecionado).
 *
 * Fluxo: drag-and-drop da paleta cria node novo no canvas; arrastar
 * de um handle cria edge; click num node abre o inspetor; "Salvar"
 * persiste graph atualizado.
 */

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Loader2,
  Save,
} from "lucide-react"
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "reactflow"
import "reactflow/dist/style.css"

import { PageShell } from "@/components/shell/page-shell"
import { RequirePerm } from "@/components/auth/require-perm"
import { Toaster, toast } from "@/components/ui/toast"
import { NodePalette } from "@/components/fluxos/NodePalette"
import { NodeInspector } from "@/components/fluxos/NodeInspector"
import { cn } from "@/lib/cn"
import { ApiError } from "@/lib/api/client"
import {
  Flows,
  type FlowOut,
  type FlowGraph,
  type FlowNode as FlowNodeT,
} from "@/lib/api/flows"
import {
  NODE_TYPE_FAMILY_LABEL,
  NODE_TYPE_LABEL,
} from "@/lib/api/flowMeta"


function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message
  return e instanceof Error ? e.message : String(e)
}


/* -------------------------------------------------------------------------- */
/* Editable node — sharp palette                                              */
/* -------------------------------------------------------------------------- */
function EditableNode(props: NodeProps) {
  const { data, selected } = props
  const family = String(data.type || "").split(".")[0]
  const familyLabel = NODE_TYPE_FAMILY_LABEL[family] || family
  const typeLabel = NODE_TYPE_LABEL[data.type] || data.type
  const stepName =
    data.label && data.label !== typeLabel ? data.label : typeLabel
  return (
    <div
      className={cn(
        "min-w-[170px] max-w-[230px] border bg-canvas-light px-3 py-2",
        selected
          ? "border-primary shadow-[0_0_0_2px_rgba(45,119,190,0.25)]"
          : "border-border-light",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-on-light !w-2 !h-2"
      />
      <div className="text-[9px] uppercase tracking-[0.16em] text-muted-on-light font-mono">
        {familyLabel}
      </div>
      <div className="text-[12px] font-semibold text-text-on-light mt-0.5 leading-tight">
        {stepName}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-on-light !w-2 !h-2"
      />
    </div>
  )
}


const NODE_TYPES = { campaignFlowEditable: EditableNode }


function genId(): string {
  return "n_" + Math.random().toString(36).slice(2, 10)
}


/* -------------------------------------------------------------------------- */
/* Inner editor (precisa estar dentro do ReactFlowProvider)                    */
/* -------------------------------------------------------------------------- */
function FlowEditorInner({
  flow, onSaved,
}: {
  flow: FlowOut
  onSaved: (next: FlowOut) => void
}) {
  const router = useRouter()
  const { screenToFlowPosition } = useReactFlow()

  const [nodes, setNodes] = React.useState<Node[]>(() =>
    (flow.graph.nodes || []).map((n) => ({
      id: n.id,
      type: "campaignFlowEditable",
      position: n.position || { x: 100, y: 100 },
      data: { id: n.id, type: n.type, label: n.label },
    })),
  )
  const [edges, setEdges] = React.useState<Edge[]>(() =>
    (flow.graph.edges || []).map((e, i) => ({
      id: `e${i}-${e.from_node}-${e.to_node}-${e.branch || ""}`,
      source: e.from_node,
      target: e.to_node,
      label: e.branch ? (e.branch === "yes" ? "sim" : "não") : undefined,
      labelStyle: { fontSize: 10, fontFamily: "monospace" },
      data: { branch: e.branch || null },
    })),
  )
  const [nodeConfigs, setNodeConfigs] = React.useState<
    Record<string, Pick<FlowNodeT, "config" | "label">>
  >(() => {
    const m: Record<string, Pick<FlowNodeT, "config" | "label">> = {}
    for (const n of flow.graph.nodes || []) {
      m[n.id] = { config: n.config || {}, label: n.label }
    }
    return m
  })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  function markDirty() { setDirty(true) }

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds))
      const meaningful = changes.some(
        (c) => c.type === "remove" || c.type === "position",
      )
      if (meaningful) markDirty()
    },
    [],
  )
  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
      const meaningful = changes.some((c) => c.type === "remove")
      if (meaningful) markDirty()
    },
    [],
  )
  const onConnect = React.useCallback(
    (conn: Connection) => {
      const sourceType = (flow.graph.nodes || []).find((n) => n.id === conn.source)?.type
      let branch: "yes" | "no" | null = null
      if (sourceType === "cond.if") {
        const existing = edges.filter((e) => e.source === conn.source)
        branch = existing.length === 0 ? "yes" : "no"
      }
      const newEdge: Edge = {
        id: `e${Date.now()}-${conn.source}-${conn.target}`,
        source: conn.source!,
        target: conn.target!,
        label: branch ? (branch === "yes" ? "sim" : "não") : undefined,
        labelStyle: { fontSize: 10, fontFamily: "monospace" },
        data: { branch },
      }
      setEdges((eds) => addEdge(newEdge, eds))
      markDirty()
    },
    [edges, flow.graph.nodes],
  )

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])
  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData("application/aegis-flow-node")
      if (!type) return
      const position = screenToFlowPosition({
        x: event.clientX, y: event.clientY,
      })
      const id = genId()
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: "campaignFlowEditable",
          position,
          data: { id, type, label: undefined },
        },
      ])
      setNodeConfigs((m) => ({ ...m, [id]: { config: {}, label: undefined } }))
      markDirty()
    },
    [screenToFlowPosition],
  )

  const selectedFullNode = React.useMemo<FlowNodeT | null>(() => {
    if (!selectedId) return null
    const n = nodes.find((x) => x.id === selectedId)
    if (!n) return null
    const cfg = nodeConfigs[selectedId] || { config: {}, label: undefined }
    return {
      id: n.id,
      type: n.data.type,
      label: cfg.label,
      position: n.position,
      config: cfg.config || {},
    }
  }, [selectedId, nodes, nodeConfigs])

  function applyNodeChange(next: FlowNodeT) {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === next.id
          ? { ...n, data: { ...n.data, label: next.label } }
          : n,
      ),
    )
    setNodeConfigs((m) => ({
      ...m,
      [next.id]: { config: next.config || {}, label: next.label },
    }))
    markDirty()
  }
  function deleteNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setNodeConfigs((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
    setSelectedId(null)
    markDirty()
  }

  function buildGraph(): FlowGraph {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.type,
        label: nodeConfigs[n.id]?.label,
        position: n.position,
        config: nodeConfigs[n.id]?.config || {},
      })),
      edges: edges.map((e) => ({
        from_node: e.source,
        to_node: e.target,
        branch: ((e.data || {}) as { branch?: "yes" | "no" }).branch || undefined,
      })),
    }
  }

  async function save() {
    setSaving(true)
    try {
      const graph = buildGraph()
      const next = await Flows.patch(flow.id, { graph })
      toast.success(`Fluxo salvo.`)
      setDirty(false)
      onSaved(next)
    } catch (e) {
      toast.error(humanise(e))
    } finally { setSaving(false) }
  }

  const subtitle = (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-muted-on-light">
        Arraste passos da paleta para o desenho · conecte puxando dos pontinhos · clique para configurar
      </span>
      {dirty && (
        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-warning text-warning bg-warning/10">
          alterações não salvas
        </span>
      )}
    </span>
  )

  return (
    <PageShell
      title={`Editar · ${flow.name}`}
      subtitle={subtitle}
      theme="light"
      toolbar={
        <>
          <Link
            href={`/fluxos/${flow.id}`}
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3 h-3" strokeWidth={1.5} /> Voltar
          </Link>
          <button
            type="button"
            onClick={() => router.push(`/fluxos/${flow.id}`)}
            disabled={saving}
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : (
              <Save className="w-3 h-3" strokeWidth={1.5} />
            )}
            Salvar
          </button>
        </>
      }
    >
      {/* Aviso pra mobile — drag-drop em telinha não é prático */}
      <div className="lg:hidden mx-3 mt-3 border border-warning bg-warning/10 px-3 py-2 text-[11px] text-text-on-light">
        <strong>Editor desenhado pra computador.</strong> Em celular ou
        tablet alguns botões e drag-drop ficam apertados. Use um computador
        para editar.
      </div>

      <div className="h-full grid grid-cols-1 lg:grid-cols-[260px_1fr_360px] gap-3 p-3 overflow-hidden bg-panel-light">
        {/* ─── Paleta ────────────────────────────────────── */}
        <section className="bg-canvas-light border border-border-light overflow-hidden flex flex-col min-h-0">
          <header className="h-9 px-3 border-b border-border-light bg-raised-light/40 flex items-center gap-2 shrink-0">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
              Paleta
            </p>
          </header>
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            <NodePalette />
          </div>
        </section>

        {/* ─── Canvas ────────────────────────────────────── */}
        <section className="bg-canvas-light border border-border-light overflow-hidden flex flex-col min-h-[50vh] lg:min-h-0">
          <header className="h-9 px-3 border-b border-border-light bg-raised-light/40 flex items-center gap-2 shrink-0">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
              Canvas
            </p>
            <p className="text-[10px] text-muted-on-light ml-2">
              {nodes.length} passo{nodes.length === 1 ? "" : "s"} · {edges.length} ligaç{edges.length === 1 ? "ão" : "ões"}
            </p>
          </header>
          <div className="flex-1 min-h-[400px]" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={16} size={1} color="#D7DBDF" />
              <Controls position="bottom-right" showInteractive={false} />
              <MiniMap pannable zoomable nodeColor="#2D77BE" maskColor="rgba(244,246,248,0.7)" />
            </ReactFlow>
          </div>
        </section>

        {/* ─── Inspetor ──────────────────────────────────── */}
        <section className="bg-canvas-light border border-border-light overflow-hidden flex flex-col min-h-0">
          <header className="h-9 px-3 border-b border-border-light bg-raised-light/40 flex items-center gap-2 shrink-0">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-text-on-light">
              Inspetor
            </p>
            {selectedFullNode && (
              <p className="text-[10px] text-muted-on-light truncate ml-2">
                {NODE_TYPE_LABEL[selectedFullNode.type] || selectedFullNode.type}
              </p>
            )}
          </header>
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            <NodeInspector
              node={selectedFullNode}
              graph={buildGraph()}
              tenantVariables={flow.variables}
              onChange={applyNodeChange}
              onDelete={deleteNode}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </section>
      </div>
      <Toaster theme="light" position="bottom-right" />
    </PageShell>
  )
}


/* -------------------------------------------------------------------------- */
/* Outer page                                                                  */
/* -------------------------------------------------------------------------- */
export default function FlowEditorPage() {
  return (
    <RequirePerm perm="security.fluxos.edit">
      <FlowEditorOuter />
    </RequirePerm>
  )
}


function FlowEditorOuter() {
  const params = useParams<{ flowId: string }>()
  const flowId = params?.flowId as string
  const [flow, setFlow] = React.useState<FlowOut | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!flowId) return
    let cancelled = false
    setLoading(true)
    Flows
      .get(flowId)
      .then((f) => { if (!cancelled) setFlow(f) })
      .catch((e) => { if (!cancelled) setError(humanise(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [flowId])

  if (loading || !flow) {
    return (
      <PageShell title="Editar fluxo" subtitle={error ? "Erro ao carregar" : "Carregando…"} theme="light">
        <div className="h-full flex items-center justify-center text-muted-on-light text-[11px] gap-2">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando o fluxo…
            </>
          )}
        </div>
      </PageShell>
    )
  }

  if (flow.status === "active") {
    return (
      <PageShell
        title={`Editar · ${flow.name}`}
        subtitle="Fluxo ativo — não pode ser editado"
        theme="light"
        toolbar={
          <Link
            href={`/fluxos/${flow.id}`}
            className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3 h-3" strokeWidth={1.5} /> Voltar
          </Link>
        }
      >
        <div className="h-full flex items-center justify-center p-6 bg-panel-light">
          <div className="bg-canvas-light border border-border-light max-w-md p-5 space-y-3">
            <h2 className="text-[13px] font-semibold text-text-on-light">
              Fluxo ativo — não pode ser editado
            </h2>
            <p className="text-[11px] text-muted-on-light leading-relaxed">
              Para preservar o histórico de execuções, fluxos ativos
              ficam congelados. Arquive este fluxo na tela anterior,
              clone para um rascunho e edite o rascunho.
            </p>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <ReactFlowProvider>
      <FlowEditorInner flow={flow} onSaved={setFlow} />
    </ReactFlowProvider>
  )
}
