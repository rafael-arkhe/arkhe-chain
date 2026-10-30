/**
 * Import/export do Construtor de Camadas — funções PURAS.
 *
 * O operador desenhava no Google My Maps e importava o export; o round-trip
 * aqui é o que garante que trazer esse acervo pra dentro não perde nome,
 * categoria (a "camada" do My Maps), estilo nem identidade da feição.
 */
import {
  exportFileName,
  featureCollectionToRows,
  groupByCategoria,
  isUsableGeometry,
  newFeatureId,
  rowsToFeatureCollection,
  type FeatureRow,
} from '@/lib/geo/geojson-io';

const RING = [
  [-46.66, -23.56],
  [-46.65, -23.56],
  [-46.65, -23.55],
  [-46.66, -23.56],
];

describe('isUsableGeometry', () => {
  test('aceita os tipos que o pipeline sabe posicionar', () => {
    expect(isUsableGeometry({ type: 'Point', coordinates: [-46.6, -23.5] })).toBe(true);
    expect(isUsableGeometry({
      type: 'LineString', coordinates: [[-46.6, -23.5], [-46.5, -23.4]],
    })).toBe(true);
    expect(isUsableGeometry({ type: 'Polygon', coordinates: [RING] })).toBe(true);
    expect(isUsableGeometry({ type: 'MultiPolygon', coordinates: [[RING]] })).toBe(true);
  });

  test('recusa geometria degenerada, fora de faixa ou não suportada', () => {
    expect(isUsableGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBe(false);
    expect(isUsableGeometry({ type: 'LineString', coordinates: [[-46.6, -23.5]] })).toBe(false);
    expect(isUsableGeometry({ type: 'Point', coordinates: [999, -23.5] })).toBe(false);
    expect(isUsableGeometry({ type: 'GeometryCollection', geometries: [] })).toBe(false);
    expect(isUsableGeometry(null)).toBe(false);
  });
});

describe('featureCollectionToRows', () => {
  test('lê nome/categoria/descrição das convenções comuns de export', () => {
    const { rows, skipped } = featureCollectionToRows({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Name: 'Boca do Beco X', layer: 'Tráfico de Drogas',
                        Description: '<b>ponto</b> quente' },
          geometry: { type: 'Polygon', coordinates: [RING] },
        },
      ],
    });
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].nome).toBe('Boca do Beco X');
    expect(rows[0].categoria).toBe('Tráfico de Drogas');
    expect(rows[0].descricao).toBe('<b>ponto</b> quente');
    expect(rows[0].id).toMatch(/^f-[0-9a-f]{8}$/);
  });

  test('aplica a categoria padrão só quando a feição não traz a própria', () => {
    const { rows } = featureCollectionToRows(
      {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { categoria: 'Cruzamentos' },
            geometry: { type: 'Point', coordinates: [-46.6, -23.5] } },
          { type: 'Feature', properties: {},
            geometry: { type: 'Point', coordinates: [-46.5, -23.4] } },
        ],
      },
      { defaultCategoria: 'Zonas de Risco' },
    );
    expect(rows.map((r) => r.categoria)).toEqual(['Cruzamentos', 'Zonas de Risco']);
  });

  test('conta o que descartou em vez de sumir com o dado', () => {
    const { rows, skipped } = featureCollectionToRows({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-46.6, -23.5] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } },
        { type: 'Feature', properties: {}, geometry: null },
      ],
    } as unknown);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  test('preserva o id da feição — reimportar ATUALIZA, não duplica', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { id: 'f-1a2b3c4d', nome: 'Zona' },
          geometry: { type: 'Polygon', coordinates: [RING] } },
      ],
    };
    expect(featureCollectionToRows(fc).rows[0].id).toBe('f-1a2b3c4d');
  });

  test('id repetido no arquivo não colide (o upsert engoliria uma feição)', () => {
    const feat = {
      type: 'Feature', properties: { id: 'f-1a2b3c4d' },
      geometry: { type: 'Point', coordinates: [-46.6, -23.5] },
    };
    const { rows } = featureCollectionToRows({
      type: 'FeatureCollection', features: [feat, { ...feat }],
    });
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  test('FeatureCollection vazia/inválida não quebra', () => {
    expect(featureCollectionToRows(null).rows).toEqual([]);
    expect(featureCollectionToRows({ type: 'Feature' }).rows).toEqual([]);
  });
});

describe('round-trip export → import', () => {
  test('nome, categoria, estilo e id sobrevivem', () => {
    const rows: FeatureRow[] = [
      { id: 'f-aabbccdd', nome: 'Área 1', categoria: 'Risco',
        descricao: 'nota', geometry: { type: 'Polygon', coordinates: [RING] },
        geo_style: { color: '#E97D2A', alpha: 0.35, extruded_height: 120 } },
      { id: 'f-11223344', nome: 'Via', categoria: 'Cruzamentos',
        geometry: { type: 'LineString', coordinates: [[-46.6, -23.5], [-46.5, -23.4]] } },
    ];
    const back = featureCollectionToRows(rowsToFeatureCollection(rows)).rows;
    expect(back).toEqual(rows);
  });
});

describe('helpers', () => {
  test('newFeatureId gera ids únicos no formato do contrato', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newFeatureId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^f-[0-9a-f]{8}$/);
  });

  test('exportFileName vira slug ascii seguro', () => {
    expect(exportFileName('Tráfico de Drogas')).toBe('trafico-de-drogas.geojson');
    expect(exportFileName('  ')).toBe('camada.geojson');
  });

  test('groupByCategoria preserva a ordem de aparição', () => {
    const rows: FeatureRow[] = [
      { id: 'a', categoria: 'B', geometry: { type: 'Point', coordinates: [0, 0] } },
      { id: 'b', categoria: 'A', geometry: { type: 'Point', coordinates: [0, 0] } },
      { id: 'c', categoria: 'B', geometry: { type: 'Point', coordinates: [0, 0] } },
      { id: 'd', geometry: { type: 'Point', coordinates: [0, 0] } },
    ];
    const groups = groupByCategoria(rows);
    expect(groups.map((g) => g.categoria)).toEqual(['B', 'A', '']);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'c']);
  });
});
