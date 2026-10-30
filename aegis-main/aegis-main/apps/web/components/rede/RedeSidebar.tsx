'use client';

/**
 * RedeSidebar — busca debouncada de entidades + slider de hops + botão Limpar.
 *
 * Chama `Entities.list({ q })` 300ms após a última digitação. O resultado vira
 * uma lista clicável; click define o "root" do grafo no parent.
 */
import { useEffect, useState } from 'react';
import { Globe, Search, X } from 'lucide-react';
import { Entities, Ontology } from '@/lib/api';
import { OBJECT_ICONS, OBJECT_LABELS } from '@/lib/object-icons';
import type { Entity, OntologyNode } from '@/lib/api/types';
import type { ObjectType } from '@/lib/mock-data';
import { cn } from '@/lib/cn';

/** Converte um OntologyNode (store canônico) numa Entity-like p/ a lista,
 *  marcando `_origin='node'` — o /rede expande node-origin via neighbors BFS. */
function nodeToEntity(n: OntologyNode): Entity {
  const nn = n as unknown as Record<string, unknown>;
  return {
    id: String(nn.id ?? ''),
    name: String(nn.name ?? nn.id ?? ''),
    entity_type: String(nn.node_type ?? ''),
    properties: (nn.properties as Record<string, unknown>) ?? {},
    classification: 'restrito',
    signed_hash: (nn.signed_hash as string | null) ?? null,
    version: typeof nn.version === 'number' ? nn.version : 1,
    created_by: '',
    created_at: (nn.created_at as string) ?? '',
    updated_at: (nn.updated_at as string | null) ?? null,
    _origin: 'node',
    _rawId: String(nn.id ?? ''),
  };
}

const LIMIT_OPTS = [300, 500, 1000, 2000, 5000] as const;

type Props = {
  rootId: string | null;
  rootName: string | null;
  hops: number;
  setHops: (n: number) => void;
  /** Limite de nós por store no modo global (Onda 2 — corte sinalizado). */
  limit: number;
  setLimit: (n: number) => void;
  globalMode?: boolean;
  /** Onda 2 — visão em cluster (agregada) vs nós crus. */
  clusterView?: boolean;
  setClusterView?: (v: boolean) => void;
  onSelectRoot: (e: Entity) => void;
  onClear: () => void;
  /** Carrega o grafo global da ontologia (todas entities + links). */
  onLoadGlobal?: () => void;
};

