/**
 * Helpers puros do /geo — sem I/O, testáveis sem provider.
 *
 *  - pointInPolygon: ESPELHA o ray-casting do backend
 *    (ontology-module app/services/atlas/geofence_eval.py::point_in_polygon)
 *    com o MESMO contrato de anel `[[lon, lat], ...]` — a contagem que a UI
 *    mostra dentro do polígono usa a mesma matemática que dispara alertas.
 *  - colorForNodeType: cor ESTÁVEL por node_type (hash determinístico →
 *    paleta fixa) — camadas data-driven, zero cor hardcoded por domínio.
 *  - humanizeNodeType: label humano no display layer (node_type cru nunca
 *    aparece na UI).
 */
import type { GeoNode } from '@/lib/api/geo';
import type { AlertGeofence } from '@/lib/api/types';

export type LngLat = [number, number];

/** Ray-casting — `ring` é `[[lon, lat], ...]` (mesmo contrato do backend). */
export function pointInPolygon(lon: number, lat: number, ring: LngLat[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

/** Paleta fixa (tokens do design — sem cor de domínio). */
const LAYER_PALETTE = [
  '#2D77BE', // azul-aço (primária)
  '#3D9F58', // verde
  '#E97D2A', // laranja
  '#8A5CC8', // roxo
  '#C8341F', // vermelho
  '#1F9E9E', // teal
  '#E8B33B', // âmbar
  '#B0568C', // magenta
];

/** Cor estável por node_type — hash determinístico → índice da paleta. */
export function colorForNodeType(nodeType: string): string {
  let h = 0;
  for (let i = 0; i < nodeType.length; i++) {
    h = (h * 31 + nodeType.charCodeAt(i)) >>> 0;
  }
  return LAYER_PALETTE[h % LAYER_PALETTE.length];
}

/** Label humano: snake/kebab/camel → Title Case (display layer). */
export function humanizeNodeType(nodeType: string): string {
  if (!nodeType) return '';
  return nodeType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Detector de rótulo de máquina (espelho de defesa-em-profundidade do backend
 * geo.py::_is_technical_label). UUID nu, hex longo, slug com hex embutido ou
 * slug lowercase com ≥3 segmentos separados por ':' → técnico (nunca no pin).
 */
export function isTechnicalLabel(s: string): boolean {
  if (!s || !s.trim()) return true;
  const t = s.trim();
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(t)) return true;
  if (/^[0-9a-f]{16,}$/i.test(t)) return true;
  for (const seg of t.split(/[:/_.\-]/)) if (seg.length >= 8 && /^[0-9a-f]+$/i.test(seg)) return true;
  if (t.includes(':') && !/\s/.test(t) && t === t.toLowerCase() && t.split(':').length >= 3) return true;
  return false;
}

/**
 * Rótulo de pin humano: nome humano intocado; senão "<Tipo> · <id curto>"
 * (espelho de geo.py::_humanize_label). Garante que o pin NUNCA renderiza um
 * UUID/slug técnico mesmo que o backend falhe.
 */
export function humanizePinLabel(name: string, nodeType: string, id: string): string {
  if (name && !isTechnicalLabel(name)) return name.trim();
  const typ = humanizeNodeType(nodeType);
  const sid = (id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 8);
  if (typ && sid) return typ + ' · ' + sid;
  return typ || sid || (name || '');
}

/** Janelas temporais REAIS — refazem o fetch com since_minutes; null = tudo. */
export const TIME_WINDOWS: { minutes: number | null; labelKey: string }[] = [
  { minutes: null, labelKey: 'geo.window.all' },
  { minutes: 15, labelKey: 'geo.window.15m' },
  { minutes: 60, labelKey: 'geo.window.1h' },
  { minutes: 360, labelKey: 'geo.window.6h' },
  { minutes: 1440, labelKey: 'geo.window.24h' },
];

export interface PolygonCount {
  total: number;
  /** node_type → contagem dos nós CARREGADOS dentro do anel. */
  byType: Record<string, number>;
}

/** Contagem REAL: nós carregados das camadas visíveis dentro do anel. */
export function countNodesInPolygon(
  nodesByType: Record<string, GeoNode[]>,
  ring: LngLat[],
): PolygonCount {
  const byType: Record<string, number> = {};
  let total = 0;
  for (const [nodeType, nodes] of Object.entries(nodesByType)) {
    for (const node of nodes) {
      if (pointInPolygon(node.lng, node.lat, ring)) {
        byType[nodeType] = (byType[nodeType] ?? 0) + 1;
        total += 1;
      }
    }
  }
  return { total, byType };
}

/** Centroide aproximado da cerca (flyTo). null = sem coordenadas usáveis. */
export function geofenceCenter(g: AlertGeofence): { lat: number; lng: number } | null {
  const coords = g.coordinates as unknown;
  if (g.shape === 'circle' && coords && typeof coords === 'object' && !Array.isArray(coords)) {
    const center = (coords as { center?: unknown }).center;
    if (Array.isArray(center) && center.length >= 2) {
      return { lng: Number(center[0]), lat: Number(center[1]) };
    }
    return null;
  }
  const ring: unknown =
    Array.isArray(coords)
      ? coords
      : coords && typeof coords === 'object'
        ? (coords as { waypoints?: unknown }).waypoints
        : null;
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  let n = 0;
  for (const p of ring) {
    if (Array.isArray(p) && p.length >= 2) {
      sumLng += Number(p[0]);
      sumLat += Number(p[1]);
      n += 1;
    }
  }
  if (n === 0) return null;
  return { lng: sumLng / n, lat: sumLat / n };
}

/**
 * Geometria desenhada no mapa, normalizada por shape. É a ponte entre o
 * desenho (polígono no overlay SVG, raio/rota no globo Cesium) e o body que
 * `Alerts.geofences.create` envia — mesmo contrato do avaliador de borda
 * (geofence_eval.py): coordinates por shape em ordem [lon, lat].
 */
export type FenceGeometry =
  | { shape: 'polygon'; ring: LngLat[] }
  | { shape: 'circle'; center: LngLat; radiusMeters: number }
  | { shape: 'route'; waypoints: LngLat[]; widthMeters: number };

/** Monta `coordinates` no shape EXATO que o backend espera (polygon → anel;
 *  circle → {center, radius_meters}; route → {waypoints, width_meters}). */
export function fenceBodyCoordinates(
  g: FenceGeometry,
): number[][] | Record<string, unknown> {
  if (g.shape === 'polygon') return g.ring;
  if (g.shape === 'circle') {
    return { center: g.center, radius_meters: g.radiusMeters };
  }
  return { waypoints: g.waypoints, width_meters: g.widthMeters };
}

/** Geometria suficiente pra criar uma cerca útil (espelha o que o avaliador
 *  consegue avaliar): polígono ≥3 vértices, círculo com raio>0, rota com ≥2
 *  pontos e largura>0. Sem isso o create vira cerca que nunca acende. */
export function fenceGeometryValid(g: FenceGeometry): boolean {
  if (g.shape === 'polygon') return g.ring.length >= 3;
  if (g.shape === 'circle') return g.center.length >= 2 && g.radiusMeters > 0;
  return g.waypoints.length >= 2 && g.widthMeters > 0;
}

/** Ferramentas de desenho que PRODUZEM geometria de cerca (não pin/medir). */
export type DrawTool = 'poligono' | 'raio' | 'rota';

/** Shape da cerca → ferramenta de desenho correspondente. Usado no redesenho
 *  pra armar (e travar) a ferramenta certa. corridor e route → Rota. */
export function toolForShape(shape: string): DrawTool {
  if (shape === 'circle') return 'raio';
  if (shape === 'route' || shape === 'corridor') return 'rota';
  return 'poligono';
}

/** A geometria desenhada casa com o shape da cerca em redesenho? O redesenho
 *  muda só as coordenadas — NUNCA o tipo. corridor e route são equivalentes
 *  (ambos vêm da ferramenta Rota). */
export function geometryMatchesFenceShape(geomShape: string, fenceShape: string): boolean {
  const norm = (s: string) => (s === 'corridor' ? 'route' : s);
  return norm(geomShape) === norm(fenceShape);
}

/** Severidades aceitas pelo backend (store.SEVERITIES) + cor visual. */
export const GEOFENCE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type GeofenceSeverity = (typeof GEOFENCE_SEVERITIES)[number];

export const SEVERITY_COLOR: Record<string, string> = {
  low: '#3D9F58',
  medium: '#E8B33B',
  high: '#E97D2A',
  critical: '#C8341F',
};

/**
 * Categoria da moldura do marcador — o PAPEL genérico do node_type decide a
 * FORMA (◇ evento · □ ativo · ○ sensor), nunca um vertical de domínio
 * hardcoded (mesma filosofia data-driven de humanizeNodeType/colorForNodeType).
 * Também re-exportada de geo-markers.
 */
export type MarkerCategory = 'event' | 'asset' | 'sensor';

/** Papel-EVENTO: detecção/alerta/ocorrência/foco/sinistro (◇ losango). */
const EVENT_ROLE = /event|detect|alert|hotspot|foco|incident|occurr|ocorr|sinistr|fire|fogo/;
/** Papel-SENSOR: observação/câmera/estação/monitor/medidor (○ círculo). */
const SENSOR_ROLE = /observ|sensor|camera|cam|station|estac|antenn|monitor|gauge|meter/;

/**
 * node_type → categoria da moldura por heurística de PAPEL (sem hardcode de
 * domínio): casa EVENTO primeiro, senão SENSOR, senão ATIVO (□) por padrão.
 */
export function categoryForNodeType(nodeType: string): MarkerCategory {
  const t = (nodeType || '').toLowerCase();
  if (EVENT_ROLE.test(t)) return 'event';
  if (SENSOR_ROLE.test(t)) return 'sensor';
  return 'asset';
}

/**
 * Retângulo da câmera Cesium (RADIANOS: west, south, east, north) → bbox em
 * graus "min_lon,min_lat,max_lon,max_lat" (5 casas) p/ carregamento por
 * viewport. Devolve null quando não dá pra recortar de forma útil:
 *   - algum valor não-finito;
 *   - degenerado (west>=east ou south>=north após conversão);
 *   - span grande demais (largura ou altura > 170° = praticamente o globo →
 *     carrega SEM bbox, evitando recorte inútil).
 * min = west/south, max = east/north; lon fixado em [-180,180], lat [-90,90].
 */
/**
 * Expande um bbox `min_lon,min_lat,max_lon,max_lat` por um FATOR de folga.
 *
 * O /geo recarrega os nós filtrando pelo retângulo da tela. Sem folga, o pin
 * que encosta na borda é DESCARTADO assim que sai da vista — e só volta depois
 * de uma ida ao servidor. Para o operador isso é exatamente "os marcadores
 * somem quando movo o mapa". Com folga, o que está logo fora já veio junto e o
 * arrasto não abre buraco.
 */
export function expandirBbox(bbox: string, fator = 0.6): string {
  const partes = bbox.split(',').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) return bbox;
  const [minLon, minLat, maxLon, maxLat] = partes;
  const folgaLon = (maxLon - minLon) * fator;
  const folgaLat = (maxLat - minLat) * fator;
  const f = (v: number) => v.toFixed(3);
  return [
    f(Math.max(-180, minLon - folgaLon)),
    f(Math.max(-90, minLat - folgaLat)),
    f(Math.min(180, maxLon + folgaLon)),
    f(Math.min(90, maxLat + folgaLat)),
  ].join(',');
}

export function rectangleToBbox(
  west: number,
  south: number,
  east: number,
  north: number,
): string | null {
  if (![west, south, east, north].every((v) => Number.isFinite(v))) return null;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  let minLon = toDeg(west);
  let minLat = toDeg(south);
  let maxLon = toDeg(east);
  let maxLat = toDeg(north);
  if (minLon >= maxLon || minLat >= maxLat) return null; // degenerado
  if (maxLon - minLon > 170 || maxLat - minLat > 170) return null; // ~globo inteiro
  const clampLon = (v: number) => Math.max(-180, Math.min(180, v));
  const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
  minLon = clampLon(minLon);
  maxLon = clampLon(maxLon);
  minLat = clampLat(minLat);
  maxLat = clampLat(maxLat);
  // 5 casas = ~1 METRO. Qualquer micro-pan gerava uma string nova → recarga
  // das camadas → o globo apagava e recriava TODAS as entidades (é a piscada
  // das camadas 3D e boa parte do lag). 3 casas = ~110 m: o mesmo enquadramento
  // continua sendo o mesmo bbox, e a recarga só acontece quando a vista
  // realmente mudou.
  const f = (v: number) => v.toFixed(3);
  return `${f(minLon)},${f(minLat)},${f(maxLon)},${f(maxLat)}`;
}
