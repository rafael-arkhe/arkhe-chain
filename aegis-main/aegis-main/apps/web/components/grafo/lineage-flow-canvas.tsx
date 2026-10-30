'use client';

/**
 * <LineageFlowCanvas /> — M5-10 (2026-05-23), M5-8 visibility (2026-05-24).
 *
 * Diagrama de pipeline DIRECIONADO (left-to-right hierárquico) para o
 * Mapa do Workflow. reactflow + layout determinístico. Substitui o
 * `<LineageGraphSVG>` força-dirigido (teia) que o operador rejeitou.
 *
 * VISIBILIDADE PLENA (M5-8) — o snapshot real do lineage costuma trazer
 * centenas de nós DataAsset SEM aresta (degree-0). Com dagre rankdir=LR
 * puro, todos esses nós desconexos caem numa única coluna empilhada e o
 * operador não consegue ler nada. Correções desta onda:
 *
 *   1. LAYOUT HÍBRIDO: dagre roda só no SUBGRAFO CONEXO (nós tocados por
 *      arestas), com ranksep/nodesep maiores → o pipeline respira. Os nós
 *      DESCONEXOS são empacotados num GRID multi-coluna determinístico
 *      (ordenado por kind+id) posicionado abaixo do pipeline, em vez de
 *      uma coluna de centenas de itens.
 *   2. DENSIDADE: `density` ('comfortable'|'compact') escala o espaçamento
 *      do dagre + o passo do grid.
 *   3. BUSCA → REALCE + CENTRAGEM: `matchIds` esmaece os não-correspondentes
 *      (opacidade reduzida em nós/arestas) e `selectedId` recebe um anel de
 *      realce + auto-`setCenter` (via useReactFlow dentro do Provider).
 *   4. "Ajustar à tela": botão rotulado (Panel) + reactflow <Controls> +
 *      `fitView` no load — o grafo inteiro é enquadrado de início.
 *   5. MiniMap pannable/zoomable para navegação.
 *
 * Determinístico: sem simulação stateful. Cada render recalcula posições
 * puras a partir de {nodes, edges, density}. A página remonta via `key`.
 *
 * Ícones de kind: AudioLines p/ IA (LogicFunction) e Modelo (LanguageModel) —
 * o ícone do AIP é AudioLines (régua feedback_aip_icon_audiolines; sem Bot/Brain).
 * Distinção entre IA e Modelo fica no rótulo (meta.label), não no ícone.
 * A COR do nó codifica o eixo ativo (color-as-data): 'general'=kind, e
 * permissions/usage/organization são encodings analíticos — preservados.
 */
import * as React from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import {
  Boxes,
  Zap,
  AudioLines,
  GitBranch,
  Workflow,
  Maximize2,
  type LucideIcon,
} from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { labelLineageKind } from '@/lib/lineage-i18n';
import type { LineageGraphNode, LineageGraphEdge } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/* Eixo de coloração (legenda progressiva)                                    */
/* -------------------------------------------------------------------------- */
export type ColorAxis = 'general' | 'permissions' | 'usage' | 'organization';

/** Densidade do layout — compacto cabe mais; espaçado lê melhor. */
export type CanvasDensity = 'comfortable' | 'compact';

/* -------------------------------------------------------------------------- */
/* Estilo por kind — cor + ícone + rótulo legível (meta.label, nunca o type  */
/* cru na UI — feedback_widget_type_never_raw_in_ui).                         */
/* -------------------------------------------------------------------------- */
interface KindMeta {
  color: string;
  icon: LucideIcon;
  /** Rótulo legível pt-BR (jamais o `kind` técnico cru). */
  label: string;
}

const KIND_META: Record<string, KindMeta> = {
  DataAsset: { color: '#2D77BE', icon: Boxes, label: 'Dados' },
  ActionType: { color: '#7C3AED', icon: Zap, label: 'Ação' },
  LogicFunction: { color: '#0D9488', icon: AudioLines, label: 'IA' },
  OntologyNode: { color: '#64748B', icon: GitBranch, label: 'Ontologia' },
  Workspace: { color: '#D97706', icon: Workflow, label: 'Painel' },
  LanguageModel: { color: '#DB2777', icon: AudioLines, label: 'Modelo' },
};
const DEFAULT_META: KindMeta = { color: '#475569', icon: GitBranch, label: 'Nó' };

function metaFor(kind: string): KindMeta {
  return KIND_META[kind] ?? DEFAULT_META;
}

