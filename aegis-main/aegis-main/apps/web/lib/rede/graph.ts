/**
 * /rede — normalização + unificação de grafos (Onda 2).
 *
 * O /rede unifica DOIS stores que vivem em tabelas diferentes:
 *   - canônico: OntologyNode/OntologyEdge  (`/ontology/graph`)
 *       node.node_type · edge.source_node_id/target_node_id/relation_type
 *   - legado:   Entity/EntityLink          (`/entities/global/graph`, `/entities/{id}/graph`)
 *       node.kind/display/canonical · edge.src/dst/rel (ou source_id/target_id)
 *
 * Para o force-graph não colidir ids entre os dois stores (uuids de tabelas
 * distintas), cada nó/aresta recebe id **namespaced** (`n:<uuid>` p/ canônico,
 * `e:<uuid>` p/ legado). O uuid cru é preservado em `_rawId` (ficha/evidência)
 * e a origem em `_origin`. Funções PURAS — testáveis isoladas (sem rede/React).
 */
import type { Entity, EntityLink, GraphOverview } from '@/lib/api/types';

export type RedeOrigin = 'entity' | 'node';
export type RedeNode = Entity & { _rawId: string; _origin: RedeOrigin };
export interface RedeGraph {
  nodes: RedeNode[];
  links: EntityLink[];
  evidenceCount: number;
  /** Onda 2 — algum store cortou o resultado em `limit` (há mais dados). */
  truncated: boolean;
}

/** Prefixo de namespace por store. */
export const PREFIX: Record<RedeOrigin, string> = { entity: 'e', node: 'n' };

/** Adiciona o namespace de origem a um uuid cru. */
export function nsId(origin: RedeOrigin, rawId: string): string {
  return `${PREFIX[origin]}:${rawId}`;
}

/** Remove o namespace, devolvendo o uuid cru (e a origem). */
export function stripNs(id: string): { origin: RedeOrigin | null; rawId: string } {
  if (id.startsWith('n:')) return { origin: 'node', rawId: id.slice(2) };
  if (id.startsWith('e:')) return { origin: 'entity', rawId: id.slice(2) };
  return { origin: null, rawId: id };
}

const _MARK_TO_CLASS: Record<string, Entity['classification']> = {
  OFICIAL: 'publico',
  OPERACIONAL: 'restrito',
  GABINETE_INTERNO: 'confidencial',
  CHEFE_GABINETE: 'sigiloso',
};

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

/**
 * Normaliza a resposta de grafo (qualquer um dos dois shapes) em RedeGraph
 * com ids namespaced por `origin`. Aceita `edges` ou `links`. Arestas sem os
 * dois endpoints são descartadas (não dá pra desenhar aresta órfã no canvas).
 */
