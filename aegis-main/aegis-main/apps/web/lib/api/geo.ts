/**
 * Cliente da leitura geoespacial da ontologia (ontology-module
 * app/routers/geo.py, montado em /api/v1/geo).
 *
 * É a fonte de dados das "Camadas da ontologia" do /geo: os node_types
 * vêm do DADO do tenant (GET /node-types) — zero hardcode de domínio —
 * e cada camada ligada busca GET /nodes?node_type=...&since_minutes=...
 *
 * Perm: security.geo.view (a mesma da tela Mapa — verificada no backend).
 */
import { aegis } from './sdk';

/**
 * Fonte crua do registro unificado do mapa (GET /api/v1/geo/sources),
 * em snake_case. A UI normaliza via `normalizeGeoSource`
 * (components/geo/geo-sources.ts).
 */
export interface GeoSourceApi {
  id: string;
  category: 'ontology' | 'reference' | 'cctv' | 'geofence' | 'correlation';
  name: string;
  description: string;
  tags: string[];
  count: number | null;
  state: 'active' | 'idle' | 'offline' | 'empty' | 'available';
  last_activity: string | null;
  producer: string | null;
  board_id: string | null;
  board_name: string | null;
}

export interface GeoNode {
  id: string;
  node_type: string;
  name: string;
  lat: number;
  lng: number;
  detected_at: string | null;
  properties_resumo: Record<string, unknown>;
  /** OP1/OP4 — estilo definido no PIPELINE (ontology_output.geo_style): a camada
   *  de pipeline renderiza com cor própria no Cesium. É um dict ARBITRÁRIO (passa
   *  verbatim do nó do DAG) — inclui as personalizações 3D do polígono. */
  geo_style?: {
    color?: string;
    /** extrusão em metros → polígono vira volume 3D (0/ausente = chapado). */
    extruded_height?: number;
    /** base do volume (m acima do solo); default 0. */
    base_height?: number;
    /** opacidade do preenchimento (0..1). */
    alpha?: number;
    outline_color?: string;
    outline_width?: number;
    close_top?: boolean;
    close_bottom?: boolean;
  } | null;
  /** Fase 1 — anel [[lon,lat],…] materializado pelo pipeline (transform geopoint);
   *  presente → o Cesium DESENHA o polígono (extrudado se geo_style pedir). */
  zone_geometry?: number[][] | null;
}

export interface GeoNodesOut {
  nodes: GeoNode[];
  /** true = resposta cortada por limit/teto de varredura — refine filtros. */
  truncated: boolean;
}

export interface GeoNodeType {
  node_type: string;
  count: number;
  /** True = camada materializada por uma pipeline do DAG (nós com geo_style). A UI
   *  liga por padrão — o output do fluxo aparece sozinho no /geo. */
  styled?: boolean;
  /** Nome humano da camada quando ela nasceu no Construtor de Camadas ("Tráfico
   *  de Drogas", com acento). Ausente nas demais → a UI humaniza o node_type. */
  label?: string | null;
}

export interface GeoNodeTypesOut {
  node_types: GeoNodeType[];
}

/** Aresta entre nós da ontologia — shape do GET /api/v1/geo/edges. */
export interface GeoEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
}

/** Camada de REFERÊNCIA (externa à ontologia): IBGE limites, CNES saúde. */
export interface GeoReferenceLayer {
  id: string;
  label: string;
  geom: 'polygon' | 'point';
  params: string[];
  source: string;
  hint?: string;
}
export interface GeoReferenceGeoJSON {
  layer: string;
  geojson: { type: 'FeatureCollection'; features: unknown[] };
  feature_count: number;
  error?: string | null;
}

/**
 * Zona operacional persistida (GET /api/v1/geo/zones), em snake_case.
 * A UI normaliza a paleta/estilo via `zoneStyle` (components/geo/geo-zones.ts).
 */
export interface GeoZoneApi {
  id: string;
  name: string;
  zone_type: string;
  geometry: number[][];
  extruded_height: number;
  source: string | null;
}

export const Geo = {
  nodeTypes: () => aegis.geo.nodeTypes<GeoNodeTypesOut>(),
  /**
   * Registro unificado de FONTES do mapa (ontologia + referência, com
   * proveniência/estado). Câmeras/cercas/correlações são compostas no
   * cliente via `buildGeoSources`. Mesma perm da tela Mapa.
   */
  sources: () => aegis.geo.sources<{ sources: GeoSourceApi[] }>(),
  /** Catálogo de camadas de referência (geobr/PySUS-equivalente, keyless). */
  referenceLayers: () => aegis.geo.referenceLayers<{ layers: GeoReferenceLayer[] }>(),
  /** GeoJSON de uma camada de referência (proxy keyless resiliente). */
  referenceLayer: (id: string, params?: { uf?: string; municipio?: string }) =>
    aegis.geo.referenceLayer<GeoReferenceGeoJSON>(id, params),
  /**
   * Arestas ENTRE os nós pedidos, em UMA chamada batched — fonte das
   * RELAÇÕES dos widgets map_live/globe_live (config `show_relations`).
   * Mesma OntologyEdge que o grafo/ficha leem; mesma perm do `nodes`.
   * Tokens não-UUID são ignorados pelo servidor (ids mock da paleta);
   * teto do servidor: 2000 ids por chamada.
   */
  edgesBetween: (nodeIds: string[], relationTypes?: string) => {
    const relations = relationTypes?.trim()
      ? relationTypes.trim().split(',')
      : undefined;
    return aegis.geo.edges<{ edges: GeoEdge[] }>(nodeIds, relations);
  },
  nodes: (opts?: {
    node_type?: string;
    since_minutes?: number;
    limit?: number;
    /** min_lon,min_lat,max_lon,max_lat */
    bbox?: string;
  }) => aegis.geo.nodes<GeoNodesOut>(opts),
  /** Zonas operacionais (exclusão/engajamento/observação/seguras) do tenant. */
  zones: () => aegis.geo.zones<{ zones: GeoZoneApi[] }>(),
  /**
   * Importa zonas normalizadas (saída de `geojsonToZoneFeatures`) para o
   * registro do tenant. Governado pela mesma perm da tela Mapa.
   */
  importZones: (body: {
    features: { name: string; geometry: number[][]; zone_type?: string }[];
    default_zone_type?: string;
    extruded_height?: number;
    source_name?: string;
  }) => {
    const { features, ...opts } = body;
    return aegis.geo.importZones<{ created: number; zones: GeoZoneApi[] }>(
      features as unknown as Record<string, unknown>[],
      opts,
    );
  },
  /** Remove uma zona pelo id (204). */
  deleteZone: (id: string) => aegis.geo.deleteZone(id),
};
