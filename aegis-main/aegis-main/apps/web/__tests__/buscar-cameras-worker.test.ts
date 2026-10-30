/**
 * Tarefa H — fonte dedicada de CÂMERAS/DETECÇÕES no /buscar.
 *
 * Worker built-in `cameras`:
 *   - busca em Cctv.streams.list() filtrando client-side por
 *     nome/cidade/url/tags (mesmo padrão do /cameras)
 *   - busca em detecções recentes (Cctv.streams.detections) filtrando
 *     por label quando a query casa (ex.: placa)
 *   - backend fora → fonte retorna vazio SEM lançar e SEM dado fake
 *     (o fallback fabricado foi removido do client)
 */
import { runWorker } from '@/lib/buscar/workers';
import { SOURCE_CATALOG } from '@/lib/buscar/types';
import {
  Cctv,
  findStreamByFocusParam,
  type CCTVDetection,
  type CCTVStream,
} from '@/lib/api/cctv';
import { DEFAULT_LOCALE, DICT } from '@/lib/i18n/dict';

jest.mock('@/lib/api/cctv', () => {
  const actual = jest.requireActual('@/lib/api/cctv');
  return {
    ...actual,
    Cctv: {
      ...actual.Cctv,
      streams: {
        ...actual.Cctv.streams,
        list: jest.fn(),
        detections: jest.fn(),
      },
    },
  };
});

const listMock = Cctv.streams.list as jest.Mock;
const detectionsMock = Cctv.streams.detections as jest.Mock;

const STREAMS: CCTVStream[] = [
  {
    id: 'cam-1',
    name: 'SP-055 · Rio-Santos · KM 110',
    url: 'https://example.test/sp055.m3u8',
    latitude: null,
    longitude: null,
    country: 'BR',
    city: 'Bertioga/SP',
    status: 'online',
    source_type: 'rodovia-sp',
    detection_enabled: true,
    stream_metadata: {},
    tags: ['rodovia', 'litoral'],
    thumbnail_url: null,
  },
  {
    id: 'cam-2',
    name: 'SP-123 · Tamoios · KM 26',
    url: 'https://example.test/sp123.m3u8',
    latitude: null,
    longitude: null,
    country: 'BR',
    city: 'Caraguatatuba/SP',
    status: 'online',
    source_type: 'concessionaria',
    detection_enabled: true,
    stream_metadata: {},
    tags: ['rodovia', 'tamoios'],
    thumbnail_url: 'https://example.test/thumb.jpg',
  },
];

const DETECTIONS_CAM2: CCTVDetection[] = [
  {
    id: 'det-1',
    stream_id: 'cam-2',
    kind: 'lpr',
    label: 'ABC1D23',
    confidence: 0.96,
    t_start_ms: 0,
    t_end_ms: 1500,
    bbox: [620, 380, 740, 430],
    metadata: {},
    detected_at: '2026-06-10T14:42:01-03:00',
    linked_entity_id: null,
  },
  {
    // agregada de flood-control — NUNCA pode virar resultado
    id: 'det-agg',
    stream_id: 'cam-2',
    kind: 'object',
    label: '__flow__',
    confidence: 1,
    t_start_ms: 0,
    t_end_ms: 60000,
    bbox: null,
    metadata: { aggregate: true, class_counts: { car: 12 } },
    detected_at: '2026-06-10T14:43:00-03:00',
    linked_entity_id: null,
  },
  {
    id: 'det-2',
    stream_id: 'cam-2',
    kind: 'face',
    label: 'match · pes-001 (0.91)',
    confidence: 0.91,
    t_start_ms: 0,
    t_end_ms: 2000,
    bbox: [580, 220, 700, 360],
    metadata: {},
    detected_at: '2026-06-10T14:42:28-03:00',
    linked_entity_id: 'pes-001',
  },
];

const camerasSource = SOURCE_CATALOG.find((s) => s.key === 'cameras')!;

const BADGE_CAMERA = DICT['buscar.cameras.badge.camera'][DEFAULT_LOCALE];
const BADGE_DETECCAO = DICT['buscar.cameras.badge.deteccao'][DEFAULT_LOCALE];

beforeEach(() => {
  listMock.mockReset();
  detectionsMock.mockReset();
});

describe('catálogo — fonte cameras', () => {
  it('expõe a fonte cameras como built-in local (sem MCP)', () => {
    expect(camerasSource).toBeTruthy();
    expect(camerasSource.builtin).toBe('cameras');
    expect(camerasSource.mcpTool).toBeNull();
    expect(camerasSource.category).toBe('local');
    expect(camerasSource.label.length).toBeGreaterThan(0);
    // ícone lucide técnico, neutro
    expect(camerasSource.icon).toBeTruthy();
  });
});

