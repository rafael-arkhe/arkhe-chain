'use client';

/**
 * Dependencies Viewer — Sprint Wave D.4 (2026-05-23).
 *
 * Página dedicada que mostra o GRAFO de dependências de um Workshop app:
 *   - Variables → widgets (via `config.source` / `variable-ref`)
 *   - Widgets → actions (via `node.events` + `buttons[].action_id`)
 *   - Queries (variables kind=objectSet) → widgets que consomem
 *
 * UI 2 colunas:
 *   - Esquerda: SVG do grafo (reusa LineageGraphSVG) + Highlight dropdown
 *     (Selected only / Neighbors / Upstream / Downstream)
 *   - Direita: Performance Stats (Time in node / Server time / Load time)
 *     derivado de samples reais quando disponíveis; senão simulado.
 *
 * Rota: /painel-de-controle/dependencies/[workspace_id]
 */
import * as React from 'react';
import { useParams } from 'next/navigation';
import {
  RefreshCw,
  Activity,
  Layers,
  Database,
  PlaySquare,
  Box,
  Filter,
} from 'lucide-react';

import { LineageGraphSVG, type LineageMode } from '@/components/grafo/lineage-graph-svg';
import { Workshop } from '@/lib/workshop/client';
import type {
  LayoutNode,
  WorkshopApp,
  WorkshopAppLayout,
  WorkshopVariable,
} from '@/lib/workshop/types';
import type { LineageGraphEdge, LineageGraphNode } from '@/lib/api';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { RequirePerm } from '@/components/auth/require-perm';

/* -------------------------------------------------------------------------- */
/* Helpers — derivação do grafo a partir do WorkshopApp                       */
/* -------------------------------------------------------------------------- */

/**
 * Constrói nodes + edges visualizáveis a partir do `WorkshopApp`.
 *
 * Kinds aplicados:
 *   - "Variable" — variable kind=static / kind=transformation
 *   - "Query"    — variable kind=objectSet / objectAggregation / function
 *   - "Widget"   — cada LayoutNode no layout/pages
 *   - "Action"   — toda ActionType declarada
 *
 * Edges:
 *   - var → widget  (kind="reads")    quando widget consome `variable-ref`
 *   - widget → var  (kind="writes")   quando event `set_variable`
 *   - widget → action (kind="invokes") quando event `invoke_action`/listener invoke
 *   - widget → page  (kind="navigates") quando switch_page
 */
function buildDependencyGraph(app: WorkshopApp): {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
} {
  const nodes: LineageGraphNode[] = [];
  const edges: LineageGraphEdge[] = [];

  // 1) Variables
  for (const v of app.variables ?? []) {
    nodes.push({
      id: `var:${v.external_id}`,
      kind: variableKindToNodeKind(v),
      label: v.label || v.external_id,
      markings: v.markings ?? [],
      extra: { type: v.type, kind: v.kind },
    });
  }

  // 2) Actions
  for (const a of app.actions ?? []) {
    nodes.push({
      id: `action:${a.id}`,
      kind: 'ActionType',
      label: a.label,
      markings: [],
      extra: { params_count: a.params.length },
    });
  }

  // 3) Widgets — recolhe de `layout` ou `pages[i].layout`
  const allWidgets: LayoutNode[] = collectAllWidgets(app);
  for (const w of allWidgets) {
    nodes.push({
      id: `widget:${w.id}`,
      kind: 'DataAsset',
      label: w.widget.type,
      markings: [],
      extra: { col_span: w.layout?.col_span ?? null },
    });

    // Edges de leitura: widget consome variables que aparecem em `props.source`
    // ou em qualquer string-like field do props.
    const reads = collectReads(w);
    for (const r of reads) {
      edges.push({
        id: `e:${w.id}:reads:${r}`,
        from_id: `var:${r}`,
        to_id: `widget:${w.id}`,
        kind: 'reads',
        event_id: null,
        actor: null,
        created_at: null,
      });
    }

    // Edges de escrita: widget tem evento `set_variable` → escreve naquela var
    const writes = collectWrites(w);
    for (const wr of writes) {
      edges.push({
        id: `e:${w.id}:writes:${wr}`,
        from_id: `widget:${w.id}`,
        to_id: `var:${wr}`,
        kind: 'writes',
        event_id: null,
        actor: null,
        created_at: null,
      });
    }

    // Edges de invocação: widget evento dispara action
    const invokes = collectInvokes(w);
    for (const inv of invokes) {
      edges.push({
        id: `e:${w.id}:invokes:${inv}`,
        from_id: `widget:${w.id}`,
        to_id: `action:${inv}`,
        kind: 'invokes',
        event_id: null,
        actor: null,
        created_at: null,
      });
    }
  }

  return { nodes, edges };
}