/* -------------------------------------------------------------------------- */
/* Eixo Organization — cor estável por Operação/Espaço do recurso.            */
/* Espelha o grupo Organization (Folder/Project) do Workflow Lineage. Cores   */
/* derivadas de uma paleta categórica fixa via hash determinístico do id, p/  */
/* que a mesma Operação tenha sempre a mesma cor entre renders.               */
/* -------------------------------------------------------------------------- */
const ORG_PALETTE = [
  '#2D77BE', '#0D9488', '#7C3AED', '#D97706', '#DB2777', '#0891B2', '#65A30D',
] as const;
/** Recurso sem Operação/Espaço — cinza neutro. */
const ORG_UNASSIGNED_COLOR = '#94A3B8';

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Cor estável por Operação (cai para o Espaço; cinza se nenhum). */
function colorForOrg(n: LineageGraphNode): string {
  const org = n.org ?? {};
  const key = org.project_id ?? org.space_id ?? null;
  if (!key) return ORG_UNASSIGNED_COLOR;
  return ORG_PALETTE[hashString(key) % ORG_PALETTE.length];
}

/** Marcação presente → acesso restrito. */
const MARKED_COLOR = '#D97706'; // amber
const UNMARKED_COLOR = '#0D9488'; // teal
/** Versão > 1 → "antiga"/desatualizada. */
const OUTDATED_COLOR = '#DC2626'; // red
const CURRENT_COLOR = '#2D77BE'; // blue

function nodeVersion(n: LineageGraphNode): number {
  const v = (n.extra ?? {})['version'];
  return typeof v === 'number' ? v : 1;
}

/** Resolve a cor de borda/realce conforme o eixo de coloração ativo. */
function colorForAxis(n: LineageGraphNode, axis: ColorAxis): string {
  if (axis === 'permissions') {
    return n.markings.length > 0 ? MARKED_COLOR : UNMARKED_COLOR;
  }
  if (axis === 'usage') {
    return nodeVersion(n) > 1 ? OUTDATED_COLOR : CURRENT_COLOR;
  }
  if (axis === 'organization') {
    return colorForOrg(n);
  }
  return metaFor(n.kind).color;
}

/* -------------------------------------------------------------------------- */
/* Tipos do dado embutido no Node reactflow                                   */
/* -------------------------------------------------------------------------- */
interface FlowNodeData {
  raw: LineageGraphNode;
  selected: boolean;
  accent: string;
  /** false → esmaecido (não casa com a busca ativa). */
  matched: boolean;
  /** Seleciona o nó por teclado (Enter/Espaço) — paridade com o clique. */
  onActivate?: () => void;
}

/* -------------------------------------------------------------------------- */
/* Nó custom — sharp corners, Handle Left(target)/Right(source) p/ fluxo LR  */
/* -------------------------------------------------------------------------- */
export function LineageNodeView({ data }: NodeProps<FlowNodeData>) {
  const { raw, selected, accent, matched, onActivate } = data;
  const t = useT();
  const meta = metaFor(raw.kind);
  const Icon = meta.icon;

  // Estado legível — NÃO depender só de cor (a11y + DS: rótulo sempre).
  const version = nodeVersion(raw);
  const outdated = version > 1;
  const freshness = `v${version} · ${
    outdated ? t('grafo.detailOutdated') : t('grafo.detailCurrent')
  }`;
  const restriction =
    raw.markings.length > 0
      ? `${t('grafo.detailRestriction')}: ${raw.markings.join(', ')}`
      : t('grafo.detailNoRestriction');
  // title (mouse) + aria-label (leitor de tela) carregam tipo, nome, frescor
  // e restrição — o mesmo que a cor sinaliza, agora em texto.
  const describe = `${meta.label} · ${raw.label} · ${freshness} · ${restriction}`;

  return (
    <div
      data-testid={`flow-node-${raw.id}`}
      data-node-kind={raw.kind}
      data-matched={matched ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      aria-label={describe}
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate?.();
        }
      }}
      className={`min-w-[150px] max-w-[230px] border-2 bg-white px-2.5 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary ${
        selected ? 'shadow-md ring-2 ring-offset-1' : 'shadow-sm'
      }`}
      style={{
        borderColor: accent,
        opacity: matched ? 1 : 0.2,
        // anel de realce na cor do acento para o nó selecionado/buscado.
        ...(selected
          ? ({ '--tw-ring-color': accent } as React.CSSProperties)
          : {}),
      }}
      title={describe}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1.5 !h-1.5"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 shrink-0" strokeWidth={1.75} style={{ color: accent }} aria-hidden />
        <span
          className="text-[9px] uppercase tracking-widest font-semibold"
          style={{ color: accent }}
        >
          {meta.label}
        </span>
      </div>
      <div className="text-[12px] font-semibold text-text-on-light mt-0.5 leading-tight truncate">
        {raw.label}
      </div>
      {raw.markings.length > 0 && (
        <div className="text-[9px] font-mono text-warning mt-0.5 truncate">
          {raw.markings.join(', ')}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-1.5 !h-1.5"
        style={{ background: accent }}
      />
    </div>
  );
}

