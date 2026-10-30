'use client';

/**
 * Sankey Flow — Sprint Wave D.4 (2026-05-23).
 *
 * Diagrama de fluxo Sankey simples (até ~4 níveis) renderizado em SVG
 * puro — sem libs externas. Útil para visualizar como ocorrências/casos
 * fluem entre categorias (origem → bairro → tipo → desfecho).
 *
 * Config:
 *   - source: external_id de uma variable que devolve
 *             array<{from: string, to: string, value: number}>
 *   - title?: cabeçalho
 *   - height?: px (default 320)
 *
 * Layout: agrupa nós em "níveis" via BFS topológico (from→to). Nodes
 * sem dependências vão pro nível 0; nodes que dependem deles, nível 1; etc.
 * Cada nó tem altura proporcional ao volume agregado que passa por ele.
 *
 * Cores por nível: ciclam por uma paleta DS (primary, success, warning,
 * danger). Sem hex literal — usa CSS variables que o tailwind plugin
 * resolve.
 */
import * as React from 'react';
import { GitBranch } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

interface Flow {
  from: string;
  to: string;
  value: number;
}

type Cfg = {
  source?: string;
  title?: string;
  height?: number;
};

/** Paleta hex usada por nível — escolhida pra match com os tokens DS. */
const LEVEL_COLORS = ['#2D77BE', '#0D9488', '#D97706', '#DC2626', '#7C3AED'];

function readFlows(
  variables: Record<string, unknown>,
  source: string | undefined,
): Flow[] {
  if (!source) return [];
  const raw = variables[source];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    const from = typeof o.from === 'string' ? o.from : '';
    const to = typeof o.to === 'string' ? o.to : '';
    const value = Number(o.value ?? 0);
    if (!from || !to || !Number.isFinite(value) || value <= 0) return [];
    return [{ from, to, value }];
  });
}

interface LayoutNode {
  id: string;
  level: number;
  total: number;
  y0: number;
  y1: number;
  color: string;
}

interface LayoutEdge {
  source: string;
  target: string;
  value: number;
  sourceY0: number;
  sourceY1: number;
  targetY0: number;
  targetY1: number;
  color: string;
}

