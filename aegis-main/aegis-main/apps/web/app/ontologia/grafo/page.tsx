'use client';

/**
 * /ontologia/grafo — Visão estrutural da ontologia.
 *
 * MVP "browser de relações" estilo Palantir, sem force-directed:
 * - KPI row: nós, vínculos, tipos distintos, densidade média.
 * - LEFT (flex-1):  tabela densa de relações (origem → vínculo → destino),
 *                   limitada às primeiras 200 edges pra manter perf no
 *                   grafo grande (3.857 / 2.873 hoje).
 * - RIGHT (360px):  distribuição por tipo de nó e por tipo de vínculo,
 *                   com barras proporcionais.
 *
 * Filtro por tipo de nó: mantém apenas edges onde origem OU destino é
 * desse tipo. Filtro por tipo de vínculo: filtra pelo edge_type.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Filter,
  GitBranch,
  Network,
  Search,
  Workflow,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { OntologiaTabs } from '@/components/ontologia/ontologia-tabs';
import { RequirePerm } from '@/components/auth/require-perm';
import { Ontology, type OntologyNodeType } from '@/lib/api';
import type { OntologyEdge, OntologyGraph, OntologyNode } from '@/lib/api/types';
import { cn } from '@/lib/cn';

const EDGE_DISPLAY_LIMIT = 200;

export default function OntologiaGrafoPage() {
  const [graph, setGraph] = useState<OntologyGraph | null>(null);
  const [types, setTypes] = useState<OntologyNodeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoFilter, setTipoFilter] = useState<string>('');
  const [vinculoFilter, setVinculoFilter] = useState<string>('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([Ontology.graph(), Ontology.listNodeTypes()])
      .then(([g, ts]) => {
        if (cancelled) return;
        setGraph(g);
        const sorted = [...ts].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
        setTypes(sorted);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Falha ao carregar o grafo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  // Índice id → node pra resolver labels nas arestas
  const nodeIndex = useMemo(() => {
    const map = new Map<string, OntologyNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  // Lookup label do tipo
  const typeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of types) map.set(t.name, t.label || t.name);
    return map;
  }, [types]);

  // Distribuição por tipo de nó (do próprio grafo, não do listNodeTypes)
  const nodeTypeDistribution = useMemo(() => {
    const freq = new Map<string, number>();
    for (const n of nodes) {
      freq.set(n.node_type, (freq.get(n.node_type) ?? 0) + 1);
    }
    return [...freq.entries()]
      .map(([name, count]) => ({
        name,
        label: typeLabelMap.get(name) || name,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [nodes, typeLabelMap]);

  // Distribuição por tipo de vínculo
  const edgeTypeDistribution = useMemo(() => {
    const freq = new Map<string, number>();
    for (const e of edges) {
      freq.set((e.relation_type ?? e.edge_type ?? ''), (freq.get((e.relation_type ?? e.edge_type ?? '')) ?? 0) + 1);
    }
    return [...freq.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [edges]);

  const topNodeTypes = useMemo(() => nodeTypeDistribution.slice(0, 8), [nodeTypeDistribution]);
  const topEdgeTypes = useMemo(() => edgeTypeDistribution.slice(0, 8), [edgeTypeDistribution]);

  const maxNodeTypeCount = topNodeTypes[0]?.count ?? 0;
  const maxEdgeTypeCount = topEdgeTypes[0]?.count ?? 0;

  // Lista de arestas filtrada
  const filteredEdges = useMemo(() => {
    const q = query.trim().toLowerCase();
    return edges.filter((e) => {
      if (vinculoFilter && (e.relation_type ?? e.edge_type ?? '') !== vinculoFilter) return false;
      const src = nodeIndex.get(e.source_node_id);
      const tgt = nodeIndex.get(e.target_node_id);
      if (tipoFilter && src?.node_type !== tipoFilter && tgt?.node_type !== tipoFilter)
        return false;
      if (q) {
        const hay = `${src?.name ?? ''} ${tgt?.name ?? ''} ${(e.relation_type ?? e.edge_type ?? '')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [edges, nodeIndex, tipoFilter, vinculoFilter, query]);

  const visibleEdges = useMemo(
    () => filteredEdges.slice(0, EDGE_DISPLAY_LIMIT),
    [filteredEdges],
  );

  const distinctTypes = nodeTypeDistribution.length;
  const density = nodes.length > 0 ? edges.length / nodes.length : 0;

  const subtitle = loading
    ? 'Carregando estrutura da ontologia…'
    : error
      ? 'Não foi possível carregar o grafo.'
      : `${formatNumber(nodes.length)} nó${nodes.length === 1 ? '' : 's'} · ${formatNumber(edges.length)} vínculo${edges.length === 1 ? '' : 's'}`;

  return (
    <RequirePerm perm="security.ontologia.view">
      <PageShell
        title="Grafo da ontologia"
        subtitle={subtitle}
        theme="light"
        subnav={<OntologiaTabs />}
        toolbar={
          <div className="flex items-center gap-2">
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              aria-label="Filtrar por tipo de objeto"
              disabled={loading || !nodeTypeDistribution.length}
              data-testid="ontologia-grafo-filter-tipo"
              className="h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary min-w-[180px]"
            >
              <option value="">Todos os tipos</option>
              {nodeTypeDistribution.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label} ({formatNumber(t.count)})
                </option>
              ))}
            </select>
            <select
              value={vinculoFilter}
              onChange={(e) => setVinculoFilter(e.target.value)}
              aria-label="Filtrar por tipo de vínculo"
              disabled={loading || !edgeTypeDistribution.length}
              data-testid="ontologia-grafo-filter-vinculo"
              className="h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary min-w-[180px]"
            >
              <option value="">Todos os vínculos</option>
              {edgeTypeDistribution.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({formatNumber(t.count)})
                </option>
              ))}
            </select>
            <div className="relative">
              <Search
                className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar relação…"
                data-testid="ontologia-grafo-search"
                className="w-56 h-7 pl-7 pr-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
              />
            </div>
          </div>
        }
      >
        <div className="h-full flex flex-col overflow-hidden">
          {/* KPI ROW */}
          <div className="shrink-0 px-4 pt-3 pb-3 border-b border-border-light bg-raised-light/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <KpiCard
                icon={<Network className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Nós"
                value={formatNumber(nodes.length)}
                hint="Objetos na ontologia"
              />
              <KpiCard
                icon={<GitBranch className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Vínculos"
                value={formatNumber(edges.length)}
                hint="Relações entre objetos"
              />
              <KpiCard
                icon={<Workflow className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Tipos distintos"
                value={formatNumber(distinctTypes)}
                hint="Categorias de nó"
              />
              <KpiCard
                icon={<BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                label="Densidade média"
                value={density.toFixed(2)}
                hint="Vínculos por nó"
              />
            </div>
          </div>

          {/* BODY */}
          <div className="flex-1 flex overflow-hidden">
            {/* CENTER: edges table */}
            <main className="flex-1 flex flex-col overflow-hidden">
              {error && (
                <div className="mx-4 mt-3 px-3 py-2 text-[11px] bg-danger/5 border border-danger/40 text-danger">
                  {error}
                </div>
              )}
              <div className="flex-1 overflow-auto p-4">
                <section className="bg-canvas-light border border-border-light">
                  <header className="px-3 py-2 border-b border-border-light flex items-center justify-between bg-raised-light/40">
                    <div className="flex items-center gap-2">
                      <GitBranch
                        className="w-3.5 h-3.5 text-primary"
                        strokeWidth={1.5}
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-on-light">
                        Relações
                      </span>
                      {(tipoFilter || vinculoFilter || query) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-on-light">
                          <Filter className="w-3 h-3" strokeWidth={1.5} />
                          filtrado
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-muted-on-light tabular-nums">
                      {formatNumber(visibleEdges.length)} de {formatNumber(filteredEdges.length)}
                      {filteredEdges.length !== edges.length
                        ? ` · total ${formatNumber(edges.length)}`
                        : ''}
                    </span>
                  </header>
                  {loading ? (
                    <div className="px-4 py-12 text-center text-[12px] text-muted-on-light">
                      Carregando relações…
                    </div>
                  ) : filteredEdges.length === 0 ? (
                    <EmptyEdges hasData={edges.length > 0} />
                  ) : (
                    <>
                      <table className="w-full text-[11px]">
                        <thead className="text-[10px] uppercase tracking-wider text-muted-on-light bg-raised-light/30 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Origem</th>
                            <th className="px-3 py-2 text-left font-semibold w-[160px]">
                              Vínculo
                            </th>
                            <th className="px-3 py-2 text-left font-semibold">Destino</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light/60">
                          {visibleEdges.map((e) => (
                            <EdgeRow
                              key={e.id}
                              edge={e}
                              nodeIndex={nodeIndex}
                              typeLabelMap={typeLabelMap}
                            />
                          ))}
                        </tbody>
                      </table>
                      {filteredEdges.length > EDGE_DISPLAY_LIMIT ? (
                        <p className="px-3 py-2 text-[10px] font-mono text-muted-on-light text-center border-t border-border-light bg-raised-light/30">
                          Exibindo as primeiras {formatNumber(EDGE_DISPLAY_LIMIT)} relações ·
                          refine os filtros para chegar nas demais
                        </p>
                      ) : null}
                    </>
                  )}
                </section>
              </div>
            </main>

            {/* RIGHT: distributions */}
            <aside className="w-[360px] shrink-0 border-l border-border-light bg-raised-light/20 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <DistributionBlock
                  icon={<Network className="w-3 h-3" strokeWidth={1.5} />}
                  title="Tipos no grafo"
                  rows={topNodeTypes.map((t) => ({
                    key: t.name,
                    label: t.label,
                    count: t.count,
                    pct:
                      maxNodeTypeCount > 0
                        ? Math.round((t.count / maxNodeTypeCount) * 100)
                        : 0,
                    sharePct: nodes.length
                      ? Math.round((t.count / nodes.length) * 100)
                      : 0,
                    active: t.name === tipoFilter,
                  }))}
                  emptyText="Sem nós no grafo."
                  loading={loading}
                  onClick={(name) => setTipoFilter(name === tipoFilter ? '' : name)}
                />
                <DistributionBlock
                  icon={<GitBranch className="w-3 h-3" strokeWidth={1.5} />}
                  title="Vínculos por tipo"
                  rows={topEdgeTypes.map((t) => ({
                    key: t.name,
                    label: t.name,
                    count: t.count,
                    pct:
                      maxEdgeTypeCount > 0
                        ? Math.round((t.count / maxEdgeTypeCount) * 100)
                        : 0,
                    sharePct: edges.length
                      ? Math.round((t.count / edges.length) * 100)
                      : 0,
                    active: t.name === vinculoFilter,
                  }))}
                  emptyText="Sem vínculos no grafo."
                  loading={loading}
                  onClick={(name) => setVinculoFilter(name === vinculoFilter ? '' : name)}
                />
              </div>
            </aside>
          </div>
        </div>
      </PageShell>
    </RequirePerm>
  );
}

function EdgeRow({
  edge,
  nodeIndex,
  typeLabelMap,
}: {
  edge: OntologyEdge;
  nodeIndex: Map<string, OntologyNode>;
  typeLabelMap: Map<string, string>;
}) {
  const src = nodeIndex.get(edge.source_node_id);
  const tgt = nodeIndex.get(edge.target_node_id);
  return (
    <tr
      data-testid={`ontologia-edge-${edge.id}`}
      className="hover:bg-raised-light/30 transition-colors"
    >
      <td className="px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] text-text-on-light truncate font-medium">
            {src?.name || edge.source_node_id}
          </p>
          <p className="text-[10px] font-mono text-muted-on-light truncate">
            {src?.node_type ? typeLabelMap.get(src.node_type) || src.node_type : '—'}
          </p>
        </div>
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide border bg-primary/5 text-primary border-primary/40">
          {(edge.relation_type ?? edge.edge_type ?? '')}
          <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] text-text-on-light truncate font-medium">
            {tgt?.name || edge.target_node_id}
          </p>
          <p className="text-[10px] font-mono text-muted-on-light truncate">
            {tgt?.node_type ? typeLabelMap.get(tgt.node_type) || tgt.node_type : '—'}
          </p>
        </div>
      </td>
    </tr>
  );
}

function DistributionBlock({
  icon,
  title,
  rows,
  emptyText,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Array<{
    key: string;
    label: string;
    count: number;
    pct: number;
    sharePct: number;
    active: boolean;
  }>;
  emptyText: string;
  loading: boolean;
  onClick: (name: string) => void;
}) {
  return (
    <section className="border-b border-border-light">
      <header className="px-3 py-2 border-b border-border-light bg-canvas-light flex items-center gap-1.5">
        <span className="text-primary">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-on-light">
          {title}
        </span>
      </header>
      <div className="px-3 py-2">
        {loading ? (
          <p className="text-[11px] text-muted-on-light py-2">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-muted-on-light py-2">{emptyText}</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => onClick(r.key)}
                  data-testid={`ontologia-grafo-dist-${r.key}`}
                  className={cn(
                    'w-full text-left px-2 py-1.5 border transition-colors',
                    r.active
                      ? 'bg-primary/5 border-primary/40'
                      : 'bg-canvas-light border-border-light/70 hover:border-primary/40',
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-text-on-light truncate flex-1 font-medium">
                      {r.label}
                    </span>
                    <span className="text-[10px] font-mono text-muted-on-light tabular-nums shrink-0">
                      {formatNumber(r.count)}
                    </span>
                    <span className="text-[10px] font-mono text-muted-on-light/80 tabular-nums shrink-0 w-9 text-right">
                      {r.sharePct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-raised-light/60 border border-border-light/60 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${r.pct}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-canvas-light border border-border-light px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-on-light">
        {icon}
        <p className="text-[9px] uppercase tracking-[0.14em] font-mono">{label}</p>
      </div>
      <p className="text-[20px] font-semibold text-text-on-light mt-0.5 truncate tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] text-muted-on-light/80 mt-0.5 truncate">{hint}</p>
      ) : null}
    </div>
  );
}

function EmptyEdges({ hasData }: { hasData: boolean }) {
  return (
    <div className="px-4 py-12 text-center">
      <GitBranch
        className="w-6 h-6 text-muted-on-light/40 mx-auto mb-2"
        strokeWidth={1.5}
      />
      <p className="text-[12px] text-muted-on-light">
        {hasData
          ? 'Nenhuma relação casa com os filtros atuais.'
          : 'Ainda não há relações entre os objetos da ontologia.'}
      </p>
      <p className="text-[11px] text-muted-on-light/70 mt-1">
        {hasData
          ? 'Limpe os filtros ou a busca para ver todas as relações.'
          : 'À medida que os agentes processam fontes, vínculos vão sendo criados aqui.'}
      </p>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}
