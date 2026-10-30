/**
 * /GEO real — mata o teatro e liga a ontologia (2026-06-12).
 *
 * Certifica os gestos do operador na tela Mapa:
 *  1. "Camadas da ontologia" nasce de GET /geo/node-types (dado, não código);
 *  2. ligar uma camada busca GET /geo/nodes?node_type=...&since_minutes=...;
 *  3. cerca criada do polígono desenhado → POST /alerts/geofences com
 *     coordinates [[lon,lat],...] (a MESMA cerca que dispara alertas);
 *  4. contagem REAL dos nós carregados dentro do polígono (fixture
 *     determinística — mesma matemática ray-casting do avaliador);
 *  5. janela temporal REAL refaz o fetch com since_minutes;
 *  6. remover cerca passa por confirmModal (nunca diálogo nativo).
 *
 * O globo Cesium em si é certificado no browser (jsdom não tem WebGL) —
 * aqui o CesiumGlobe entra como stub via mock do next/dynamic.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GeoProvider, useGeo, type ShapeDraft } from '@/components/geo/geo-context';
import { PainelCamadas } from '@/components/geo/painel-camadas';
import { MapaCanvas } from '@/components/geo/mapa';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const Stub = () => null;
    return Stub;
  },
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/api/geo', () => ({
  Geo: {
    nodeTypes: jest.fn(),
    nodes: jest.fn(),
    referenceLayers: jest.fn().mockResolvedValue({ layers: [] }),
    referenceLayer: jest.fn().mockResolvedValue({
      layer: 'empty',
      geojson: { type: 'FeatureCollection', features: [] },
      feature_count: 0,
    }),
  },
}));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn() }, detections: jest.fn() },
}));
jest.mock('@/lib/api', () => ({
  Alerts: {
    geofences: {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      alerts: jest.fn(),
    },
  },
}));

const { Geo } = jest.requireMock('@/lib/api/geo');
const { Cctv } = jest.requireMock('@/lib/api/cctv');
const { Alerts } = jest.requireMock('@/lib/api');
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog');

/** Stub que dá coordenada geográfica REAL ao clique do overlay —
 *  mapeamento linear determinístico px → lon/lat. */
function ScreenToGeoStub() {
  const { screenToGeoRef } = useGeo();
  screenToGeoRef.current = (xPx: number, yPx: number) => ({
    lng: xPx / 100, // 0..10
    lat: -(yPx / 100), // 0..-5
  });
  return null;
}

/** Captura `setShapeDraft` do contexto — simula o que o CesiumGlobe faz ao
 *  concluir um Raio (círculo) / Rota (corredor), que em jsdom é stub (null).
 *  Setar durante o render espelha o ScreenToGeoStub acima. */
let setDraft: (d: ShapeDraft) => void = () => {};
function DraftDriver() {
  setDraft = useGeo().setShapeDraft;
  return null;
}

/** Captura setEditingFence — simula o "Redesenhar no mapa" do painel-detalhe. */
let setEditing: (f: { id: string; name: string; severity: string; shape: string; widthMeters?: number } | null) => void = () => {};
function EditingDriver() {
  setEditing = useGeo().setEditingFence;
  return null;
}

const NODE_TYPES = {
  node_types: [
    { node_type: 'vehicle_track', count: 12 },
    { node_type: 'cctv_detection', count: 3 },
  ],
};

const FIXTURE_NODES = {
  nodes: [
    // ring do teste: cliques em (100,100) (900,100) (900,400) (100,400)
    // → lon 1..9, lat -1..-4. Dois dentro, um fora.
    { id: 'n1', node_type: 'vehicle_track', name: 'Alvo 1', lat: -2, lng: 5, detected_at: null, properties_resumo: {} },
    { id: 'n2', node_type: 'vehicle_track', name: 'Alvo 2', lat: -3, lng: 6, detected_at: null, properties_resumo: {} },
    { id: 'n3', node_type: 'vehicle_track', name: 'Fora', lat: -20, lng: 20, detected_at: null, properties_resumo: {} },
  ],
  truncated: false,
};

