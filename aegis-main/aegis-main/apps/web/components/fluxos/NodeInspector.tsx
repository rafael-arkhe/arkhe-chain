"use client"

/**
 * NodeInspector — painel de configuração do passo selecionado.
 *
 * Por tipo, mostra os campos relevantes em PT-BR. Strings com
 * suporte a variáveis (mustache) ganham botão "Inserir variável" do
 * VariablePicker — operador escolhe da lista hierárquica em vez de
 * digitar `{{}}`.
 *
 * Save imediato: cada onChange ja propaga o node atualizado ao
 * canvas; o "Salvar fluxo" lá fora persiste no backend.
 *
 * Portado de politicians-app/components/campaign/flows/NodeInspector.tsx.
 */

import * as React from "react"
import { Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConditionBuilder, type ConditionAST } from "./ConditionBuilder"
import { VariablePicker } from "./VariablePicker"
import {
  NODE_TYPE_FAMILY_LABEL,
  NODE_TYPE_LABEL,
  CRON_PRESET_LABEL,
} from "@/lib/api/flowMeta"
import type { FlowGraph, FlowNode, FlowVariableSpec } from "@/lib/api/flows"


type Cfg = Record<string, unknown>


interface Props {
  node: FlowNode | null
  graph: FlowGraph
  tenantVariables?: Record<string, FlowVariableSpec>
  onChange: (next: FlowNode) => void
  onDelete: (id: string) => void
  onClose: () => void
}