export function RedeSidebar({
  rootId,
  rootName,
  hops,
  setHops,
  limit,
  setLimit,
  globalMode,
  clusterView,
  setClusterView,
  onSelectRoot,
  onClear,
  onLoadGlobal,
}: Props) {
  const [query, setQuery] = useState('');
  // SHELL HONESTO (2026-06-12): estado inicial VAZIO — o corpus demo
  // fabricado morreu. `live === null` = ainda não consultou o backend.
  const [results, setResults] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      // Onda 2 — busca UNIFICADA: Entity (legado) + OntologyNode (canônico). Cada
      // resultado carrega `_origin`; o /rede expande entity via /entities/{id}/graph
      // e node via neighbors BFS. allSettled: um store offline não derruba o outro.
      const params: Record<string, string> = { limit: '15' };
      if (query.trim()) params.q = query.trim();
      const [entRes, nodeRes] = await Promise.allSettled([
        Entities.list(params),
        Ontology.listNodes({ q: query.trim() || undefined, limit: 15 }),
      ]);
      if (cancelled) return;
      const ents: Entity[] =
        entRes.status === 'fulfilled'
          ? entRes.value.map((e) => ({ ...e, _origin: 'entity' as const, _rawId: e.id }))
          : [];
      const nodes: Entity[] =
        nodeRes.status === 'fulfilled' ? nodeRes.value.map(nodeToEntity) : [];
      setResults([...ents, ...nodes]);
      setLive(entRes.status === 'fulfilled' || nodeRes.status === 'fulfilled');
      setLoading(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <aside
      data-testid="rede-sidebar"
      className="w-[240px] bg-panel-light border-r border-border-light flex flex-col shrink-0 overflow-hidden"
    >
      <div className="p-3 border-b border-border-light">
        <label className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Buscar entidade
        </label>
        <div className="mt-1 relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, placa, CPF, ID…"
            data-testid="rede-search"
            className="w-full h-8 pl-7 pr-2 bg-white border border-border-light text-[12px] outline-none focus:border-primary"
          />
        </div>
        <p className="mt-1.5 text-[10px] font-mono text-muted-on-light">
          {loading || live === null
            ? 'Buscando…'
            : `${results.length} resultado${results.length === 1 ? '' : 's'}${live ? '' : ' · offline'}`}
        </p>
      </div>

      <div className="p-3 border-b border-border-light">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="rede-hops"
            className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold"
          >
            Saltos (hops)
          </label>
          <span
            data-testid="rede-hops-value"
            className="text-[11px] font-mono text-text-on-light"
          >
            {hops}
          </span>
        </div>
        <input
          id="rede-hops"
          data-testid="rede-hops"
          type="range"
          min={1}
          max={4}
          step={1}
          value={hops}
          onChange={(e) => setHops(parseInt(e.target.value, 10))}
          className="w-full"
        />
        <div className="mt-1 flex justify-between text-[9px] font-mono text-muted-on-light">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
        </div>
      </div>

      {onLoadGlobal && (
        <div className="p-3 border-b border-border-light">
          <button
            type="button"
            data-testid="rede-global"
            onClick={onLoadGlobal}
            className="w-full h-8 px-2 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5 justify-center"
            title="Carrega TODAS as entities + links — visão da ontologia inteira"
          >
            <Globe className="w-3 h-3" strokeWidth={1.5} />
            Ver toda a ontologia
          </button>
          {globalMode && setClusterView && (
            <div className="mt-2 flex items-stretch gap-1" data-testid="rede-view-toggle">
              <button
                type="button"
                onClick={() => setClusterView(true)}
                data-testid="rede-view-clusters"
                className={cn(
                  'flex-1 h-7 px-2 text-[11px] border',
                  clusterView
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white border-border-light text-text-on-light hover:border-primary',
                )}
                title="Panorama agregado — escala a milhões"
              >
                Clusters
              </button>
              <button
                type="button"
                onClick={() => setClusterView(false)}
                data-testid="rede-view-nodes"
                className={cn(
                  'flex-1 h-7 px-2 text-[11px] border',
                  !clusterView
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white border-border-light text-text-on-light hover:border-primary',
                )}
                title="Nós crus (use limite; pesado em tenants grandes)"
              >
                Nós
              </button>
            </div>
          )}
          {globalMode && !clusterView && (
            <div className="mt-2 flex items-center gap-2">
              <label
                htmlFor="rede-limit"
                className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold"
              >
                Limite
              </label>
              <select
                id="rede-limit"
                data-testid="rede-limit"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                className="flex-1 h-7 px-1.5 bg-white border border-border-light text-[11px] font-mono outline-none focus:border-primary"
              >
                {LIMIT_OPTS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString('pt-BR')} nós/store
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {rootId && (
        <div className="p-3 border-b border-border-light bg-raised-light">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
            Raiz atual
          </p>
          <p
            data-testid="rede-root-name"
            className="text-[12px] font-semibold text-text-on-light truncate"
          >
            {rootName ?? rootId}
          </p>
          <button
            type="button"
            data-testid="rede-clear"
            onClick={onClear}
            className="mt-2 h-7 px-2 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5 w-full justify-center"
          >
            <X className="w-3 h-3" strokeWidth={1.5} /> Limpar
          </button>
        </div>
      )}

      <ul className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <li className="px-3 py-6 text-center text-muted-on-light text-[11px]">
            Nenhum resultado.
          </li>
        ) : (
          results.map((e) => {
            const tipo = e.entity_type as ObjectType;
            const Icon = OBJECT_ICONS[tipo] || OBJECT_ICONS.pessoa;
            const isRoot = rootId === e.id;
            const subtitle =
              Object.values(e.properties).slice(0, 2).join(' · ') ||
              OBJECT_LABELS[tipo] ||
              tipo;
            return (
              <li key={`${e._origin ?? 'entity'}:${e.id}`}>
                <button
                  type="button"
                  data-testid={`rede-result-${e.id}`}
                  onClick={() => onSelectRoot(e)}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-border-light transition-colors flex items-start gap-2',
                    isRoot
                      ? 'bg-white border-l-2 border-l-primary'
                      : 'hover:bg-raised-light/60',
                  )}
                >
                  <Icon
                    className="w-3.5 h-3.5 text-muted-on-light shrink-0 mt-0.5"
                    strokeWidth={1.5}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate">{e.name}</p>
                    <p className="text-[10px] font-mono text-muted-on-light truncate">
                      {subtitle}
                    </p>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
