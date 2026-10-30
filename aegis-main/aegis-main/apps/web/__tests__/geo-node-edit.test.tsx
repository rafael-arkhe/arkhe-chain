/**
 * G11 — editar/remover entidade da ontologia pelo PINO do /geo (NodeDetalhe).
 *
 * Antes o pino de nó era só-leitura (resumo + coords + link /ficha). Agora,
 * sob ontology.objects.write: renomear (promptModal → PUT) e remover
 * (confirmModal → DELETE), com refresh da camada (o pin some/atualiza).
 */
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeoProvider, useGeo } from '@/components/geo/geo-context';
import { PainelDetalheGeo } from '@/components/geo/painel-detalhe';
import type { GeoNode } from '@/lib/api/geo';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock('@/components/cameras/hls-player', () => ({ HlsBadge: () => null, HlsPlayer: () => null }));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn().mockResolvedValue(true),
  promptModal: jest.fn().mockResolvedValue('Alvo Renomeado'),
}));
jest.mock('@/components/ui/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/api/situational', () => ({
  Situational: {
    nearby: jest.fn().mockResolvedValue({ anchor: {}, neighbors: [] }),
    correlations: jest.fn().mockResolvedValue({ correlations: [] }),
    correlate: jest.fn(),
    cutCorrelation: jest.fn(),
  },
}));
jest.mock('@/lib/api', () => ({
  Alerts: { geofences: { list: jest.fn().mockResolvedValue([]), alerts: jest.fn().mockResolvedValue([]) } },
  Ontology: { updateNode: jest.fn(), deleteNode: jest.fn() },
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
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));

const { Ontology } = jest.requireMock('@/lib/api');
const { confirmModal, promptModal } = jest.requireMock('@/components/dialog/confirm-dialog');

const NODE: GeoNode = {
  id: 'n-1', node_type: 'vehicle_track', name: 'Alvo 1',
  lat: -23.55, lng: -46.63, detected_at: null, properties_resumo: {},
};

function SelectNode() {
  const { setSelected } = useGeo();
  useEffect(() => { setSelected({ kind: 'node', node: NODE }); }, []);
  return null;
}

function renderNode() {
  return render(<GeoProvider><SelectNode /><PainelDetalheGeo /></GeoProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  confirmModal.mockResolvedValue(true);
  promptModal.mockResolvedValue('Alvo Renomeado');
  Ontology.updateNode.mockImplementation((id: string, patch: Record<string, unknown>) =>
    Promise.resolve({ id, ...patch }));
  Ontology.deleteNode.mockResolvedValue({ status: 'deleted' });
});

describe('NodeDetalhe — editar/remover pelo pino', () => {
  it('renomear via promptModal → PUT updateNode {name}', async () => {
    renderNode();
    expect(await screen.findByTestId('node-detalhe')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('node-renomear'));
    await waitFor(() => expect(promptModal).toHaveBeenCalled());
    await waitFor(() =>
      expect(Ontology.updateNode).toHaveBeenCalledWith('n-1', { name: 'Alvo Renomeado' }),
    );
  });

  it('renomear cancelado (null) → nenhum PUT', async () => {
    promptModal.mockResolvedValueOnce(null);
    renderNode();
    fireEvent.click(await screen.findByTestId('node-renomear'));
    await waitFor(() => expect(promptModal).toHaveBeenCalled());
    expect(Ontology.updateNode).not.toHaveBeenCalled();
  });

  it('remover via confirmModal → DELETE + fecha o detalhe', async () => {
    renderNode();
    fireEvent.click(await screen.findByTestId('node-remover'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await waitFor(() => expect(Ontology.deleteNode).toHaveBeenCalledWith('n-1'));
    await waitFor(() =>
      expect(screen.queryByTestId('node-detalhe')).not.toBeInTheDocument(),
    );
  });

  it('remover negado no confirmModal → nenhum DELETE', async () => {
    confirmModal.mockResolvedValueOnce(false);
    renderNode();
    fireEvent.click(await screen.findByTestId('node-remover'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    expect(Ontology.deleteNode).not.toHaveBeenCalled();
  });
});
