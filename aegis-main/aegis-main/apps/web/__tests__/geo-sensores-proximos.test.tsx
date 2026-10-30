/**
 * /GEO — Sensores próximos + correlação espaço-temporal (2026-06-14).
 *
 * Certifica os gestos do operador no painel de detalhe da seleção:
 *  1. selecionar um nó posicionado → seção "Sensores próximos" chama
 *     GET /situational/nearby e popula a lista com distância + Δtempo
 *     (JetBrains Mono); estado vazio honesto quando não há vizinho;
 *  2. mudar raio (100/200/500m) e janela (5/15/60min) refaz o fetch com
 *     os novos parâmetros;
 *  3. clicar num vizinho foca (flyTo) + seleciona o nó;
 *  4. selecionar desenha as linhas âncora→vizinhos no mapa (correlationLines);
 *  5. "Correlacionar" (gated situational.correlate.manage) → confirmModal →
 *     POST /situational/correlations;
 *  6. correlações existentes aparecem com "Cortar correlação" (gated) →
 *     confirmModal → DELETE; confirmModal negado não corta.
 *
 * O globo Cesium é certificado no browser (jsdom não tem WebGL) — aqui o
 * desenho é provado pelo estado correlationLines no GeoContext.
 */
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { GeoProvider, useGeo } from '@/components/geo/geo-context';
import { PainelDetalheGeo } from '@/components/geo/painel-detalhe';
import { PainelCamadas } from '@/components/geo/painel-camadas';
import type { GeoNode } from '@/lib/api/geo';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock('@/components/cameras/hls-player', () => ({
  HlsBadge: () => null,
  HlsPlayer: () => null,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/components/ui/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/api/situational', () => ({
  Situational: {
    nearby: jest.fn(),
    correlations: jest.fn(),
    correlate: jest.fn(),
    cutCorrelation: jest.fn(),
  },
}));
jest.mock('@/lib/api', () => ({
  Alerts: {
    geofences: {
      remove: jest.fn(),
      list: jest.fn().mockResolvedValue([]),
      alerts: jest.fn().mockResolvedValue([]),
    },
  },
}));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn().mockResolvedValue([]) }, detections: jest.fn() },
}));
jest.mock('@/lib/api/geo', () => ({
  Geo: {
    nodeTypes: jest.fn().mockResolvedValue({ node_types: [] }),
    nodes: jest.fn().mockResolvedValue({ nodes: [], truncated: false }),
    referenceLayers: jest.fn().mockResolvedValue({ layers: [] }),
    referenceLayer: jest.fn().mockResolvedValue({
      layer: 'empty',
      geojson: { type: 'FeatureCollection', features: [] },
      feature_count: 0,
    }),
  },
}));

// useCan controlável por teste (gating do Correlacionar/Cortar).
let mockCanValue = true;
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => mockCanValue,
}));

const { Situational } = jest.requireMock('@/lib/api/situational');
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog');

const ANCHOR: GeoNode = {
  id: 'anchor-1',
  node_type: 'Event',
  name: 'Evento câmera Centro',
  lat: -23.55,
  lng: -46.63,
  detected_at: '2026-06-14T12:00:00Z',
  properties_resumo: {},
};

const NEARBY = {
  anchor: { node_id: 'anchor-1', node_type: 'Event', name: 'Evento câmera Centro' },
  neighbors: [
    {
      node_id: 'viz-1',
      node_type: 'Observation',
      name: 'Viatura 12',
      lat: -23.551,
      lng: -46.631,
      distance_m: 142.5,
      delta_s: 38,
      confidence: 0.82,
    },
    {
      node_id: 'viz-2',
      node_type: 'cctv_stream',
      name: 'Câmera Praça',
      lat: -23.549,
      lng: -46.629,
      distance_m: 310.0,
      delta_s: 95,
      confidence: 0.61,
    },
  ],
};

const EXISTING = {
  correlations: [
    {
      edge_id: 'edge-1',
      source_node_id: 'anchor-1',
      target_node_id: 'viz-1',
      distance_m: 142.5,
      delta_s: 38,
      confidence: 0.82,
      evidence: {},
    },
  ],
};

/** Lê o estado do GeoContext (linhas desenhadas) pra provar o desenho. */
let captured: ReturnType<typeof useGeo> | null = null;
function Probe() {
  captured = useGeo();
  return null;
}

