/**
 * §C C2-C4 (/cameras) — listas escaláveis: helpers PUROS de filtro/busca.
 *
 * Operador: "Streams · N", "Observações vinculadas · N" e "Detecções IA · N"
 * não têm filtro/busca/paginação e a quantidade vai crescer absurdamente. Os
 * filtros de SERVIDOR (status/city/detection_enabled) já existem no client;
 * aqui ficam a BUSCA livre client-side + o filtro por kind das detecções +
 * a derivação de cidades pro dropdown. Sem I/O — a UI só renderiza o resultado.
 */
import {
  filterStreams,
  deriveCities,
  filterDetectionGroups,
} from '@/components/cameras/camera-filters';

const streams = [
  { name: 'Praça Norte', city: 'São Paulo', tags: ['zona-norte', 'lpr'], source_type: 'rtsp' },
  { name: 'Av. Central', city: 'Campinas', tags: ['centro'], source_type: 'webcam-usb' },
  { name: 'Portaria Sul', city: 'São Paulo', tags: [], source_type: null },
];

describe('filterStreams — busca livre (nome | cidade | tags | source_type)', () => {
  it('casa por nome, cidade e tag (case-insensitive)', () => {
    expect(filterStreams(streams, 'norte').map((s) => s.name)).toEqual(['Praça Norte']);
    expect(filterStreams(streams, 'CAMPINAS').map((s) => s.name)).toEqual(['Av. Central']);
    expect(filterStreams(streams, 'centro').map((s) => s.name)).toEqual(['Av. Central']);
  });
  it('busca vazia → tudo; sem match → vazio', () => {
    expect(filterStreams(streams, '')).toHaveLength(3);
    expect(filterStreams(streams, '   ')).toHaveLength(3);
    expect(filterStreams(streams, 'zzz')).toHaveLength(0);
  });
});

describe('deriveCities — cidades únicas ordenadas (dropdown)', () => {
  it('únicas, sem vazias, ordenadas', () => {
    expect(deriveCities(streams)).toEqual(['Campinas', 'São Paulo']);
    expect(deriveCities([{ city: null }, { city: '' }, { city: '  ' }])).toEqual([]);
  });
});

const groups = [
  { entity_id: 'ent-1', sample: { kind: 'lpr', label: 'ABC1D23' } },
  { entity_id: null, sample: { kind: 'face', label: 'Rosto 7' } },
  { entity_id: 'ent-3', sample: { kind: 'object', label: 'mochila' } },
];

describe('filterDetectionGroups — filtro por kind + busca', () => {
  it('kind filtra; "all"/ausente → tudo', () => {
    expect(filterDetectionGroups(groups, { kind: 'lpr' }).map((g) => g.entity_id)).toEqual(['ent-1']);
    expect(filterDetectionGroups(groups, { kind: 'all' })).toHaveLength(3);
    expect(filterDetectionGroups(groups, {})).toHaveLength(3);
  });
  it('busca casa label e entity_id', () => {
    expect(filterDetectionGroups(groups, { query: 'abc1' }).map((g) => g.entity_id)).toEqual(['ent-1']);
    expect(filterDetectionGroups(groups, { query: 'ent-3' }).map((g) => g.entity_id)).toEqual(['ent-3']);
  });
  it('kind + busca combinam', () => {
    expect(filterDetectionGroups(groups, { kind: 'face', query: 'rosto' })).toHaveLength(1);
    expect(filterDetectionGroups(groups, { kind: 'face', query: 'mochila' })).toHaveLength(0);
  });
});