const NODE_TYPES = { lineageNode: LineageNodeView };

/* -------------------------------------------------------------------------- */
/* Layout híbrido determinístico                                              */
/*  · subgrafo CONEXO  → dagre rankdir=LR (pipeline)                          */
/*  · nós DESCONEXOS   → grid multi-coluna empacotado, abaixo do pipeline     */
/* -------------------------------------------------------------------------- */
const NODE_W = 200;
const NODE_H = 58;

interface DensitySpec {
  nodesep: number;
  ranksep: number;
  /** passo horizontal/vertical do grid de desconexos (centro-a-centro). */
  gridStepX: number;
  gridStepY: number;
  /** largura-alvo do bloco de desconexos (px) p/ decidir nº de colunas. */
  gridTargetWidth: number;
}

function densitySpec(density: CanvasDensity): DensitySpec {
  if (density === 'compact') {
    return {
      nodesep: 26,
      ranksep: 80,
      gridStepX: NODE_W + 24,
      gridStepY: NODE_H + 18,
      gridTargetWidth: 1500,
    };
  }
  return {
    nodesep: 60,
    ranksep: 130,
    gridStepX: NODE_W + 56,
    gridStepY: NODE_H + 40,
    gridTargetWidth: 1900,
  };
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  /** ids dos nós sem nenhuma aresta incidente (degree-0). */
  disconnectedIds: Set<string>;
}

/**
 * Split por CONECTIVIDADE — separa os nós que participam do pipeline
 * (grau ≥ 1, tocados por alguma aresta válida) dos recursos SOLTOS
 * (grau 0). Pura e barata (O(V+E)).
 *
 * Reutilizada em dois lugares: (a) `computeLayout`, que posiciona conexos
 * via dagre e desconexos num grid; (b) a página do Mapa, que por padrão só
 * manda os CONECTADOS ao canvas e expõe os soltos numa lista colapsada —
 * o pipeline legível como estado inicial.
 */
export function splitConnectivity(
  rawNodes: LineageGraphNode[],
  rawEdges: LineageGraphEdge[],
): { connectedIds: Set<string>; disconnectedIds: Set<string> } {
  const nodeIds = new Set(rawNodes.map((n) => n.id));
  const degree = new Map<string, number>();
  for (const n of rawNodes) degree.set(n.id, 0);
  for (const e of rawEdges) {
    if (!nodeIds.has(e.from_id) || !nodeIds.has(e.to_id)) continue;
    degree.set(e.from_id, (degree.get(e.from_id) ?? 0) + 1);
    degree.set(e.to_id, (degree.get(e.to_id) ?? 0) + 1);
  }
  const connectedIds = new Set<string>();
  const disconnectedIds = new Set<string>();
  for (const n of rawNodes) {
    if ((degree.get(n.id) ?? 0) > 0) connectedIds.add(n.id);
    else disconnectedIds.add(n.id);
  }
  return { connectedIds, disconnectedIds };
}

/**
 * Computa posições. Exportado p/ teste do empacotamento.
 *
 * - Nós com grau ≥ 1 vão ao dagre (subgrafo conexo, rankdir=LR).
 * - Nós com grau 0 são empacotados num grid agrupado por kind, deslocado
 *   para baixo do bounding-box do dagre, com folga vertical.
 */