const FENCE = {
  id: 'g1',
  name: 'Perímetro Escola',
  shape: 'polygon',
  coordinates: [[-46.7, -23.5], [-46.5, -23.5], [-46.5, -23.7]],
  active: true,
  severity: 'high',
};

beforeEach(() => {
  jest.clearAllMocks();
  Geo.nodeTypes.mockResolvedValue(NODE_TYPES);
  Geo.nodes.mockResolvedValue(FIXTURE_NODES);
  Cctv.streams.list.mockResolvedValue([]);
  Cctv.detections.mockResolvedValue([]);
  Alerts.geofences.list.mockResolvedValue([FENCE]);
  Alerts.geofences.alerts.mockResolvedValue([]);
  Alerts.geofences.create.mockResolvedValue({ ...FENCE, id: 'g2' });
  Alerts.geofences.update.mockImplementation((id: string, changes: Record<string, unknown>) =>
    Promise.resolve({ ...FENCE, id, ...changes }),
  );
  Alerts.geofences.remove.mockResolvedValue(undefined);
});

function renderGeo(children: React.ReactNode) {
  return render(<GeoProvider>{children}</GeoProvider>);
}

describe('Camadas da ontologia — data-driven de GET /geo/node-types', () => {
  it('popula o painel com label humano + contagem (zero hardcode)', async () => {
    renderGeo(<PainelCamadas />);
    expect(await screen.findByText('Vehicle Track')).toBeInTheDocument();
    expect(screen.getByText('Cctv Detection')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(Geo.nodeTypes).toHaveBeenCalledTimes(1);
  });

  it('ligar uma camada busca GET /geo/nodes com node_type (sem janela = tudo)', async () => {
    renderGeo(<PainelCamadas />);
    fireEvent.click(await screen.findByTestId('layer-toggle-vehicle_track'));
    await waitFor(() =>
      expect(Geo.nodes).toHaveBeenCalledWith({
        node_type: 'vehicle_track',
        since_minutes: undefined,
      }),
    );
    // contagem carregada/total aparece no painel
    expect(await screen.findByText('3/12')).toBeInTheDocument();
  });

  it('tenant sem nós geolocalizados → estado vazio honesto', async () => {
    Geo.nodeTypes.mockResolvedValue({ node_types: [] });
    renderGeo(<PainelCamadas />);
    expect(await screen.findByText('geo.layers.ontologyEmpty')).toBeInTheDocument();
  });
});

describe('Janela temporal REAL — since_minutes refaz o fetch', () => {
  it('selecionar 1 h refaz a busca da camada ativa com since_minutes=60', async () => {
    renderGeo(
      <>
        <PainelCamadas />
        <MapaCanvas />
      </>,
    );
    fireEvent.click(await screen.findByTestId('layer-toggle-vehicle_track'));
    await waitFor(() => expect(Geo.nodes).toHaveBeenCalled());
    Geo.nodes.mockClear();
    fireEvent.click(screen.getByTestId('janela-60'));
    await waitFor(() =>
      expect(Geo.nodes).toHaveBeenCalledWith({
        node_type: 'vehicle_track',
        since_minutes: 60,
      }),
    );
  });
});

describe('Cerca virtual criada do polígono desenhado', () => {
  function drawTriangle() {
    fireEvent.click(screen.getByTestId('tool-poligono'));
    const overlay = screen.getByTestId('poligono-overlay');
    jest.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 400 });
    fireEvent.click(overlay, { clientX: 100, clientY: 400 });
  }

  it('POST /alerts/geofences recebe coordinates [[lon,lat],...] + severidade do dropdown', async () => {
    renderGeo(
      <>
        <ScreenToGeoStub />
        <MapaCanvas />
      </>,
    );
    drawTriangle();
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('fence-name'), {
      target: { value: 'Perímetro Norte' },
    });
    fireEvent.change(screen.getByTestId('fence-severity'), {
      target: { value: 'critical' },
    });
    fireEvent.click(screen.getByTestId('criar-geofence'));
    await waitFor(() =>
      expect(Alerts.geofences.create).toHaveBeenCalledWith({
        name: 'Perímetro Norte',
        shape: 'polygon',
        coordinates: [
          [1, -1],
          [9, -1],
          [9, -4],
          [1, -4],
        ],
        severity: 'critical',
        baseline_silent: false,
      }),
    );
    // pós-criação: polígono limpo + lista de cercas recarregada
    await waitFor(() =>
      expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument(),
    );
    expect(Alerts.geofences.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('checkbox "ativar sem retroagir" → POST com baseline_silent: true', async () => {
    renderGeo(<><ScreenToGeoStub /><MapaCanvas /></>);
    fireEvent.click(screen.getByTestId('tool-poligono'));
    const overlay = screen.getByTestId('poligono-overlay');
    jest.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 100 });
    fireEvent.click(overlay, { clientX: 500, clientY: 400 });
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('fence-name'), { target: { value: 'Pátio cheio' } });
    fireEvent.click(screen.getByTestId('fence-baseline-silent')); // marca
    fireEvent.click(screen.getByTestId('criar-geofence'));
    await waitFor(() =>
      expect(Alerts.geofences.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pátio cheio', baseline_silent: true }),
      ),
    );
  });

  it('sem conversão geográfica (globo não pronto) → clique não cria vértice', async () => {
    renderGeo(<MapaCanvas />); // sem ScreenToGeoStub
    fireEvent.click(screen.getByTestId('tool-poligono'));
    const overlay = screen.getByTestId('poligono-overlay');
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 400 });
    expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument();
  });

  it('contagem REAL: nós carregados da camada ativa dentro do anel (fixture)', async () => {
    renderGeo(
      <>
        <ScreenToGeoStub />
        <PainelCamadas />
        <MapaCanvas />
      </>,
    );
    fireEvent.click(await screen.findByTestId('layer-toggle-vehicle_track'));
    await waitFor(() => expect(Geo.nodes).toHaveBeenCalled());
    await screen.findByText('3/12');
    drawTriangle();
    const count = await screen.findByTestId('polygon-count');
    // n1 (5,-2) e n2 (6,-3) dentro · n3 (20,-20) fora
    expect(count.textContent).toContain('2 geo.polygon.inside');
    expect(count.textContent).toContain('Vehicle Track: 2');
  });
});

