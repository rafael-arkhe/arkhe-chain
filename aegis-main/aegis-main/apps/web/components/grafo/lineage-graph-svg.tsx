'use client';

/**
 * <LineageGraphSVG /> — Sprint L9 (2026-05-23).
 *
 * Força-grafo SVG puro p/ Workflow Lineage. Sem react-force-graph: rodamos
 * `d3-force-3d` em 2D no useEffect, salvamos posições no estado e
 * renderizamos `<svg>` com `<circle>` por nó + `<line>` por aresta. Razão:
 * full control (zoom/pan/drag/hover/tests acessam SVG real, não <canvas>),
 * SSR-safe, e roda 200-300 nós sem suor.
 *
 * Props:
 *   - `nodes`, `edges` — saída de `LineageGraph.get()` (já filtrada por
 *     `kind`/`marking` no servidor)
 *   - `selectedId` (opcional) + `onSelect`
 *   - `mode` — 'all' | 'neighbors' | 'upstream' | 'downstream'
 *     Filtragem client-side (BFS sobre {nodes,edges} já materializados).
 *     Motivo: o lineage-graph endpoint usa IDs prefixados
 *     (asset:UUID, action:UUID …) ≠ OntologyNode.id que /links/* aceita.
 *
 * Cores por kind: blue=DataAsset · violet=ActionType · teal=LogicFunction
 * · gray=OntologyNode · amber=Workspace · slate=default.
 */
import * as React from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
} from 'd3-force-3d';
import type { LineageGraphNode, LineageGraphEdge } from '@/lib/api';
import { Links, PainelApps, type PainelAppPerfStatsOut } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */
export type LineageMode = 'all' | 'neighbors' | 'upstream' | 'downstream';

export interface LineageGraphSVGProps {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  selectedId?: string | null;
  onSelect?: (node: LineageGraphNode | null) => void;
  mode?: LineageMode;
  width?: number;
  height?: number;
  /** força (em px) — distância alvo de uma aresta. */
  linkDistance?: number;
  /** repulsão entre nós (negativo). */
  chargeStrength?: number;
  /** profundidade do BFS para upstream/downstream. */
  maxDepth?: number;
  /**
   * Wave G.1 — quando setado, o card de Estatísticas chama
   * `GET /platform/v23/painel-apps/{workspaceId}/perf-stats` e exibe
   * total_ms + slowest_3 (server_time_ms / time_in_node_ms) em vez do
   * mock derivado do estado visível.
   */
  workspaceId?: string | null;
}

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null | undefined;
  fy: number | null | undefined;
  data: LineageGraphNode;
}

interface SimEdge {
  source: string | SimNode;
  target: string | SimNode;
  data: LineageGraphEdge;
}

/* -------------------------------------------------------------------------- */
/* Estilos por kind                                                           */
/* -------------------------------------------------------------------------- */
const KIND_FILL: Record<string, string> = {
  DataAsset: '#2D77BE',
  ActionType: '#7C3AED',
  LogicFunction: '#0D9488',
  OntologyNode: '#64748B',
  Workspace: '#D97706',
};
const DEFAULT_FILL = '#475569';
const STROKE_DEFAULT = '#1E293B';
const STROKE_SELECTED = '#0F172A';

function kindFill(kind: string): string {
  return KIND_FILL[kind] ?? DEFAULT_FILL;
}

