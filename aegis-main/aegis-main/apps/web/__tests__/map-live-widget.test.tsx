/**
 * map_live widget — helpers genéricos (multi-domínio).
 *
 * O widget de Mapa (MapboxGL) lê um object set e plota QUALQUER objeto com
 * lat/lng. Estes testes cobrem a derivação pura de dados (sem WebGL): markers,
 * rota/cerca e centro. O render MapboxGL é certificado ao vivo no browser.
 */
import { readArray, toMarkers, toPairs, deriveCenter } from '@/components/workshop/widgets/map-live';

describe('map_live — derivação de dados (genérica)', () => {
  it('readArray tolera array e {rows}, e exige a key', () => {
    expect(readArray({ p: [1, 2] }, 'p')).toEqual([1, 2]);
    expect(readArray({ p: { rows: [1] } }, 'p')).toEqual([1]);
    expect(readArray({}, 'p')).toEqual([]);
    expect(readArray({ p: [1] })).toEqual([]); // sem key
  });

  it('toMarkers aceita {lat,lng} e {latitude,longitude}, ignora inválidos', () => {
    const vars = {
      pts: [
        { id: 'x', lat: -23.5, lng: -46.6, label: 'A', color: '#fff', pulse: true },
        { latitude: 1, longitude: 2 },
        { lat: 'nan', lng: 0 },
        'lixo',
      ],
    };
    const m = toMarkers(vars, { source: 'pts' });
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ id: 'x', lat: -23.5, lng: -46.6, color: '#fff', pulse: true });
    expect(m[0].popupHtml).toContain('A');
    expect(m[1]).toMatchObject({ lat: 1, lng: 2, pulse: false });
  });

  it('toMarkers escapa HTML do label (anti-XSS)', () => {
    const m = toMarkers({ pts: [{ lat: 0, lng: 0, label: '<img src=x onerror=1>' }] }, { source: 'pts' });
    expect(m[0].popupHtml).not.toContain('<img');
    expect(m[0].popupHtml).toContain('&lt;img');
  });

  it('toPairs aceita [lat,lng] e {lat,lng} (rota/cerca)', () => {
    expect(toPairs({ r: [[1, 2], [3, 4]] }, 'r')).toEqual([[1, 2], [3, 4]]);
    expect(toPairs({ r: [{ lat: 1, lng: 2 }] }, 'r')).toEqual([[1, 2]]);
    expect(toPairs({}, 'r')).toEqual([]);
  });

  it('deriveCenter usa média dos markers ou cai no fallback neutro (BR)', () => {
    expect(deriveCenter([])).toMatchObject({ lat: -15.78, lng: -47.93 });
    expect(deriveCenter([{ id: '1', lat: 0, lng: 0 }, { id: '2', lat: 2, lng: 4 }])).toEqual({ lat: 1, lng: 2 });
  });

  it('source ausente → zero markers (nada de domínio assumido)', () => {
    expect(toMarkers({}, {})).toEqual([]);
  });
});

// ── V2 visão§ — popup rico + seleção por pino (contrato da object-table) ────
import { richPopupHtml, rowsById } from '@/components/workshop/widgets/map-live';

describe('map_live V2 — popup rico e seleção', () => {
  const instancia = {
    id: 'n1',
    name: 'estrutura 3',
    properties: {
      localizacao: { lat: -23.5533, lng: -46.6374 },
      confianca: 0.92,
      observacao: 'telhado duplo',
      lista_ignorada: [1, 2],
      nulo: null,
    },
  };

  it('richPopupHtml monta rótulo + properties escalares (geopoint vira lat,lng)', () => {
    const html = richPopupHtml(instancia)!;
    expect(html).toContain('<b>estrutura 3</b>');
    expect(html).toContain('-23.55330, -46.63740');
    expect(html).toContain('0.92');
    expect(html).toContain('telhado duplo');
    expect(html).not.toContain('lista_ignorada');
  });

  it('richPopupHtml escapa HTML das properties (anti-XSS)', () => {
    const html = richPopupHtml({ name: 'x', properties: { nota: '<script>1</script>' } })!;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rowsById indexa as linhas pelo MESMO id do marcador', () => {
    const rows = rowsById({ pts: [instancia, { lat: 1, lng: 2 }] }, { source: 'pts' });
    expect(rows['n1']).toBe(instancia);
    expect(rows['1']).toMatchObject({ lat: 1, lng: 2 }); // fallback = índice
  });
});

// ── V3 (B4) — polígonos por instância (geoshape canônico em properties) ─────
import { instanceZones } from '@/components/workshop/widgets/map-live';

describe('map_live V3 — polígonos por instância', () => {
  it('instanceZones converte geoshape Polygon (GeoJSON [lng,lat]) em ring [lat,lng]', () => {
    const vars = {
      pts: [
        { id: 'lote-1', name: 'Lote 1', properties: {
          perimetro: { type: 'Polygon', coordinates: [[[-46.64, -23.55], [-46.63, -23.55], [-46.63, -23.56], [-46.64, -23.56]]] },
        } },
        { id: 'sem-shape', properties: { localizacao: { lat: 1, lng: 2 } } },
      ],
    };
    const zones = instanceZones(vars, { source: 'pts' });
    expect(zones).toHaveLength(1);
    expect(zones[0].id).toBe('lote-1');
    expect(zones[0].ring[0]).toEqual([-23.55, -46.64]); // [lat,lng]
    expect(zones[0].ring).toHaveLength(4);
  });

  it('nome do campo é DADO — qualquer property com Polygon vira zona', () => {
    const vars = { pts: [{ id: 'a', properties: {
      talhao: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
    } }] };
    expect(instanceZones(vars, { source: 'pts' })).toHaveLength(1);
  });

  it('polígono degenerado (<3 pontos válidos) é ignorado', () => {
    const vars = { pts: [{ id: 'a', properties: {
      perimetro: { type: 'Polygon', coordinates: [[[0, 0], ['x', 'y']]] },
    } }] };
    expect(instanceZones(vars, { source: 'pts' })).toHaveLength(0);
  });
});
