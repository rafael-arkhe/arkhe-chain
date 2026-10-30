'use client';

/**
 * SolutionCanvas — reactflow canvas for the Desenho da Operação.
 *
 * Renders the AIP Architect workflow graph: concept nodes across the four
 * phases (Coleta → Processamento → Ontologia → Construção da aplicação) plus
 * concrete nodes after a concept is expanded. The LLM-generated blueprint
 * populates each phase node's ``config.items`` — rendered inline so two
 * different problems produce visibly different diagrams.
 *
 * Interactive (M4-REWORK): drag-to-connect (drawable edges), node resize, and
 * a right-click context menu (send forward/back, group, delete). Follows
 * docs/research/foundry/solution-designer/diagrams.md.
 *
 * Estética sharp: sem rounded, sem emoji, tokens semânticos.
 */
import * as React from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  NodeResizer,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ArrowRight, Play, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

import type { SolutionGraph } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { PHASE_META, kindLabel, humanizeKind, nodeCaption, type Phase } from './nodeMeta';
import {
  deriveBlueprintGraph,
  isObjectNodeId,
  type BlueprintForGraph,
} from './blueprint-graph';

// D (feedback do operador): manter a COR de fase, mas corpo BRANCO (texto
// legível) + faixa colorida grossa à esquerda como identidade (o tint pálido
// bg-*-50 lavava o conteúdo). A cor também vive no rótulo da fase (phaseMeta.tone).
const PHASE_BG: Record<string, string> = {
  coleta: 'border border-border-light border-l-4 border-l-blue-700 bg-white',
  processamento: 'border border-border-light border-l-4 border-l-violet-700 bg-white',
  ontologia: 'border border-border-light border-l-4 border-l-success bg-white',
  aplicacao: 'border border-border-light border-l-4 border-l-warning bg-white',
};

type CanvasItem = { label: string; detail?: string };

/**
 * B (#1) — arestas DERIVADAS da ROTA das fontes: para cada nó de Coleta com
 * fontes que declaram um Tipo de objeto de saída (``target_node_type``), liga
 * o nó ao destino. Prefere um nó ``ontology_type`` específico daquele tipo;
 * senão, o nó da fase ``ontologia``. Dedupe contra arestas já existentes (não
 * recria uma seta que o operador desenhou). Pura — testável sem reactflow.
 */
