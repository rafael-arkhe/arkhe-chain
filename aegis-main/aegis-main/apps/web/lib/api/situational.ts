/**
 * Cliente do motor de correlação espaço-temporal (ontology-module
 * app/routers/situational.py, montado em /api/v1/situational).
 *
 * CORRELAÇÃO = LINKS REVERSÍVEIS COM EVIDÊNCIA, nunca merge de entidades.
 * O motor opera sobre QUALQUER nó posicionado da ontologia (Event de câmera
 * + Observation de telemetria + Alert) — acha vizinhos dentro de um raio
 * (haversine) e janela temporal (`nearby`, cálculo AO VIVO) e materializa
 * arestas CORRELACIONADO_COM com {distance_m, delta_s, confidence, evidence}
 * (`correlate`). Cortar remove só a aresta (reversível; nenhum nó é tocado).
 *
 * Perms:
 *   - situational.correlate.view  — nearby + correlations list/create
 *   - situational.correlate.manage — cut (cortar a correlação)
 */
import { aegis } from './sdk';

/** Vizinho posicionado dentro do raio+janela do âncora (cálculo ao vivo). */
export interface SituationalNeighbor {
  node_id: string;
  node_type: string;
  name: string;
  lat: number;
  lng: number;
  distance_m: number;
  delta_s: number;
  confidence: number;
}

export interface SituationalAnchor {
  node_id: string;
  node_type: string;
  name: string;
}

export interface NearbyResult {
  anchor: SituationalAnchor;
  neighbors: SituationalNeighbor[];
}

/** Aresta CORRELACIONADO_COM materializada (evidência reversível). */
export interface CorrelationEdge {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  distance_m?: number | null;
  delta_s?: number | null;
  confidence?: number | null;
  evidence?: Record<string, unknown> | null;
}

export interface CorrelationsResult {
  correlations: CorrelationEdge[];
}

export interface CorrelateBody {
  anchor_node_id: string;
  radius_m?: number;
  window_s?: number;
  kinds?: string[];
  limit?: number;
}

export const Situational = {
  /**
   * GET /nearby — nós posicionados dentro do raio+janela do âncora.
   * Cálculo AO VIVO, NÃO cria arestas (exploração). Mais perto+recente
   * primeiro. Defaults do servidor: 200 m / 300 s.
   */
  nearby: (opts: {
    node_id: string;
    radius_m?: number;
    window_s?: number;
    kinds?: string;
    limit?: number;
  }) =>
    aegis.situational.nearby<NearbyResult>(opts.node_id, {
      radius_m: opts.radius_m,
      window_s: opts.window_s,
      kinds: opts.kinds?.trim() ? opts.kinds.trim().split(',') : undefined,
      limit: opts.limit,
    }),

  /** GET /correlations — arestas CORRELACIONADO_COM existentes do nó. */
  correlations: (nodeId: string) =>
    aegis.situational.correlations<CorrelationsResult>(nodeId),

  /**
   * POST /correlations — materializa as correlações do âncora (cria arestas
   * + lineage; idempotente). Devolve só as arestas (novas) com evidência.
   */
  correlate: (body: CorrelateBody) => {
    const { anchor_node_id, ...opts } = body;
    return aegis.situational.correlate<CorrelationsResult>(anchor_node_id, opts);
  },

  /**
   * DELETE /correlations/{edge_id} — corta a correlação (REVERSÍVEL: remove
   * só a aresta, nenhum nó é tocado) + lineage. Perm situational.correlate.manage.
   */
  cutCorrelation: (edgeId: string) =>
    aegis.situational.cut(encodeURIComponent(edgeId)),
};