/** Seleciona o nó âncora assim que monta (uma vez). */
function SelectAnchor({ node }: { node: GeoNode }) {
  const { setSelected } = useGeo();
  useEffect(() => {
    setSelected({ kind: 'node', node });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanValue = true;
  captured = null;
  Situational.nearby.mockResolvedValue(NEARBY);
  Situational.correlations.mockResolvedValue(EXISTING);
  Situational.correlate.mockResolvedValue({ correlations: EXISTING.correlations });
  Situational.cutCorrelation.mockResolvedValue(undefined);
});

function renderWithAnchor(node: GeoNode = ANCHOR) {
  return render(
    <GeoProvider>
      <Probe />
      <SelectAnchor node={node} />
      <PainelDetalheGeo />
    </GeoProvider>,
  );
}

describe('Sensores próximos — GET /situational/nearby', () => {
  it('seleção de nó posicionado popula a seção com distância + Δtempo', async () => {
    renderWithAnchor();
    expect(await screen.findByTestId('sensores-proximos')).toBeInTheDocument();
    await waitFor(() =>
      expect(Situational.nearby).toHaveBeenCalledWith(
        expect.objectContaining({ node_id: 'anchor-1' }),
      ),
    );
    const list = await screen.findByTestId('nearby-list');
    expect(within(list).getByText('Viatura 12')).toBeInTheDocument();
    expect(within(list).getByText('Câmera Praça')).toBeInTheDocument();
    // distância em metros + Δtempo em segundos (JetBrains Mono = font-mono).
    // 142.5 m → "143 m" (toFixed(0)); Δ "38 s".
    expect(within(list).getByText('143 m')).toBeInTheDocument();
    expect(within(list).getByText(/Δ\s*38\s*s/)).toBeInTheDocument();
  });

  it('estado vazio honesto quando não há vizinho no raio/janela', async () => {
    Situational.nearby.mockResolvedValue({ anchor: NEARBY.anchor, neighbors: [] });
    renderWithAnchor();
    expect(await screen.findByText('geo.nearby.empty')).toBeInTheDocument();
  });

  it('erro de rede → mensagem de erro honesta', async () => {
    Situational.nearby.mockRejectedValue(new Error('boom'));
    renderWithAnchor();
    expect(await screen.findByText('geo.nearby.error')).toBeInTheDocument();
  });

  it('desenha as linhas âncora→vizinhos no mapa (correlationLines)', async () => {
    renderWithAnchor();
    await screen.findByTestId('nearby-list');
    await waitFor(() => {
      const lines = captured?.correlationLines ?? [];
      const nearby = lines.filter((l) => l.kind === 'nearby');
      expect(nearby.length).toBe(2);
      // path = [âncora, vizinho] em [lat, lng]
      expect(nearby[0].path[0]).toEqual([ANCHOR.lat, ANCHOR.lng]);
      expect(nearby[0].path[1]).toEqual([-23.551, -46.631]);
    });
  });
});

describe('Controles de raio e janela refazem o fetch', () => {
  it('mudar o raio para 500m re-busca com radius_m=500', async () => {
    renderWithAnchor();
    await waitFor(() => expect(Situational.nearby).toHaveBeenCalled());
    Situational.nearby.mockClear();
    fireEvent.click(await screen.findByTestId('nearby-radius-500'));
    await waitFor(() =>
      expect(Situational.nearby).toHaveBeenCalledWith(
        expect.objectContaining({ node_id: 'anchor-1', radius_m: 500 }),
      ),
    );
  });

  it('mudar a janela para 60min re-busca com window_s=3600', async () => {
    renderWithAnchor();
    await waitFor(() => expect(Situational.nearby).toHaveBeenCalled());
    Situational.nearby.mockClear();
    fireEvent.click(await screen.findByTestId('nearby-window-3600'));
    await waitFor(() =>
      expect(Situational.nearby).toHaveBeenCalledWith(
        expect.objectContaining({ node_id: 'anchor-1', window_s: 3600 }),
      ),
    );
  });
});

describe('Clicar num vizinho foca + seleciona', () => {
  it('seleciona o nó vizinho ao clicar', async () => {
    renderWithAnchor();
    fireEvent.click(await screen.findByTestId('nearby-neighbor-viz-1'));
    await waitFor(() => {
      expect(captured?.selected?.kind).toBe('node');
      if (captured?.selected?.kind === 'node') {
        expect(captured.selected.node.id).toBe('viz-1');
      }
    });
  });
});

describe('Correlacionar — gated situational.correlate.manage', () => {
  it('botão visível quando tem a perm; POST após confirmModal', async () => {
    renderWithAnchor();
    fireEvent.click(await screen.findByTestId('correlacionar'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await waitFor(() =>
      expect(Situational.correlate).toHaveBeenCalledWith(
        expect.objectContaining({ anchor_node_id: 'anchor-1' }),
      ),
    );
  });

  it('confirmModal negado → POST não acontece', async () => {
    confirmModal.mockResolvedValueOnce(false);
    renderWithAnchor();
    fireEvent.click(await screen.findByTestId('correlacionar'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await act(async () => {});
    expect(Situational.correlate).not.toHaveBeenCalled();
  });

  it('sem a perm → botão Correlacionar não aparece', async () => {
    mockCanValue = false;
    renderWithAnchor();
    await screen.findByTestId('nearby-list');
    expect(screen.queryByTestId('correlacionar')).not.toBeInTheDocument();
  });
});

describe('Cortar correlação — gated + reversível', () => {
  it('lista correlações existentes e corta após confirmModal (DELETE)', async () => {
    renderWithAnchor();
    fireEvent.click(await screen.findByTestId('cortar-correlacao-edge-1'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await waitFor(() =>
      expect(Situational.cutCorrelation).toHaveBeenCalledWith('edge-1'),
    );
  });

  it('confirmModal negado → DELETE não acontece', async () => {
    confirmModal.mockResolvedValueOnce(false);
    renderWithAnchor();
    fireEvent.click(await screen.findByTestId('cortar-correlacao-edge-1'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await act(async () => {});
    expect(Situational.cutCorrelation).not.toHaveBeenCalled();
  });

  it('sem a perm → botão Cortar não aparece', async () => {
    mockCanValue = false;
    renderWithAnchor();
    await screen.findByTestId('nearby-list');
    expect(screen.queryByTestId('cortar-correlacao-edge-1')).not.toBeInTheDocument();
  });
});

describe('Correlações como camada no painel de camadas', () => {
  it('mostra a camada Correlações com toggle de visibilidade', async () => {
    render(
      <GeoProvider>
        <PainelCamadas />
      </GeoProvider>,
    );
    expect(await screen.findByText(/^geo\.corr\.layer · 0$/)).toBeInTheDocument();
    expect(screen.getByTestId('correlations-layer-hint')).toBeInTheDocument();
  });
});
