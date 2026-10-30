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
import {
  buildGeoSources,
  filterGeoSources,
  allSourceTags,
  sourceDeepLink,
  type GeoSource,
} from '@/components/geo/geo-sources';

const backend: GeoSource[] = [
  {
    id: 'ontology:Event', category: 'ontology', name: 'Event',
    description: '2 objetos geolocalizados', tags: ['ontologia', 'Event', 'Inpe Focos Collect'],
    count: 2, state: 'active', lastActivity: '2026-07-04T10:00:00Z',
    producer: 'Inpe Focos Collect', boardId: null, boardName: null,
  },
  {
    id: 'ontology:Zone', category: 'ontology', name: 'Zone',
    description: '1 objeto geolocalizado', tags: ['ontologia', 'Zone'],
    count: 1, state: 'idle', lastActivity: '2026-07-01T10:00:00Z',
    producer: 'Fluxo de Zonas', boardId: 'b-123', boardName: 'Zonas de risco',
  },
  {
    id: 'reference:focos_calor', category: 'reference', name: 'Focos de calor ativos hoje (INPE)',
    description: 'Detecções de fogo ativo', tags: ['referência', 'INPE', 'point'],
    count: null, state: 'available', lastActivity: null,
    producer: 'INPE TerraBrasilis', boardId: null, boardName: null,
  },
];

describe('buildGeoSources — compõe backend + câmeras + cercas + correlações', () => {
  it('adiciona entradas de cctv/geofence/correlação normalizadas', () => {
    const all = buildGeoSources({
      backend,
      cctvTotal: 12, cctvOnline: 9,
      geofenceTotal: 4, geofenceActive: 3,
      correlations: 7,
    });
    const by = Object.fromEntries(all.map((s) => [s.id, s]));
    expect(by['cctv'].category).toBe('cctv');
    expect(by['cctv'].count).toBe(12);
    expect(by['cctv'].state).toBe('active'); // online>0
    expect(by['geofence'].count).toBe(4);
    expect(by['correlation'].count).toBe(7);
    // as do backend continuam presentes
    expect(by['ontology:Event']).toBeTruthy();
    expect(by['reference:focos_calor']).toBeTruthy();
  });

  it('estado honesto: cctv sem online vira idle; zero vira empty', () => {
    const idle = buildGeoSources({ backend: [], cctvTotal: 3, cctvOnline: 0, geofenceTotal: 0, geofenceActive: 0, correlations: 0 });
    expect(idle.find((s) => s.id === 'cctv')!.state).toBe('idle');
    const empty = buildGeoSources({ backend: [], cctvTotal: 0, cctvOnline: 0, geofenceTotal: 0, geofenceActive: 0, correlations: 0 });
    expect(empty.find((s) => s.id === 'cctv')!.state).toBe('empty');
  });
});

describe('filterGeoSources — busca + facetas (categoria/tag)', () => {
  it('busca casa nome, descrição, producer e tags (case-insensitive)', () => {
    expect(filterGeoSources(backend, { query: 'inpe' }).map((s) => s.id)).toEqual(
      expect.arrayContaining(['ontology:Event', 'reference:focos_calor']),
    );
    expect(filterGeoSources(backend, { query: 'zone' }).map((s) => s.id)).toEqual(['ontology:Zone']);
  });
  it('faceta de categoria filtra', () => {
    expect(filterGeoSources(backend, { category: 'reference' }).map((s) => s.id)).toEqual(['reference:focos_calor']);
  });
  it('faceta de tag filtra', () => {
    expect(filterGeoSources(backend, { tag: 'INPE' }).map((s) => s.id)).toEqual(['reference:focos_calor']);
  });
  it('sem filtro → tudo', () => {
    expect(filterGeoSources(backend, {})).toHaveLength(3);
  });
});

describe('allSourceTags — união ordenada das tags', () => {
  it('coleta tags únicas de todas as fontes', () => {
    const tags = allSourceTags(backend);
    expect(tags).toContain('ontologia');
    expect(tags).toContain('INPE');
    // sem duplicatas
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe('sourceDeepLink — abrir fluxo/origem', () => {
  it('ontologia com boardId → deep-link do DAG', () => {
    const zone = backend.find((s) => s.id === 'ontology:Zone')!;
    expect(sourceDeepLink(zone)).toBe('/painel-de-controle/dados?aba=pipelines&board=b-123');
  });
  it('ontologia sem board → sem deep-link (produtor não é fluxo)', () => {
    const ev = backend.find((s) => s.id === 'ontology:Event')!;
    expect(sourceDeepLink(ev)).toBeNull();
  });
  it('cctv → /cameras · geofence → /alertas', () => {
    const [cctv] = buildGeoSources({ backend: [], cctvTotal: 1, cctvOnline: 1, geofenceTotal: 0, geofenceActive: 0, correlations: 0 })
      .filter((s) => s.id === 'cctv');
    expect(sourceDeepLink(cctv)).toBe('/cameras');
    const [gf] = buildGeoSources({ backend: [], cctvTotal: 0, cctvOnline: 0, geofenceTotal: 1, geofenceActive: 1, correlations: 0 })
      .filter((s) => s.id === 'geofence');
    expect(sourceDeepLink(gf)).toBe('/alertas');
  });
});