describe('Paridade de shapes — Raio (círculo) e Rota (corredor) desenhados', () => {
  it('círculo: POST recebe shape=circle + coordinates {center,radius_meters}', async () => {
    renderGeo(
      <>
        <DraftDriver />
        <MapaCanvas />
      </>,
    );
    // CesiumGlobe (stub) publicaria isto ao fechar o Raio:
    act(() => setDraft({ kind: 'circle', center: [-46.6, -23.6], radiusMeters: 500 }));
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    // raio medido aparece (honesto: veio do desenho, não digitado)
    expect(screen.getByTestId('circle-radius').textContent).toContain('500 m');
    fireEvent.change(screen.getByTestId('fence-name'), { target: { value: 'Zona Central' } });
    fireEvent.change(screen.getByTestId('fence-severity'), { target: { value: 'medium' } });
    fireEvent.click(screen.getByTestId('criar-geofence'));
    await waitFor(() =>
      expect(Alerts.geofences.create).toHaveBeenCalledWith({
        name: 'Zona Central',
        shape: 'circle',
        coordinates: { center: [-46.6, -23.6], radius_meters: 500 },
        severity: 'medium',
        baseline_silent: false,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument(),
    );
  });

  it('rota: POST recebe shape=route + coordinates {waypoints,width_meters}', async () => {
    renderGeo(
      <>
        <DraftDriver />
        <MapaCanvas />
      </>,
    );
    act(() =>
      setDraft({
        kind: 'route',
        waypoints: [[-46.64, -23.52], [-46.64, -23.5]],
      }),
    );
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    // contagem ao-vivo dos pontos + largura editável (não vem do desenho)
    expect(screen.getByTestId('geofence-actions').textContent).toContain('2 geo.route.points');
    fireEvent.change(screen.getByTestId('route-width'), { target: { value: '120' } });
    fireEvent.change(screen.getByTestId('fence-name'), { target: { value: 'Corredor Leste' } });
    fireEvent.click(screen.getByTestId('criar-geofence'));
    await waitFor(() =>
      expect(Alerts.geofences.create).toHaveBeenCalledWith({
        name: 'Corredor Leste',
        shape: 'route',
        coordinates: {
          waypoints: [[-46.64, -23.52], [-46.64, -23.5]],
          width_meters: 120,
        },
        severity: 'high',
        baseline_silent: false,
      }),
    );
  });

  it('rota com 1 ponto só → criar fica desabilitado (geometria insuficiente)', async () => {
    renderGeo(
      <>
        <DraftDriver />
        <MapaCanvas />
      </>,
    );
    act(() => setDraft({ kind: 'route', waypoints: [[-46.64, -23.52]] }));
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('fence-name'), { target: { value: 'Rota incompleta' } });
    expect(screen.getByTestId('criar-geofence')).toBeDisabled();
    expect(Alerts.geofences.create).not.toHaveBeenCalled();
  });

  it('descartar desenho do círculo → card some, nada é criado', async () => {
    renderGeo(
      <>
        <DraftDriver />
        <MapaCanvas />
      </>,
    );
    act(() => setDraft({ kind: 'circle', center: [-46.6, -23.6], radiusMeters: 300 }));
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('descartar-desenho'));
    await waitFor(() =>
      expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument(),
    );
    expect(Alerts.geofences.create).not.toHaveBeenCalled();
  });
});

