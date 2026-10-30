/**
 * /GEO — Editar geocerca no painel-detalhe (2026-06-19).
 *
 * Certifica os gestos do operador no GeofenceDetalhe:
 *  1. severidade = SELECT (enumerado) → PATCH {severity};
 *  2. renomear via promptModal (texto livre, nunca prompt nativo) → PATCH {name};
 *  3. ativar/desativar → PATCH {active}; desativar passa por confirmModal;
 *  4. confirmModal negado ao desativar → nenhum PATCH;
 *  5. após PATCH, o painel reflete o objeto devolvido (não fica stale).
 *
 * O PATCH é gated por alerts.geofences.manage (useCan). O backend/SDK/avaliador
 * são certificados nos seus testes; aqui o foco é o gesto + o body do PATCH.
 */
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GeoProvider, useGeo } from '@/components/geo/geo-context';
import { PainelDetalheGeo } from '@/components/geo/painel-detalhe';
import type { AlertGeofence } from '@/lib/api/types';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock('@/components/cameras/hls-player', () => ({ HlsBadge: () => null, HlsPlayer: () => null }));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn().mockResolvedValue(true),
  promptModal: jest.fn().mockResolvedValue('Perímetro Sul'),
}));
jest.mock('@/components/ui/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/api/situational', () => ({
  Situational: { nearby: jest.fn(), correlations: jest.fn(), correlate: jest.fn(), cutCorrelation: jest.fn() },
}));
jest.mock('@/lib/api', () => ({
  Alerts: {
    geofences: {
      update: jest.fn(),
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
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));

const { Alerts } = jest.requireMock('@/lib/api');
const { confirmModal, promptModal } = jest.requireMock('@/components/dialog/confirm-dialog');

const FENCE: AlertGeofence = {
  id: 'gf-1',
  name: 'Perímetro Escola',
  shape: 'polygon',
  coordinates: [[-46.7, -23.5], [-46.5, -23.5], [-46.5, -23.7]],
  active: true,
  severity: 'high',
};

function SelectFence({ fence }: { fence: AlertGeofence }) {
  const { setSelected } = useGeo();
  useEffect(() => {
    setSelected({ kind: 'geofence', geofence: fence });
  }, [fence]);
  return null;
}

function renderDetalhe(fence: AlertGeofence = FENCE) {
  return render(
    <GeoProvider>
      <SelectFence fence={fence} />
      <PainelDetalheGeo />
    </GeoProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  confirmModal.mockResolvedValue(true);
  promptModal.mockResolvedValue('Perímetro Sul');
  Alerts.geofences.update.mockImplementation((id: string, changes: Record<string, unknown>) =>
    Promise.resolve({ ...FENCE, id, ...changes }),
  );
});

describe('GeofenceDetalhe — editar', () => {
  it('severidade via select → PATCH {severity}', async () => {
    renderDetalhe();
    const sel = await screen.findByTestId('detalhe-fence-severity');
    fireEvent.change(sel, { target: { value: 'critical' } });
    await waitFor(() =>
      expect(Alerts.geofences.update).toHaveBeenCalledWith('gf-1', { severity: 'critical' }),
    );
  });

  it('renomear via promptModal (nunca nativo) → PATCH {name}', async () => {
    renderDetalhe();
    fireEvent.click(await screen.findByTestId('detalhe-renomear-cerca'));
    await waitFor(() => expect(promptModal).toHaveBeenCalled());
    await waitFor(() =>
      expect(Alerts.geofences.update).toHaveBeenCalledWith('gf-1', { name: 'Perímetro Sul' }),
    );
  });

  it('renomear cancelado (promptModal null) → nenhum PATCH', async () => {
    promptModal.mockResolvedValueOnce(null);
    renderDetalhe();
    fireEvent.click(await screen.findByTestId('detalhe-renomear-cerca'));
    await waitFor(() => expect(promptModal).toHaveBeenCalled());
    expect(Alerts.geofences.update).not.toHaveBeenCalled();
  });

  it('desativar (ativa→inativa) passa por confirmModal → PATCH {active:false}', async () => {
    renderDetalhe();
    fireEvent.click(await screen.findByTestId('detalhe-toggle-ativa'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    await waitFor(() =>
      expect(Alerts.geofences.update).toHaveBeenCalledWith('gf-1', { active: false }),
    );
  });

  it('confirmModal negado ao desativar → nenhum PATCH', async () => {
    confirmModal.mockResolvedValueOnce(false);
    renderDetalhe();
    fireEvent.click(await screen.findByTestId('detalhe-toggle-ativa'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalled());
    expect(Alerts.geofences.update).not.toHaveBeenCalled();
  });

  it('ativar (inativa→ativa) NÃO pede confirmação → PATCH {active:true}', async () => {
    renderDetalhe({ ...FENCE, active: false });
    fireEvent.click(await screen.findByTestId('detalhe-toggle-ativa'));
    await waitFor(() =>
      expect(Alerts.geofences.update).toHaveBeenCalledWith('gf-1', { active: true }),
    );
    expect(confirmModal).not.toHaveBeenCalled();
  });

  it('após PATCH o painel reflete o nome novo (objeto devolvido, não stale)', async () => {
    Alerts.geofences.update.mockResolvedValueOnce({ ...FENCE, name: 'Perímetro Sul' });
    renderDetalhe();
    fireEvent.click(await screen.findByTestId('detalhe-renomear-cerca'));
    expect(await screen.findByText('Perímetro Sul')).toBeInTheDocument();
  });
});
