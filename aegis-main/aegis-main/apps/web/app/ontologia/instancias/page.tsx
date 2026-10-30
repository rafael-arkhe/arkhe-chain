'use client';

/**
 * /ontologia/instancias — Browser de instâncias da ontologia.
 *
 * Layout Palantir 3-pane:
 * - LEFT (240px):  lista de tipos com count, filtro de busca e seleção
 *                  ativa (pré-selecionada via `?tipo=<name>` da URL).
 * - CENTER (flex): tabela densa de objetos do tipo selecionado.
 * - RIGHT (380px): inspector inline do objeto selecionado — exibe
 *                  propriedades + relações que envolvem o node (resolve
 *                  source/target via listEdges()).
 *
 * Inspeção inline; desde T1 a /ficha/{id} TAMBÉM resolve OntologyNode
 * canônico (fallback após Entity/CCTV) — ficha de 1ª classe pra
 * qualquer instância da ontologia.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Box,
  Boxes,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Database,
  Filter,
  History,
  Network,
  Pencil,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { OntologiaTabs } from '@/components/ontologia/ontologia-tabs';
import { RequirePerm } from '@/components/auth/require-perm';
import { useCan } from '@/lib/auth/useAuth';
import { Ontology, type OntologyNodeType, type NodeVersion, type NodeAsOf } from '@/lib/api';
import type { OntologyEdge, OntologyNode } from '@/lib/api/types';
import { formatDataHoraBR } from '@/lib/datetime';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';

const PAGE_SIZE = 100;

export default function OntologiaInstanciasPage() {
  const params = useSearchParams();
  const t = useT();
  const tipoFromQuery = params?.get('tipo') ?? '';

  const [types, setTypes] = useState<OntologyNodeType[]>([]);
  const [tipo, setTipo] = useState<string>(tipoFromQuery);
  const [tipoQuery, setTipoQuery] = useState('');
  const [nodes, setNodes] = useState<OntologyNode[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [edges, setEdges] = useState<OntologyEdge[]>([]);
  const [nodeIndex, setNodeIndex] = useState<Map<string, OntologyNode>>(new Map());
  // F1 remoção — seleção múltipla + bulk-delete com preview do raio de ação.
  const canBulkDelete = useCan('ontology.objects.bulk_delete');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPreview, setBulkPreview] = useState<{
    matched: number;
    edges_affected: number;
    sample: { id: string; name: string; node_type: string }[];
  } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Carrega tipos pra coluna esquerda
  useEffect(() => {
    let cancelled = false;
    setLoadingTypes(true);
    Ontology.listNodeTypes()
      .then((rows) => {
        if (cancelled) return;
        const sorted = [...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
        setTypes(sorted);
      })
      .catch(() => {
        /* o erro do fetch de nodes é mais visível pro operador */
      })
      .finally(() => {
        if (!cancelled) setLoadingTypes(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Carrega edges + grafo para resolver relações no inspector
  useEffect(() => {
    let cancelled = false;
    Ontology.graph()
      .then((g) => {
        if (cancelled) return;
        setEdges(g.edges);
        const map = new Map<string, OntologyNode>();
        for (const n of g.nodes) map.set(n.id, n);
        setNodeIndex(map);
      })
      .catch(() => {
        /* inspector mostra "sem relações" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sincroniza tipo da URL → state
  useEffect(() => {
    setTipo(tipoFromQuery);
    setSelectedNodeId(null);
    setSelectedIds(new Set());
  }, [tipoFromQuery]);

  // Carrega instâncias do tipo selecionado
  useEffect(() => {
    if (!tipo) {
      setNodes([]);
      setError(null);
      setSelectedNodeId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    Ontology.listNodes({ node_type: tipo, limit: PAGE_SIZE, offset: 0 })
      .then((rows) => {
        if (cancelled) return;
        setNodes(rows);
        setSelectedNodeId(rows[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Falha ao carregar instâncias.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tipo]);

  const filteredTypes = useMemo(() => {
    const q = tipoQuery.trim().toLowerCase();
    if (!q) return types;
    return types.filter(
      (t) =>
        (t.label ?? '').toLowerCase().includes(q) ||
        (t.name ?? '').toLowerCase().includes(q),
    );
  }, [types, tipoQuery]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (n) =>
        (n.name ?? '').toLowerCase().includes(q) ||
        (n.description ?? '').toLowerCase().includes(q) ||
        (n.id ?? '').toLowerCase().includes(q),
    );
  }, [nodes, query]);

  const tipoLabel = useMemo(() => {
    if (!tipo) return '';
    const found = types.find((x) => x.name === tipo);
    return found?.label || tipo;
  }, [types, tipo]);

  // ── F1 remoção — seleção múltipla + bulk-delete ─────────────────────
  const allFilteredSelected = filtered.length > 0 && filtered.every((n) => selectedIds.has(n.id));
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((n) => next.delete(n.id));
      else filtered.forEach((n) => next.add(n.id));
      return next;
    });
  const openBulkPreview = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const prev = await Ontology.bulkDeleteNodes({ node_ids: ids, dry_run: true });
      setBulkPreview({
        matched: prev.matched ?? 0,
        edges_affected: prev.edges_affected ?? 0,
        sample: prev.sample ?? [],
      });
    } finally {
      setBulkBusy(false);
    }
  };
  const confirmBulkDelete = async () => {
    if (!bulkPreview) return;
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    try {
      await Ontology.bulkDeleteNodes({
        node_ids: ids,
        dry_run: false,
        confirm: true,
        expected_count: bulkPreview.matched,
      });
      setNodes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
      if (selectedNodeId && selectedIds.has(selectedNodeId)) setSelectedNodeId(null);
      setSelectedIds(new Set());
      setBulkPreview(null);
      // atualiza contagem dos tipos na coluna esquerda
      Ontology.listNodeTypes()
        .then((rows) => setTypes([...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))))
        .catch(() => {});
    } finally {
      setBulkBusy(false);
    }
  };

  // Onda 2 — navegação do grafo tipado: o objeto selecionado pode ser do tipo
  // atual (lista central) OU um VINCULADO de outro tipo (resolvido do grafo) ao
  // clicar numa relação. Fallback p/ nodeIndex permite traversar objeto→vinculado.
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId)
      ?? (selectedNodeId ? nodeIndex.get(selectedNodeId) : undefined)
      ?? null,
    [nodes, nodeIndex, selectedNodeId],
  );

  const typeLabelOf = useMemo(() => {
    const m = new Map(types.map((t) => [t.name, t.label || t.name]));
    return (kind: string | undefined) => (kind ? (m.get(kind) || kind) : '');
  }, [types]);

  const nodeRelations = useMemo(() => {
    if (!selectedNode) return [];
    return edges.filter(
      (e) => e.source_node_id === selectedNode.id || e.target_node_id === selectedNode.id,
    );
  }, [edges, selectedNode]);

  const subtitle = !tipo
    ? 'Escolha um tipo na coluna esquerda'
    : loading
      ? `Carregando objetos do tipo ${tipoLabel}…`
      : `${formatNumber(nodes.length)} objeto${nodes.length === 1 ? '' : 's'} do tipo ${tipoLabel}`;

  return (
    <RequirePerm perm="security.ontologia.view">
      <PageShell
        title="Instâncias"
        subtitle={subtitle}
        theme="light"
        subnav={<OntologiaTabs />}
        toolbar={
          <div className="relative">
            <Search
              className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome…"
              data-testid="ontologia-instancias-search"
              disabled={!tipo}
              className="w-64 h-7 pl-7 pr-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary disabled:opacity-60"
            />
          </div>
        }
      >
        <div className="h-full flex overflow-hidden">
          {/* LEFT: types */}
          <aside className="w-[240px] shrink-0 border-r border-border-light bg-raised-light/20 flex flex-col overflow-hidden">
            <div className="shrink-0 px-3 py-2 border-b border-border-light">
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-1.5 flex items-center gap-1">
                <Filter className="w-3 h-3" strokeWidth={1.5} />
                Tipo de objeto
              </p>
              <div className="relative">
                <Search
                  className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light"
                  strokeWidth={1.5}
                />
                <input
                  type="text"
                  value={tipoQuery}
                  onChange={(e) => setTipoQuery(e.target.value)}
                  placeholder="Filtrar tipos…"
                  data-testid="ontologia-instancias-tipo-filter"
                  className="w-full h-7 pl-7 pr-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingTypes ? (
                <p className="px-3 py-4 text-[11px] text-muted-on-light">Carregando…</p>
              ) : filteredTypes.length === 0 ? (
                <p className="px-3 py-4 text-[11px] text-muted-on-light">Sem tipos.</p>
              ) : (
                <ul>
                  {filteredTypes.map((t) => {
                    const active = t.name === tipo;
                    return (
                      <li key={t.name}>
                        <button
                          type="button"
                          onClick={() => setTipo(t.name)}
                          data-testid={`ontologia-instancias-tipo-${t.name}`}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors border-l-2',
                            active
                              ? 'bg-primary/10 border-primary text-text-on-light'
                              : 'border-transparent hover:bg-raised-light/40',
                          )}
                        >
                          <Boxes
                            className={cn(
                              'w-3 h-3 shrink-0',
                              active ? 'text-primary' : 'text-muted-on-light',
                            )}
                            strokeWidth={1.5}
                          />
                          <span className="text-[11px] truncate flex-1 text-text-on-light">
                            {t.label || t.name}
                          </span>
                          <span className="text-[10px] font-mono text-muted-on-light tabular-nums shrink-0">
                            {formatNumber(t.count ?? 0)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* CENTER: dense list */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {error && (
              <div className="mx-4 mt-3 px-3 py-2 text-[11px] bg-danger/5 border border-danger/40 text-danger">
                {error}
              </div>
            )}
            <div className="flex-1 overflow-auto p-4">
              <div className="bg-canvas-light border border-border-light">
                {!tipo ? (
                  <EmptyChooseType />
                ) : loading ? (
                  <div className="px-4 py-12 text-center text-[12px] text-muted-on-light">
                    Carregando…
                  </div>
                ) : filtered.length === 0 ? (
                  <EmptyNoResults hasData={nodes.length > 0} tipoLabel={tipoLabel} />
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-on-light bg-raised-light/40 sticky top-0">
                      <tr>
                        {canBulkDelete && (
                          <th className="px-2 py-2 w-[34px]">
                            <button
                              type="button"
                              onClick={toggleAll}
                              data-testid="ontologia-select-all"
                              aria-label={t('bulk.selectAll')}
                              className="h-4 w-4 flex items-center justify-center text-muted-on-light hover:text-primary"
                            >
                              {allFilteredSelected ? (
                                <CheckSquare className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                              ) : (
                                <Square className="w-3.5 h-3.5" strokeWidth={1.5} />
                              )}
                            </button>
                          </th>
                        )}
                        <th className="px-3 py-2 text-left font-semibold">Nome</th>
                        <th className="px-3 py-2 text-left font-semibold w-[70px]">
                          Versão
                        </th>
                        <th className="px-3 py-2 text-left font-semibold w-[180px]">
                          Editado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light/60">
                      {filtered.map((n) => {
                        const isSelected = n.id === selectedNodeId;
                        const isChecked = selectedIds.has(n.id);
                        return (
                          <tr
                            key={n.id}
                            data-testid={`ontologia-instancia-${n.id}`}
                            onClick={() => setSelectedNodeId(n.id)}
                            className={cn(
                              'cursor-pointer transition-colors',
                              isChecked
                                ? 'bg-danger/5 border-l-2 border-danger'
                                : isSelected
                                  ? 'bg-primary/5 border-l-2 border-primary'
                                  : 'hover:bg-raised-light/30 border-l-2 border-transparent',
                            )}
                          >
                            {canBulkDelete && (
                              <td className="px-2 py-2 w-[34px]">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleOne(n.id);
                                  }}
                                  data-testid={`ontologia-select-${n.id}`}
                                  aria-label={t('bulk.selectRow')}
                                  className="h-4 w-4 flex items-center justify-center text-muted-on-light hover:text-primary"
                                >
                                  {isChecked ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-danger" strokeWidth={1.5} />
                                  ) : (
                                    <Square className="w-3.5 h-3.5" strokeWidth={1.5} />
                                  )}
                                </button>
                              </td>
                            )}
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-6 w-6 shrink-0 bg-primary/5 border border-primary/30 flex items-center justify-center text-primary">
                                  <Box className="w-3 h-3" strokeWidth={1.5} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-medium text-text-on-light truncate">
                                    {n.name || n.id}
                                  </p>
                                  {n.description ? (
                                    <p className="text-[10px] text-muted-on-light truncate">
                                      {n.description}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] font-mono text-muted-on-light/70 truncate">
                                      {n.id}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {n.version ? (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide border bg-raised-light/40 text-muted-on-light border-border-light">
                                  v{n.version}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-on-light/60">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[10px] font-mono text-muted-on-light tabular-nums">
                              {n.updated_at
                                ? formatDataHoraBR(n.updated_at)
                                : n.created_at
                                  ? formatDataHoraBR(n.created_at)
                                  : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            {/* F1 remoção — barra de ação em lote (aparece com seleção) */}
            {canBulkDelete && selectedIds.size > 0 && (
              <div
                data-testid="ontologia-bulk-bar"
                className="shrink-0 border-t border-danger/40 bg-danger/5 px-4 py-2 flex items-center justify-between gap-3"
              >
                <span className="text-[11px] text-text-on-light">
                  {t('bulk.selectedCount').replace('{n}', String(selectedIds.size))}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="h-7 px-2.5 text-[11px] border border-border-light text-muted-on-light hover:text-text-on-light"
                  >
                    {t('bulk.clear')}
                  </button>
                  <button
                    type="button"
                    onClick={openBulkPreview}
                    disabled={bulkBusy}
                    data-testid="ontologia-bulk-delete"
                    className="h-7 px-2.5 text-[11px] flex items-center gap-1.5 bg-danger text-white border border-danger hover:bg-danger/90 disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />{' '}
                    {t('bulk.deleteN').replace('{n}', String(selectedIds.size))}
                  </button>
                </div>
              </div>
            )}
          </main>

          {/* RIGHT: inspector */}
          <aside className="w-[380px] shrink-0 border-l border-border-light bg-raised-light/20 flex flex-col overflow-hidden">
            {selectedNode ? (
              <NodeInspector
                node={selectedNode}
                relations={nodeRelations}
                nodeIndex={nodeIndex}
                tipoLabel={typeLabelOf(selectedNode.node_type) || tipoLabel}
                onNavigate={setSelectedNodeId}
                typeLabelOf={typeLabelOf}
              />
            ) : (
              <InspectorEmpty hasTipo={!!tipo} />
            )}
          </aside>
        </div>
      </PageShell>

      {/* F1 remoção — diálogo de confirmação com preview do raio de ação */}
      {bulkPreview && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-4"
          data-testid="ontologia-bulk-dialog"
        >
          <div className="w-[460px] max-w-[92vw] bg-white border border-border-light shadow-xl">
            <div className="px-4 py-3 border-b border-border-light flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={1.5} />
              <h3 className="text-[13px] font-semibold text-text-on-light">
                {t('bulk.confirmTitle')}
              </h3>
            </div>
            <div className="px-4 py-3 space-y-2">
              <p className="text-[12px] text-text-on-light">
                {t('bulk.confirmBody')
                  .replace('{n}', String(bulkPreview.matched))
                  .replace('{e}', String(bulkPreview.edges_affected))}
              </p>
              {bulkPreview.sample.length > 0 && (
                <div className="border border-border-light max-h-40 overflow-y-auto bg-canvas-light">
                  <ul className="divide-y divide-border-light/60">
                    {bulkPreview.sample.map((s) => (
                      <li
                        key={s.id}
                        className="px-2.5 py-1.5 text-[11px] text-text-on-light truncate"
                      >
                        {s.name || s.id}
                        <span className="text-[9px] font-mono text-muted-on-light ml-1.5">
                          {s.node_type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[10px] text-muted-on-light">{t('bulk.confirmHint')}</p>
            </div>
            <div className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                disabled={bulkBusy}
                className="h-7 px-3 text-[11px] border border-border-light text-muted-on-light hover:text-text-on-light disabled:opacity-50"
              >
                {t('bulk.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                disabled={bulkBusy}
                data-testid="ontologia-bulk-confirm"
                className="h-7 px-3 text-[11px] flex items-center gap-1.5 bg-danger text-white border border-danger hover:bg-danger/90 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} /> {t('bulk.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </RequirePerm>
  );
}

function NodeInspector({
  node,
  relations,
  nodeIndex,
  tipoLabel,
  onNavigate,
  typeLabelOf,
}: {
  node: OntologyNode;
  relations: OntologyEdge[];
  nodeIndex: Map<string, OntologyNode>;
  tipoLabel: string;
  onNavigate: (id: string) => void;
  typeLabelOf: (kind: string | undefined) => string;
}) {
  const schemaEntries = useMemo(() => {
    const schema = node.schema_definition;
    if (!schema || typeof schema !== 'object') return [];
    return Object.entries(schema as Record<string, unknown>);
  }, [node.schema_definition]);

  // Retoque UX: a seção "Propriedades" abre COLAPSADA — a ficha lidera com
  // descrição/relações; o operador expande as propriedades cruas sob demanda.
  const [propsOpen, setPropsOpen] = useState(false);
  // Atalho contextual: editar o CONTRATO do tipo deste objeto (gated).
  const canEditType = useCan('ontology.types.write');
  // Tarefa D — strings do inspector via useT() (pt-BR default + en-US).
  const t = useT();

  // Onda 11 — histórico temporal: lista de versões + estado as-of sob demanda.
  const [history, setHistory] = useState<NodeVersion[]>([]);
  const [asOf, setAsOf] = useState<NodeAsOf | null>(null);
  const [asOfVersion, setAsOfVersion] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    setHistory([]);
    setAsOf(null);
    setAsOfVersion(null);
    Ontology.nodeHistory(node.id)
      .then((rows) => { if (!cancel) setHistory(rows); })
      .catch(() => { /* sem histórico / sem permissão histórica: a seção some */ });
    return () => { cancel = true; };
  }, [node.id]);

  const viewAsOf = (v: number) => {
    if (asOfVersion === v) { setAsOfVersion(null); setAsOf(null); return; }
    setAsOfVersion(v);
    setAsOf(null);
    Ontology.nodeAsOf(node.id, String(v))
      .then((s) => setAsOf(s))
      .catch(() => setAsOf(null));  // 403 da governança histórica → sem detalhe
  };

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      data-testid="ontologia-instancia-inspector"
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border-light bg-canvas-light">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 bg-primary/5 border border-primary/30 flex items-center justify-center text-primary">
            <Box className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono">
              {tipoLabel || node.node_type}
              {node.version ? ` · v${node.version}` : ''}
            </p>
            <p className="text-[14px] font-semibold text-text-on-light truncate">
              {node.name || node.id}
            </p>
            <p className="text-[10px] font-mono text-muted-on-light truncate mt-0.5">
              {node.id}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-stretch gap-1">
            {/* Tarefa D — desde T1 a /ficha resolve OntologyNode canônico:
                a instância inspecionada abre como ficha de 1ª classe. */}
            <Link
              href={`/ficha/${encodeURIComponent(node.id)}`}
              data-testid="abrir-ficha-instancia"
              title={t('instancias.abrirFicha')}
              className="h-7 px-2 inline-flex items-center gap-1.5 text-[10px] border border-border-light text-text-on-light hover:border-primary transition-colors"
            >
              <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
              {t('instancias.abrirFicha')}
            </Link>
            {canEditType && (
              <Link
                href={`/painel-de-controle/tipos-editor?kind=${encodeURIComponent(node.node_type)}&cp=1`}
                data-testid="ontologia-instancia-inspector-editar-tipo"
                title={`Editar o contrato do tipo ${tipoLabel || node.node_type}`}
                className="h-7 px-2 inline-flex items-center gap-1.5 text-[10px] border border-border-light text-text-on-light hover:border-primary transition-colors"
              >
                <Pencil className="w-3 h-3" strokeWidth={1.5} />
                Editar tipo
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Body scroll */}
      <div className="flex-1 overflow-y-auto">
        {node.description ? (
          <section className="px-4 py-3 border-b border-border-light">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-1">
              Descrição
            </p>
            <p className="text-[11px] text-text-on-light leading-relaxed">
              {node.description}
            </p>
          </section>
        ) : null}

        <section className="px-4 py-3 border-b border-border-light">
          <button
            type="button"
            onClick={() => setPropsOpen((v) => !v)}
            aria-expanded={propsOpen}
            data-testid="ontologia-instancia-propriedades-toggle"
            className="w-full text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2 flex items-center gap-1.5 hover:text-text-on-light"
          >
            {propsOpen ? <ChevronDown className="w-3 h-3" strokeWidth={1.5} /> : <ChevronRight className="w-3 h-3" strokeWidth={1.5} />}
            <Database className="w-3 h-3" strokeWidth={1.5} />
            Propriedades
            <span className="ml-auto font-mono normal-case tracking-normal text-muted-on-light">
              {schemaEntries.length}
            </span>
          </button>
          {propsOpen && (schemaEntries.length === 0 ? (
            <p className="text-[11px] text-muted-on-light">
              Sem propriedades registradas.
            </p>
          ) : (
            <dl className="space-y-1.5" data-testid="ontologia-instancia-propriedades-lista">
              {schemaEntries.map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[110px_1fr] gap-2 items-baseline px-2 py-1.5 bg-canvas-light border border-border-light/70"
                >
                  <dt className="text-[10px] font-mono uppercase tracking-wide text-muted-on-light truncate">
                    {k}
                  </dt>
                  <dd
                    className="text-[11px] text-text-on-light break-words"
                    title={renderValue(v, true)}
                  >
                    {renderValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          ))}
        </section>

        <section className="px-4 py-3 border-b border-border-light">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2 flex items-center gap-1.5">
            <Network className="w-3 h-3" strokeWidth={1.5} />
            Relações
            <span className="ml-auto font-mono normal-case tracking-normal text-muted-on-light">
              {relations.length}
            </span>
          </p>
          {relations.length === 0 ? (
            <p className="text-[11px] text-muted-on-light">
              Este objeto não tem relações registradas.
            </p>
          ) : (
            <ul className="space-y-1">
              {relations.slice(0, 12).map((e) => {
                const isOutgoing = e.source_node_id === node.id;
                const otherId = isOutgoing ? e.target_node_id : e.source_node_id;
                const other = nodeIndex.get(otherId);
                const cardinality = (e.metadata as Record<string, unknown> | undefined)?.cardinality as
                  | string
                  | undefined;
                const canNavigate = !!other;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={!canNavigate}
                      onClick={() => canNavigate && onNavigate(otherId)}
                      data-testid={`ontologia-relacao-${otherId}`}
                      className={cn(
                        'w-full text-left px-2 py-1.5 bg-canvas-light border border-border-light/70',
                        canNavigate
                          ? 'hover:border-primary/50 hover:bg-primary/5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer'
                          : 'cursor-default',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono uppercase text-muted-on-light shrink-0">
                          {isOutgoing ? 'origem' : 'destino'}
                        </span>
                        <ArrowRight
                          className={cn(
                            'w-3 h-3 shrink-0',
                            isOutgoing ? 'text-primary' : 'text-muted-on-light',
                          )}
                          strokeWidth={1.5}
                        />
                        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border bg-primary/5 text-primary border-primary/40 shrink-0">
                          {e.relation_type ?? e.edge_type}
                        </span>
                        {cardinality ? (
                          <span className="ml-auto text-[9px] font-mono text-muted-on-light shrink-0">
                            {cardinality}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-text-on-light truncate mt-1 flex items-center gap-1">
                        {other?.name || otherId}
                        {canNavigate ? (
                          <ArrowRight className="w-3 h-3 text-primary/60 shrink-0" strokeWidth={1.5} />
                        ) : null}
                      </p>
                      {other?.node_type ? (
                        <p className="text-[10px] text-muted-on-light truncate">
                          {typeLabelOf(other.node_type)}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
              {relations.length > 12 ? (
                <li className="px-2 py-1 text-[10px] font-mono text-muted-on-light text-center">
                  +{relations.length - 12} relações adicionais
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {history.length > 0 ? (
          <section
            className="px-4 py-3 border-b border-border-light"
            data-testid="ontologia-instancia-historico"
          >
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2 flex items-center gap-1.5">
              <History className="w-3 h-3" strokeWidth={1.5} />
              Histórico
              <span className="ml-auto font-mono normal-case tracking-normal text-muted-on-light">
                {history.length}
              </span>
            </p>
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.version}>
                  <button
                    type="button"
                    onClick={() => viewAsOf(h.version)}
                    data-testid={`ontologia-versao-${h.version}`}
                    className={cn(
                      'w-full text-left px-2 py-1.5 bg-canvas-light border focus:outline-none focus:ring-1 focus:ring-primary',
                      asOfVersion === h.version
                        ? 'border-primary'
                        : 'border-border-light/70 hover:border-primary/50',
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-mono text-primary shrink-0">v{h.version}</span>
                      <span className="text-muted-on-light truncate">{h.author || '—'}</span>
                      <span className="ml-auto text-[10px] text-muted-on-light shrink-0">
                        {h.created_at ? formatDataHoraBR(h.created_at) : '—'}
                      </span>
                    </div>
                    {asOfVersion === h.version && asOf ? (
                      <dl
                        className="mt-1.5 space-y-1 border-t border-border-light/60 pt-1.5"
                        data-testid={`ontologia-asof-${h.version}`}
                      >
                        {Object.entries(asOf.properties).slice(0, 8).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[100px_1fr] gap-2">
                            <dt className="text-[9px] font-mono uppercase tracking-wide text-muted-on-light truncate">
                              {k}
                            </dt>
                            <dd className="text-[10px] text-text-on-light break-words">
                              {renderValue(v)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-2">
            Procedência
          </p>
          <dl className="space-y-1 text-[11px]">
            <Row label="Criado em" value={node.created_at ? formatDataHoraBR(node.created_at) : '—'} />
            <Row label="Editado em" value={node.updated_at ? formatDataHoraBR(node.updated_at) : '—'} />
            <Row label="Criado por" value={node.created_by || '—'} />
            <Row label="Hash assinado" value={node.signed_hash ? <span className="font-mono text-[10px]">{truncate(node.signed_hash, 18)}</span> : '—'} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10px] font-mono uppercase tracking-wide text-muted-on-light w-24 shrink-0">
        {label}
      </dt>
      <dd className="text-[11px] text-text-on-light truncate flex-1 text-right">
        {value}
      </dd>
    </div>
  );
}

function InspectorEmpty({ hasTipo }: { hasTipo: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="h-10 w-10 bg-canvas-light border border-border-light flex items-center justify-center text-muted-on-light/60 mb-3">
        <Box className="w-5 h-5" strokeWidth={1.5} />
      </div>
      <p className="text-[12px] text-text-on-light font-medium">
        {hasTipo ? 'Selecione um objeto' : 'Comece pela coluna esquerda'}
      </p>
      <p className="text-[11px] text-muted-on-light mt-1 max-w-[260px]">
        {hasTipo
          ? 'Clique numa linha ao centro para inspecionar propriedades e relações.'
          : 'Escolha um tipo de objeto para listar as instâncias correspondentes.'}
      </p>
    </div>
  );
}

function EmptyChooseType() {
  return (
    <div className="px-4 py-12 text-center">
      <Database
        className="w-6 h-6 text-muted-on-light/40 mx-auto mb-2"
        strokeWidth={1.5}
      />
      <p className="text-[12px] text-muted-on-light">
        Escolha um tipo de objeto na coluna esquerda.
      </p>
      <p className="text-[11px] text-muted-on-light/70 mt-1">
        As instâncias do tipo selecionado aparecem aqui.
      </p>
    </div>
  );
}

function EmptyNoResults({ hasData, tipoLabel }: { hasData: boolean; tipoLabel: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <X
        className="w-6 h-6 text-muted-on-light/40 mx-auto mb-2"
        strokeWidth={1.5}
      />
      <p className="text-[12px] text-muted-on-light">
        {hasData
          ? 'Nenhuma instância casa com a busca.'
          : `Nenhum objeto do tipo ${tipoLabel} foi encontrado.`}
      </p>
      <p className="text-[11px] text-muted-on-light/70 mt-1">
        {hasData
          ? 'Tente limpar a busca para ver todas as instâncias.'
          : 'Use os agentes 24/7 ou a importação manual para popular este tipo.'}
      </p>
    </div>
  );
}

function renderValue(raw: unknown, raw_string = false): string {
  if (raw == null) return '—';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) {
    if (raw.length === 0) return '[]';
    return raw_string ? JSON.stringify(raw) : `${raw.length} item${raw.length === 1 ? '' : 's'}`;
  }
  if (typeof raw === 'object') {
    const keys = Object.keys(raw as Record<string, unknown>);
    return raw_string
      ? JSON.stringify(raw)
      : keys.length === 0
        ? '{}'
        : `objeto · ${keys.length} campo${keys.length === 1 ? '' : 's'}`;
  }
  return String(raw);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}