export function computeLayout(
  rawNodes: LineageGraphNode[],
  rawEdges: LineageGraphEdge[],
  density: CanvasDensity = 'comfortable',
): LayoutResult {
  const spec = densitySpec(density);
  const nodeIds = new Set(rawNodes.map((n) => n.id));

  const validEdges = rawEdges.filter(
    (e) => nodeIds.has(e.from_id) && nodeIds.has(e.to_id),
  );

  const { connectedIds, disconnectedIds } = splitConnectivity(rawNodes, rawEdges);
  const connected = rawNodes.filter((n) => connectedIds.has(n.id));
  const disconnected = rawNodes.filter((n) => disconnectedIds.has(n.id));

  const pos = new Map<string, { x: number; y: number }>();

  // ── 1. Pipeline conexo via dagre ──────────────────────────────────────
  let dagreBottom = 0;
  let dagreLeft = 0;
  if (connected.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      nodesep: spec.nodesep,
      ranksep: spec.ranksep,
      marginx: 24,
      marginy: 24,
    });
    g.setDefaultEdgeLabel(() => ({}));
    const connectedIds = new Set(connected.map((n) => n.id));
    for (const n of connected) {
      g.setNode(n.id, { width: NODE_W, height: NODE_H });
    }
    for (const e of validEdges) {
      if (connectedIds.has(e.from_id) && connectedIds.has(e.to_id)) {
        g.setEdge(e.from_id, e.to_id);
      }
    }
    dagre.layout(g);
    let maxBottom = -Infinity;
    let minLeft = Infinity;
    for (const n of connected) {
      const dn = g.node(n.id);
      if (dn) {
        const x = dn.x - NODE_W / 2;
        const y = dn.y - NODE_H / 2;
        pos.set(n.id, { x, y });
        maxBottom = Math.max(maxBottom, y + NODE_H);
        minLeft = Math.min(minLeft, x);
      } else {
        pos.set(n.id, { x: 0, y: 0 });
      }
    }
    dagreBottom = Number.isFinite(maxBottom) ? maxBottom : 0;
    dagreLeft = Number.isFinite(minLeft) ? minLeft : 0;
  }

  // ── 2. Desconexos: grid agrupado por kind ─────────────────────────────
  if (disconnected.length > 0) {
    // Ordena por kind (estável: ordem de KIND_META) e depois id — determinístico.
    const kindOrder = Object.keys(KIND_META);
    const kindRank = (k: string) => {
      const i = kindOrder.indexOf(k);
      return i === -1 ? kindOrder.length : i;
    };
    const sorted = [...disconnected].sort((a, b) => {
      const ka = kindRank(a.kind);
      const kb = kindRank(b.kind);
      if (ka !== kb) return ka - kb;
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const cols = Math.max(
      1,
      Math.floor(spec.gridTargetWidth / spec.gridStepX),
    );
    // Folga entre o pipeline e o bloco de desconexos.
    const gapTop =
      connected.length > 0 ? dagreBottom + spec.gridStepY * 1.5 : 24;
    const startX = connected.length > 0 ? dagreLeft : 24;

    sorted.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos.set(n.id, {
        x: startX + col * spec.gridStepX,
        y: gapTop + row * spec.gridStepY,
      });
    });
  }

  // Fallback defensivo: qualquer nó sem posição (não deve ocorrer).
  for (const n of rawNodes) {
    if (!pos.has(n.id)) pos.set(n.id, { x: 0, y: 0 });
  }

  return { positions: pos, disconnectedIds };
}

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */
export interface LineageFlowCanvasProps {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  selectedId?: string | null;
  onSelect?: (node: LineageGraphNode | null) => void;
  colorAxis?: ColorAxis;
  height?: number;
  /** Densidade do layout (compacto/espaçado). */
  density?: CanvasDensity;
  /**
   * Conjunto de ids que casam com a busca ativa. Quando definido e não
   * vazio, os nós FORA do conjunto são esmaecidos. `undefined`/vazio →
   * todos plenos.
   */
  matchIds?: Set<string> | null;
}