export function NodeInspector({ node, graph, tenantVariables, onChange, onDelete, onClose }: Props) {
  if (!node) {
    return (
      <div className="text-[11px] text-muted-on-light p-3 italic">
        Clique num passo do desenho para editar.
      </div>
    )
  }

  const cfg = (node.config || {}) as Cfg
  const family = node.type.split(".")[0]
  const familyLabel = NODE_TYPE_FAMILY_LABEL[family] || family
  const typeLabel = NODE_TYPE_LABEL[node.type] || node.type

  function update(patch: Partial<FlowNode>) {
    onChange({ ...node!, ...patch })
  }
  function updateConfig(patch: Cfg) {
    onChange({ ...node!, config: { ...cfg, ...patch } })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between border-b border-border-light pb-2">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-on-light">
            {familyLabel}
          </div>
          <h3 className="text-[13px] font-semibold text-text-on-light">
            {node.label || typeLabel}
          </h3>
          <p className="text-[10px] font-mono text-muted-on-light mt-0.5">
            {node.type} · id {node.id.slice(0, 8)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
          className="text-muted-on-light hover:text-text-on-light"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Label custom — operador renomeia */}
      <Field label="Nome do passo (opcional)" hint="O que aparece no desenho.">
        <Input
          value={node.label || ""}
          onChange={(e) => update({ label: e.target.value })}
          placeholder={typeLabel}
          className="bg-canvas-light text-[12px]"
        />
      </Field>

      {/* Form por tipo */}
      {node.type === "trigger.cron" && (
        <Field label="Quando rodar">
          <select
            value={(cfg.preset as string) || "off"}
            onChange={(e) => updateConfig({ preset: e.target.value })}
            className="w-full bg-canvas-light border border-border-light px-2 py-1.5 text-[12px]"
          >
            {Object.entries(CRON_PRESET_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
      )}

      {(node.type === "agent.worker-news" || node.type === "agent.worker-legislativo") && (
        <>
          <FieldWithPicker
            label="Palavras-chave"
            hint="Separe por vírgula. Aceita {{$tenant.keywords}}."
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ keywords: ((cfg.keywords as string) || "") + expr })}
          >
            <Input
              value={(cfg.keywords as string) || ""}
              onChange={(e) => updateConfig({ keywords: e.target.value })}
              placeholder="invasão, furto, homicídio"
              className="bg-canvas-light text-[12px]"
            />
          </FieldWithPicker>
          <NumberField
            label="Janela (horas)"
            value={Number(cfg.hours) || 24}
            min={1}
            max={720}
            onChange={(v) => updateConfig({ hours: v })}
          />
          <NumberField
            label="Máximo por execução"
            value={Number(cfg.max_per_run) || 30}
            min={1}
            max={200}
            onChange={(v) => updateConfig({ max_per_run: v })}
          />
        </>
      )}

      {node.type === "agent.worker-x" && (
        <>
          <Field label="Conta no X" hint="Ex.: @perfil.oficial">
            <Input
              value={(cfg.handle as string) || ""}
              onChange={(e) => updateConfig({ handle: e.target.value })}
              placeholder="@..."
              className="bg-canvas-light text-[12px] font-mono"
            />
          </Field>
          <NumberField
            label="Quantidade por execução"
            value={Number(cfg.count) || 20}
            min={1}
            max={200}
            onChange={(v) => updateConfig({ count: v })}
          />
        </>
      )}

      {node.type === "agent.votacao-detalhada" && (
        <>
          <Field
            label="ID da votação (Câmara)"
            hint="Identificador da votação nominal, ex.: 2447259-99. Pegue na saída do Coletor do Congresso ou no painel de votações da Câmara."
          >
            <Input
              value={(cfg.votacao_id as string) || ""}
              onChange={(e) => updateConfig({ votacao_id: e.target.value })}
              placeholder="2447259-99"
              className="bg-canvas-light text-[12px] font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Filtrar por partido (opcional)">
              <Input
                value={(cfg.partido as string) || ""}
                onChange={(e) => updateConfig({ partido: e.target.value.toUpperCase() })}
                placeholder="PT, PL, PSDB…"
                className="bg-canvas-light text-[12px] font-mono"
              />
            </Field>
            <Field label="Filtrar por UF (opcional)">
              <Input
                value={(cfg.uf as string) || ""}
                onChange={(e) => updateConfig({ uf: e.target.value.toUpperCase() })}
                placeholder="SP, MG, RJ…"
                className="bg-canvas-light text-[12px] font-mono"
              />
            </Field>
          </div>
          <Field label="Filtrar por tipo de voto (opcional)">
            <select
              value={(cfg.voto as string) || ""}
              onChange={(e) => updateConfig({ voto: e.target.value || undefined })}
              className="w-full bg-canvas-light border border-border-light px-2 py-1.5 text-[12px]"
            >
              <option value="">Todos os votos</option>
              <option value="Sim">Apenas votos Sim</option>
              <option value="Não">Apenas votos Não</option>
              <option value="Abstenção">Apenas Abstenção</option>
              <option value="Obstrução">Apenas Obstrução</option>
              <option value="Art. 17">Apenas Art. 17 (presidente)</option>
            </select>
          </Field>
        </>
      )}

      {node.type === "agent.aip-call" && (
        <>
          <FieldWithPicker
            label="Instrução do sistema"
            hint="Diz ao agente como se comportar. Aceita variáveis."
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) =>
              updateConfig({ system_prompt: ((cfg.system_prompt as string) || "") + expr })
            }
          >
            <Textarea
              value={(cfg.system_prompt as string) || ""}
              onChange={(e) => updateConfig({ system_prompt: e.target.value })}
              placeholder="Ex.: Você é o agente de análise..."
              className="bg-canvas-light text-[12px] min-h-[80px]"
            />
          </FieldWithPicker>
          <FieldWithPicker
            label="Pergunta / contexto"
            hint="Texto que o operador quer analisar. Aceita variáveis."
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) =>
              updateConfig({ prompt: ((cfg.prompt as string) || "") + expr })
            }
          >
            <Textarea
              value={(cfg.prompt as string) || ""}
              onChange={(e) => updateConfig({ prompt: e.target.value })}
              placeholder="Ex.: Resuma as ocorrências da última hora em 5 linhas."
              className="bg-canvas-light text-[12px] min-h-[80px]"
            />
          </FieldWithPicker>
        </>
      )}

      {node.type === "xform.summarize" && (
        <>
          <FieldWithPicker
            label="O que resumir"
            hint="Aponte para uma lista (ex.: itens do coletor)."
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ input: expr })}
          >
            <Input
              value={(cfg.input as string) || ""}
              onChange={(e) => updateConfig({ input: e.target.value })}
              placeholder="{{coletor.items}}"
              className="bg-canvas-light text-[12px] font-mono"
            />
          </FieldWithPicker>
          <Field label="Estilo do resumo">
            <select
              value={(cfg.style as string) || "brief"}
              onChange={(e) => updateConfig({ style: e.target.value })}
              className="w-full bg-canvas-light border border-border-light px-2 py-1.5 text-[12px]"
            >
              <option value="brief">Brief curto (5 linhas)</option>
              <option value="bullets">Em bullets</option>
              <option value="executive">Nota executiva (3 parágrafos)</option>
            </select>
          </Field>
        </>
      )}

      {node.type === "xform.classify" && (
        <>
          <FieldWithPicker
            label="Texto a classificar"
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ input: expr })}
          >
            <Input
              value={(cfg.input as string) || ""}
              onChange={(e) => updateConfig({ input: e.target.value })}
              placeholder="{{coletor.items[0].title}}"
              className="bg-canvas-light text-[12px] font-mono"
            />
          </FieldWithPicker>
          <Field label="Rótulos disponíveis (separados por vírgula)">
            <Input
              value={Array.isArray(cfg.labels) ? (cfg.labels as string[]).join(", ") : ""}
              onChange={(e) =>
                updateConfig({
                  labels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="alta, média, baixa"
              className="bg-canvas-light text-[12px]"
            />
          </Field>
        </>
      )}

      {node.type === "xform.filter" && (
        <>
          <FieldWithPicker
            label="Lista de entrada"
            hint="A lista que vai ser filtrada."
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ input: expr })}
          >
            <Input
              value={(cfg.input as string) || ""}
              onChange={(e) => updateConfig({ input: e.target.value })}
              placeholder="{{coletor.items}}"
              className="bg-canvas-light text-[12px] font-mono"
            />
          </FieldWithPicker>
          <Field label="Manter quando..." hint="Cada item é testado contra esta condição.">
            <ConditionBuilder
              value={cfg.condition as ConditionAST | undefined}
              onChange={(ast) => updateConfig({ condition: ast })}
              graph={graph}
              focusNodeId={node.id}
              tenantVariables={tenantVariables}
            />
          </Field>
        </>
      )}

      {node.type === "xform.limit" && (
        <>
          <FieldWithPicker
            label="Lista de entrada"
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ input: expr })}
          >
            <Input
              value={(cfg.input as string) || ""}
              onChange={(e) => updateConfig({ input: e.target.value })}
              placeholder="{{coletor.items}}"
              className="bg-canvas-light text-[12px] font-mono"
            />
          </FieldWithPicker>
          <NumberField
            label="Quantos manter"
            value={Number(cfg.n) || 10}
            min={1}
            max={1000}
            onChange={(v) => updateConfig({ n: v })}
          />
        </>
      )}

      {node.type === "cond.if" && (
        <Field label="Verifica esta condição" hint="Se verdadeira, segue pelo SIM. Se falsa, pelo NÃO.">
          <ConditionBuilder
            value={cfg.condition as ConditionAST | undefined}
            onChange={(ast) => updateConfig({ condition: ast })}
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
          />
        </Field>
      )}

      {node.type === "var.set" && (
        <>
          <Field label="Nome da variável">
            <Input
              value={(cfg.key as string) || ""}
              onChange={(e) => updateConfig({ key: e.target.value })}
              placeholder="contador"
              className="bg-canvas-light text-[12px] font-mono"
            />
          </Field>
          <FieldWithPicker
            label="Valor"
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ value: ((cfg.value as string) || "") + expr })}
          >
            <Input
              value={(cfg.value as string) || ""}
              onChange={(e) => updateConfig({ value: e.target.value })}
              placeholder="qualquer texto ou {{...}}"
              className="bg-canvas-light text-[12px]"
            />
          </FieldWithPicker>
        </>
      )}

      {node.type === "out.task.create" && (
        <>
          <FieldWithPicker
            label="Título da tarefa"
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ title: ((cfg.title as string) || "") + expr })}
          >
            <Input
              value={(cfg.title as string) || ""}
              onChange={(e) => updateConfig({ title: e.target.value })}
              placeholder="Brief do dia — {{$now}}"
              className="bg-canvas-light text-[12px]"
            />
          </FieldWithPicker>
          <FieldWithPicker
            label="Descrição (briefing)"
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) =>
              updateConfig({ prompt_text: ((cfg.prompt_text as string) || "") + expr })
            }
          >
            <Textarea
              value={(cfg.prompt_text as string) || ""}
              onChange={(e) => updateConfig({ prompt_text: e.target.value })}
              placeholder="Resumo automático. Anexar contexto via variáveis."
              className="bg-canvas-light text-[12px] min-h-[100px]"
            />
          </FieldWithPicker>
          <Field label="Prioridade">
            <select
              value={(cfg.priority as string) || "normal"}
              onChange={(e) => updateConfig({ priority: e.target.value })}
              className="w-full bg-canvas-light border border-border-light px-2 py-1.5 text-[12px]"
            >
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </Field>
        </>
      )}

      {node.type === "out.proposal.create" && (
        <>
          <FieldWithPicker
            label="Título da proposta"
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ title: ((cfg.title as string) || "") + expr })}
          >
            <Input
              value={(cfg.title as string) || ""}
              onChange={(e) => updateConfig({ title: e.target.value })}
              placeholder="Aprovar publicação sobre X"
              className="bg-canvas-light text-[12px]"
            />
          </FieldWithPicker>
          <FieldWithPicker
            label="Resumo / detalhe"
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) =>
              updateConfig({ summary: ((cfg.summary as string) || "") + expr })
            }
          >
            <Textarea
              value={(cfg.summary as string) || ""}
              onChange={(e) => updateConfig({ summary: e.target.value })}
              placeholder="O que o aprovador precisa saber pra decidir."
              className="bg-canvas-light text-[12px] min-h-[80px]"
            />
          </FieldWithPicker>
          <Field label="Severidade">
            <select
              value={(cfg.severity as string) || "MEDIUM"}
              onChange={(e) => updateConfig({ severity: e.target.value })}
              className="w-full bg-canvas-light border border-border-light px-2 py-1.5 text-[12px]"
            >
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
          </Field>
        </>
      )}

      {node.type === "out.broadcast" && (
        <>
          <FieldWithPicker
            label="Texto a publicar"
            hint="Sempre vai pra fila de aprovação antes de ir ao ar."
            graph={graph}
            focusNodeId={node.id}
            tenantVariables={tenantVariables}
            onPick={(expr) => updateConfig({ text: ((cfg.text as string) || "") + expr })}
          >
            <Textarea
              value={(cfg.text as string) || ""}
              onChange={(e) => updateConfig({ text: e.target.value })}
              placeholder="Conteúdo do post..."
              className="bg-canvas-light text-[12px] min-h-[80px]"
            />
          </FieldWithPicker>
          <Field label="Canais (separados por vírgula)">
            <Input
              value={Array.isArray(cfg.channels) ? (cfg.channels as string[]).join(", ") : ""}
              onChange={(e) =>
                updateConfig({
                  channels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="x, instagram"
              className="bg-canvas-light text-[12px]"
            />
          </Field>
        </>
      )}

      {/* Delete */}
      <div className="border-t border-border-light pt-3">
        <Button
          variant="ghost"
          onClick={() => onDelete(node.id)}
          className="text-danger hover:bg-danger/10"
          size="sm"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Remover este passo
        </Button>
      </div>
    </div>
  )
}


function Field({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-muted-on-light mt-0.5">{hint}</p>}
    </div>
  )
}


function FieldWithPicker({
  label, hint, children, graph, focusNodeId, tenantVariables, onPick,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  graph: FlowGraph
  focusNodeId?: string | null
  tenantVariables?: Record<string, FlowVariableSpec>
  onPick: (expr: string) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {label}
        </Label>
        <VariablePicker
          graph={graph}
          focusNodeId={focusNodeId}
          tenantVariables={tenantVariables}
          onPick={onPick}
        />
      </div>
      {children}
      {hint && <p className="text-[10px] text-muted-on-light mt-0.5">{hint}</p>}
    </div>
  )
}


function NumberField({
  label, value, min, max, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-canvas-light text-[12px]"
      />
    </Field>
  )
}