export function deriveRouteEdges(
  nodes: { id: string; kind: string; phase: string; title?: string; config?: Record<string, unknown> }[],
  existingKeys: Set<string>,
): { id: string; source: string; target: string; label: string }[] {
  const ontoPhase = nodes.find((n) => n.phase === 'ontologia');
  const typeNodeByKind = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind === 'ontology_type') {
      const cfg = n.config as Record<string, unknown> | undefined;
      const k = String((cfg?.object_kind as string) || (cfg?.kind as string) || n.title || '').trim();
      if (k) typeNodeByKind.set(k, n.id);
    }
  }
  const out: { id: string; source: string; target: string; label: string }[] = [];
  const seen = new Set(existingKeys);
  for (const n of nodes) {
    if (n.phase !== 'coleta') continue;
    const srcs = Array.isArray(n.config?.linked_sources)
      ? (n.config!.linked_sources as { target_node_type?: string }[])
      : [];
    const kinds = Array.from(
      new Set(srcs.map((s) => s.target_node_type).filter((k): k is string => !!k)),
    );
    for (const kind of kinds) {
      const targetId = typeNodeByKind.get(kind) || ontoPhase?.id;
      if (!targetId || targetId === n.id) continue;
      const key = `${n.id}->${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `auto:${n.id}:${kind}`, source: n.id, target: targetId, label: kind });
    }
  }
  return out;
}

function SolutionNodeView(props: NodeProps) {
  const t = useT();
  const { data, selected } = props;
  const phase = String(data.phase || 'coleta') as Phase;
  const isConcept = data.kind === 'concept';
  const phaseMeta = PHASE_META[phase] ?? PHASE_META.coleta;
  const bg = PHASE_BG[phase] ?? 'border border-border-light bg-canvas-light';
  const items: CanvasItem[] = Array.isArray(data.config?.items)
    ? (data.config.items as CanvasItem[])
    : [];
  // #1 (feedback do operador) — status de dados nos nós de COLETA: o operador
  // bate o olho no diagrama e sabe o que falta plugar. P2 (2026-06-05):
  // múltiplas fontes por nó — lê linked_sources (array) com fallback do
  // linked_source legado (singular, pré-P2). Chip mostra "N fontes".
  const rawSources = data.config?.linked_sources;
  const legacy = (data.config?.linked_source ?? null) as { label?: string } | null;
  // B (#1) — cada fonte carrega a ROTA (target_node_type). O nó mostra
  // "Fonte → Tipo" inline: o operador lê a SAÍDA sem hover nem seguir seta.
  const sources: { label?: string; target_node_type?: string }[] = Array.isArray(rawSources)
    ? (rawSources as { label?: string; target_node_type?: string }[])
    : legacy
      ? [legacy]
      : [];
  const sourcesTitle = sources.map((s) => s.label).filter(Boolean).join(' · ') || undefined;
  // #6 — resolve o kind do Tipo de saída p/ o nome humano (nunca kind cru):
  // display_name do blueprint OU, faltando, humaniza o slug (Produto Final).
  const typeLabels = (data.typeLabels || {}) as Record<string, string>;
  const typeName = (kind: string) => typeLabels[kind] || humanizeKind(kind);
  return (
    <div
      data-testid={`canvas-node-${phase}`}
      data-node-id={data.id}
      className={
        `relative min-w-[180px] max-w-[240px] h-full px-3 py-2 ${bg} ` +
        (selected ? 'ring-2 ring-primary ring-offset-1' : '')
      }
    >
      {/* ▶ Play por nó — valida o nó e mostra o output (erro→o que arrumar /
          sucesso→dados). Nós sintéticos (objectType) e read-only não têm play. */}
      {!data.readonly && !data.objectType && typeof data.onPlay === 'function' && (
        <button
          type="button"
          data-testid={`node-play-${data.id}`}
          title={t('solutions.nodePlay')}
          aria-label={t('solutions.nodePlay')}
          onClick={(e) => {
            e.stopPropagation();
            (data.onPlay as (id: string) => void)(String(data.id));
          }}
          className="absolute top-1 right-1 z-10 inline-flex items-center justify-center w-5 h-5 border border-border-light bg-white hover:border-primary text-muted-on-light hover:text-primary"
        >
          {data.playStatus === 'running' ? (
            <Loader2 className="w-3 h-3 animate-spin text-primary" strokeWidth={1.5} />
          ) : data.playStatus === 'ok' ? (
            <CheckCircle2 className="w-3 h-3 text-success" strokeWidth={1.5} />
          ) : data.playStatus === 'error' ? (
            <AlertTriangle className="w-3 h-3 text-danger" strokeWidth={1.5} />
          ) : (
            <Play className="w-3 h-3" strokeWidth={1.5} />
          )}
        </button>
      )}
      {/* Resize handle — visible while selected (Foundry control #7). */}
      {!data.readonly && (
        <NodeResizer
          isVisible={selected}
          minWidth={180}
          minHeight={64}
          lineClassName="!border-primary"
          handleClassName="!bg-primary !w-2 !h-2 !border-0"
        />
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-on-light !w-2 !h-2"
      />
      <div className={`text-[10px] uppercase tracking-widest ${phaseMeta.tone}`}>
        {nodeCaption({
          objectType: !!data.objectType,
          isConcept,
          title: data.title,
          phaseLabel: phaseMeta.label,
          conceptLabel: t('solutions.nodeConcept'),
          objectTypeLabel: t('solutions.nodeObjectType'),
        })}
      </div>
      <div className="text-[12px] font-semibold text-text-on-light mt-1 leading-tight">
        {data.title || kindLabel(String(data.kind))}
      </div>
      {!isConcept && (
        <div className="text-[11px] text-muted-on-light mt-1">
          {kindLabel(String(data.kind))}
        </div>
      )}
      {items.length > 0 && (
        <ul className="mt-1.5 space-y-1" data-testid={`node-items-${phase}`}>
          {items.map((it, i) => (
            <li
              key={`${it.label}-${i}`}
              className="text-[11px] text-text-on-light bg-white/70 border border-border-light px-1.5 py-0.5 truncate"
              title={it.detail || it.label}
            >
              {it.label}
            </li>
          ))}
        </ul>
      )}
      {data.config?.generate_data_model ? (
        <div className="text-[10px] mt-1 uppercase tracking-wider text-success">
          {t('solutions.nodeDataModel')}
        </div>
      ) : null}
      {/* B (#1) — status de dados (só fase Coleta) em 3 estados, com as ROTAS
          Fonte→Tipo inline. Estado de cor: sem fontes (amarelo) → fontes sem
          Saída (amarelo de atenção) → todas com Saída (verde). */}
      {phase === 'coleta' &&
        (sources.length === 0 ? (
          <div
            className="inline-flex items-center mt-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-warning/10 border border-warning/40 text-warning"
            data-testid="node-data-missing"
          >
            {t('solutions.nodeNoData')}
          </div>
        ) : (
          <div
            className="mt-1 space-y-1"
            data-testid="node-data-linked"
            data-output={sources.every((s) => s.target_node_type) ? 'all' : 'partial'}
            title={sourcesTitle}
          >
            {sources.slice(0, 4).map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className={
                  'flex items-center gap-1 px-1 py-0.5 text-[10px] border ' +
                  (s.target_node_type
                    ? 'bg-success/10 border-success/40 text-success'
                    : 'bg-warning/10 border-warning/40 text-warning')
                }
              >
                <span className="truncate max-w-[88px]">{s.label}</span>
                {s.target_node_type ? (
                  <>
                    <ArrowRight className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{typeName(s.target_node_type)}</span>
                  </>
                ) : (
                  <span className="opacity-80 shrink-0">· {t('solutions.nodeNoOutput')}</span>
                )}
              </div>
            ))}
            {sources.length > 4 && (
              <div className="text-[10px] text-muted-on-light">
                {t('solutions.nodeMoreSources').replace('{n}', String(sources.length - 4))}
              </div>
            )}
          </div>
        ))}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-on-light !w-2 !h-2"
      />
    </div>
  );
}

const NODE_TYPES = { solution: SolutionNodeView };

// #17a — rótulos de aresta LEGÍVEIS: antes eram texto puro que estourava e
// ficava por baixo dos nós. Badge branco (sharp, sem rounded) + truncar longos.
function truncLabel(s: string): string {
  const v = String(s || '');
  return v.length > 22 ? `${v.slice(0, 21)}…` : v;
}
const EDGE_LABEL_STYLE = (fill: string) => ({ fontSize: 9, fontFamily: 'monospace', fill });
const EDGE_LABEL_BG = { fill: '#ffffff', fillOpacity: 0.92, stroke: '#e4e4e7', strokeWidth: 1 };
const EDGE_LABEL_BG_PAD: [number, number] = [4, 2];

export function SolutionCanvas({
  graph,
  selectedId,
  onSelect,
  onConnect,
  onNodePositionChange,
  onNodeContextAction,
  onNodePlay,
  playStatus,
  readonly = false,
}: {
  graph: SolutionGraph;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Drag-to-connect: a new edge was drawn between two nodes. */
  onConnect?: (edge: { source: string; target: string }) => void;
  /** Node was dragged or resized — persist its new position/size. */
  onNodePositionChange?: (
    id: string,
    pos: { x: number; y: number },
    size?: { width?: number; height?: number },
  ) => void;
  /** Context-menu action on a node (#17b — só 'delete' é exposto). */
  onNodeContextAction?: (id: string, action: 'delete') => void;
  /** ▶ play em um nó — valida/roda aquele nó e mostra o output (erro/sucesso). */
  onNodePlay?: (id: string) => void;
  /** Estado do play por nó (id → 'idle'|'running'|'ok'|'error') p/ o badge no ▶. */
  playStatus?: Record<string, 'idle' | 'running' | 'ok' | 'error'>;
  readonly?: boolean;
}) {
  const t = useT();
  const [menu, setMenu] = React.useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // B (#6 do review) — mapa kind→nome humano do Tipo de objeto (do blueprint
  // embutido + nós ontology_type). O nó/aresta nunca mostra o kind cru como
  // rótulo único quando há display_name.
  const typeLabels = React.useMemo(() => {
    const m: Record<string, string> = {};
    const wiz = graph.wizard as Record<string, unknown> | undefined;
    const bp = wiz?._blueprint as
      | { ontology_types?: { kind?: string; display_name?: string }[] }
      | undefined;
    for (const o of bp?.ontology_types ?? []) {
      const k = String(o.kind || '').trim();
      if (k) m[k] = String(o.display_name || o.kind || '').trim() || k;
    }
    for (const n of graph.nodes || []) {
      if (n.kind === 'ontology_type') {
        const cfg = n.config as Record<string, unknown> | undefined;
        const k = String((cfg?.object_kind as string) || (cfg?.kind as string) || n.title || '').trim();
        if (k && !m[k]) m[k] = (n.title || k).trim();
      }
    }
    return m;
  }, [graph]);

  // F3 — nós de tipo de objeto + arestas de lineage derivados do blueprint
  // embutido (proposed_links / widgets / itens da coleta). Tudo que faltava pra
  // o operador VER "Coleta → objeto → consumido na Construção".
  const derived = React.useMemo(() => {
    const wiz = graph.wizard as Record<string, unknown> | undefined;
    const bp = (wiz?._blueprint as BlueprintForGraph | undefined) ?? undefined;
    return deriveBlueprintGraph(bp, graph.nodes || []);
  }, [graph.wizard, graph.nodes]);

  const nodes: Node[] = React.useMemo(
    () => [
      ...(graph.nodes || []).map((n, i) => ({
        id: n.id,
        type: 'solution',
        position: n.position || {
          x: 80 + (i % 4) * 280,
          y: 120 + Math.floor(i / 4) * 130,
        },
        selected: n.id === selectedId,
        draggable: !readonly,
        ...(typeof n.config?.width === 'number'
          ? { width: n.config.width as number }
          : {}),
        ...(typeof n.config?.height === 'number'
          ? { height: n.config.height as number }
          : {}),
        zIndex: typeof n.config?.z === 'number' ? (n.config.z as number) : 0,
        data: {
          id: n.id,
          kind: n.kind,
          phase: n.phase,
          title: n.title,
          config: n.config || {},
          typeLabels,
          readonly,
          onPlay: onNodePlay,
          playStatus: playStatus?.[n.id] || 'idle',
        },
      })),
      // Nós de tipo de objeto: SINTÉTICOS (derivados do blueprint), só-leitura
      // — não arrastáveis/selecionáveis/deletáveis (não existem no graph salvo).
      ...derived.objectNodes.map((o) => ({
        id: o.id,
        type: 'solution',
        position: o.position,
        draggable: false,
        selectable: false,
        deletable: false,
        zIndex: 0,
        data: {
          id: o.id,
          kind: o.kind,
          phase: o.phase,
          title: o.title,
          config: o.config,
          typeLabels,
          readonly: true,
          objectType: true,
        },
      })),
    ],
    [graph.nodes, selectedId, readonly, typeLabels, derived, onNodePlay, playStatus],
  );

  // #4 (fix do operador) — reactflow é CONTROLADO (nodes={...}); sem aplicar as
  // mudanças durante o arrasto, o nó não se move ao vivo (parecia travado). Um
  // estado local espelha os nós derivados e aplica `applyNodeChanges` no drag;
  // re-sincroniza quando o graph muda (posição final persiste via
  // onNodePositionChange → re-deriva com n.position).
  const [liveNodes, setLiveNodes] = React.useState<Node[]>(nodes);
  React.useEffect(() => {
    setLiveNodes(nodes);
  }, [nodes]);

  const edges: Edge[] = React.useMemo(() => {
    const base: Edge[] = (graph.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      animated: false,
      labelStyle: { fontSize: 10, fontFamily: 'monospace' },
      style: { stroke: '#71717a' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#71717a' },
    }));
    // B (#1) — arestas DERIVADAS da rota das fontes (Coleta→Tipo de objeto),
    // verde tracejado p/ distinguir das manuais. Dedupe contra as existentes.
    // F3 — passa também os nós de objeto sintéticos p/ a rota cair no TIPO
    // específico (não só na fase ontologia).
    const seen = new Set(base.map((e) => `${e.source}->${e.target}`));
    const routeRaw = [...graph.nodes, ...derived.objectNodes];
    const route: Edge[] = deriveRouteEdges(routeRaw, seen).map((e) => {
      seen.add(`${e.source}->${e.target}`);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: truncLabel(typeLabels[e.label] || humanizeKind(e.label)), // #6 — nome humano do Tipo na seta (nunca slug cru)
        // #19 — fluxo de coleta animado (dado entrando da fonte pro Tipo).
        animated: true,
        labelStyle: EDGE_LABEL_STYLE('#16a34a'),
        labelBgStyle: EDGE_LABEL_BG,
        labelBgPadding: EDGE_LABEL_BG_PAD,
        labelBgBorderRadius: 0,
        style: { stroke: '#16a34a', strokeDasharray: '4 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a' },
      };
    });
    // F3 — lineage do blueprint: relações tipo↔tipo (azul-aço, sólida),
    // Coleta→objeto (verde tracejado), objeto→Construção (âmbar tracejado).
    const bpEdges: Edge[] = [];
    for (const e of derived.edges) {
      const key = `${e.source}->${e.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const color = e.relation ? '#2D77BE' : e.consumer ? '#a16207' : '#16a34a';
      bpEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label ? truncLabel(e.label) : undefined,
        // #19 — fluxo de dados (Coleta→objeto, objeto→Construção) animado;
        // relações semânticas tipo↔tipo ficam sólidas/estáticas (sem distração).
        animated: !e.relation,
        labelStyle: EDGE_LABEL_STYLE(color),
        labelBgStyle: EDGE_LABEL_BG,
        labelBgPadding: EDGE_LABEL_BG_PAD,
        labelBgBorderRadius: 0,
        style: {
          stroke: color,
          ...(e.relation ? {} : { strokeDasharray: '4 3' }),
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      });
    }
    return [...base, ...route, ...bpEdges];
  }, [graph.edges, graph.nodes, typeLabels, derived]);

  const handleNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      if (readonly) return;
      for (const ch of changes) {
        // F3 — nós de objeto são sintéticos (não estão no graph salvo); nunca
        // persistir posição/tamanho deles.
        if ('id' in ch && typeof ch.id === 'string' && isObjectNodeId(ch.id)) continue;
        if (ch.type === 'position' && ch.position && !ch.dragging) {
          onNodePositionChange?.(ch.id, ch.position);
        }
        if (ch.type === 'dimensions' && ch.dimensions) {
          onNodePositionChange?.(
            ch.id,
            // position is unchanged on resize; pass a marker the page merges
            undefined as unknown as { x: number; y: number },
            { width: ch.dimensions.width, height: ch.dimensions.height },
          );
        }
      }
      // #4 — APLICA as mudanças no estado local p/ o arrasto ser visível ao vivo
      // (controlado: sem isso o nó não se move até soltar). A posição final é
      // persistida acima via onNodePositionChange (!dragging).
      setLiveNodes((nds) => applyNodeChanges(changes, nds));
    },
    [readonly, onNodePositionChange],
  );

  const handleConnect = React.useCallback(
    (c: Connection) => {
      if (readonly || !c.source || !c.target || c.source === c.target) return;
      onConnect?.({ source: c.source, target: c.target });
    },
    [readonly, onConnect],
  );

  return (
    <div className="h-full w-full relative" data-testid="solution-canvas">
      <ReactFlow
        nodes={liveNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        elementsSelectable={!readonly}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        onNodeClick={(_e, n) => onSelect?.(n.id)}
        onPaneClick={() => {
          onSelect?.(null);
          setMenu(null);
        }}
        onNodeContextMenu={(e, n) => {
          if (readonly) return;
          e.preventDefault();
          const rect = (e.currentTarget as HTMLElement)
            .closest('[data-testid="solution-canvas"]')
            ?.getBoundingClientRect();
          setMenu({
            id: n.id,
            x: e.clientX - (rect?.left ?? 0),
            y: e.clientY - (rect?.top ?? 0),
          });
          onSelect?.(n.id);
        }}
        connectionLineStyle={{ stroke: '#0f766e' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#e4e4e7" />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>

      {menu && !readonly && (
        <div
          className="absolute z-50 bg-white border border-border-light shadow-md min-w-[160px]"
          style={{ left: menu.x, top: menu.y }}
          data-testid="node-context-menu"
          onMouseLeave={() => setMenu(null)}
        >
          {/* #17b — só "Excluir": forward/back não tinham efeito visível e
              "Agrupar" era dead code (flag que ninguém lia) — confundiam. */}
          {(
            [
              ['delete', 'solutions.deleteNode'],
            ] as const
          ).map(([action, labelKey]) => (
            <button
              key={action}
              type="button"
              data-testid={`ctx-${action}`}
              className={
                'w-full text-left text-[11.5px] px-3 py-1.5 hover:bg-canvas-light ' +
                (action === 'delete'
                  ? 'text-danger'
                  : 'text-text-on-light')
              }
              onClick={() => {
                onNodeContextAction?.(menu.id, action);
                setMenu(null);
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
