/**
 * /geo — clique na câmera da lista VOA até ela (gap d do Sprint 7).
 *
 * Causa-raiz consertada: o item da câmera no PainelCamadas era um <li> com
 * <span> estático — NUNCA teve onClick (as cercas ganharam o botão com
 * flyToRef + setSelected; as câmeras não). Clicar no nome não selecionava
 * nem voava nada.
 *
 * Invariantes:
 *  - câmera COM lat/lng → flyTo(lat, lng, alt) + setSelected({kind:'stream'});
 *  - câmera SEM coordenada → NÃO voa (nunca voo pra (0,0) inventado), mas
 *    ainda seleciona (painel de detalhe mostra o estado honesto).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/api/geo', () => ({
  Geo: { nodeTypes: jest.fn(), nodes: jest.fn() },
}));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn() } },
}));
jest.mock('@/lib/api', () => ({
  Alerts: {
    geofences: { list: jest.fn(), remove: jest.fn(), alerts: jest.fn() },
  },
}));

const mockFlyTo = jest.fn();
const mockSetSelected = jest.fn();
jest.mock('@/components/geo/geo-context', () => ({
  useGeo: () => ({
    filters: {
      showCameras: true,
      showDetections: false,
      showGeofences: true,
      showAlerts: false,
    },
    setFilters: jest.fn(),
    isFullscreen: false,
    nodeTypes: [],
    activeTypes: [],
    toggleNodeType: jest.fn(),
    layerNodes: {},
    truncatedTypes: [],
    referenceLayers: [],
    activeReferenceLayers: [],
    referenceGeoJSON: {},
    toggleReferenceLayer: jest.fn(),
    referenceRendered: {},
    geofences: [],
    reloadGeofences: jest.fn(),
    pendingAlerts: [],
    materializedCorrelations: [],
    flyToRef: { current: mockFlyTo },
    setSelected: mockSetSelected,
  }),
}));

import { Cctv } from '@/lib/api/cctv';
import { PainelCamadas } from '@/components/geo/painel-camadas';

const mList = (Cctv as unknown as { streams: { list: jest.Mock } }).streams.list;

const CAM_GEO = {
  id: 's1',
  name: 'Portaria Norte',
  url: 'https://example.org/s1.m3u8',
  latitude: -23.55,
  longitude: -46.64,
  status: 'online',
  detection_enabled: true,
  tags: [],
};
const CAM_SEM_GEO = {
  id: 's2',
  name: 'Corredor B',
  url: 'https://example.org/s2.m3u8',
  latitude: null,
  longitude: null,
  status: 'offline',
  detection_enabled: false,
  tags: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mList.mockResolvedValue([CAM_GEO, CAM_SEM_GEO]);
});

test('clique na câmera com coordenada VOA (flyTo) e seleciona o stream', async () => {
  render(<PainelCamadas />);
  const btn = await screen.findByTestId('camera-s1');
  fireEvent.click(btn);
  expect(mockFlyTo).toHaveBeenCalledTimes(1);
  expect(mockFlyTo).toHaveBeenCalledWith(-23.55, -46.64, expect.any(Number));
  expect(mockSetSelected).toHaveBeenCalledWith({ kind: 'stream', stream: CAM_GEO });
});

test('câmera SEM lat/lng: seleciona mas NÃO voa (nunca destino inventado)', async () => {
  render(<PainelCamadas />);
  const btn = await screen.findByTestId('camera-s2');
  fireEvent.click(btn);
  expect(mockFlyTo).not.toHaveBeenCalled();
  expect(mockSetSelected).toHaveBeenCalledWith({
    kind: 'stream',
    stream: CAM_SEM_GEO,
  });
});

test('regressão: as DUAS câmeras listadas na seção', async () => {
  render(<PainelCamadas />);
  await waitFor(() => expect(mList).toHaveBeenCalled());
  expect(await screen.findByTestId('camera-s1')).toBeTruthy();
  expect(screen.getByTestId('camera-s2')).toBeTruthy();
});
