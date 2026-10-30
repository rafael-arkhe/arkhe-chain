'use client';

/**
 * InspectorDepsTab — Wave G.2 (2026-05-23).
 *
 * Vista interativa de dependências do widget selecionado.
 *
 *   - "Usa"            (upstream): variáveis/queries que ESTE widget lê
 *                                  via `props.source*`, `bindings` ou
 *                                  metadados de variables-ref do schema.
 *   - "Consumido por"  (downstream): outros widgets que leem variáveis
 *                                    que este widget ESCREVE (eventos
 *                                    `set_variable` / `refresh_variable`,
 *                                    eventos `node.events`).
 *
 * Mostra também um mini-grafo via `<LineageGraphSVG />` em modo
 * `neighbors` com o widget atual como nó raiz. Click num item navega
 * (`onNavigate`) para o widget ou variável correspondente.
 */
import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, Network } from 'lucide-react';
import { LineageGraphSVG } from '@/components/grafo/lineage-graph-svg';
import type { LineageGraphNode, LineageGraphEdge } from '@/lib/api';
import type { LayoutNode, WorkshopApp, WorkshopAppLayout } from '@/lib/workshop/types';

function collectAllNodes(app: WorkshopApp): LayoutNode[] {
  const out: LayoutNode[] = [];
  function walk(layout: WorkshopAppLayout) {
    function visit(n: LayoutNode) {
      out.push(n);
      for (const c of n.children ?? []) visit(c);
    }
    for (const n of layout.root ?? []) visit(n);
  }
  if (app.pages && app.pages.length > 0) {
    for (const p of app.pages) walk(p.layout);
  } else if (app.layout) {
    walk(app.layout);
  }
  return out;
}

function readsOf(node: LayoutNode): string[] {
  const out = new Set<string>();
  const props = (node.widget.props ?? {}) as Record<string, unknown>;
  for (const [key, val] of Object.entries(props)) {
    if (key.startsWith('source') || key.endsWith('_source') || key === 'binding') {
      if (typeof val === 'string' && val.trim()) {
        out.add(val.trim().split('.')[0]);
      }
    }
  }
  for (const v of Object.values(node.widget.bindings ?? {})) {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
  }
  return Array.from(out);
}

function writesOf(node: LayoutNode): string[] {
  // F2: modelo único = node.events (config.on_events foi removido).
  const out = new Set<string>();
  for (const ev of node.events ?? []) {
    if (ev.action === 'set_variable' || ev.action === 'refresh_variable') {
      const t = (ev.params?.target as string) || '';
      if (t) out.add(t);
    }
  }
  return Array.from(out);
}

interface DepsResult {
  upstream: { kind: 'variable'; id: string; label: string }[];
  downstream: { kind: 'widget'; id: string; label: string; via: string }[];
  graph: { nodes: LineageGraphNode[]; edges: LineageGraphEdge[] };
}

function computeDeps(app: WorkshopApp, widgetId: string): DepsResult {
  const allNodes = collectAllNodes(app);
  const target = allNodes.find((n) => n.id === widgetId);
  const upstream: DepsResult['upstream'] = [];
  const downstream: DepsResult['downstream'] = [];
  const nodes: LineageGraphNode[] = [];
  const edges: LineageGraphEdge[] = [];

  if (!target) {
    return { upstream, downstream, graph: { nodes, edges } };
  }

  const targetReads = readsOf(target);
  const targetWrites = writesOf(target);
  const varLabels: Record<string, string> = {};
  for (const v of app.variables ?? []) {
    varLabels[v.external_id] = v.label || v.external_id;
  }

  // upstream: vars que ESTE widget lê
  for (const ext of targetReads) {
    upstream.push({ kind: 'variable', id: ext, label: varLabels[ext] || ext });
  }

  // downstream: widgets que leem vars que este widget escreve
  for (const other of allNodes) {
    if (other.id === widgetId) continue;
    const otherReads = readsOf(other);
    for (const v of targetWrites) {
      if (otherReads.includes(v)) {
        downstream.push({
          kind: 'widget',
          id: other.id,
          label: other.widget.type,
          via: v,
        });
      }
    }
  }

  // Grafo mínimo: root widget + vars upstream + widgets downstream
  nodes.push({
    id: `widget:${widgetId}`,
    kind: 'DataAsset',
    label: target.widget.type,
    markings: [],
    extra: {},
  });
  const addedVars = new Set<string>();
  for (const u of upstream) {
    if (addedVars.has(u.id)) continue;
    addedVars.add(u.id);
    nodes.push({
      id: `var:${u.id}`,
      kind: 'OntologyNode',
      label: u.label,
      markings: [],
      extra: {},
    });
    edges.push({
      id: `e:${u.id}-${widgetId}`,
      from_id: `var:${u.id}`,
      to_id: `widget:${widgetId}`,
      kind: 'reads',
      event_id: null,
      actor: null,
      created_at: null,
    });
  }
  const addedDownstream = new Set<string>();
  for (const d of downstream) {
    const k = `widget:${d.id}`;
    if (!addedDownstream.has(k)) {
      addedDownstream.add(k);
      nodes.push({
        id: k,
        kind: 'DataAsset',
        label: d.label,
        markings: [],
        extra: {},
      });
    }
    const vk = `var:${d.via}`;
    if (!addedVars.has(d.via)) {
      addedVars.add(d.via);
      nodes.push({
        id: vk,
        kind: 'OntologyNode',
        label: varLabels[d.via] || d.via,
        markings: [],
        extra: {},
      });
    }
    edges.push({
      id: `e:${widgetId}-w-${d.via}`,
      from_id: `widget:${widgetId}`,
      to_id: vk,
      kind: 'writes',
      event_id: null,
      actor: null,
      created_at: null,
    });
    edges.push({
      id: `e:${d.via}-r-${d.id}`,
      from_id: vk,
      to_id: k,
      kind: 'reads',
      event_id: null,
      actor: null,
      created_at: null,
    });
  }

  return { upstream, downstream, graph: { nodes, edges } };
}