export function normalizeRedeGraph(g: unknown, origin: RedeOrigin): RedeGraph {
  const obj = (g ?? {}) as Record<string, unknown>;
  const rawNodes = Array.isArray(obj.nodes) ? (obj.nodes as Record<string, unknown>[]) : [];
  const rawEdges = Array.isArray(obj.edges)
    ? (obj.edges as Record<string, unknown>[])
    : Array.isArray(obj.links)
      ? (obj.links as Record<string, unknown>[])
      : [];

  const nodes: RedeNode[] = rawNodes
    .map((n) => {
      const rawId = typeof n.id === 'string' ? n.id : String(n.id ?? '');
      if (!rawId) return null;
      const markings = Array.isArray(n.markings) ? (n.markings as string[]) : [];
      const inferredClass =
        markings.map((m) => _MARK_TO_CLASS[m]).find(Boolean) ?? 'restrito';
      return {
        id: nsId(origin, rawId),
        _rawId: rawId,
        _origin: origin,
        name: pickStr(n, ['name', 'display', 'canonical']) || rawId,
        entity_type: pickStr(n, ['entity_type', 'node_type', 'kind']),
        properties: (n.properties as Record<string, unknown>) ?? {},
        classification:
          (n.classification as Entity['classification']) ??
          (inferredClass as Entity['classification']),
        signed_hash: (n.signed_hash as string | null) ?? null,
        version: typeof n.version === 'number' ? n.version : 1,
        created_by: (n.created_by as string) ?? '',
        created_at: (n.created_at as string) ?? '',
        updated_at: (n.updated_at as string | null) ?? null,
      } as RedeNode;
    })
    .filter((n): n is RedeNode => n !== null);

  const links: EntityLink[] = rawEdges
    .map((e) => {
      const src = pickStr(e, ['source_node_id', 'src', 'src_id', 'source_id', 'source']);
      const dst = pickStr(e, ['target_node_id', 'dst', 'dst_id', 'target_id', 'target']);
      if (!src || !dst) return null;
      return {
        id: typeof e.id === 'string' ? e.id : `${src}-${dst}`,
        source_id: nsId(origin, src),
        target_id: nsId(origin, dst),
        link_type: pickStr(e, ['relation_type', 'rel', 'link_type', 'edge_type']) || 'rel',
        properties:
          (e.properties as Record<string, unknown>) ??
          (e.metadata as Record<string, unknown>) ??
          {},
      } as EntityLink;
    })
    .filter((l): l is EntityLink => l !== null);

  const evidenceCount = typeof obj.evidence_count === 'number' ? obj.evidence_count : 0;
  return { nodes, links, evidenceCount, truncated: obj.truncated === true };
}

/** Formata contagem compacta pt-BR (1424 → "1,4 mil"). */
function _fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return String(n);
}

/**
 * Converte a visão agregada (overview) em super-nós + arestas agregadas pro
 * canvas — escala a milhões (são ~dezenas de clusters). Cada super-nó carrega
 * `_cluster`/`_clusterKey`/`_count`; clicar nele faz drill-down pro tipo.
 */
export function overviewToRede(
  ov: GraphOverview,
  origin: RedeOrigin = 'node',
): { nodes: RedeNode[]; links: EntityLink[] } {
  const ns = (k: string) => `${PREFIX[origin]}:cluster:${k}`;
  const nodes: RedeNode[] = (ov.clusters || []).map((c) => ({
    id: ns(c.key),
    _rawId: c.key,
    _origin: origin,
    _cluster: true,
    _clusterKey: c.key,
    _count: c.count,
    name: `${c.label} · ${_fmtCount(c.count)}`,
    entity_type: c.key, // dá cor/ícone por tipo no canvas
    properties: { count: c.count },
    classification: 'restrito',
    signed_hash: null,
    version: 1,
    created_by: '',
    created_at: '',
    updated_at: null,
  }));
  const present = new Set(nodes.map((n) => n.id));
  const links: EntityLink[] = (ov.edges || [])
    .map((e, i) => ({
      id: `clusteredge-${i}`,
      source_id: ns(e.source),
      target_id: ns(e.target),
      link_type: _fmtCount(e.count),
      properties: { count: e.count },
    }))
    .filter((l) => present.has(l.source_id) && present.has(l.target_id)) as EntityLink[];
  return { nodes, links };
}

/**
 * Unifica vários RedeGraph: dedup de nós por id namespaced, e MANTÉM apenas
 * arestas cujos dois endpoints estão presentes no conjunto final (consistência
 * do canvas — react-force-graph quebra silenciosamente com aresta órfã).
 */
export function mergeRedeGraphs(parts: RedeGraph[]): RedeGraph {
  const nodeById = new Map<string, RedeNode>();
  for (const p of parts) for (const n of p.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const present = new Set(nodeById.keys());

  const linkById = new Map<string, EntityLink>();
  for (const p of parts) {
    for (const l of p.links) {
      if (present.has(l.source_id) && present.has(l.target_id) && !linkById.has(l.id)) {
        linkById.set(l.id, l);
      }
    }
  }
  return {
    nodes: [...nodeById.values()],
    links: [...linkById.values()],
    evidenceCount: parts.reduce((a, p) => a + p.evidenceCount, 0),
    truncated: parts.some((p) => p.truncated),
  };
}
