/**
 * Mosaicos nomeados — fonte única da verdade do tipo Mosaic e da resolução
 * de um mosaico para seus streams de câmera. Módulo PURO (sem I/O): a UI só
 * consome o resultado. Contrato coberto aqui; implementação em
 * lib/cameras/mosaic.ts.
 *
 * Ordem da tupla de geometria: [lon, lat] — CONFIRMADO em geo.ts/§B onda-4
 * (geo-zones.ts, cesium-globe.tsx fromDegrees(cx=p[0], cy=p[1]),
 * painel-camadas.tsx `for (const [lon, lat] of geometry)`).
 */
import type { CCTVStream } from '@/lib/api/cctv';
import {
  pointInPolygon,
  resolveMosaic,
  mosaicCount,
  newMosaicId,
  type Mosaic,
  type MosaicSelection,
  type ZonePolygon,
} from '@/lib/cameras/mosaic';

/** Fábrica de CCTVStream — preenche os campos obrigatórios não relevantes. */
function mk(p: Partial<CCTVStream> & { id: string }): CCTVStream {
  return {
    id: p.id,
    name: p.name ?? p.id,
    url: p.url ?? '',
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    country: p.country ?? null,
    city: p.city ?? null,
    status: p.status ?? 'offline',
    source_type: p.source_type ?? null,
    detection_enabled: p.detection_enabled ?? false,
    stream_metadata: p.stream_metadata ?? {},
    tags: p.tags ?? [],
    thumbnail_url: p.thumbnail_url ?? null,
  };
}

function mosaic(selection: MosaicSelection): Mosaic {
  return { id: 'm1', name: 'Teste', selection, layout: { cols: 'auto' } };
}

// Quadrado em [lon,lat]: lon ∈ [0,10], lat ∈ [0,10].
const square: number[][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const zones: ZonePolygon[] = [{ id: 'z1', geometry: square }];

describe('pointInPolygon — ray-casting robusto ([lon,lat])', () => {
  it('ponto claramente dentro → true', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });
  it('ponto claramente fora → false', () => {
    expect(pointInPolygon(20, 20, square)).toBe(false);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
    expect(pointInPolygon(5, 11, square)).toBe(false);
  });
  it('vértice é determinístico (booleano) — borda é definida pela implementação', () => {
    expect(typeof pointInPolygon(0, 0, square)).toBe('boolean');
    expect(typeof pointInPolygon(10, 10, square)).toBe('boolean');
  });
  it('menos de 3 pontos → false', () => {
    expect(pointInPolygon(5, 5, [])).toBe(false);
    expect(pointInPolygon(5, 5, [[0, 0]])).toBe(false);
    expect(pointInPolygon(5, 5, [[0, 0], [10, 10]])).toBe(false);
  });
  it('respeita a ordem lon/lat (não confunde eixos)', () => {
    // Polígono estreito em lon [0,2], alto em lat [0,20].
    const tall: number[][] = [
      [0, 0],
      [2, 0],
      [2, 20],
      [0, 20],
    ];
    expect(pointInPolygon(1, 15, tall)).toBe(true); // lon=1 dentro, lat=15 dentro
    expect(pointInPolygon(15, 1, tall)).toBe(false); // eixos trocados → fora
  });
});

describe('resolveMosaic — modo manual', () => {
  const a = mk({ id: 'a' });
  const b = mk({ id: 'b' });
  const c = mk({ id: 'c' });
  const streams = [a, b, c];

  it('ordena pela ordem de streamIds e ignora ids ausentes', () => {
    const m = mosaic({ mode: 'manual', streamIds: ['c', 'a', 'x'] });
    expect(resolveMosaic(m, streams, zones).map((s) => s.id)).toEqual(['c', 'a']);
  });
  it('streamIds vazio → nenhum', () => {
    const m = mosaic({ mode: 'manual', streamIds: [] });
    expect(resolveMosaic(m, streams, zones)).toEqual([]);
  });
});

