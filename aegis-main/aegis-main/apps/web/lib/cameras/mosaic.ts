/**
 * Mosaicos nomeados de câmeras — FONTE ÚNICA DA VERDADE do tipo `Mosaic` e da
 * resolução de um mosaico para seus streams. Módulo PURO (sem I/O): os
 * componentes de UI importam os tipos daqui e só renderizam o resultado das
 * funções. Contrato em __tests__/mosaic.test.ts.
 *
 * Ordem da tupla de geometria: [lon, lat] — CONFIRMADO na leitura do /geo
 * (lib/api/geo.ts `GeoZoneApi.geometry: number[][]`) e no seu uso da §B onda-4:
 *   - components/geo/geo-zones.ts:10  → `geometry:[[lon,lat],...]`
 *   - components/geo/cesium-globe.tsx → soma p[0]→cx, p[1]→cy e passa a
 *     `Cesium.Cartesian3.fromDegrees(cx, cy)` (fromDegrees = longitude, latitude)
 *   - components/geo/painel-camadas.tsx → `for (const [lon, lat] of geometry)`
 * Logo, em cada ponto do polígono: índice 0 = longitude, índice 1 = latitude.
 */
import type { CCTVStream } from '@/lib/api/cctv';

/** Colunas do grid do mosaico. 'auto' = a UI decide pela contagem. */
export type MosaicCols = 'auto' | 2 | 3 | 4;

/** Dimensões de filtro de um mosaico. Toda dimensão AUSENTE = sem restrição. */
export interface MosaicFilter {
  city?: string;
  status?: 'online' | 'offline';
  tags?: string[];
  zoneId?: string;
}

/**
 * Como o mosaico escolhe seus streams:
 *  - `manual`: lista explícita de ids, na ordem em que devem aparecer;
 *  - `filter`: predicado data-driven (AND entre dimensões definidas).
 */
export type MosaicSelection =
  | { mode: 'manual'; streamIds: string[] }
  | { mode: 'filter'; filter: MosaicFilter };

/** Um mosaico nomeado persistido pelo operador. */
export interface Mosaic {
  id: string;
  name: string;
  selection: MosaicSelection;
  layout: { cols: MosaicCols };
}

/**
 * Zona operacional como GEOMETRIA CRUA armazenada pelo /geo — `geometry` é um
 * anel de vértices `[lon, lat]` (mesma forma de `GeoZoneApi.geometry`).
 */
export interface ZonePolygon {
  id: string;
  geometry: number[][];
}

/**
 * Ray-casting robusto (PNPOLY, W. R. Franklin). `polygon` é um anel de vértices
 * `[lon, lat]` — logo `p[0]` é a longitude (eixo x) e `p[1]` a latitude (eixo y),
 * casando com os argumentos `(lng, lat)`. Polígono degenerado (< 3 vértices) →
 * `false`. O resultado para pontos exatamente sobre uma aresta/vértice é
 * determinístico porém definido pela implementação (borda ambígua por natureza).
 */
export function pointInPolygon(lng: number, lat: number, polygon: number[][]): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const x = lng;
  const y = lat;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Resolve um mosaico para a lista de streams que ele contém.
 *
 *  - `manual`: os streams cujo id está em `streamIds`, na ORDEM de `streamIds`;
 *    ids não presentes em `streams` são ignorados.
 *  - `filter`: percorre `streams` na ORDEM DE ENTRADA, mantendo o stream sse e
 *    somente se ele casa com TODAS as dimensões DEFINIDAS do filtro (AND):
 *      • city   — igualdade case-insensitive + trim vs `stream.city`
 *                 (undefined/'' = sem restrição);
 *      • status — `stream.status === filter.status` (undefined = sem restrição);
 *      • tags   — se `filter.tags` não-vazio, o stream precisa ter >= 1 delas
 *                 (OR interno, case-insensitive); vazio/undefined = sem restrição;
 *      • zoneId — se definido, acha a zona por id em `zones`; o stream precisa
 *                 ter lat & lng não-nulos E cair dentro de `zone.geometry`.
 *
 * DECISÃO documentada: se `filter.zoneId` está definido mas NÃO existe zona com
 * esse id em `zones`, a dimensão zona não casa com NINGUÉM (retorna nenhum para
 * essa dimensão) — preferimos "vazio honesto" a "silenciosamente sem filtro",
 * pois um id de zona órfão indica estado inconsistente e mostrar todas as
 * câmeras mascararia o problema.
 */
export function resolveMosaic(
  mosaic: Mosaic,
  streams: CCTVStream[],
  zones: ZonePolygon[],
): CCTVStream[] {
  const sel = mosaic.selection;

  if (sel.mode === 'manual') {
    const byId = new Map(streams.map((s) => [s.id, s]));
    const out: CCTVStream[] = [];
    for (const id of sel.streamIds) {
      const s = byId.get(id);
      if (s) out.push(s);
    }
    return out;
  }

  const f = sel.filter;
  const wantCity = (f.city ?? '').trim().toLowerCase();
  const wantTags = (Array.isArray(f.tags) ? f.tags : [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  const zoneRequested = f.zoneId != null && f.zoneId !== '';
  const zone = zoneRequested ? zones.find((z) => z.id === f.zoneId) ?? null : null;

  return streams.filter((s) => {
    // city — case-insensitive + trim
    if (wantCity) {
      if ((s.city ?? '').trim().toLowerCase() !== wantCity) return false;
    }
    // status
    if (f.status !== undefined && s.status !== f.status) return false;
    // tags — OR interno, case-insensitive
    if (wantTags.length > 0) {
      const streamTags = (s.tags ?? []).map((t) => t.trim().toLowerCase());
      if (!wantTags.some((t) => streamTags.includes(t))) return false;
    }
    // zoneId
    if (zoneRequested) {
      // id de zona órfão → nenhum stream casa (ver decisão documentada acima).
      if (!zone) return false;
      if (s.latitude == null || s.longitude == null) return false;
      if (!pointInPolygon(s.longitude, s.latitude, zone.geometry)) return false;
    }
    return true;
  });
}

/** Conveniência: quantos streams o mosaico contém. */
export function mosaicCount(
  mosaic: Mosaic,
  streams: CCTVStream[],
  zones: ZonePolygon[],
): number {
  return resolveMosaic(mosaic, streams, zones).length;
}

/**
 * Id único e ESTÁVEL para um novo mosaico, derivado deterministicamente dos ids
 * existentes — SEM `Math.random`/`Date.now` (banidos em alguns contextos). Toma
 * o maior sufixo numérico entre ids no padrão `m<n>` e devolve `m<max+1>` (lista
 * vazia → `m1`). Ids fora do padrão são ignorados na contagem. Dada a mesma
 * entrada, sempre produz a mesma saída, e nunca colide com um id `m<n>` existente.
 */
export function newMosaicId(existing: Mosaic[]): string {
  let max = 0;
  for (const m of existing) {
    const match = /^m(\d+)$/.exec(m.id);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `m${max + 1}`;
}