function computeLayout(
  flows: Flow[],
  width: number,
  height: number,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; levels: number } {
  // Compute levels via Kahn-like sort
  const nodes = new Set<string>();
  const outBy = new Map<string, Flow[]>();
  const inBy = new Map<string, Flow[]>();
  for (const f of flows) {
    nodes.add(f.from);
    nodes.add(f.to);
    (outBy.get(f.from) ?? outBy.set(f.from, []).get(f.from))!.push(f);
    (inBy.get(f.to) ?? inBy.set(f.to, []).get(f.to))!.push(f);
  }
  const level = new Map<string, number>();
  // Start with sources (no incoming)
  for (const n of nodes) if (!inBy.has(n)) level.set(n, 0);
  // Propagate
  let changed = true;
  let safety = 16;
  while (changed && safety > 0) {
    changed = false;
    for (const f of flows) {
      const lFrom = level.get(f.from);
      if (lFrom == null) continue;
      const next = lFrom + 1;
      if ((level.get(f.to) ?? -1) < next) {
        level.set(f.to, next);
        changed = true;
      }
    }
    safety--;
  }
  // Fill anything still unassigned (cycles) com nível 0
  for (const n of nodes) if (!level.has(n)) level.set(n, 0);
  const maxLevel = Math.max(0, ...Array.from(level.values()));

  // Total por nó (max(in, out))
  const total = new Map<string, number>();
  for (const n of nodes) {
    const inSum = (inBy.get(n) ?? []).reduce((a, b) => a + b.value, 0);
    const outSum = (outBy.get(n) ?? []).reduce((a, b) => a + b.value, 0);
    total.set(n, Math.max(inSum, outSum) || 1);
  }

  // Agrupa nós por nível e posiciona vertical
  const byLevel = new Map<number, string[]>();
  for (const n of nodes) {
    const l = level.get(n) ?? 0;
    const arr = byLevel.get(l) ?? [];
    arr.push(n);
    byLevel.set(l, arr);
  }
  for (const arr of byLevel.values()) arr.sort();

  const PAD_Y = 8;
  const usable = height - PAD_Y * 2;
  const NODE_GAP = 6;

  const layoutNodes: LayoutNode[] = [];
  for (const [l, ids] of byLevel.entries()) {
    const totalsSum = ids.reduce((a, id) => a + (total.get(id) ?? 0), 0) || 1;
    const heightAvail = usable - NODE_GAP * (ids.length - 1);
    let y = PAD_Y;
    for (const id of ids) {
      const t = total.get(id) ?? 0;
      const h = (t / totalsSum) * heightAvail;
      layoutNodes.push({
        id,
        level: l,
        total: t,
        y0: y,
        y1: y + h,
        color: LEVEL_COLORS[l % LEVEL_COLORS.length],
      });
      y += h + NODE_GAP;
    }
  }

  // Posições X
  const colWidth = width / Math.max(1, maxLevel + 1);

  // Edges com Y do source/target proporcional a "fluxo ocupado".
  // Mantém ordem estável por (from, to).
  const usedOut = new Map<string, number>(); // px usados no source
  const usedIn = new Map<string, number>();
  const edges: LayoutEdge[] = [];
  for (const f of flows.sort((a, b) =>
    a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
  )) {
    const src = layoutNodes.find((n) => n.id === f.from);
    const tgt = layoutNodes.find((n) => n.id === f.to);
    if (!src || !tgt) continue;
    const srcHeight = src.y1 - src.y0;
    const tgtHeight = tgt.y1 - tgt.y0;
    const srcShare = (f.value / (total.get(src.id) || 1)) * srcHeight;
    const tgtShare = (f.value / (total.get(tgt.id) || 1)) * tgtHeight;
    const sStart = src.y0 + (usedOut.get(src.id) ?? 0);
    const tStart = tgt.y0 + (usedIn.get(tgt.id) ?? 0);
    edges.push({
      source: src.id,
      target: tgt.id,
      value: f.value,
      sourceY0: sStart,
      sourceY1: sStart + srcShare,
      targetY0: tStart,
      targetY1: tStart + tgtShare,
      color: src.color,
    });
    usedOut.set(src.id, (usedOut.get(src.id) ?? 0) + srcShare);
    usedIn.set(tgt.id, (usedIn.get(tgt.id) ?? 0) + tgtShare);
  }

  return { nodes: layoutNodes, edges, levels: maxLevel + 1 };
}

function pathBetween(
  sx: number,
  sy0: number,
  sy1: number,
  tx: number,
  ty0: number,
  ty1: number,
): string {
  const mx = (sx + tx) / 2;
  return [
    `M ${sx} ${sy0}`,
    `C ${mx} ${sy0}, ${mx} ${ty0}, ${tx} ${ty0}`,
    `L ${tx} ${ty1}`,
    `C ${mx} ${ty1}, ${mx} ${sy1}, ${sx} ${sy1}`,
    'Z',
  ].join(' ');
}