describe('resolveMosaic — modo filter (AND entre dimensões)', () => {
  const sp1 = mk({ id: 'sp1', city: 'São Paulo', status: 'online', tags: ['lpr', 'centro'] });
  const sp2 = mk({ id: 'sp2', city: 'São Paulo', status: 'offline', tags: ['face'] });
  const cps = mk({ id: 'cps', city: 'Campinas', status: 'online', tags: ['lpr'] });
  const noCity = mk({ id: 'nc', city: null, status: 'online', tags: [] });
  const streams = [sp1, sp2, cps, noCity];

  it('city só (case-insensitive + trim)', () => {
    const m = mosaic({ mode: 'filter', filter: { city: '  são paulo ' } });
    expect(resolveMosaic(m, streams, zones).map((s) => s.id)).toEqual(['sp1', 'sp2']);
  });
  it("city vazia/'' = sem restrição", () => {
    const m = mosaic({ mode: 'filter', filter: { city: '' } });
    expect(resolveMosaic(m, streams, zones)).toHaveLength(4);
  });
  it('status só', () => {
    const m = mosaic({ mode: 'filter', filter: { status: 'online' } });
    expect(resolveMosaic(m, streams, zones).map((s) => s.id)).toEqual(['sp1', 'cps', 'nc']);
  });
  it('tags OR (case-insensitive)', () => {
    const m = mosaic({ mode: 'filter', filter: { tags: ['LPR', 'face'] } });
    expect(resolveMosaic(m, streams, zones).map((s) => s.id)).toEqual(['sp1', 'sp2', 'cps']);
  });
  it('tags vazio = sem restrição', () => {
    const m = mosaic({ mode: 'filter', filter: { tags: [] } });
    expect(resolveMosaic(m, streams, zones)).toHaveLength(4);
  });
  it('multi-dimensão AND (city + status + tags)', () => {
    const m = mosaic({
      mode: 'filter',
      filter: { city: 'São Paulo', status: 'online', tags: ['lpr'] },
    });
    expect(resolveMosaic(m, streams, zones).map((s) => s.id)).toEqual(['sp1']);
  });
  it('filtro vazio {} → todos, na ordem de entrada', () => {
    const m = mosaic({ mode: 'filter', filter: {} });
    expect(resolveMosaic(m, streams, zones).map((s) => s.id)).toEqual([
      'sp1',
      'sp2',
      'cps',
      'nc',
    ]);
  });
});

describe('resolveMosaic — dimensão zoneId (point-in-polygon)', () => {
  const inside = mk({ id: 'in', longitude: 5, latitude: 5 });
  const outside = mk({ id: 'out', longitude: 20, latitude: 20 });
  const noGeo = mk({ id: 'nogeo', longitude: null, latitude: null });
  const streams = [inside, outside, noGeo];

  it('mantém só streams dentro do polígono; sem coords → fora', () => {
    const m = mosaic({ mode: 'filter', filter: { zoneId: 'z1' } });
    expect(resolveMosaic(m, streams, zones).map((s) => s.id)).toEqual(['in']);
  });
  it('zoneId inexistente → nenhum (dimensão sem matches)', () => {
    const m = mosaic({ mode: 'filter', filter: { zoneId: 'nope' } });
    expect(resolveMosaic(m, streams, zones)).toEqual([]);
  });
  it('zoneId combina com outras dimensões (AND)', () => {
    const insideSp = mk({ id: 'insp', longitude: 3, latitude: 3, city: 'São Paulo' });
    const insideCps = mk({ id: 'incp', longitude: 7, latitude: 7, city: 'Campinas' });
    const m = mosaic({ mode: 'filter', filter: { zoneId: 'z1', city: 'São Paulo' } });
    expect(
      resolveMosaic(m, [insideSp, insideCps], zones).map((s) => s.id),
    ).toEqual(['insp']);
  });
});

describe('mosaicCount', () => {
  it('== resolveMosaic(...).length', () => {
    const streams = [mk({ id: 'a' }), mk({ id: 'b' }), mk({ id: 'c' })];
    const m = mosaic({ mode: 'manual', streamIds: ['a', 'b', 'zzz'] });
    expect(mosaicCount(m, streams, zones)).toBe(2);
    expect(mosaicCount(m, streams, zones)).toBe(resolveMosaic(m, streams, zones).length);
  });
});

describe('newMosaicId — único e determinístico (sem random/Date.now)', () => {
  it('lista vazia → m1', () => {
    expect(newMosaicId([])).toBe('m1');
  });
  it('deriva do maior sufixo numérico + 1', () => {
    const existing: Mosaic[] = [
      mosaic({ mode: 'manual', streamIds: [] }),
      { ...mosaic({ mode: 'manual', streamIds: [] }), id: 'm2' },
      { ...mosaic({ mode: 'manual', streamIds: [] }), id: 'm5' },
    ];
    // m1, m2, m5 → m6
    expect(newMosaicId(existing)).toBe('m6');
  });
  it('ignora ids fora do padrão m<n>', () => {
    const existing: Mosaic[] = [
      { ...mosaic({ mode: 'manual', streamIds: [] }), id: 'custom-abc' },
      { ...mosaic({ mode: 'manual', streamIds: [] }), id: 'm3' },
    ];
    expect(newMosaicId(existing)).toBe('m4');
  });
  it('é determinístico (mesma entrada → mesma saída) e não colide com existentes', () => {
    const existing: Mosaic[] = [
      { ...mosaic({ mode: 'manual', streamIds: [] }), id: 'm1' },
      { ...mosaic({ mode: 'manual', streamIds: [] }), id: 'm2' },
    ];
    const first = newMosaicId(existing);
    const second = newMosaicId(existing);
    expect(first).toBe(second);
    expect(existing.map((m) => m.id)).not.toContain(first);
  });
});
