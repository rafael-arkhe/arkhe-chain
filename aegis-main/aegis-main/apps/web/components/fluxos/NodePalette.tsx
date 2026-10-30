"use client"

/**
 * NodePalette — paleta lateral com tipos de passo arrastáveis pro
 * canvas. Cada item dispara HTML5 drag-and-drop; o canvas captura o
 * drop e cria um node novo no ponto.
 */

import * as React from "react"
import {
  Activity, AudioLines, FileText, Filter,
  GitBranch, Newspaper, Send,
  PinIcon, Wand2, Variable as VariableIcon,
  CheckCheck,
} from "lucide-react"

import { NODE_TYPE_LABEL, NODE_TYPE_FAMILY_LABEL } from "@/lib/api/flowMeta"


export interface PaletteItem {
  type: string
  icon: React.ComponentType<{ className?: string }>
  shortLabel?: string
}


const ITEMS_BY_FAMILY: Record<string, PaletteItem[]> = {
  trigger: [
    { type: "trigger.cron",    icon: Activity },
    { type: "trigger.manual",  icon: Activity },
    { type: "trigger.on-event", icon: Activity },
  ],
  agent: [
    { type: "agent.worker-news",        icon: Newspaper },
    { type: "agent.worker-legislativo", icon: FileText },
    { type: "agent.worker-x",           icon: AudioLines },
    { type: "agent.aip-call",           icon: Wand2 },
    { type: "agent.votacao-detalhada",  icon: FileText },
  ],
  xform: [
    { type: "xform.filter",     icon: Filter },
    { type: "xform.limit",      icon: Filter },
    { type: "xform.sort",       icon: Filter },
    { type: "xform.summarize",  icon: Wand2 },
    { type: "xform.classify",   icon: Wand2 },
  ],
  cond: [
    { type: "cond.if", icon: GitBranch },
  ],
  var: [
    { type: "var.set", icon: VariableIcon },
  ],
  out: [
    { type: "out.task.create",     icon: CheckCheck },
    { type: "out.proposal.create", icon: CheckCheck },
    { type: "out.brief.append",    icon: PinIcon },
    { type: "out.broadcast",       icon: Send },
  ],
}


export function NodePalette() {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[11px] font-semibold text-text-on-light">
          Adicionar passo
        </h3>
        <p className="text-[10px] text-muted-on-light leading-relaxed mt-0.5">
          Arraste um item daqui para o desenho do fluxo. Conecte
          puxando dos pontinhos da caixa.
        </p>
      </div>
      {Object.entries(ITEMS_BY_FAMILY).map(([family, items]) => (
        <div key={family} className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.16em] text-muted-on-light font-mono font-semibold">
            {NODE_TYPE_FAMILY_LABEL[family] || family}
          </div>
          <div className="space-y-1">
            {items.map((it) => (
              <DraggableItem key={it.type} item={it} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


function DraggableItem({ item }: { item: PaletteItem }) {
  const Icon = item.icon
  const label = NODE_TYPE_LABEL[item.type] || item.type
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/aegis-flow-node", item.type)
        e.dataTransfer.effectAllowed = "move"
      }}
      className="flex items-center gap-2 px-2 py-1.5 border border-border-light bg-canvas-light hover:border-primary hover:bg-primary/5 cursor-grab active:cursor-grabbing transition-colors"
      title={`Arrastar: ${label}`}
    >
      <Icon className="h-3.5 w-3.5 text-muted-on-light shrink-0" />
      <span className="text-[11px] text-text-on-light truncate">{label}</span>
    </div>
  )
}