export interface InspectorDepsTabProps {
  app: WorkshopApp;
  widgetId: string;
  onNavigateWidget?: (widgetId: string) => void;
  onNavigateVariable?: (externalId: string) => void;
}

export function InspectorDepsTab({
  app,
  widgetId,
  onNavigateWidget,
  onNavigateVariable,
}: InspectorDepsTabProps) {
  const deps = React.useMemo(() => computeDeps(app, widgetId), [app, widgetId]);

  return (
    <div
      data-testid="inspector-deps-panel"
      className="px-3 py-3 text-[11px] text-text-on-light space-y-3"
    >
      <header className="flex items-center gap-2">
        <Network className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <p className="font-semibold uppercase tracking-[0.16em] text-[10px] text-muted-on-light flex-1">
          Dependências do widget
        </p>
        <span
          className="text-[10px] font-mono text-muted-on-light"
          data-testid="inspector-deps-counts"
        >
          {deps.upstream.length} usa · {deps.downstream.length} consumido por
        </span>
      </header>

      <section data-testid="inspector-deps-upstream">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1 flex items-center gap-1">
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} /> Usa
          (este widget lê)
        </p>
        {deps.upstream.length === 0 ? (
          <p className="italic text-muted-on-light">
            Este widget não lê nenhuma variável.
          </p>
        ) : (
          <ul className="space-y-1">
            {deps.upstream.map((u) => (
              <li
                key={`up-${u.id}`}
                data-testid={`inspector-deps-up-${u.id}`}
                className="flex items-center justify-between gap-2 border border-border-light bg-canvas-light px-2 h-7"
              >
                <span className="text-[11px] font-mono truncate">{u.label}</span>
                <button
                  type="button"
                  onClick={() => onNavigateVariable?.(u.id)}
                  data-testid={`inspector-deps-up-nav-${u.id}`}
                  className="text-[10.5px] text-primary hover:underline"
                  title="Abrir variável no painel de variáveis"
                >
                  abrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="inspector-deps-downstream">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1 flex items-center gap-1">
          <ArrowDownRight className="w-3 h-3" strokeWidth={1.5} /> Consumido por
          (outros widgets leem)
        </p>
        {deps.downstream.length === 0 ? (
          <p className="italic text-muted-on-light">
            Nenhum widget lê variáveis escritas por este.
          </p>
        ) : (
          <ul className="space-y-1">
            {deps.downstream.map((d) => (
              <li
                key={`down-${d.id}-${d.via}`}
                data-testid={`inspector-deps-down-${d.id}`}
                className="flex items-center justify-between gap-2 border border-border-light bg-canvas-light px-2 h-7"
              >
                <span className="text-[11px] font-mono truncate">
                  {d.label} <span className="text-muted-on-light">· via {d.via}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateWidget?.(d.id)}
                  data-testid={`inspector-deps-down-nav-${d.id}`}
                  className="text-[10.5px] text-primary hover:underline"
                  title="Selecionar este widget no canvas"
                >
                  abrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-border-light bg-canvas-light" data-testid="inspector-deps-graph">
        <header className="h-7 px-2 border-b border-border-light bg-panel-light flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-on-light">
            Vizinhança (mini-grafo)
          </p>
        </header>
        <div className="p-1">
          {deps.graph.nodes.length === 0 ? (
            <p className="italic text-muted-on-light p-2">
              Nenhuma dependência para visualizar.
            </p>
          ) : (
            <LineageGraphSVG
              nodes={deps.graph.nodes}
              edges={deps.graph.edges}
              selectedId={`widget:${widgetId}`}
              mode="neighbors"
              width={300}
              height={220}
            />
          )}
        </div>
      </section>
    </div>
  );
}