describe('worker cameras — busca por câmera', () => {
  it('query por nome acha a câmera com badge/href corretos', async () => {
    listMock.mockResolvedValue(STREAMS);
    detectionsMock.mockResolvedValue([]);

    const results = await runWorker(camerasSource, 'tamoios');

    const cams = results.filter((r) => r.kind === BADGE_CAMERA);
    expect(cams).toHaveLength(1);
    expect(cams[0].externalId).toBe('cam-2');
    expect(cams[0].name).toBe('SP-123 · Tamoios · KM 26');
    expect(cams[0].url).toBe('/cameras?focus=cam-2');
    expect(cams[0].thumbnail).toBe('https://example.test/thumb.jpg');
    // nada de detecção casa "tamoios"
    expect(results.filter((r) => r.kind === BADGE_DETECCAO)).toHaveLength(0);
  });

  it('query por cidade ou tag também casa (padrão do filtro de /cameras)', async () => {
    listMock.mockResolvedValue(STREAMS);
    detectionsMock.mockResolvedValue([]);

    const porCidade = await runWorker(camerasSource, 'bertioga');
    expect(porCidade.map((r) => r.externalId)).toContain('cam-1');

    const porTag = await runWorker(camerasSource, 'litoral');
    expect(porTag.map((r) => r.externalId)).toContain('cam-1');
  });
});

describe('worker cameras — busca por detecção', () => {
  it('query por placa acha a detecção LPR (label@stream + href focus)', async () => {
    listMock.mockResolvedValue(STREAMS);
    detectionsMock.mockImplementation((id: string) =>
      Promise.resolve(id === 'cam-2' ? DETECTIONS_CAM2 : []),
    );

    const results = await runWorker(camerasSource, 'abc1d23');

    expect(results).toHaveLength(1);
    const det = results[0];
    expect(det.kind).toBe(BADGE_DETECCAO);
    expect(det.externalId).toBe('det-1');
    expect(det.name).toBe('ABC1D23 @ SP-123 · Tamoios · KM 26');
    expect(det.url).toBe('/cameras?focus=cam-2');
    expect(det.entityId).toBeUndefined();
  });

  it('detecção vinculada à ontologia expõe entityId (Abrir ficha)', async () => {
    listMock.mockResolvedValue(STREAMS);
    detectionsMock.mockImplementation((id: string) =>
      Promise.resolve(id === 'cam-2' ? DETECTIONS_CAM2 : []),
    );

    const results = await runWorker(camerasSource, 'pes-001');
    const det = results.find((r) => r.externalId === 'det-2');
    expect(det).toBeTruthy();
    expect(det!.entityId).toBe('pes-001');
  });

  it('detecção agregada (__flow__) nunca vira resultado', async () => {
    listMock.mockResolvedValue(STREAMS);
    detectionsMock.mockImplementation((id: string) =>
      Promise.resolve(id === 'cam-2' ? DETECTIONS_CAM2 : []),
    );

    const results = await runWorker(camerasSource, 'flow');
    expect(results.find((r) => r.externalId === 'det-agg')).toBeUndefined();
  });
});

describe('worker cameras — resiliência', () => {
  it('backend fora → retorna vazio SEM lançar e sem dado fake', async () => {
    listMock.mockRejectedValue(new Error('fetch failed'));

    await expect(runWorker(camerasSource, 'tamoios')).resolves.toEqual([]);
    expect(detectionsMock).not.toHaveBeenCalled();
  });

  it('falha só no endpoint de detecções não derruba o match de câmera', async () => {
    listMock.mockResolvedValue(STREAMS);
    detectionsMock.mockRejectedValue(new Error('boom'));

    const results = await runWorker(camerasSource, 'tamoios');
    expect(results.map((r) => r.externalId)).toEqual(['cam-2']);
  });

  it('query vazia → vazio (sem flood de stream/detecção)', async () => {
    const results = await runWorker(camerasSource, '   ');
    expect(results).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe('deep-link /cameras?focus=<stream_id>', () => {
  it('resolve o stream apontado pelo param focus', () => {
    const s = findStreamByFocusParam(STREAMS, '?focus=cam-2');
    expect(s?.id).toBe('cam-2');
  });

  it('retorna null sem param ou com id desconhecido', () => {
    expect(findStreamByFocusParam(STREAMS, '')).toBeNull();
    expect(findStreamByFocusParam(STREAMS, '?focus=nao-existe')).toBeNull();
  });
});
