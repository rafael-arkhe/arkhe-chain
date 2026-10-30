/**
 * /GEO real — classificação por DADO, não hardcode (2026-06-12).
 *
 * O PageShell do /geo deixou de receber "OPERAÇÃO AURORA"/'confidencial'
 * fixos. Fontes reais (as MESMAS do banner do header):
 *  - nível  = banner.classification_default da config do app-shell do
 *    tenant; sem configuração → default honesto 'restrito';
 *  - rótulo = Operação ativa do operador (GET /me/context.project_name).
 */
import { render, screen, waitFor } from '@testing-library/react';
import GeoPage from '@/app/geo/page';
import { useClassification } from '@/lib/store';
// #12 — o rótulo (Operação/organização) agora vem do store COMPARTILHADO de
// /me/context (fetch RAW deduplicado), não mais de MeContextApi.get direto.
import { _meContextStore } from '@/lib/data/me-context-store';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const Stub = () => null;
    return Stub;
  },
}));
jest.mock('@/components/cameras/hls-player', () => ({
  HlsBadge: () => null,
  HlsPlayer: () => null,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/api/geo', () => ({
  Geo: {
    nodeTypes: jest.fn(),
    nodes: jest.fn(),
    // Camadas de referência — o geo-context as chama no mount; o mock antigo
    // não as tinha e quebrava o render inteiro antes da classificação.
    referenceLayers: jest.fn(),
    referenceLayer: jest.fn(),
  },
}));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn() }, detections: jest.fn() },
}));
jest.mock('@/lib/api', () => ({
  Alerts: {
    geofences: { list: jest.fn(), create: jest.fn(), remove: jest.fn(), alerts: jest.fn() },
  },
  MeContextApi: { get: jest.fn() },
}));

const APP_SHELL_CONFIG = {
  banner: { classification_default: 'confidencial' },
};
jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({ config: APP_SHELL_CONFIG, isPreview: false, loading: false }),
}));

const { Geo } = jest.requireMock('@/lib/api/geo');
const { Cctv } = jest.requireMock('@/lib/api/cctv');
const { Alerts, MeContextApi } = jest.requireMock('@/lib/api');

const CTX_HIDRA = {
  organization_id: 'org-1',
  organization_name: 'SSP',
  space_id: null,
  space_name: null,
  project_id: 'p-1',
  project_name: 'Operação Hidra',
};

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  _meContextStore._resetForTests();
  Geo.nodeTypes.mockResolvedValue({ node_types: [] });
  Geo.nodes.mockResolvedValue({ nodes: [], truncated: false });
  Geo.referenceLayers.mockResolvedValue({ layers: [] });
  Geo.referenceLayer.mockResolvedValue({ type: 'FeatureCollection', features: [] });
  Cctv.streams.list.mockResolvedValue([]);
  Cctv.detections.mockResolvedValue([]);
  Alerts.geofences.list.mockResolvedValue([]);
  Alerts.geofences.alerts.mockResolvedValue([]);
  // #12 — label vem do GET RAW /api/me/context (store compartilhado).
  fetchMock = jest.fn((url: string) => {
    if (String(url).includes('/api/me/context')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CTX_HIDRA) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  MeContextApi.get.mockResolvedValue(CTX_HIDRA);
  useClassification.getState().setContext('publico', '');
});

describe('/geo — classificação vem do contexto real', () => {
  it('nível = classification_default do tenant · rótulo = Operação ativa', async () => {
    render(<GeoPage />);
    await waitFor(() =>
      expect(useClassification.getState().label).toBe('OPERAÇÃO HIDRA'),
    );
    expect(useClassification.getState().level).toBe('confidencial');
  });

  it('sem Operação ativa → rótulo cai pra organização', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/me/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ...CTX_HIDRA, project_id: null, project_name: null }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    render(<GeoPage />);
    await waitFor(() => expect(useClassification.getState().label).toBe('SSP'));
  });

  it('hardcode morto: nada de OPERAÇÃO AURORA na tela', async () => {
    render(<GeoPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/me/context'));
    expect(screen.queryByText(/AURORA/)).not.toBeInTheDocument();
  });

  it('Exportar PNG real está no toolbar (Compartilhar/KML mortos)', async () => {
    render(<GeoPage />);
    expect(await screen.findByTestId('exportar-png')).toBeInTheDocument();
    expect(screen.queryByText(/Compartilhar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/KML/)).not.toBeInTheDocument();
  });
});