describe('Robustez do desenho do polígono — desfazer + concluir', () => {
  function startPolygon() {
    fireEvent.click(screen.getByTestId('tool-poligono'));
    const overlay = screen.getByTestId('poligono-overlay');
    jest.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    return overlay;
  }

  it('chip flutuante (1–2 pontos) com desfazer; desfazer remove o ponto', async () => {
    renderGeo(<><ScreenToGeoStub /><MapaCanvas /></>);
    const overlay = startPolygon();
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    // 1 ponto → chip de progresso (card só aparece em >=3)
    expect(await screen.findByTestId('poligono-progresso')).toBeInTheDocument();
    expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('desfazer-ponto-chip'));
    // 0 pontos → chip some
    await waitFor(() =>
      expect(screen.queryByTestId('poligono-progresso')).not.toBeInTheDocument(),
    );
  });

  it('desfazer ponto no card (>=3) reduz a contagem de vértices', async () => {
    renderGeo(<><ScreenToGeoStub /><MapaCanvas /></>);
    const overlay = startPolygon();
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 400 });
    fireEvent.click(overlay, { clientX: 100, clientY: 400 });
    const card = await screen.findByTestId('geofence-actions');
    expect(card.textContent).toContain('4 geo.polygon.vertices');
    fireEvent.click(screen.getByTestId('desfazer-ponto'));
    await waitFor(() =>
      expect(screen.getByTestId('geofence-actions').textContent).toContain('3 geo.polygon.vertices'),
    );
  });

  it('Ctrl+Z desfaz quando o foco NÃO está num campo de texto', async () => {
    renderGeo(<><ScreenToGeoStub /><MapaCanvas /></>);
    const overlay = startPolygon();
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 400 });
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    });
    // 3 → 2 vértices: card some (precisa de >=3), chip volta
    await waitFor(() =>
      expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('poligono-progresso')).toBeInTheDocument();
  });

  it('duplo-clique (2 cliques no mesmo ponto) conclui: overlay vira pointer-events-none', async () => {
    renderGeo(<><ScreenToGeoStub /><MapaCanvas /></>);
    const overlay = startPolygon();
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 100 });
    fireEvent.click(overlay, { clientX: 500, clientY: 300 });
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    // 2º clique no MESMO ponto → conclui (sai do modo polígono)
    fireEvent.click(overlay, { clientX: 500, clientY: 300 });
    await waitFor(() =>
      expect(screen.getByTestId('poligono-overlay').className).toContain('pointer-events-none'),
    );
    // o anel permanece (3 vértices) — o card de criar-cerca segue disponível
    expect(screen.getByTestId('geofence-actions')).toBeInTheDocument();
    expect(Alerts.geofences.create).not.toHaveBeenCalled();
  });

  it('cliques em pontos DISTINTOS nunca disparam conclusão (não é duplo-clique)', async () => {
    renderGeo(<><ScreenToGeoStub /><MapaCanvas /></>);
    const overlay = startPolygon();
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 100 });
    fireEvent.click(overlay, { clientX: 900, clientY: 400 });
    fireEvent.click(overlay, { clientX: 100, clientY: 400 });
    // 4 vértices acumulados, segue em modo polígono (não concluiu)
    const card = await screen.findByTestId('geofence-actions');
    expect(card.textContent).toContain('4 geo.polygon.vertices');
    expect(screen.getByTestId('poligono-overlay').className).toContain('cursor-crosshair');
  });
});

