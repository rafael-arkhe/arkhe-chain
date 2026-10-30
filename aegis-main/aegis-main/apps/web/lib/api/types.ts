/**
 * Tipos alinhados com schemas Pydantic do ontology-module.
 * Fonte de verdade: ontology-module/app/schemas/*
 */

export interface OntologyNode {
  id: string;
  name: string;
  node_type: string;
  // Valores das propriedades da instância (inclui séries `timeseries` [{t,v}]).
  properties: Record<string, unknown>;
  schema_definition: Record<string, unknown>;
  description: string;
  version: number;
  created_by: string;
  signed_hash: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface OntologyEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  // A API (OntologyEdgeResponse) serializa o nome da relação como `relation_type`.
  // `edge_type` permanece opcional p/ compat com consumidores antigos.
  relation_type?: string;
  edge_type?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OntologyGraph {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  /** Onda 2 — True quando o backend cortou o grafo em `limit` (há mais nós). */
  truncated?: boolean;
}

export interface Entity {
  id: string;
  name: string;
  entity_type: string;
  properties: Record<string, unknown>;
  classification: 'publico' | 'restrito' | 'confidencial' | 'sigiloso';
  signed_hash: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  /**
   * /rede unify (Onda 2) — quando o grafo unifica os stores Entity/EntityLink
   * e OntologyNode/OntologyEdge, o `id` vira namespaced (`e:<uuid>`/`n:<uuid>`)
   * pro force-graph não colidir. `_rawId` preserva o uuid cru (ficha/evidência)
   * e `_origin` diz de qual store o nó veio. Ausentes fora do /rede.
   */
  _rawId?: string;
  _origin?: 'entity' | 'node';
  /** /rede cluster (Onda 2) — super-nó agregado: `_cluster` marca, `_clusterKey`
   *  é o valor do agrupamento (ex.: node_type 'Event') p/ drill-down, `_count` é
   *  quantos nós o cluster representa (dimensiona o super-nó). */
  _cluster?: boolean;
  _clusterKey?: string;
  _count?: number;
}

/** Visão agregada (cluster) do grafo — escala a milhões via GROUP BY. */
export interface GraphOverview {
  by: string;
  clusters: { key: string; label: string; count: number }[];
  edges: { source: string; target: string; count: number }[];
  total_nodes: number;
}

/** Grafo do endpoint do vertical câmara (`/camara/{city}/correlation`). */
export interface CamaraCorrelationNode {
  id: string;
  label: string;
  kind: string;
  properties: Record<string, unknown>;
}

export interface CamaraCorrelationEdge {
  source: string;
  target: string;
  rel: string;
  weight: number;
  properties: Record<string, unknown>;
}

export interface CamaraCorrelationGraph {
  nodes: CamaraCorrelationNode[];
  edges: CamaraCorrelationEdge[];
  stats: Record<string, unknown>;
}

export interface EntityLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  properties: Record<string, unknown>;
}

export interface DataSource {
  id: string;
  name: string;
  connector_type: string;
  status: 'connected' | 'degraded' | 'offline';
  latency_ms: number | null;
  last_check: string;
}

export interface AlertFeed {
  id: string;
  name: string;
  /** Busca salva monitorada: {query, sources, advanced}. */
  filters: Record<string, unknown>;
  cadence_seconds: number;
  /** false = monitoramento pausado (o scheduler pula). */
  active: boolean;
}

export interface AlertWatch {
  id: string;
  object_id: string;
  created_at: string;
}

/**
 * Wire shape REAL do store de cercas (ontology-module
 * app/services/alerts/geofences.py::_to_geofence_dict). Geofence é
 * OntologyNode(node_type='Geofence'); a cerca criada no /geo é a MESMA
 * que o avaliador do Atlas usa pra disparar alertas de borda.
 *
 * coordinates por shape:
 *   polygon            → [[lon, lat], ...]
 *   circle             → { center: [lon, lat], radius_meters }
 *   corridor | route   → { waypoints: [[lon, lat], ...], width_meters }
 */
export interface AlertGeofence {
  id: string;
  name: string;
  shape: 'polygon' | 'circle' | 'corridor' | 'route' | string;
  coordinates: number[][] | Record<string, unknown> | null;
  active: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
}

export interface AlertItem {
  id: string;
  feed_kind: 'feed' | 'watch' | 'geofence' | 'share';
  title: string;
  snippet: string;
  priority: 'critica' | 'alta' | 'normal';
  channel: string;
  created_at: string;
  acknowledged_at: string | null;
  // Aditivos do store na ontologia (2026-06-12) — ver lib/api/alerts-map.ts.
  classification?: string;
  severity?: string;
  payload?: Record<string, unknown> | null;
  redacted?: boolean;
}

export interface VideoStream {
  id: string;
  name: string;
  endpoint: string;
  online: boolean;
  has_lpr: boolean;
  has_facematch: boolean;
  lat: number | null;
  lon: number | null;
}

export interface VideoTag {
  id: string;
  stream_id: string;
  label: string;
  observation: string;
  t_start_ms: number;
  t_end_ms: number;
  linked_entity_id: string | null;
  classification: 'publico' | 'restrito' | 'confidencial' | 'sigiloso';
  state: 'novo' | 'revisao' | 'confirmado' | 'rejeitado';
}

export interface Dossier {
  id: string;
  title: string;
  template: string;
  classification: 'publico' | 'restrito' | 'confidencial' | 'sigiloso';
  body_md: string;
  version: number;
  signed_hash: string | null;
  created_by: string;
  updated_at: string;
}

export interface Briefing {
  id: string;
  title: string;
  template: string;
  classification: 'publico' | 'restrito' | 'confidencial' | 'sigiloso';
  slides_count: number;
  updated_at: string;
}

export interface COV {
  id: string;
  entity_type: string;
  name: string;
  layout: Record<string, unknown>;
  team_default: boolean;
}

export interface IamUser {
  id: string;
  username: string;
  display_name: string;
  matricula: string | null;
  unidade: string;
  roles: string[];
  enabled: boolean;
}

export interface IamRole {
  id: string;
  name: string;
  description: string;
  perms: string[];
  user_count: number;
}

export interface IamPermission {
  key: string;
  description: string;
  category: string;
}

export interface IamAuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  ip: string | null;
  classification: 'publico' | 'restrito' | 'confidencial' | 'sigiloso';
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  perm_key: string | null;
  badge: string | null;
}

export interface NavSection {
  id: string;
  label: string;
  default_open: boolean;
  items: NavItem[];
}

export interface NavTree {
  sections: NavSection[];
}

/**
 * SHELL HONESTO (2026-06-12): KPI offline é `null` (UI renderiza '—'),
 * nunca número fabricado — por isso value/delta_pct admitem null.
 */
export interface MeHomeKpi {
  value: number | null;
  delta_pct: number | null;
}

export interface MeHome {
  kpis: {
    bos_24h: MeHomeKpi;
    mandados_abertos: MeHomeKpi;
    viaturas_ativas: MeHomeKpi;
    alertas_criticos: MeHomeKpi;
    operadores_online: MeHomeKpi;
  };
  timeline: { id: string; at: string; kind: string; text: string; classification: string }[];
}
