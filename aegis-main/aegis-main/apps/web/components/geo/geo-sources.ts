/**
 * B3 (MAPA /geo) — registro data-driven de FONTES do mapa (helpers puros).
 *
 * A aba "Fontes" deixa de ser 5 SourceCard hardcoded e passa a compor um
 * registro unificado: fontes do backend (ontologia + referência, com
 * proveniência/estado) + câmeras + cercas + correlações (do contexto do
 * /geo), com categoria, TAG, busca e deep-link "abrir fluxo/origem".
 *
 * Estes helpers são PUROS (sem I/O) — a UI só renderiza o resultado.
 */

/** Categoria de uma fonte do mapa. */
export type GeoSourceCategory =
  | 'ontology'
  | 'reference'
  | 'cctv'
  | 'geofence'
  | 'correlation';

/** Estado honesto de uma fonte (produção/atividade). */
export type GeoSourceState =
  | 'active'
  | 'idle'
  | 'offline'
  | 'empty'
  | 'available';

/** Fonte do mapa já normalizada para a UI (camelCase). */
export interface GeoSource {
  id: string;
  category: GeoSourceCategory;
  name: string;
  description: string;
  tags: string[];
  count: number | null;
  state: GeoSourceState;
  lastActivity: string | null;
  producer: string | null;
  boardId: string | null;
  boardName: string | null;
}

/**
 * Shape cru vindo do backend (snake_case). A UI nunca consome isto direto —
 * passa por `normalizeGeoSource`.
 */
export interface GeoSourceApi {
  id: string;
  category: GeoSourceCategory;
  name: string;
  description: string;
  tags: string[];
  count: number | null;
  state: GeoSourceState;
  last_activity: string | null;
  producer: string | null;
  board_id: string | null;
  board_name: string | null;
}

/** Mapeia a fonte crua do backend (snake_case) para a `GeoSource` (camelCase). */
export function normalizeGeoSource(raw: GeoSourceApi): GeoSource {
  return {
    id: raw.id,
    category: raw.category,
    name: raw.name,
    description: raw.description,
    tags: raw.tags,
    count: raw.count,
    state: raw.state,
    lastActivity: raw.last_activity,
    producer: raw.producer,
    boardId: raw.board_id,
    boardName: raw.board_name,
  };
}

/** Entradas para compor o registro unificado de fontes do /geo. */
export interface BuildGeoSourcesInput {
  backend: GeoSource[];
  cctvTotal: number;
  cctvOnline: number;
  geofenceTotal: number;
  geofenceActive: number;
  correlations: number;
}

/**
 * Compõe o registro unificado: fontes do backend (ontologia + referência)
 * seguidas das entradas sintéticas de câmeras, cercas e correlações — todas
 * já no shape `GeoSource` com estado honesto derivado dos contadores.
 */
export function buildGeoSources({
  backend,
  cctvTotal,
  cctvOnline,
  geofenceTotal,
  geofenceActive,
  correlations,
}: BuildGeoSourcesInput): GeoSource[] {
  const cctv: GeoSource = {
    id: 'cctv',
    category: 'cctv',
    name: 'Câmeras CCTV',
    description: `${cctvOnline}/${cctvTotal} online`,
    tags: ['sensores', 'cctv'],
    count: cctvTotal,
    state: cctvOnline > 0 ? 'active' : cctvTotal > 0 ? 'idle' : 'empty',
    lastActivity: null,
    producer: null,
    boardId: null,
    boardName: null,
  };

  const geofence: GeoSource = {
    id: 'geofence',
    category: 'geofence',
    name: 'Cercas virtuais',
    description: `${geofenceActive}/${geofenceTotal} ativas`,
    tags: ['cercas'],
    count: geofenceTotal,
    state:
      geofenceActive > 0 ? 'active' : geofenceTotal > 0 ? 'idle' : 'empty',
    lastActivity: null,
    producer: null,
    boardId: null,
    boardName: null,
  };

  const correlation: GeoSource = {
    id: 'correlation',
    category: 'correlation',
    name: 'Correlações',
    description: `${correlations} correlações`,
    tags: ['correlações'],
    count: correlations,
    state: correlations > 0 ? 'active' : 'empty',
    lastActivity: null,
    producer: null,
    boardId: null,
    boardName: null,
  };

  return [...backend, cctv, geofence, correlation];
}

/** União ordenada (sem duplicatas) de todas as tags das fontes. */
export function allSourceTags(sources: GeoSource[]): string[] {
  const set = new Set<string>();
  for (const s of sources) {
    for (const t of s.tags) set.add(t);
  }
  return Array.from(set).sort();
}

/** Filtro de fontes: busca livre + facetas de categoria/tag. */
export interface GeoSourceFilter {
  query?: string;
  category?: GeoSourceCategory;
  tag?: string;
}

/**
 * Filtra fontes por busca (nome | descrição | producer | tags,
 * case-insensitive), categoria (exata) e tag (contida). Filtro vazio → tudo.
 */
export function filterGeoSources(
  sources: GeoSource[],
  { query, category, tag }: GeoSourceFilter,
): GeoSource[] {
  const q = query?.trim().toLowerCase();
  return sources.filter((s) => {
    if (category && s.category !== category) return false;
    if (tag && !s.tags.includes(tag)) return false;
    if (q) {
      const haystack = [
        s.name,
        s.description,
        s.producer ?? '',
        ...s.tags,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Deep-link "abrir fluxo/origem" de uma fonte:
 * - ontologia COM boardId → o board do DAG que a produz;
 * - cctv → /cameras · geofence → /alertas;
 * - correlação / referência / ontologia sem board → sem destino (null).
 */
export function sourceDeepLink(s: GeoSource): string | null {
  switch (s.category) {
    case 'ontology':
      return s.boardId
        ? `/painel-de-controle/dados?aba=pipelines&board=${s.boardId}`
        : null;
    case 'cctv':
      return '/cameras';
    case 'geofence':
      return '/alertas';
    case 'correlation':
    case 'reference':
    default:
      return null;
  }
}