describe('Redesenhar geometria — modo edição salva via PATCH (não cria nova)', () => {
  it('banner de redesenho aparece antes de desenhar; cancelar limpa o modo', async () => {
    renderGeo(
      <>
        <EditingDriver />
        <MapaCanvas />
      </>,
    );
    act(() => setEditing({ id: 'g1', name: 'Perímetro Escola', severity: 'high', shape: 'polygon' }));
    expect(await screen.findByTestId('redesenho-banner')).toBeInTheDocument();
    // ainda não há card de geometria nem chamada de API
    expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cancelar-redesenho'));
    await waitFor(() =>
      expect(screen.queryByTestId('redesenho-banner')).not.toBeInTheDocument(),
    );
    expect(Alerts.geofences.update).not.toHaveBeenCalled();
    expect(Alerts.geofences.create).not.toHaveBeenCalled();
  });

  it('redesenhar (círculo) → PATCH {shape,coordinates}; sem nome/severidade no card; não CREATE', async () => {
    renderGeo(
      <>
        <EditingDriver />
        <DraftDriver />
        <MapaCanvas />
      </>,
    );
    act(() => setEditing({ id: 'g1', name: 'Zona Circular', severity: 'high', shape: 'circle' }));
    // operador desenha a nova geometria (CesiumGlobe publicaria isto)
    act(() => setDraft({ kind: 'circle', center: [-46.6, -23.6], radiusMeters: 400 }));
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    // modo edição: cabeçalho "editando" + SEM input de nome/severidade
    expect(screen.getByTestId('editando-cerca')).toBeInTheDocument();
    expect(screen.queryByTestId('fence-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fence-severity')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('criar-geofence'));
    await waitFor(() =>
      expect(Alerts.geofences.update).toHaveBeenCalledWith('g1', {
        shape: 'circle',
        coordinates: { center: [-46.6, -23.6], radius_meters: 400 },
      }),
    );
    expect(Alerts.geofences.create).not.toHaveBeenCalled();
    // pós-save: card some + modo edição encerrado
    await waitFor(() =>
      expect(screen.queryByTestId('geofence-actions')).not.toBeInTheDocument(),
    );
  });

  it('redesenho preserva o TIPO: a paleta trava as outras ferramentas de shape', async () => {
    renderGeo(<><EditingDriver /><MapaCanvas /></>);
    // redesenhando um POLÍGONO → só Polígono (Ponto) fica liberada
    act(() => setEditing({ id: 'g1', name: 'Perímetro Escola', severity: 'high', shape: 'polygon' }));
    await screen.findByTestId('redesenho-banner');
    expect((screen.getByTestId('tool-raio') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('tool-rota') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('tool-poligono') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('tool-selecionar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('redesenho de CÍRCULO trava Ponto/Rota e libera Raio', async () => {
    renderGeo(<><EditingDriver /><MapaCanvas /></>);
    act(() => setEditing({ id: 'g1', name: 'Zona', severity: 'high', shape: 'circle' }));
    await screen.findByTestId('redesenho-banner');
    expect((screen.getByTestId('tool-raio') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('tool-poligono') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('tool-rota') as HTMLButtonElement).disabled).toBe(true);
  });

  it('guarda do save: geometria de tipo diferente NÃO faz PATCH (cinto+suspensório)', async () => {
    renderGeo(<><EditingDriver /><DraftDriver /><MapaCanvas /></>);
    // redesenhando um POLÍGONO, mas chega um draft de CÍRCULO (bypass da paleta)
    act(() => setEditing({ id: 'g1', name: 'Perímetro', severity: 'high', shape: 'polygon' }));
    act(() => setDraft({ kind: 'circle', center: [-46.6, -23.6], radiusMeters: 400 }));
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('criar-geofence'));
    // mismatch de tipo → nenhum PATCH (nem POST)
    await waitFor(() => {});
    expect(Alerts.geofences.update).not.toHaveBeenCalled();
    expect(Alerts.geofences.create).not.toHaveBeenCalled();
  });

  it('redesenho de rota pré-carrega a largura ATUAL (não reseta pro default 80m)', async () => {
    renderGeo(<><EditingDriver /><DraftDriver /><MapaCanvas /></>);
    act(() => setEditing({ id: 'g1', name: 'Corredor', severity: 'high', shape: 'route', widthMeters: 250 }));
    act(() => setDraft({ kind: 'route', waypoints: [[-46.64, -23.52], [-46.64, -23.5]] }));
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    // input de largura mostra a largura original (250), não o default 80
    expect((screen.getByTestId('route-width') as HTMLInputElement).value).toBe('250');
    fireEvent.click(screen.getByTestId('criar-geofence'));
    await waitFor(() =>
      expect(Alerts.geofences.update).toHaveBeenCalledWith('g1', expect.objectContaining({
        coordinates: expect.objectContaining({ width_meters: 250 }),
      })),
    );
  });

  it('corridor: redesenho preserva o shape original (não normaliza p/ route)', async () => {
    renderGeo(<><EditingDriver /><DraftDriver /><MapaCanvas /></>);
    act(() => setEditing({ id: 'g1', name: 'Corredor', severity: 'high', shape: 'corridor' }));
    // ferramenta Rota produz draft kind 'route' — mas o save mantém 'corridor'
    act(() => setDraft({ kind: 'route', waypoints: [[-46.64, -23.52], [-46.64, -23.5]] }));
    expect(await screen.findByTestId('geofence-actions')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('criar-geofence'));
    await waitFor(() =>
      expect(Alerts.geofences.update).toHaveBeenCalledWith('g1', expect.objectContaining({
        shape: 'corridor',
      })),
    );
  });
});

describe('Cercas no painel de camadas — a MESMA cerca que dispara alertas', () => {
  it('lista as cercas reais (Alerts.geofences.list) com severidade e estado', async () => {
    renderGeo(<PainelCamadas />);
    expect(await screen.findByText('Perímetro Escola')).toBeInTheDocument();
    expect(screen.getByText('geo.fence.active')).toBeInTheDocument();
  });

  it('remover passa por confirmModal e chama DELETE', async () => {
    renderGeo(<PainelCamadas />);
    fireEvent.click(await screen.findByTestId('remover-cerca-g1'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await waitFor(() => expect(Alerts.geofences.remove).toHaveBeenCalledWith('g1'));
    expect(Alerts.geofences.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('confirmModal negado → DELETE não acontece', async () => {
    confirmModal.mockResolvedValueOnce(false);
    renderGeo(<PainelCamadas />);
    fireEvent.click(await screen.findByTestId('remover-cerca-g1'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await act(async () => {});
    expect(Alerts.geofences.remove).not.toHaveBeenCalled();
  });
});