function SankeyFlow({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const height = typeof cfg.height === 'number' ? cfg.height : 320;
  const width = 720;
  const flows = readFlows(variables, cfg.source);

  if (flows.length === 0) {
    return (
      <div
        className="bg-white border border-border-light p-3 flex flex-col gap-2"
        data-testid="sankey-flow-widget"
      >
        {cfg.title && (
          <header className="flex items-center gap-2 border-b border-border-light pb-2">
            <GitBranch className="w-3 h-3 text-primary" strokeWidth={1.5} />
            <p className="text-h3 font-semibold flex-1">{cfg.title}</p>
          </header>
        )}
        <p
          className="text-small text-muted-on-light italic"
          data-testid="sankey-flow-empty"
        >
          Sem fluxos para desenhar. Configure o dado fonte com
          array {'{from, to, value}'}.
        </p>
      </div>
    );
  }

  const { nodes, edges, levels } = computeLayout(flows, width, height);
  const NODE_W = 14;
  const colWidth = width / Math.max(1, levels);

  return (
    <div
      className="bg-white border border-border-light flex flex-col"
      data-testid="sankey-flow-widget"
    >
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <GitBranch className="w-3 h-3 text-primary" strokeWidth={1.5} />
          <p className="text-caption uppercase tracking-[0.16em] font-semibold font-mono flex-1">
            {cfg.title}
          </p>
          <span
            className="text-caption font-mono text-muted-on-light"
            data-testid="sankey-flow-meta"
          >
            {nodes.length} nós · {edges.length} fluxos
          </span>
        </header>
      )}
      <div className="overflow-x-auto" data-testid="sankey-flow-canvas">
        <svg
          data-testid="sankey-flow-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block' }}
        >
          {/* Edges (caminhos curvos) */}
          <g data-testid="sankey-flow-edges">
            {edges.map((e, i) => {
              const src = nodes.find((n) => n.id === e.source);
              const tgt = nodes.find((n) => n.id === e.target);
              if (!src || !tgt) return null;
              const sx = (src.level + 1) * colWidth - NODE_W / 2;
              const tx = tgt.level * colWidth + NODE_W / 2;
              return (
                <path
                  key={`e-${i}`}
                  d={pathBetween(
                    sx,
                    e.sourceY0,
                    e.sourceY1,
                    tx,
                    e.targetY0,
                    e.targetY1,
                  )}
                  fill={e.color}
                  fillOpacity={0.28}
                  stroke="none"
                  data-testid={`sankey-flow-edge-${i}`}
                >
                  <title>{`${e.source} → ${e.target}: ${e.value}`}</title>
                </path>
              );
            })}
          </g>

          {/* Nodes */}
          <g data-testid="sankey-flow-nodes">
            {nodes.map((n) => {
              const x = n.level * colWidth + (colWidth - NODE_W) / 2;
              return (
                <g key={n.id} data-testid={`sankey-flow-node-${n.id}`}>
                  <rect
                    x={x}
                    y={n.y0}
                    width={NODE_W}
                    height={Math.max(2, n.y1 - n.y0)}
                    fill={n.color}
                    stroke="#0F172A"
                    strokeWidth={0.6}
                  />
                  <text
                    x={
                      n.level === 0
                        ? x + NODE_W + 4
                        : n.level === levels - 1
                          ? x - 4
                          : x + NODE_W + 4
                    }
                    y={(n.y0 + n.y1) / 2 + 3}
                    fontSize={10}
                    fontFamily="ui-monospace, monospace"
                    fill="#1E293B"
                    textAnchor={n.level === levels - 1 ? 'end' : 'start'}
                  >
                    {n.id} ({n.total})
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

registerWidget('sankey_flow', SankeyFlow, {
  group: 'viz',
  label: 'Fluxo Sankey',
  description:
    'Diagrama Sankey simples mostrando como volumes fluem entre categorias (até 4 níveis).',
  icon: 'git-branch',
  defaultColSpan: 8,
  mockConfig: {
    source: 'fluxos',
    title: 'Casos · origem → bairro → desfecho',
    height: 320,
  },
  mockVariables: {
    fluxos: [
      { from: 'CCTV', to: 'Centro', value: 22 },
      { from: 'CCTV', to: 'Sul', value: 14 },
      { from: 'Denúncia', to: 'Centro', value: 18 },
      { from: 'Denúncia', to: 'Norte', value: 10 },
      { from: 'Centro', to: 'Resolvido', value: 30 },
      { from: 'Centro', to: 'Em curso', value: 10 },
      { from: 'Sul', to: 'Resolvido', value: 9 },
      { from: 'Sul', to: 'Em curso', value: 5 },
      { from: 'Norte', to: 'Resolvido', value: 7 },
      { from: 'Norte', to: 'Em curso', value: 3 },
    ],
  },
  previewWidth: 480,
  previewHeight: 320,
  config_schema: [
    {
      name: 'source',
      label: 'Dado fonte',
      description:
        'external_id de variable retornando array [{from, to, value}].',
      field: 'variable-ref',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima do gráfico.',
      field: 'string',
      placeholder: 'ex.: Casos · origem → desfecho',
    },
    {
      name: 'height',
      label: 'Altura (px)',
      description: 'Altura visível em pixels.',
      field: 'number',
      min: 160,
      max: 800,
      step: 20,
      default: 320,
      unit: 'px',
    },
  ],
});

export { SankeyFlow };