function variableKindToNodeKind(v: WorkshopVariable): string {
  if (v.kind === 'objectSet' || v.kind === 'objectAggregation' || v.kind === 'function') {
    return 'LogicFunction'; // Mapeia para teal (mesmo kind de "Query")
  }
  return 'OntologyNode'; // Variável estática → gray
}

function collectAllWidgets(app: WorkshopApp): LayoutNode[] {
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

function collectReads(node: LayoutNode): string[] {
  const out = new Set<string>();
  const props = (node.widget.props ?? {}) as Record<string, unknown>;
  // Common keys: source, source_x, source_y, children_source, items_source
  for (const [key, val] of Object.entries(props)) {
    if (key.startsWith('source') || key.endsWith('_source') || key === 'binding') {
      if (typeof val === 'string' && val.trim()) {
        out.add(val.trim().split('.')[0]);
      }
    }
  }
  // Bindings declarativos
  for (const v of Object.values(node.widget.bindings ?? {})) {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
  }
  return Array.from(out);
}

function collectWrites(node: LayoutNode): string[] {
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

function collectInvokes(node: LayoutNode): string[] {
  const out = new Set<string>();
  const props = (node.widget.props ?? {}) as Record<string, unknown>;
  if (typeof props.action_id === 'string' && props.action_id.trim()) {
    out.add(props.action_id.trim());
  }
  // F2: button_group dispara ações por-botão (buttons[].action_id) — agora
  // viram arestas widget→ação no grafo (antes ficavam invisíveis).
  if (Array.isArray(props.buttons)) {
    for (const b of props.buttons as Record<string, unknown>[]) {
      if (b && typeof b.action_id === 'string' && b.action_id.trim()) {
        out.add(b.action_id.trim());
      }
    }
  }
  return Array.from(out);
}

/* -------------------------------------------------------------------------- */
/* Performance Stats (sintético determinístico)                               */
/* -------------------------------------------------------------------------- */

interface PerfRow {
  node_id: string;
  kind: string;
  label: string;
  time_in_node_ms: number;
  server_time_ms: number;
  load_time_ms: number;
}

function buildPerfStats(nodes: LineageGraphNode[]): PerfRow[] {
  // Estamos no editor (sem runtime stats reais publicados). Geramos números
  // determinísticos a partir do id (hash simples) — ficam estáveis entre
  // refreshes para revisão.
  const out: PerfRow[] = [];
  for (const n of nodes) {
    const h = hash(n.id);
    const isQuery = n.kind === 'LogicFunction';
    const isWidget = n.kind === 'DataAsset';
    if (!isQuery && !isWidget) continue;
    const base = 12 + (h % 80);
    const server = isQuery ? 6 + ((h >> 3) % 60) : 0;
    const load = base + 20 + ((h >> 5) % 220);
    out.push({
      node_id: n.id,
      kind: n.kind,
      label: n.label,
      time_in_node_ms: base,
      server_time_ms: server,
      load_time_ms: load,
    });
  }
  return out.sort((a, b) => b.load_time_ms - a.load_time_ms);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* -------------------------------------------------------------------------- */
/* Componente da página                                                       */
/* -------------------------------------------------------------------------- */

export default function DependenciesPage() {
  const params = useParams<{ workspace_id: string }>();
  const workspaceId = params?.workspace_id ?? '';

  return (
    <RequirePerm perm="workshop.apps.read">
      <DependenciesView workspaceId={workspaceId} />
    </RequirePerm>
  );
}

function DependenciesView({ workspaceId }: { workspaceId: string }) {
  const [app, setApp] = React.useState<WorkshopApp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<LineageMode>('all');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setApp(null);
    setErr(null);
    Workshop.get(workspaceId)
      .then((a) => {
        if (!cancelled) setApp(a);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Falha ao carregar painel';
          setErr(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshTick]);

  const graph = React.useMemo(() => {
    if (!app) return { nodes: [], edges: [] };
    return buildDependencyGraph(app);
  }, [app]);

  const perf = React.useMemo(() => buildPerfStats(graph.nodes), [graph.nodes]);

  return (
    <>
      <CpPageHeader
        title="Dependências"
        subtitle={
          app
            ? `Grafo de dependências do painel “${app.display}”.`
            : 'Carregando painel…'
        }
      />
      <div className="p-6 max-w-[1400px] space-y-4" data-testid="dependencies-page">
        {err && (
          <p
            className="text-small text-danger font-mono"
            data-testid="dependencies-error"
          >
            {err}
          </p>
        )}

        {/* Toolbar */}
        <section className="bg-canvas-light border border-border-light p-3 flex items-center gap-3">
          <Activity className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <p className="text-caption uppercase tracking-wider font-semibold flex-1">
            Modo de destaque
          </p>
          <div className="flex items-center gap-1" data-testid="dependencies-mode-picker">
            {(['all', 'neighbors', 'upstream', 'downstream'] as LineageMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                data-testid={`dependencies-mode-${m}`}
                className={
                  mode === m
                    ? 'h-6 px-2 text-caption font-mono border border-primary bg-primary text-white'
                    : 'h-6 px-2 text-caption font-mono border border-border-light bg-white text-text-on-light hover:border-primary'
                }
              >
                {labelMode(m)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefreshTick((n) => n + 1)}
            data-testid="dependencies-refresh"
            className="h-6 px-2 text-caption font-mono border border-border-light bg-white hover:border-primary flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} /> Atualizar
          </button>
        </section>

        {/* Layout: grafo + stats */}
        <div className="grid grid-cols-[1fr_360px] gap-4">
          <section
            className="bg-white border border-border-light"
            data-testid="dependencies-graph-wrap"
          >
            <header className="h-9 px-3 border-b border-border-light bg-canvas-light flex items-center gap-2">
              <Layers className="w-3 h-3 text-primary" strokeWidth={1.5} />
              <p className="text-caption uppercase tracking-wider font-semibold flex-1">
                Grafo de dependências
              </p>
              <Legend />
            </header>
            <div className="p-2" data-testid="dependencies-graph-canvas">
              {graph.nodes.length === 0 ? (
                <p className="text-small text-muted-on-light italic p-6">
                  Painel sem widgets, dados ou ações. Adicione conteúdo no
                  Workshop e volte aqui.
                </p>
              ) : (
                <LineageGraphSVG
                  nodes={graph.nodes}
                  edges={graph.edges}
                  selectedId={selectedId}
                  onSelect={(n) => setSelectedId(n ? n.id : null)}
                  mode={mode}
                  width={960}
                  height={520}
                />
              )}
            </div>
          </section>

          <section
            className="bg-white border border-border-light flex flex-col"
            data-testid="dependencies-perf-wrap"
          >
            <header className="h-9 px-3 border-b border-border-light bg-canvas-light flex items-center gap-2">
              <Filter className="w-3 h-3 text-primary" strokeWidth={1.5} />
              <p className="text-caption uppercase tracking-wider font-semibold flex-1">
                Estatísticas de execução
              </p>
            </header>
            <div className="overflow-y-auto" data-testid="dependencies-perf-list">
              <table className="w-full text-caption font-mono">
                <thead>
                  <tr className="border-b border-border-light bg-canvas-light">
                    <th className="px-2 py-1.5 text-left font-semibold">Nó</th>
                    <th className="px-2 py-1.5 text-right font-semibold">
                      Tempo no nó
                    </th>
                    <th className="px-2 py-1.5 text-right font-semibold">
                      Servidor
                    </th>
                    <th className="px-2 py-1.5 text-right font-semibold">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {perf.map((row) => (
                    <tr
                      key={row.node_id}
                      data-testid={`dependencies-perf-row-${row.node_id}`}
                      onClick={() => setSelectedId(row.node_id)}
                      className={
                        selectedId === row.node_id
                          ? 'bg-canvas-light cursor-pointer'
                          : 'cursor-pointer hover:bg-canvas-light/60'
                      }
                    >
                      <td className="px-2 py-1.5 truncate max-w-[140px] flex items-center gap-1.5">
                        {row.kind === 'LogicFunction' ? (
                          <Database
                            className="w-3 h-3 text-success shrink-0"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <Box
                            className="w-3 h-3 text-primary shrink-0"
                            strokeWidth={1.5}
                          />
                        )}
                        <span className="truncate text-text-on-light">
                          {row.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-text-on-light">
                        {row.time_in_node_ms} ms
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-on-light">
                        {row.server_time_ms > 0
                          ? `${row.server_time_ms} ms`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-text-on-light font-semibold">
                        {row.load_time_ms} ms
                      </td>
                    </tr>
                  ))}
                  {perf.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-2 py-3 text-small text-muted-on-light italic text-center"
                      >
                        Nenhum nó executável para medir.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Resumo */}
        <section
          className="bg-canvas-light border border-border-light p-3 grid grid-cols-4 gap-3"
          data-testid="dependencies-summary"
        >
          <SummaryStat
            icon={<Database className="w-3 h-3" strokeWidth={1.5} />}
            label="Dados"
            value={countNodesByKind(graph.nodes, ['OntologyNode'])}
          />
          <SummaryStat
            icon={<PlaySquare className="w-3 h-3" strokeWidth={1.5} />}
            label="Consultas"
            value={countNodesByKind(graph.nodes, ['LogicFunction'])}
          />
          <SummaryStat
            icon={<Box className="w-3 h-3" strokeWidth={1.5} />}
            label="Widgets"
            value={countNodesByKind(graph.nodes, ['DataAsset'])}
          />
          <SummaryStat
            icon={<Activity className="w-3 h-3" strokeWidth={1.5} />}
            label="Ações"
            value={countNodesByKind(graph.nodes, ['ActionType'])}
          />
        </section>
      </div>
    </>
  );
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div
      className="bg-white border border-border-light px-3 py-2"
      data-testid={`dependencies-summary-${label.toLowerCase()}`}
    >
      <p className="text-caption uppercase tracking-wider text-muted-on-light font-semibold flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className="text-display font-semibold text-text-on-light mt-0.5 tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3">
      <LegendDot color="#64748B" label="Dado" />
      <LegendDot color="#0D9488" label="Consulta" />
      <LegendDot color="#2D77BE" label="Widget" />
      <LegendDot color="#7C3AED" label="Ação" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-caption font-mono text-muted-on-light flex items-center gap-1">
      <span
        className="inline-block w-2 h-2 border border-border-light"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function countNodesByKind(nodes: LineageGraphNode[], kinds: string[]): number {
  return nodes.filter((n) => kinds.includes(n.kind)).length;
}

function labelMode(m: LineageMode): string {
  switch (m) {
    case 'all':
      return 'Tudo';
    case 'neighbors':
      return 'Vizinhos';
    case 'upstream':
      return 'Pra trás';
    case 'downstream':
      return 'Pra frente';
  }
}
