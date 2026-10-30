"use client"

/**
 * VariablePicker — botão "+" que abre um popover hierárquico com
 * todas as referências disponíveis no contexto do flow:
 *
 *   - Variáveis da organização (tenant_vars)
 *   - Built-ins ($now, $tenant_slug, $flow_run_id, $trigger)
 *   - Saídas dos passos anteriores (calculado por toposort do graph
 *     em edição, considerando o node em foco)
 *
 * Operador clica → cola a expressão mustache no campo target.
 * Sem digitar `{{}}` na mão.
 *
 * Portado de politicians-app/components/campaign/flows/VariablePicker.tsx.
 */

import * as React from "react"
import { ChevronRight, Variable } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NODE_TYPE_LABEL } from "@/lib/api/flowMeta"
import type { FlowGraph, FlowNode, FlowVariableSpec } from "@/lib/api/flows"


/** Output schema declarado por tipo de node — usado pra mostrar
 *  quais campos estão disponíveis pra referenciar. */
export const NODE_OUTPUT_FIELDS: Record<
  string,
  Array<{ key: string; label: string; type: string }>
> = {
  "agent.worker-news": [
    { key: "fetched", label: "Total consultado", type: "número" },
    { key: "matched", label: "Que bateram com keywords", type: "número" },
    { key: "ingested", label: "Novos ingeridos", type: "número" },
    { key: "skipped_existing", label: "Repetidos pulados", type: "número" },
  ],
  "agent.worker-legislativo": [
    { key: "fetched", label: "Total consultado", type: "número" },
    { key: "matched", label: "Bateram com keywords", type: "número" },
    { key: "ingested", label: "Novos ingeridos", type: "número" },
    { key: "skipped_existing", label: "Repetidos pulados", type: "número" },
  ],
  "agent.worker-x": [
    { key: "ingested", label: "Posts novos", type: "número" },
    { key: "handle", label: "Conta acompanhada", type: "texto" },
  ],
  "agent.worker-ig": [
    { key: "ingested", label: "Posts novos", type: "número" },
    { key: "ig_handle", label: "Conta acompanhada", type: "texto" },
  ],
  "agent.aip-call": [
    { key: "text", label: "Texto gerado", type: "texto" },
    { key: "tokens_input", label: "Tokens entrada", type: "número" },
    { key: "tokens_output", label: "Tokens saída", type: "número" },
  ],
  "agent.votacao-detalhada": [
    { key: "items", label: "Lista de votos", type: "lista" },
    { key: "count", label: "Total de votos retornados", type: "número" },
    { key: "votacao_id", label: "ID da votação", type: "texto" },
    { key: "summary_by_voto", label: "Resumo por tipo de voto", type: "objeto" },
    { key: "summary_by_partido", label: "Resumo por partido", type: "objeto" },
  ],
  "xform.filter": [
    { key: "items", label: "Itens que passaram", type: "lista" },
    { key: "count", label: "Quantidade que passou", type: "número" },
    { key: "kept_of", label: "Quantos foram testados", type: "número" },
  ],
  "xform.limit": [
    { key: "items", label: "Itens limitados", type: "lista" },
    { key: "count", label: "Quantidade", type: "número" },
  ],
  "xform.sort": [
    { key: "items", label: "Itens ordenados", type: "lista" },
    { key: "count", label: "Quantidade", type: "número" },
  ],
  "xform.summarize": [
    { key: "text", label: "Resumo gerado", type: "texto" },
    { key: "summarized_items", label: "Quantidade resumida", type: "número" },
  ],
  "xform.classify": [
    { key: "label", label: "Rótulo escolhido", type: "texto" },
    { key: "raw", label: "Resposta crua", type: "texto" },
  ],
  "cond.if": [
    { key: "branch", label: "Branch tomado", type: "texto" },
    { key: "matched", label: "Resultado", type: "verdadeiro/falso" },
  ],
  "var.set": [
    { key: "key", label: "Nome da variável", type: "texto" },
    { key: "value", label: "Valor", type: "qualquer" },
  ],
  "out.task.create": [
    { key: "task_id", label: "ID da tarefa", type: "texto" },
    { key: "title", label: "Título", type: "texto" },
  ],
  "out.proposal.create": [
    { key: "proposal_id", label: "ID da proposta", type: "texto" },
  ],
}


/** Toposort simples — devolve nodes ANTECESSORES de ``focusId``. */
function predecessorsOf(graph: FlowGraph, focusId: string): FlowNode[] {
  const byId = new Map<string, FlowNode>()
  for (const n of graph.nodes || []) byId.set(n.id, n)
  // Reverse adjacency (in-edges)
  const inEdges = new Map<string, string[]>()
  for (const e of graph.edges || []) {
    if (!inEdges.has(e.to_node)) inEdges.set(e.to_node, [])
    inEdges.get(e.to_node)!.push(e.from_node)
  }
  // BFS reverso a partir de focusId
  const visited = new Set<string>()
  const queue: string[] = []
  for (const src of inEdges.get(focusId) || []) queue.push(src)
  while (queue.length) {
    const n = queue.shift()!
    if (visited.has(n)) continue
    visited.add(n)
    for (const src of inEdges.get(n) || []) queue.push(src)
  }
  // Ordem de inserção do graph
  return (graph.nodes || []).filter((n) => visited.has(n.id))
}


