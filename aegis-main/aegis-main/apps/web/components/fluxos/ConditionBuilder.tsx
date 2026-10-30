"use client"

/**
 * ConditionBuilder — UI dropdown-driven para o operador montar
 * condições (AST JSON) sem digitar código. Garantia: zero free-text
 * de expressão, sem injeção, sem `eval` no backend.
 *
 * Estrutura do AST:
 *   - Folha:  {var, op, value}
 *   - Composição: {op: 'and'|'or', clauses: [...]}
 *
 * MVP: operador combina cláusulas todas com `and` ou todas com `or`
 * (não suporta misturar AND e OR no mesmo nível). Para casos
 * compostos, encadear nodes condicionais resolve.
 *
 * Portado de politicians-app/components/campaign/flows/ConditionBuilder.tsx.
 */

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VariablePicker } from "./VariablePicker"
import type { FlowGraph, FlowVariableSpec } from "@/lib/api/flows"


export interface ConditionAST {
  op?: string
  clauses?: ConditionAST[]
  var?: string
  value?: unknown
}


const OPERATORS: Array<{ value: string; label: string; needsValue: boolean }> = [
  { value: "eq",          label: "é igual a",            needsValue: true },
  { value: "neq",         label: "é diferente de",       needsValue: true },
  { value: "gt",          label: "é maior que",          needsValue: true },
  { value: "lt",          label: "é menor que",          needsValue: true },
  { value: "gte",         label: "é ≥ a",                needsValue: true },
  { value: "lte",         label: "é ≤ a",                needsValue: true },
  { value: "contains",    label: "contém",               needsValue: true },
  { value: "starts_with", label: "começa com",           needsValue: true },
  { value: "ends_with",   label: "termina com",          needsValue: true },
  { value: "in",          label: "está em",              needsValue: true },
  { value: "empty",       label: "está vazio",           needsValue: false },
]


interface Clause {
  var: string
  op: string
  value: string
}


function parseAst(ast: ConditionAST | undefined): {
  combinator: "and" | "or"
  clauses: Clause[]
} {
  if (!ast) return { combinator: "and", clauses: [{ var: "", op: "eq", value: "" }] }
  if (ast.op === "and" || ast.op === "or") {
    return {
      combinator: ast.op,
      clauses: (ast.clauses || []).map((c) => ({
        var: String(c.var || ""),
        op: String(c.op || "eq"),
        value: c.value == null ? "" : String(c.value),
      })),
    }
  }
  // É uma folha
  return {
    combinator: "and",
    clauses: [{
      var: String(ast.var || ""),
      op: String(ast.op || "eq"),
      value: ast.value == null ? "" : String(ast.value),
    }],
  }
}


function buildAst(combinator: "and" | "or", clauses: Clause[]): ConditionAST {
  const valid = clauses.filter((c) => c.var.trim())
  if (valid.length === 0) return {}
  const leaves: ConditionAST[] = valid.map((c) => {
    const opMeta = OPERATORS.find((o) => o.value === c.op)
    const leaf: ConditionAST = { var: c.var, op: c.op }
    if (opMeta?.needsValue) {
      // Tenta coerção: se for numero puro, converte.
      const v = c.value
      if (v && /^-?\d+(\.\d+)?$/.test(v)) leaf.value = Number(v)
      else leaf.value = v
    }
    return leaf
  })
  if (leaves.length === 1) return leaves[0]
  return { op: combinator, clauses: leaves }
}


export function ConditionBuilder({
  value, onChange, graph, focusNodeId, tenantVariables,
}: {
  value: ConditionAST | undefined
  onChange: (ast: ConditionAST) => void
  graph: FlowGraph
  focusNodeId?: string | null
  tenantVariables?: Record<string, FlowVariableSpec>
}) {
  const parsed = parseAst(value)
  const [combinator, setCombinator] = React.useState<"and" | "or">(parsed.combinator)
  const [clauses, setClauses] = React.useState<Clause[]>(parsed.clauses)

  // Sincroniza quando o valor externo muda (mudou de node)
  React.useEffect(() => {
    const p = parseAst(value)
    setCombinator(p.combinator)
    setClauses(p.clauses)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)])

  function commit(nextClauses: Clause[], nextComb: "and" | "or" = combinator) {
    setClauses(nextClauses)
    setCombinator(nextComb)
    onChange(buildAst(nextComb, nextClauses))
  }

  function updateClause(i: number, patch: Partial<Clause>) {
    commit(clauses.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  function addClause() {
    commit([...clauses, { var: "", op: "eq", value: "" }])
  }

  function removeClause(i: number) {
    if (clauses.length === 1) {
      commit([{ var: "", op: "eq", value: "" }])
    } else {
      commit(clauses.filter((_, idx) => idx !== i))
    }
  }

  return (
    <div className="space-y-2">
      {clauses.map((c, i) => {
        const opMeta = OPERATORS.find((o) => o.value === c.op)
        return (
          <div key={i} className="space-y-1.5 border border-border-light bg-raised-light/40 p-2.5">
            {i > 0 && (
              <div className="text-[10px] uppercase tracking-widest text-muted-on-light mb-1">
                {combinator === "and" ? "E (todas precisam ser verdadeiras)" : "OU (basta uma ser verdadeira)"}
              </div>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <Input
                value={c.var}
                onChange={(e) => updateClause(i, { var: e.target.value })}
                placeholder="campo (ex: news.ingested ou item.severity)"
                className="bg-canvas-light text-[12px] font-mono"
              />
              <VariablePicker
                graph={graph}
                focusNodeId={focusNodeId}
                tenantVariables={tenantVariables}
                onPick={(expr) => {
                  // Tira o {{ }} pra mostrar o path puro no campo
                  const inner = expr.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "")
                  updateClause(i, { var: inner })
                }}
                title="Escolher campo de saída de outro passo"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={c.op}
                onChange={(e) => updateClause(i, { op: e.target.value })}
                className="h-9 text-[12px] border border-border-light bg-canvas-light px-2"
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {opMeta?.needsValue && (
                <Input
                  value={c.value}
                  onChange={(e) => updateClause(i, { value: e.target.value })}
                  placeholder="valor"
                  className="bg-canvas-light text-[12px] flex-1"
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeClause(i)}
                className="h-9 w-9 p-0 text-muted-on-light hover:text-danger"
                title="Remover esta cláusula"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )
      })}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 text-[11px] text-muted-on-light">
          <span>Combinar com:</span>
          <button
            type="button"
            onClick={() => commit(clauses, "and")}
            className={`px-2 py-1 text-[10px] uppercase tracking-wider border ${combinator === "and" ? "bg-primary text-white border-primary-hover" : "bg-canvas-light text-text-on-light border-border-light hover:bg-raised-light/40"}`}
          >
            E
          </button>
          <button
            type="button"
            onClick={() => commit(clauses, "or")}
            className={`px-2 py-1 text-[10px] uppercase tracking-wider border ${combinator === "or" ? "bg-primary text-white border-primary-hover" : "bg-canvas-light text-text-on-light border-border-light hover:bg-raised-light/40"}`}
          >
            OU
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addClause}
          className="border-border-light text-text-on-light"
        >
          <Plus className="h-3 w-3 mr-1" />
          Adicionar cláusula
        </Button>
      </div>
    </div>
  )
}
