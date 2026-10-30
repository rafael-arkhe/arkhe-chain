'use client';

/**
 * /rede — grafo de correlação interativo.
 *
 * Substitui o SVG estático antigo por `react-force-graph-2d` consumindo o
 * endpoint `/entities/{id}/graph` do ontology-module.
 *
 * Layout: 240 (busca/lista) | 1fr (canvas) | 280 (inspetor).
 *
 * Por que client-only / dynamic: a lib usa <canvas> via d3-force,
 * incompatível com SSR. O wrapper `RedeCanvas` já faz `dynamic({ ssr: false })`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Network } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { RedeCanvas } from '@/components/rede/RedeCanvas';
import { RedeLegenda } from '@/components/rede/RedeLegenda';
import { RedeSidebar } from '@/components/rede/RedeSidebar';
import { RedeInspector } from '@/components/rede/RedeInspector';
import { Entities, Ontology } from '@/lib/api';
import type { Entity, EntityLink } from '@/lib/api/types';
import { normalizeRedeGraph, mergeRedeGraphs, overviewToRede, nsId, type RedeNode } from '@/lib/rede/graph';

export default function RedePage() {
  const [root, setRoot] = useState<Entity | null>(null);
  const [hops, setHops] = useState(3);
  /** Modo "ontologia global": pula BFS, carrega todos entities + links. */
  const [globalMode, setGlobalMode] = useState(false);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [nodes, setNodes] = useState<RedeNode[]>([]);
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [evidenceCount, setEvidenceCount] = useState(0);
  /** Limite de nós por store no modo global (seletor na sidebar). */
  const [limit, setLimit] = useState(2000);
  const [truncated, setTruncated] = useState(false);
  /** Onda 2 — visão em CLUSTER (default no global; escala a milhões) vs nós crus. */
  const [clusterView, setClusterView] = useState(true);
  /** Drill-down: quando setado, mostra os nós CRUS daquele node_type (clicou no cluster). */
  const [drillType, setDrillType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tamanho do container do canvas — força-grafo precisa de width/height numéricos
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Medição via callback ref — dispara assim que o div é montado.
  // (useEffect com [] tem race: canvasRef.current pode estar null
  // no momento que o effect roda em alguns Strict Mode renders.)
  const roRef = useRef<ResizeObserver | null>(null);
  const pollsRef = useRef<number[]>([]);
  const measuredRef = useRef<HTMLDivElement | null>(null);

  const canvasRefCb = useCallback((node: HTMLDivElement | null) => {
    // Cleanup anterior
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    pollsRef.current.forEach((t) => window.clearTimeout(t));
    pollsRef.current = [];
    canvasRef.current = node;
    measuredRef.current = node;
    if (!node) return;

    const update = () => {
      const r = node.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w <= 0 || h <= 0) return;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    requestAnimationFrame(update);
    pollsRef.current = [50, 150, 350, 700, 1200, 2000].map((ms) =>
      window.setTimeout(update, ms),
    );
    const ro = new ResizeObserver(update);
    ro.observe(node);
    roRef.current = ro;
  }, []);

  useEffect(() => {
    const handler = () => {
      const el = measuredRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w > 0 && h > 0) {
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    };
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
      if (roRef.current) roRef.current.disconnect();
      pollsRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Carrega subgrafo quando muda root, hops ou globalMode
  useEffect(() => {
    if (!root && !globalMode) {
      setNodes([]);
      setLinks([]);
      setEvidenceCount(0);
      setTruncated(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Onda 2 — UNIFY: no modo global, mescla o store canônico
    // (OntologyNode/OntologyEdge via /ontology/graph) com o legado
    // (Entity/EntityLink via /entities/global/graph). É o que destrava o
    // "nós sem vínculos": o grafo rico (objetos/relações do operador/AIP) vive
    // no canônico, que o /rede ignorava. allSettled: se um store falha, mostra
    // o outro. No modo root (entidade selecionada), segue só o legado por ora.
    const loader = globalMode
      ? drillType
        ? // drill-down: nós CRUS de um node_type (clicou num cluster)
          Ontology.graph(limit, drillType).then((g) => ({
            ...normalizeRedeGraph(g, 'node'),
          }))
        : clusterView
          ? // visão agregada (escala a milhões — GROUP BY)
            Ontology.graphOverview('node_type').then((ov) => ({
              ...overviewToRede(ov, 'node'),
              evidenceCount: 0,
              truncated: false,
            }))
          : // nós crus unificados (canônico + Entity legado)
            Promise.allSettled([
              Ontology.graph(limit),
              Entities.globalGraph(Math.min(limit, 2000)),
            ]).then((res) => {
              const parts = [] as ReturnType<typeof normalizeRedeGraph>[];
              if (res[0].status === 'fulfilled') parts.push(normalizeRedeGraph(res[0].value, 'node'));
              if (res[1].status === 'fulfilled') parts.push(normalizeRedeGraph(res[1].value, 'entity'));
              if (parts.length === 0) {
                const err = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
                throw (err?.reason as Error) ?? new Error('Falha ao consultar o grafo');
              }
              return mergeRedeGraphs(parts);
            })
      : root!._origin === 'node'
        ? Ontology.neighbors(root!._rawId ?? root!.id, hops).then((g) =>
            normalizeRedeGraph(g, 'node'),
          )
        : Entities.graph(root!.id, { hops, max_nodes: 300 }).then((g) =>
            normalizeRedeGraph(g, 'entity'),
          );

    loader
      .then((graph) => {
        if (cancelled) return;
        setNodes(graph.nodes);
        setLinks(graph.links);
        setEvidenceCount(graph.evidenceCount);
        setTruncated(graph.truncated);
        // Clusters não têm "detalhe" — clicar neles faz drill-down. Nos demais
        // modos, auto-seleciona o root (por _rawId, namespaced) ou o 1º nó.
        if (globalMode && clusterView && !drillType) {
          setSelected(null);
        } else if (root) {
          const rid = root._rawId ?? root.id;
          setSelected(graph.nodes.find((n) => n._rawId === rid) ?? root);
        } else if (graph.nodes.length > 0) {
          setSelected(graph.nodes[0]);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setNodes([]);
          setLinks([]);
          setError(e.message || 'Falha ao consultar o grafo de rede');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, hops, globalMode, limit, clusterView, drillType]);

  const handleSelectRoot = useCallback((e: Entity) => {
    setRoot(e);
    setSelected(e);
    setDrillType(null);
  }, []);

  const handleClear = useCallback(() => {
    setRoot(null);
    setSelected(null);
    setNodes([]);
    setLinks([]);
    setError(null);
    setGlobalMode(false);
    setDrillType(null);
  }, []);

  const handleLoadGlobal = useCallback(() => {
    setError(null);
    setRoot(null);
    setSelected(null);
    setDrillType(null);
    setClusterView(true); // panorama agregado por padrão (escala a milhões)
    setGlobalMode(true);
  }, []);

  const handleNodeClick = useCallback((n: Entity) => {
    // Clicar num CLUSTER faz drill-down pro tipo; nó normal só seleciona.
    if (n._cluster && n._clusterKey) {
      setDrillType(n._clusterKey);
      setSelected(null);
    } else {
      setSelected(n);
    }
  }, []);

  const subtitle = globalMode
    ? clusterView && !drillType
      ? `${nodes.length} grupos · ${links.length} relações agregadas · visão em cluster`
      : drillType
        ? `Tipo "${drillType}" · ${nodes.length} nós · ${links.length} vínculos`
        : `${nodes.length} nós · ${links.length} vínculos · ontologia global`
    : root
    ? `${nodes.length} nó${nodes.length === 1 ? '' : 's'} · ${links.length} vínculo${links.length === 1 ? '' : 's'}${evidenceCount ? ` · ${evidenceCount} evidência${evidenceCount === 1 ? '' : 's'}` : ''} · raiz ${root.id}`
    : 'Selecione uma entidade pra iniciar a expansão de vínculos';

  return (
    <RequirePerm perm="security.rede.view">
      <PageShell
        title={
          <>
            <Network className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
            <span>Rede de correlação</span>
          </>
        }
        subtitle={subtitle}
        classification="confidencial"
        classificationLabel="QUADRO DE REDE"
        theme="light"
      >
        <div className="h-full flex overflow-hidden">
          <RedeSidebar
            rootId={root?.id ?? null}
            rootName={root?.name ?? null}
            hops={hops}
            setHops={setHops}
            limit={limit}
            setLimit={setLimit}
            globalMode={globalMode}
            clusterView={clusterView}
            setClusterView={(v) => {
              setClusterView(v);
              setDrillType(null);
            }}
            onSelectRoot={handleSelectRoot}
            onClear={handleClear}
            onLoadGlobal={handleLoadGlobal}
          />

          <div
            ref={canvasRefCb}
            data-testid="rede-canvas-container"
            className="flex-1 min-w-0 min-h-0 relative bg-canvas-light overflow-hidden"
          >
            {loading && (
              <div className="absolute top-3 left-3 z-10 bg-white border border-border-light px-2 py-1 text-[10px] font-mono text-muted-on-light flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 bg-primary animate-pulse" />
                Carregando subgrafo…
              </div>
            )}
            {/* Drill-down: voltar ao panorama de clusters */}
            {globalMode && drillType && (
              <button
                type="button"
                data-testid="rede-drill-voltar"
                onClick={() => setDrillType(null)}
                className="absolute top-3 right-3 z-10 h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
              >
                ← Voltar aos clusters
              </button>
            )}
            {!root && !globalMode && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-[12px] font-semibold text-text-on-light">
                    Nenhuma entidade selecionada
                  </p>
                  <p className="mt-1 text-[11px] font-mono text-muted-on-light">
                    Use a busca à esquerda ou clique &quot;Ver toda a ontologia&quot;
                  </p>
                </div>
              </div>
            )}
            {(root || globalMode) && (
              <RedeCanvas
                nodes={nodes}
                links={links}
                selectedId={selected?.id ?? null}
                rootId={root ? nsId(root._origin ?? 'entity', root._rawId ?? root.id) : null}
                onNodeClick={handleNodeClick}
                /* Default 1200×700 quando o ResizeObserver ainda não
                   mediu — force-graph redimensiona quando width/height
                   mudam, então não bloqueia render inicial. */
                width={size.w || 1200}
                height={size.h || 700}
              />
            )}
            {/* Estado honesto: nós presentes mas SEM vínculos — diferencia
                ausência de relações de bug de renderização (Onda 1). */}
            {(root || globalMode) && nodes.length > 0 && links.length === 0 && (
              <div
                data-testid="rede-sem-vinculos"
                className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white border border-warning/40 bg-warning/5 px-3 py-1.5 text-[11px] text-text-on-light max-w-[90%] text-center"
              >
                Nenhum vínculo entre as entidades carregadas. As entidades existem,
                mas não há relações registradas no recorte atual.
              </div>
            )}
            {/* Corte sinalizado: o grafo foi truncado no limite — há mais (Onda 2). */}
            {(root || globalMode) && truncated && (
              <div
                data-testid="rede-truncado"
                className="absolute top-3 left-3 z-10 bg-white border border-warning/40 bg-warning/5 px-2 py-1 text-[10px] font-mono text-text-on-light"
              >
                Mostrando {nodes.length} nós (limite {limit}). Há mais — aumente o
                limite na barra lateral ou refine.
              </div>
            )}
            {(root || globalMode) && nodes.length > 0 && (
              <>
                <div className="absolute bottom-3 left-3 bg-white border border-border-light px-2 py-1 flex items-center gap-3 text-[10px] font-mono text-muted-on-light z-10">
                  <span>
                    {nodes.length} nós · {links.length} vínculos
                  </span>
                  {selected && (
                    <>
                      <span className="opacity-50">·</span>
                      <span data-testid={`rede-node-${selected.id}`}>
                        Selecionado: {selected.name}
                      </span>
                    </>
                  )}
                </div>

                {/* Legenda de tipos presentes no grafo */}
                <RedeLegenda nodes={nodes} />
              </>
            )}
          </div>

          <RedeInspector selected={selected} error={error} />
        </div>
      </PageShell>
    </RequirePerm>
  );
}