export interface VariablePickerProps {
  /** Graph completo do flow em edição. */
  graph: FlowGraph
  /** ID do node em edição — só mostra outputs de PASSOS ANTERIORES. */
  focusNodeId?: string | null
  /** Variáveis declaradas no flow (escopo desta organização). */
  tenantVariables?: Record<string, FlowVariableSpec>
  /** Callback quando o operador escolhe uma referência. */
  onPick: (expression: string) => void
  /** Botão "title" tooltip. */
  title?: string
}


export function VariablePicker({
  graph, focusNodeId, tenantVariables, onPick, title,
}: VariablePickerProps) {
  const [open, setOpen] = React.useState(false)
  const predecessors = focusNodeId ? predecessorsOf(graph, focusNodeId) : []

  function pick(expr: string) {
    onPick(expr)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-muted-on-light hover:text-text-on-light"
          title={title || "Inserir variável ou dado de passo anterior"}
        >
          <Variable className="h-3 w-3 mr-1" />
          Inserir variável
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[360px] max-h-[480px] overflow-y-auto p-0"
      >
        <div className="px-3 py-2 border-b border-border-light bg-raised-light/40">
          <p className="text-[11px] font-semibold text-text-on-light">
            Inserir referência
          </p>
          <p className="text-[10px] text-muted-on-light mt-0.5">
            Clique numa opção para colar no campo.
          </p>
        </div>

        {/* Variáveis da organização */}
        {tenantVariables && Object.keys(tenantVariables).length > 0 && (
          <Section label="Variáveis desta organização">
            {Object.entries(tenantVariables).map(([k, spec]) => (
              <PickerItem
                key={k}
                label={k}
                detail={spec.description || `tipo: ${spec.type}`}
                expr={`{{$tenant.${k}}}`}
                onPick={pick}
              />
            ))}
          </Section>
        )}

        {/* Built-ins */}
        <Section label="Sistema (built-ins)">
          <PickerItem
            label="Hora atual (UTC)"
            detail="Ex.: 2026-05-07T15:30:00+00:00"
            expr="{{$now}}"
            onPick={pick}
          />
          <PickerItem
            label="Hora atual (BRT)"
            detail="Hora local Brasília"
            expr="{{$now_brt}}"
            onPick={pick}
          />
          <PickerItem
            label="Slug da organização"
            detail="Identificador do tenant"
            expr="{{$tenant_slug}}"
            onPick={pick}
          />
          <PickerItem
            label="ID desta execução"
            detail="UUID do flow run"
            expr="{{$flow_run_id}}"
            onPick={pick}
          />
        </Section>

        {/* Saídas dos passos anteriores */}
        <Section label="Saídas dos passos anteriores">
          {predecessors.length === 0 ? (
            <p className="text-[11px] text-muted-on-light italic px-3 py-2">
              Sem passos anteriores. Conecte este passo a outro pra
              acessar os dados que ele gerar.
            </p>
          ) : (
            predecessors.map((p) => {
              const fields = NODE_OUTPUT_FIELDS[p.type] || []
              const stepLabel =
                p.label || NODE_TYPE_LABEL[p.type] || p.type
              return (
                <details
                  key={p.id}
                  className="border-b border-border-light/60"
                  open
                >
                  <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-semibold text-text-on-light hover:bg-raised-light/40 select-none flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    {stepLabel}
                  </summary>
                  <div className="bg-canvas-light">
                    {fields.length === 0 ? (
                      <PickerItem
                        label="(saída completa)"
                        detail="Resultado bruto do passo"
                        expr={`{{${p.id}}}`}
                        onPick={pick}
                      />
                    ) : (
                      fields.map((f) => (
                        <PickerItem
                          key={f.key}
                          label={f.label}
                          detail={`tipo: ${f.type}`}
                          expr={`{{${p.id}.${f.key}}}`}
                          onPick={pick}
                        />
                      ))
                    )}
                  </div>
                </details>
              )
            })
          )}
        </Section>
      </PopoverContent>
    </Popover>
  )
}


function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted-on-light bg-raised-light/40 border-b border-border-light/60">
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}


function PickerItem({
  label, detail, expr, onPick,
}: {
  label: string
  detail?: string
  expr: string
  onPick: (expr: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(expr)}
      className="w-full text-left px-3 py-1.5 hover:bg-primary/10 transition-colors border-b border-border-light/60 last:border-b-0"
    >
      <div className="text-[12px] text-text-on-light">{label}</div>
      {detail && (
        <div className="text-[10px] text-muted-on-light mt-0.5">{detail}</div>
      )}
      <code className="text-[10px] text-primary font-mono mt-0.5 block truncate">
        {expr}
      </code>
    </button>
  )
}