/* -------------------------------------------------------------------------- */
/* Inner — precisa estar dentro do <ReactFlowProvider> p/ useReactFlow.       */
/* -------------------------------------------------------------------------- */
function FlowInner({
  nodes: rawNodes,
  edges: rawEdges,
  selectedId,
  onSelect,
  colorAxis = 'general',
  height = 540,
  density = 'comfortable',
  matchIds,
}: LineageFlowCanvasProps) {
  const t = useT();
  const rf = useReactFlow();

  const layout = React.useMemo(
    () => computeLayout(rawNodes, rawEdges, density),
    [rawNodes, rawEdges, density],
  );

  const hasMatchFilter = !!matchIds && matchIds.size > 0;
  const isMatched = React.useCallback(
    (id: string) => !hasMatchFilter || (matchIds as Set<string>).has(id),
    [hasMatchFilter, matchIds],
  );

  const flowNodes: Node<FlowNodeData>[] = React.useMemo(
    () =>
      rawNodes.map((n) => {
        const accent = colorForAxis(n, colorAxis);
        return {
          id: n.id,
          type: 'lineageNode',
          position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
          draggable: true,
          selectable: true,
          data: {
            raw: n,
            selected: selectedId === n.id,
            accent,
            matched: isMatched(n.id),
            onActivate: () => onSelect?.(n),
          },
        };
      }),
    [rawNodes, layout, colorAxis, selectedId, isMatched, onSelect],
  );

  const flowEdges: Edge[] = React.useMemo(() => {
    const ids = new Set(rawNodes.map((n) => n.id));
    return rawEdges
      .filter((e) => ids.has(e.from_id) && ids.has(e.to_id))
      .map((e, i) => {
        const active = selectedId === e.from_id || selectedId === e.to_id;
        // Esmaece arestas cujos dois extremos estão fora do match.
        const dim =
          hasMatchFilter && !isMatched(e.from_id) && !isMatched(e.to_id);
        // Relação legível da aresta (derivado de / ação / consome / …) —
        // exposta a leitores de tela; sem rótulo visível p/ não poluir o fluxo.
        const relation = labelLineageKind(e.kind);
        return {
          id: `${e.id}-${i}`,
          source: e.from_id,
          target: e.to_id,
          type: 'smoothstep',
          ariaLabel: relation,
          data: { relation },
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: active ? '#0F172A' : '#94A3B8',
          },
          style: {
            stroke: active ? '#0F172A' : '#94A3B8',
            strokeWidth: active ? 1.6 : 1,
            opacity: dim ? 0.15 : 1,
          },
        } satisfies Edge;
      });
  }, [rawNodes, rawEdges, selectedId, hasMatchFilter, isMatched]);

  const onNodeClick = React.useCallback(
    (_: React.MouseEvent, node: Node<FlowNodeData>) => {
      onSelect?.(node.data.raw);
    },
    [onSelect],
  );

  const onPaneClick = React.useCallback(() => {
    onSelect?.(null);
  }, [onSelect]);

  const miniMapColor = React.useCallback(
    (node: Node<FlowNodeData>) =>
      node.data.matched ? node.data.accent : '#CBD5E1',
    [],
  );

  // Busca → centra no nó selecionado/buscado (sem alterar zoom bruscamente).
  React.useEffect(() => {
    if (!selectedId) return;
    const p = layout.positions.get(selectedId);
    if (!p) return;
    // centro do nó (dagre/grid devolvem top-left).
    const cx = p.x + NODE_W / 2;
    const cy = p.y + NODE_H / 2;
    // setCenter mantém o zoom atual quando possível.
    const z = rf.getZoom?.() ?? 1;
    rf.setCenter?.(cx, cy, { zoom: Math.max(z, 0.6), duration: 300 });
  }, [selectedId, layout, rf]);

  const handleFit = React.useCallback(() => {
    rf.fitView?.({ padding: 0.2, duration: 300 });
  }, [rf]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={NODE_TYPES}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.08}
      maxZoom={2}
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} size={1} color="#E2E8F0" />
      <Panel position="top-right">
        <button
          type="button"
          onClick={handleFit}
          data-testid="grafo-fit-view"
          aria-label={t('grafo.fitView')}
          title={t('grafo.fitView')}
          className="h-8 px-2.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold border border-border-light bg-white text-text-on-light hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
          {t('grafo.fitView')}
        </button>
      </Panel>
      <Controls position="bottom-right" showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={miniMapColor}
        maskColor="rgba(241,245,249,0.7)"
      />
    </ReactFlow>
  );
}

/* -------------------------------------------------------------------------- */
/* Componente — envolve o inner no Provider (escopo do useReactFlow).         */
/* -------------------------------------------------------------------------- */
export function LineageFlowCanvas(props: LineageFlowCanvasProps) {
  const { height = 540, colorAxis = 'general' } = props;
  return (
    <div
      className="relative bg-canvas-light border border-border-light overflow-hidden"
      style={{ width: '100%', height }}
      data-testid="lineage-flow-canvas"
      data-color-axis={colorAxis}
      data-density={props.density ?? 'comfortable'}
    >
      <ReactFlowProvider>
        <FlowInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export default LineageFlowCanvas;
