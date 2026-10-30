/**
 * Widget vision_count (V1 visão→georref→mapa) + extensão do map_live.
 *
 * Invariantes:
 *  - fluxo operador-no-loop: contar → revisar (toggle caixa) → confirmar;
 *  - NUNCA materializa sem revisão (confirm só após detecções na tela);
 *  - bulk create recebe APENAS as caixas mantidas, com geopoint canônico
 *    na propriedade configurada;
 *  - map_live (toMarkers) acha geopoint DENTRO de properties da instância
 *    canônica — genérico, sem nome de campo hardcoded.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({
  Compute: { visionCount: jest.fn(), selectModel: jest.fn() },
  Ontology: { bulkCreate: jest.fn() },
}));
jest.mock('@/lib/workshop/client', () => ({
  Workshop: { upload: jest.fn().mockResolvedValue({ url: 'http://minio/x', object_key: 'k' }), invokeAction: jest.fn() },
}));

import { Compute, Ontology } from '@/lib/api';
import { getWidgetComponent, getWidgetMeta } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets/vision-count';
import '@/components/workshop/widgets/media-uploader';
import { toMarkers } from '@/components/workshop/widgets/map-live';

const mockCompute = Compute as jest.Mocked<typeof Compute>;
const mockOntology = Ontology as jest.Mocked<typeof Ontology>;

const DETS = {
  count: 2,
  provider: 'vision-llm-demo',
  vendor: 'openrouter_vision',
  provider_kind: 'cloud_inference',
  jurisdictions: ['US'],
  detections: [
    { x_min: 0.1, y_min: 0.1, x_max: 0.3, y_max: 0.3, geopoint: { lat: -23.551, lng: -46.638 } },
    { x_min: 0.6, y_min: 0.6, x_max: 0.8, y_max: 0.8, geopoint: { lat: -23.558, lng: -46.632 } },
  ],
};

function renderWidget(config: Record<string, unknown> = { target_kind: 'estrutura', geo_property: 'localizacao' }) {
  const Comp = getWidgetComponent('vision_count')!;
  return render(
    <Comp appId="app-1" config={config} variables={{}} bindings={{}} setBinding={() => {}} emit={jest.fn()} />,
  );
}

async function pickImage() {
  const file = new File(['fake-bytes'], 'aerea.png', { type: 'image/png' });
  fireEvent.change(screen.getByTestId('vc-file'), { target: { files: [file] } });
  await screen.findByTestId('vc-image');
}

function fillAnchorAndInstruction() {
  fireEvent.change(screen.getByTestId('vc-nw_lat'), { target: { value: '-23.55' } });
  fireEvent.change(screen.getByTestId('vc-nw_lng'), { target: { value: '-46.64' } });
  fireEvent.change(screen.getByTestId('vc-se_lat'), { target: { value: '-23.56' } });
  fireEvent.change(screen.getByTestId('vc-se_lng'), { target: { value: '-46.63' } });
  fireEvent.change(screen.getByTestId('vc-instruction'), { target: { value: 'conte as casas' } });
}

describe('vision_count (widget genérico V1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompute.visionCount.mockResolvedValue(DETS as never);
    mockCompute.selectModel.mockResolvedValue({
      classification: { vocabulary: 'open', output: 'box', reason: 'r' },
      intention: null, jurisdiction: null,
      recommended: { key: 'moondream3-detect', label: 'Detecção por texto', vocabulary: 'open',
        output: 'box', hostings: ['shared'], provider_hint: 'wavespeed', route: 'managed',
        jurisdictions: ['SG'], capability: 'detect', cost_hint: '$0.001/req', coldstart_hint: 'none' },
      candidates: [{ key: 'moondream3-detect', label: 'Detecção por texto' } as never,
                   { key: 'sam3-image', label: 'Segmentação SAM3' } as never],
      tradeoffs: ['Detecção por texto: managed via wavespeed'],
    } as never);
    mockOntology.bulkCreate.mockResolvedValue({ created: 1, object_ids: ['o1'], kind: 'estrutura' } as never);
  });

  it('declara mockConfig (regra da paleta) e config_schema com node-type picker', () => {
    const meta = getWidgetMeta('vision_count')!;
    expect(meta.mockConfig).toBeTruthy();
    const kindField = (meta.config_schema || []).find((f: { name: string }) => f.name === 'target_kind');
    expect(kindField?.field).toBe('node-type'); // nunca input técnico manual
  });

  it('conta com geo_bounds e mostra a revisão com caixas + provider usado', async () => {
    renderWidget();
    await pickImage();
    fillAnchorAndInstruction();
    fireEvent.click(screen.getByTestId('vc-count'));
    await screen.findByTestId('vc-review');
    expect(mockCompute.visionCount).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: 'conte as casas',
        geo_bounds: { nw: { lat: -23.55, lng: -46.64 }, se: { lat: -23.56, lng: -46.63 } },
      }),
    );
    expect(screen.getByTestId('vc-det-0')).toBeInTheDocument();
    expect(screen.getByTestId('vc-review')).toHaveTextContent('visionCount.found: 2');
    expect(screen.getByTestId('vc-review')).toHaveTextContent('vision-llm-demo');
  });

  it('REVISÃO: remover uma caixa exclui ela do bulk create (só as mantidas materializam)', async () => {
    renderWidget();
    await pickImage();
    fillAnchorAndInstruction();
    fireEvent.click(screen.getByTestId('vc-count'));
    await screen.findByTestId('vc-review');

    fireEvent.click(screen.getByTestId('vc-det-0')); // falso positivo
    expect(screen.getByTestId('vc-review')).toHaveTextContent('visionCount.found: 1');

    fireEvent.click(screen.getByTestId('vc-confirm'));
    await waitFor(() => expect(mockOntology.bulkCreate).toHaveBeenCalled());
    const [kind, items] = mockOntology.bulkCreate.mock.calls[0];
    expect(kind).toBe('estrutura');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ localizacao: { lat: -23.558, lng: -46.632 } });
    expect(await screen.findByTestId('vc-created')).toHaveTextContent('1');
  });

  it('jurisdição configurada é repassada ao roteador (fail-closed no backend)', async () => {
    renderWidget({ target_kind: 'estrutura', jurisdiction: 'BR' });
    await pickImage();
    fillAnchorAndInstruction();
    mockCompute.visionCount.mockRejectedValueOnce(new Error("nenhum provedor de computação elegível p/ detecção na jurisdição 'BR'"));
    fireEvent.click(screen.getByTestId('vc-count'));
    const err = await screen.findByTestId('vc-error');
    expect(err).toHaveTextContent("jurisdição 'BR'");
    expect(mockCompute.visionCount).toHaveBeenCalledWith(expect.objectContaining({ jurisdiction: 'BR' }));
  });

  it('sem target_kind o Confirmar fica bloqueado com aviso', async () => {
    renderWidget({});
    await pickImage();
    fillAnchorAndInstruction();
    fireEvent.click(screen.getByTestId('vc-count'));
    await screen.findByTestId('vc-review');
    expect(screen.getByTestId('vc-confirm')).toBeDisabled();
    expect(screen.getByTestId('vc-review')).toHaveTextContent('visionCount.noKind');
  });
});

describe('map_live lê geopoint de properties (instância canônica)', () => {
  it('toMarkers acha o geopoint dentro de properties, qualquer nome de campo', () => {
    const rows = [
      // instância canônica do object set: geopoint nested, nome do campo é DADO
      { id: 'n1', name: 'estrutura 1', properties: { localizacao: { lat: -23.551, lng: -46.638 } } },
      { id: 'n2', name: 'árvore 7', properties: { posicao_geo: { lat: -10.1, lng: -50.2 }, especie: 'ipê' } },
      // top-level continua funcionando (telemetria M2)
      { id: 'n3', lat: -23.5, lng: -46.6, label: 'Ativo' },
      // sem geo → ignorada
      { id: 'n4', name: 'sem-geo', properties: { cor: 'azul' } },
    ];
    const markers = toMarkers({ pontos: rows }, { source: 'pontos' } as never);
    expect(markers).toHaveLength(3);
    expect(markers[0]).toMatchObject({ id: 'n1', lat: -23.551, lng: -46.638 });
    expect(markers[1]).toMatchObject({ id: 'n2', lat: -10.1, lng: -50.2 });
  });
});

// ── S4 — recomendação de modelo + saída pino/polígono + intenção (no widget) ─
describe('vision_count S4 — seleção de modelo + output_as na UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompute.visionCount.mockResolvedValue(DETS as never);
    mockCompute.selectModel.mockResolvedValue({
      classification: { vocabulary: 'open', output: 'polygon', reason: 'área' },
      intention: null, jurisdiction: null,
      recommended: { key: 'sam3-image', label: 'Segmentação SAM3', vocabulary: 'open',
        output: 'polygon', hostings: ['shared'], provider_hint: 'wavespeed', route: 'managed',
        jurisdictions: ['SG'], capability: 'segment', cost_hint: 'por req', coldstart_hint: 'none' },
      candidates: [{ key: 'sam3-image', label: 'Segmentação SAM3' } as never,
                   { key: 'edge-segmenter', label: 'Segmentador no cliente' } as never],
      tradeoffs: ['Segmentação SAM3: managed via wavespeed'],
    } as never);
    mockOntology.bulkCreate.mockResolvedValue({ created: 1, object_ids: ['o1'], kind: 'estrutura' } as never);
  });

  it('ao sair da instrução, pede recomendação ao AIP e mostra o modelo + alternativas', async () => {
    const Comp = getWidgetComponent('vision_count')!;
    render(<Comp appId="a" config={{ target_kind: 'lote', geo_property: 'perimetro' }}
      variables={{}} bindings={{}} setBinding={() => {}} emit={jest.fn()} />);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('vc-file'), { target: { files: [file] } });
    await screen.findByTestId('vc-image');
    fireEvent.change(screen.getByTestId('vc-instruction'), { target: { value: 'delimitar os lotes' } });
    fireEvent.blur(screen.getByTestId('vc-instruction'));
    await waitFor(() => expect(mockCompute.selectModel).toHaveBeenCalledWith('delimitar os lotes', undefined, undefined));
    const rec = await screen.findByTestId('vc-rec');
    expect(rec).toHaveTextContent('Segmentação SAM3');
    expect(rec).toHaveTextContent('managed');
    // saída alinhou a polígono (output=polygon) automaticamente
    expect(screen.getByTestId('vc-out-geoshape')).toHaveAttribute('aria-pressed', 'true');
  });

  it('polígono → conta com capability=segment e materializa geoshape', async () => {
    mockCompute.visionCount.mockResolvedValue({
      ...DETS, capability: 'segment', output_as: 'geoshape',
      detections: [{ x_min: 0.1, y_min: 0.1, x_max: 0.3, y_max: 0.3,
        geoshape: { type: 'Polygon', coordinates: [[[-46.6, -23.5], [-46.5, -23.5], [-46.5, -23.6], [-46.6, -23.5]]] } }],
    } as never);
    const Comp = getWidgetComponent('vision_count')!;
    render(<Comp appId="a" config={{ target_kind: 'lote', geo_property: 'perimetro' }}
      variables={{}} bindings={{}} setBinding={() => {}} emit={jest.fn()} />);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('vc-file'), { target: { files: [file] } });
    await screen.findByTestId('vc-image');
    for (const [k, v] of [['nw_lat', '-23.55'], ['nw_lng', '-46.64'], ['se_lat', '-23.56'], ['se_lng', '-46.63']])
      fireEvent.change(screen.getByTestId(`vc-${k}`), { target: { value: v } });
    fireEvent.change(screen.getByTestId('vc-instruction'), { target: { value: 'delimitar lotes' } });
    fireEvent.click(screen.getByTestId('vc-out-geoshape'));
    fireEvent.click(screen.getByTestId('vc-count'));
    await waitFor(() => expect(mockCompute.visionCount).toHaveBeenCalled());
    expect(mockCompute.visionCount.mock.calls[0][0]).toMatchObject({ capability: 'segment', output_as: 'geoshape' });
    await screen.findByTestId('vc-review');
    fireEvent.click(screen.getByTestId('vc-confirm'));
    await waitFor(() => expect(mockOntology.bulkCreate).toHaveBeenCalled());
    const items = mockOntology.bulkCreate.mock.calls[0][1];
    expect(items[0].perimetro).toMatchObject({ type: 'Polygon' });  // geoshape materializado
  });

  it('pino (default) → capability=detect, materializa geopoint (sem geoshape)', async () => {
    const Comp = getWidgetComponent('vision_count')!;
    render(<Comp appId="a" config={{ target_kind: 'lote', geo_property: 'local' }}
      variables={{}} bindings={{}} setBinding={() => {}} emit={jest.fn()} />);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('vc-file'), { target: { files: [file] } });
    await screen.findByTestId('vc-image');
    for (const [k, v] of [['nw_lat', '-23.55'], ['nw_lng', '-46.64'], ['se_lat', '-23.56'], ['se_lng', '-46.63']])
      fireEvent.change(screen.getByTestId(`vc-${k}`), { target: { value: v } });
    fireEvent.change(screen.getByTestId('vc-instruction'), { target: { value: 'contar' } });
    fireEvent.click(screen.getByTestId('vc-out-point'));  // pino
    fireEvent.click(screen.getByTestId('vc-count'));
    await waitFor(() => expect(mockCompute.visionCount).toHaveBeenCalled());
    expect(mockCompute.visionCount.mock.calls[0][0]).toMatchObject({ capability: 'detect', output_as: 'point' });
    await screen.findByTestId('vc-review');
    fireEvent.click(screen.getByTestId('vc-confirm'));
    await waitFor(() => expect(mockOntology.bulkCreate).toHaveBeenCalled());
    const items = mockOntology.bulkCreate.mock.calls[0][1];
    expect(items[0].local).toHaveProperty('lat');  // geopoint (pino), sem geoshape
  });

  it('intenção edge é repassada ao select_model', async () => {
    const Comp = getWidgetComponent('vision_count')!;
    render(<Comp appId="a" config={{ target_kind: 'lote' }}
      variables={{}} bindings={{}} setBinding={() => {}} emit={jest.fn()} />);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('vc-file'), { target: { files: [file] } });
    await screen.findByTestId('vc-image');
    fireEvent.change(screen.getByTestId('vc-instruction'), { target: { value: 'delimitar lotes' } });
    fireEvent.change(screen.getByTestId('vc-intention'), { target: { value: 'edge' } });
    fireEvent.blur(screen.getByTestId('vc-intention'));
    await waitFor(() => expect(mockCompute.selectModel).toHaveBeenCalledWith('delimitar lotes', 'edge', undefined));
  });
});
