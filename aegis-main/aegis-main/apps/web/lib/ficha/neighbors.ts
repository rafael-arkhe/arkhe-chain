/**
 * Vizinhança 1-hop de um objeto da ficha — fonte ÚNICA p/ a aba Vínculos
 * (relation_list) E o navegador de associações (associacoes-rail).
 *
 * BUG que isto corrige: a /ficha resolve o id via Entities.get → obj.id é um
 * Entity.id. Chamar Links.neighbors (grafo de OntologyNode) com um Entity.id dá
 * 404 "node not found". Aqui roteamos pelo espaço de id correto:
 *   • obj.__canonical === true (OntologyNode) → Links.neighbors (grafo da ontologia)
 *   • senão (Entity) → Entities.graph (grafo de Entity, /entities/{id}/graph)
 * e normalizamos os dois para um shape único {nodes,edges}.
 */
import { Links, Entities } from '@/lib/api';

export type NeighborNode = { id: string; name: string; node_type: string };
export type NeighborEdge = {
  source_id: string;
  target_id: string;
  relation_type: string;
  /** Confiança 0..1 da aresta (Entities.graph `e.weight`). Qualifica o vínculo. */
  weight?: number;
  /** Qualificação societária / status (possible|confirmed) / proveniência / confiança.
   *  Vem de `e.properties` (Entity) ou `e.properties`/`e.metadata` (canônico). */
  properties?: Record<string, unknown>;
};
export type NeighborsOut = { nodes: NeighborNode[]; edges: NeighborEdge[] };

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export async function fetchNeighbors(
  id: string,
  isCanonical: boolean,
  opts?: { max_depth?: number; max_nodes?: number },
): Promise<NeighborsOut> {
  const max_depth = opts?.max_depth ?? 1;
  const max_nodes = opts?.max_nodes ?? 100;

  if (isCanonical) {
    // Grafo da ontologia (OntologyNode) — já vem no shape {nodes,edges} certo.
    const out = await Links.neighbors(id, { max_depth, max_nodes });
    const nodes = ((out?.nodes ?? []) as unknown[]).map((n) => {
      const d = rec(n);
      return {
        id: String(d.id ?? ''),
        name: String(d.name ?? d.label ?? d.display ?? d.id ?? ''),
        node_type: String(d.node_type ?? d.kind ?? ''),
      };
    });
    const edges = ((out?.edges ?? []) as unknown[]).map((e) => {
      const d = rec(e);
      // Canônico (Links.neighbors / OntologyEdge): qualificação vem em `properties`
      // ou `metadata` quando o backend a serializa; weight idem. "Se disponível".
      const props = { ...rec(d.metadata), ...rec(d.properties) };
      const w = typeof d.weight === 'number' ? (d.weight as number) : undefined;
      return {
        source_id: String(d.source_id ?? d.src ?? ''),
        target_id: String(d.target_id ?? d.dst ?? ''),
        relation_type: String(d.relation_type ?? d.rel ?? 'vínculo'),
        ...(w !== undefined ? { weight: w } : {}),
        ...(Object.keys(props).length ? { properties: props } : {}),
      };
    });
    return { nodes, edges };
  }

  // Grafo de Entity (ficha de pessoa/objeto). nodes {id,kind,display}; edges {src,dst,rel}.
  const g = rec(await Entities.graph(id, { hops: max_depth, max_nodes }));
  const nodes = ((g.nodes ?? []) as unknown[]).map((n) => {
    const d = rec(n);
    return {
      id: String(d.id ?? ''),
      name: String(d.display ?? d.canonical ?? d.name ?? d.id ?? ''),
      node_type: String(d.kind ?? d.node_type ?? ''),
    };
  });
  const edges = ((g.edges ?? []) as unknown[]).map((e) => {
    const d = rec(e);
    // Entities.graph já devolve a aresta qualificada: weight (confiança) + properties
    // (qualificacao societária, status possible/confirmed, proveniência). Não achatar.
    const props = { ...rec(d.metadata), ...rec(d.properties) };
    const w = typeof d.weight === 'number' ? (d.weight as number) : undefined;
    return {
      source_id: String(d.src ?? d.source_id ?? ''),
      target_id: String(d.dst ?? d.target_id ?? ''),
      relation_type: String(d.rel ?? d.relation_type ?? 'vínculo'),
      ...(w !== undefined ? { weight: w } : {}),
      ...(Object.keys(props).length ? { properties: props } : {}),
    };
  });
  return { nodes, edges };
}
