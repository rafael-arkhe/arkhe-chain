/**
 * /geo — atalho para o Construtor de Camadas na seção "Camadas de referência".
 *
 * Regra: o atalho só existe quando o operador PODE desenhar (perm
 * `security.geo.camada.manage`) E o app está instalado no tenant (Loja). Link
 * morto é pior que ausência de link — o operador clicaria e cairia no vazio.
 */
import { render, screen, waitFor } from '@testing-library/react';

let mockCanCamada = true;
jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: (perm: string) =>
    perm === 'security.geo.camada.manage' ? mockCanCamada : true,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({ confirmModal: jest.fn() }));
jest.mock('@/components/ui/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/api/geo', () => ({
  Geo: { nodeTypes: jest.fn(), nodes: jest.fn(), sources: jest.fn() },
}));
jest.mock('@/lib/api/cctv', () => ({ Cctv: { streams: { list: jest.fn() } } }));
jest.mock('@/lib/api', () => ({
  Alerts: { geofences: { list: jest.fn(), remove: jest.fn(), alerts: jest.fn() } },
}));
const mockWorkshopList = jest.fn();
jest.mock('@/lib/workshop/client', () => ({
  Workshop: { list: (...a: unknown[]) => mockWorkshopList(...a) },
}));
jest.mock('@/components/geo/geo-context', () => ({
  REF_LAYER_COLORS: {},
  useGeo: () => ({
    filters: { showCameras: false, showDetections: false, showGeofences: false, showAlerts: false },
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
    zones: [],
    reloadZones: jest.fn(),
    deleteZone: jest.fn(),
    importZones: jest.fn(),
    flyToRef: { current: jest.fn() },
    setSelected: jest.fn(),
  }),
}));

import { Cctv } from '@/lib/api/cctv';
import { PainelCamadas } from '@/components/geo/painel-camadas';

const APP = { id: 'app-uuid-1', external_id: 'construtor-camadas', display: 'Construtor de Camadas' };

beforeEach(() => {
  jest.clearAllMocks();
  mockCanCamada = true;
  (Cctv as unknown as { streams: { list: jest.Mock } }).streams.list.mockResolvedValue([]);
  mockWorkshopList.mockResolvedValue([APP]);
});

test('app instalado + perm → atalho aponta para o app', async () => {
  render(<PainelCamadas />);
  const link = await screen.findByTestId('abrir-construtor-camadas');
  expect(link).toHaveAttribute('href', '/workshop/view/app-uuid-1');
});

test('sem a perm de desenhar: nem consulta os apps, nem mostra atalho', async () => {
  mockCanCamada = false;
  render(<PainelCamadas />);
  await screen.findByTestId('camadas-referencia');
  await waitFor(() => expect(mockWorkshopList).not.toHaveBeenCalled());
  expect(screen.queryByTestId('abrir-construtor-camadas')).not.toBeInTheDocument();
});

test('app NÃO instalado: nada de link morto', async () => {
  mockWorkshopList.mockResolvedValue([
    { id: 'outro', external_id: 'painel-qualquer', display: 'Outro' },
  ]);
  render(<PainelCamadas />);
  await screen.findByTestId('camadas-referencia');
  await waitFor(() => expect(mockWorkshopList).toHaveBeenCalled());
  expect(screen.queryByTestId('abrir-construtor-camadas')).not.toBeInTheDocument();
});

test('falha ao listar apps não quebra o painel', async () => {
  mockWorkshopList.mockRejectedValue(new Error('offline'));
  render(<PainelCamadas />);
  expect(await screen.findByTestId('camadas-referencia')).toBeInTheDocument();
  expect(screen.queryByTestId('abrir-construtor-camadas')).not.toBeInTheDocument();
});