/* -------------------------------------------------------------------------- */
/* BFS p/ modos upstream / downstream                                         */
/* -------------------------------------------------------------------------- */
function bfs(
  startId: string,
  edges: LineageGraphEdge[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
): Set<string> {
  const visited = new Set<string>([startId]);
  let frontier: string[] = [startId];
  for (let d = 0; d < maxDepth; d += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges) {
        if (direction !== 'upstream' && e.from_id === id && !visited.has(e.to_id)) {
          visited.add(e.to_id);
          next.push(e.to_id);
        }
        if (direction !== 'downstream' && e.to_id === id && !visited.has(e.from_id)) {
          visited.add(e.from_id);
          next.push(e.from_id);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return visited;
}

/* -------------------------------------------------------------------------- */
/* Aplica o `mode` ao subconjunto visível                                     */
/* -------------------------------------------------------------------------- */
function filterByMode(
  nodes: LineageGraphNode[],
  edges: LineageGraphEdge[],
  selectedId: string | null | undefined,
  mode: LineageMode,
  maxDepth: number,
): { nodes: LineageGraphNode[]; edges: LineageGraphEdge[] } {
  if (mode === 'all' || !selectedId) return { nodes, edges };
  let keep: Set<string>;
  if (mode === 'neighbors') {
    keep = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.from_id === selectedId) keep.add(e.to_id);
      if (e.to_id === selectedId) keep.add(e.from_id);
    }
  } else if (mode === 'upstream') {
    keep = bfs(selectedId, edges, 'upstream', maxDepth);
  } else {
    keep = bfs(selectedId, edges, 'downstream', maxDepth);
  }
  const fnodes = nodes.filter((n) => keep.has(n.id));
  const fedges = edges.filter((e) => keep.has(e.from_id) && keep.has(e.to_id));
  return { nodes: fnodes, edges: fedges };
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                 */
/* -------------------------------------------------------------------------- */
export function LineageGraphSVG(props: LineageGraphSVGProps) {
  const {
    nodes: rawNodes,
    edges: rawEdges,
    selectedId,
    onSelect,
    mode = 'all',
    width = 760,
    height = 540,
    linkDistance = 70,
    chargeStrength,
    maxDepth = 3,
    workspaceId = null,
  } = props;

  /* Wave G.1 — Performance Stats reais via /painel-apps/{id}/perf-stats
     quando workspaceId está presente. Sem workspaceId mantém o card
     antigo (contagem de nós/arestas). Carregamento lazy + tolerante a
     falhas (silencioso). */
  const [perfStats, setPerfStats] = React.useState<PainelAppPerfStatsOut | null>(
    null,
  );
  React.useEffect(() => {
    if (!workspaceId) {
      setPerfStats(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const out = await PainelApps.perfStats(workspaceId);
        if (!cancelled) setPerfStats(out);
      } catch {
        if (!cancelled) setPerfStats(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  /* Sprint L17 (2026-05-23): quando temos selectedId + mode ≠ 'all',
     tentamos primeiro o traversal recursivo no servidor via
     /platform/v23/links/{node_id}/{mode}. Isto requer resolver o ID
     prefixado (`asset:UUID`, `action:UUID`) → OntologyNode.id pelo
     endpoint /links/_resolve. Quando o resolve devolve null
     (asset sem nó, action sem execução) OU o request falha por
     outras razões, caímos no BFS client-side existente, que opera
     sobre os IDs prefixados originais. Garante zero regressão.
   */
  const [serverKeep, setServerKeep] = React.useState<Set<string> | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setServerKeep(null);
    if (!selectedId || mode === 'all') return;
    (async () => {
      try {
        const resolved = await Links.resolve(selectedId);
        if (cancelled) return;
        if (!resolved.ontology_node_id) {
          // Fallback explícito — BFS client-side. Não pré-popula serverKeep.
          return;
        }
        const ontId = resolved.ontology_node_id;
        const fetcher =
          mode === 'neighbors'
            ? Links.neighbors
            : mode === 'upstream'
              ? Links.upstream
              : Links.downstream;
        const out = await fetcher(ontId, { max_depth: maxDepth, max_nodes: 200 });
        if (cancelled) return;
        const keep = new Set<string>();
        // Mapeia ontology_node_id de volta para o ID prefixado em rawNodes:
        // assets têm DataAsset.ontology_node_id; actions resolvem via último
        // execution -> target_node_id. Por isso, comparamos extra.* quando
        // existir, OU usamos o próprio id como passthrough (caso `node:*`).
        const ontIdToPrefixedIds = new Map<string, string[]>();
        for (const rn of rawNodes) {
          const extra = (rn.extra ?? {}) as Record<string, unknown>;
          const ont =
            typeof extra.ontology_node_id === 'string'
              ? extra.ontology_node_id
              : null;
          if (ont) {
            const list = ontIdToPrefixedIds.get(ont) ?? [];
            list.push(rn.id);
            ontIdToPrefixedIds.set(ont, list);
          }
        }
        for (const n of out.nodes) {
          const matches = ontIdToPrefixedIds.get(n.id) ?? [];
          for (const m of matches) keep.add(m);
        }
        // sempre inclui o próprio nó selecionado
        keep.add(selectedId);
        // Garante ao menos 1 elemento útil; senão deixa fallback assumir.
        if (keep.size >= 1) setServerKeep(keep);
      } catch {
        // Silenciosa — BFS client-side cobre. Mantém zero regressão.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, mode, maxDepth, rawNodes]);

  const visible = React.useMemo(() => {
    if (serverKeep && selectedId && mode !== 'all') {
      const fnodes = rawNodes.filter((n) => serverKeep.has(n.id));
      const fedges = rawEdges.filter(
        (e) => serverKeep.has(e.from_id) && serverKeep.has(e.to_id),
      );
      // Garante mínimo viável — se servidor devolveu só o próprio nó, fallback.
      if (fnodes.length >= 1) return { nodes: fnodes, edges: fedges };
    }
    return filterByMode(rawNodes, rawEdges, selectedId ?? null, mode, maxDepth);
  }, [serverKeep, rawNodes, rawEdges, selectedId, mode, maxDepth]);

  /* posições em estado p/ re-render a cada tick */
  const [positions, setPositions] = React.useState<Record<string, { x: number; y: number }>>({});
  const simRef = React.useRef<Simulation<SimNode, SimEdge> | null>(null);

  /* --- transform (zoom + pan) — declarado antes do effect p/ ser
       referenciado pelo `fitToView` ao final da simulação. */
  const [transform, setTransform] = React.useState({ x: 0, y: 0, k: 1 });

  /* --- monta a simulação a cada mudança em {nodes, edges, mode} --- */
  React.useEffect(() => {
    const cx = width / 2;
    const cy = height / 2;
    /* Charge dinâmico: nuvens grandes precisam de repulsão menor pra
       não dispararem pra fora do viewport. */
    const n = visible.nodes.length || 1;
    const charge =
      chargeStrength ?? Math.max(-260, -Math.min(260, 12000 / n));
    const simNodes: SimNode[] = visible.nodes.map((n, i) => {
      const ring = 1 + Math.floor(i / 16);
      const angle = (i * 2 * Math.PI) / Math.max(visible.nodes.length, 1);
      return {
        id: n.id,
        x: cx + Math.cos(angle) * (40 + ring * 30),
        y: cy + Math.sin(angle) * (40 + ring * 30),
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        data: n,
      };
    });
    const idx: Record<string, SimNode> = {};
    simNodes.forEach((sn) => {
      idx[sn.id] = sn;
    });
    const simEdges: SimEdge[] = visible.edges
      .filter((e) => idx[e.from_id] && idx[e.to_id])
      .map((e) => ({ source: e.from_id, target: e.to_id, data: e }));

    const sim = forceSimulation(simNodes, 2)
      .force(
        'link',
        forceLink(simEdges)
          .id((d: SimNode) => d.id)
          .distance(linkDistance)
          .strength(0.5),
      )
      .force('charge', forceManyBody().strength(charge))
      .force('center', forceCenter(cx, cy))
      .force('collide', forceCollide(14))
      .alpha(1)
      .alphaDecay(0.04) as Simulation<SimNode, SimEdge>;

    let firstFit = true;
    function publish() {
      const map: Record<string, { x: number; y: number }> = {};
      for (const sn of simNodes) {
        map[sn.id] = { x: sn.x, y: sn.y };
      }
      setPositions(map);
    }

    function fitToView() {
      if (!firstFit) return;
      firstFit = false;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const sn of simNodes) {
        if (sn.x < minX) minX = sn.x;
        if (sn.x > maxX) maxX = sn.x;
        if (sn.y < minY) minY = sn.y;
        if (sn.y > maxY) maxY = sn.y;
      }
      if (!Number.isFinite(minX)) return;
      const pad = 40;
      const w = Math.max(1, maxX - minX) + pad * 2;
      const h = Math.max(1, maxY - minY) + pad * 2;
      const k = Math.min(width / w, height / h, 1.5);
      const tx = width / 2 - ((minX + maxX) / 2) * k;
      const ty = height / 2 - ((minY + maxY) / 2) * k;
      setTransform({ x: tx, y: ty, k });
    }

    sim.on('tick', publish);
    sim.on('end', () => {
      publish();
      fitToView();
    });
    simRef.current = sim;
    publish();

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [visible.nodes, visible.edges, width, height, linkDistance, chargeStrength]);
  /* charge é derivado de chargeStrength + n; ambos disparam novo effect. */

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const dragRef = React.useRef<
    | { type: 'pan'; startX: number; startY: number; tx0: number; ty0: number }
    | { type: 'node'; id: string }
    | null
  >(null);

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setTransform((t) => {
      const newK = Math.max(0.2, Math.min(4, t.k * factor));
      return { ...t, k: newK };
    });
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const target = e.target as Element;
    const nodeId = target.getAttribute('data-node-id');
    if (nodeId) {
      dragRef.current = { type: 'node', id: nodeId };
    } else {
      dragRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        tx0: transform.x,
        ty0: transform.y,
      };
    }
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    if (d.type === 'pan') {
      setTransform((t) => ({
        ...t,
        x: d.tx0 + (e.clientX - d.startX),
        y: d.ty0 + (e.clientY - d.startY),
      }));
    } else if (d.type === 'node') {
      const sim = simRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!sim || !rect) return;
      const localX = (e.clientX - rect.left - transform.x) / transform.k;
      const localY = (e.clientY - rect.top - transform.y) / transform.k;
      const arr = sim.nodes();
      const found = arr.find((nn) => nn.id === d.id);
      if (found) {
        found.fx = localX;
        found.fy = localY;
        (sim.alpha(0.3) as Simulation<SimNode, SimEdge>).restart();
      }
    }
  }

  function onMouseUp() {
    const d = dragRef.current;
    if (d && d.type === 'node') {
      const sim = simRef.current;
      if (sim) {
        const arr = sim.nodes();
        const found = arr.find((nn) => nn.id === d.id);
        if (found) {
          found.fx = null;
          found.fy = null;
        }
      }
    }
    dragRef.current = null;
  }

  function onNodeClick(n: LineageGraphNode, e: React.MouseEvent) {
    e.stopPropagation();
    onSelect?.(n);
  }

  /* --- hover --- */
  const [hoverId, setHoverId] = React.useState<string | null>(null);

  /* --- render ---------------------------------------------------------- */
  if (visible.nodes.length === 0) {
    return (
      <div
        data-testid="lineage-graph-svg-empty"
        className="flex h-full w-full items-center justify-center bg-canvas-light border border-border-light"
        style={{ minHeight: height }}
      >
        <p className="text-[11px] font-mono text-muted-on-light">
          Sem nós para renderizar.
        </p>
      </div>
    );
  }

  const hoverNode = hoverId ? visible.nodes.find((n) => n.id === hoverId) : null;
  const hoverPos = hoverId ? positions[hoverId] : null;

  return (
    <div
      className="relative bg-canvas-light border border-border-light overflow-hidden"
      style={{ width: '100%', height }}
      data-testid="lineage-graph-svg-wrap"
    >
      <svg
        ref={svgRef}
        data-testid="lineage-graph-svg"
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ display: 'block', cursor: dragRef.current?.type === 'pan' ? 'grabbing' : 'default' }}
      >
        <defs>
          <marker
            id="lineage-arrow"
            viewBox="0 -5 10 10"
            refX="18"
            refY="0"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,-5L10,0L0,5" fill="#475569" />
          </marker>
          <marker
            id="lineage-arrow-active"
            viewBox="0 -5 10 10"
            refX="18"
            refY="0"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,-5L10,0L0,5" fill="#0F172A" />
          </marker>
        </defs>

        <g
          transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
          data-testid="lineage-graph-viewport"
        >
          {/* Edges */}
          <g data-testid="lineage-graph-edges">
            {visible.edges.map((e) => {
              const s = positions[e.from_id];
              const t = positions[e.to_id];
              if (!s || !t) return null;
              const active =
                hoverId && (hoverId === e.from_id || hoverId === e.to_id);
              return (
                <line
                  key={e.id}
                  data-testid={`lineage-edge-${e.id}`}
                  data-edge-kind={e.kind}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={active ? '#0F172A' : '#94A3B8'}
                  strokeWidth={active ? 1.4 : 0.8}
                  markerEnd={
                    active ? 'url(#lineage-arrow-active)' : 'url(#lineage-arrow)'
                  }
                  opacity={active ? 1 : 0.55}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g data-testid="lineage-graph-nodes">
            {visible.nodes.map((n) => {
              const p = positions[n.id];
              if (!p) return null;
              const isSel = selectedId === n.id;
              const isHover = hoverId === n.id;
              const r = isSel ? 9 : isHover ? 8 : 6.5;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  data-testid={`lineage-svg-node-${n.id}`}
                  data-node-kind={n.kind}
                >
                  <circle
                    data-node-id={n.id}
                    r={r}
                    fill={kindFill(n.kind)}
                    stroke={isSel ? STROKE_SELECTED : STROKE_DEFAULT}
                    strokeWidth={isSel ? 2.2 : 1}
                    onClick={(ev) => onNodeClick(n, ev)}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId((id) => (id === n.id ? null : id))}
                    style={{ cursor: 'pointer' }}
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Tooltip */}
      {hoverNode && hoverPos && (
        <div
          data-testid="lineage-graph-tooltip"
          className="absolute pointer-events-none border border-border-light bg-white text-[11px] font-mono px-2 py-1 shadow-md"
          style={{
            left: hoverPos.x * transform.k + transform.x + 14,
            top: hoverPos.y * transform.k + transform.y - 8,
            maxWidth: 260,
          }}
        >
          <p className="font-semibold text-text-on-light truncate">
            {hoverNode.label}
          </p>
          <p className="text-muted-on-light">{hoverNode.kind}</p>
          {hoverNode.markings.length > 0 && (
            <p className="text-warning">{hoverNode.markings.join(', ')}</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        data-testid="lineage-graph-legend"
        className="absolute bottom-2 left-2 bg-white border border-border-light px-2 py-1 text-[10px] font-mono space-y-0.5"
      >
        {Object.entries(KIND_FILL).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{ background: c }}
              className="inline-block w-2 h-2"
            />
            <span className="text-text-on-light">{k}</span>
          </div>
        ))}
      </div>

      {/* Mode indicator */}
      <div
        data-testid="lineage-graph-mode-indicator"
        className="absolute top-2 right-2 bg-white border border-border-light px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-on-light"
      >
        Modo: {mode}
      </div>

      {/* Wave G.1 (2026-05-23) — Performance Stats card.
          Quando workspaceId está presente, consome
          `GET /platform/v23/painel-apps/{id}/perf-stats` e exibe
          tempos reais (total_ms + top-3 slowest widgets). Sem
          workspaceId, mantém contagem de nós/arestas (Wave F.2). */}
      <div
        data-testid="lineage-perf-stats"
        className="absolute top-2 right-32 bg-white border border-border-light px-2 py-1 text-[10px] font-mono text-muted-on-light flex flex-col gap-0.5 max-w-[260px]"
      >
        <p className="font-semibold uppercase tracking-wider text-text-on-light">
          Estatísticas
        </p>
        {perfStats ? (
          <>
            <p data-testid="lineage-perf-stats-total">
              Total:{' '}
              <span className="text-text-on-light">
                {perfStats.total_ms.toFixed(1)} ms
              </span>
            </p>
            <p>
              Amostras:{' '}
              <span className="text-text-on-light">{perfStats.sample_count}</span>
            </p>
            {perfStats.slowest_3.length > 0 && (
              <div
                className="mt-1 pt-1 border-t border-border-light"
                data-testid="lineage-perf-stats-slowest"
              >
                <p className="text-muted-on-light text-[9.5px] uppercase tracking-wider mb-0.5">
                  Mais lentos
                </p>
                {perfStats.slowest_3.map((w) => (
                  <p
                    key={`${w.widget_id}-${w.widget_type}`}
                    className="truncate"
                    title={`${w.widget_id} · ${w.widget_type}`}
                    data-testid={`lineage-perf-stats-widget-${w.widget_id}`}
                  >
                    <span className="text-text-on-light">
                      {w.widget_id.length > 14
                        ? `${w.widget_id.slice(0, 13)}…`
                        : w.widget_id}
                    </span>{' '}
                    {w.total_load_ms.toFixed(1)}ms
                  </p>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p>
              Nós:{' '}
              <span className="text-text-on-light">{visible.nodes.length}</span>
            </p>
            <p>
              Arestas:{' '}
              <span className="text-text-on-light">{visible.edges.length}</span>
            </p>
            <p>
              Modo: <span className="text-text-on-light">{mode}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default LineageGraphSVG;
