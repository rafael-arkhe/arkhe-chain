/**
 * Toolbar do /cameras equilibrada PELO TIPO da câmera (tags) — 2026-09-11.
 *
 * Câmera de contagem (`bc-ready`, vertical LR4) NÃO caça placa: sem
 * "Placas procuradas" e sem análise multidomínio — o gesto dela é
 * "Calibrar linha" (desenho no frame). Câmera OCR não mostra hotlist.
 * LPR (detection_enabled, sem tag especial) mantém TODOS os gestos.
 *
 * Perms mockadas LIGADAS em todos os casos: o que some aqui é por TIPO,
 * não por permissão — regressão do "Placas procuradas aparecendo em
 * câmera de OCR/CON".
 */
import { render, screen, act } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => true,
}));
jest.mock('@/components/shell/page-shell', () => ({
  PageShell: ({
    toolbar,
  }: {
    toolbar?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-shell">
      <div data-testid="shell-toolbar">{toolbar}</div>
    </div>
  ),
}));
jest.mock('@/components/cameras/hls-player', () => ({
  HlsPlayer: () => <div data-testid="hls-player" />,
  HlsBadge: () => <span />,
}));
jest.mock('@/components/cameras/lpr-overlay', () => ({ LprOverlay: () => null }));
jest.mock('@/components/cameras/mosaic-view', () => ({ MosaicView: () => null }));
jest.mock('@/components/cameras/heatmap-modal', () => ({ HeatmapModal: () => null }));
jest.mock('@/components/cameras/export-modal', () => ({ ExportModal: () => null }));
jest.mock('@/components/cameras/calibrate-modal', () => ({
  CalibrateModal: () => <div data-testid="calibrate-modal" />,
}));
jest.mock('@/components/cameras/line-calibrate-modal', () => ({
  LineCalibrateModal: () => <div data-testid="line-calibrate-modal" />,
}));
jest.mock('@/components/cameras/multidomain-modal', () => ({
  MultidomainModal: () => <div data-testid="multidomain-modal" />,
}));

jest.mock('@/lib/api/cctv', () => {
  const actual = jest.requireActual('@/lib/api/cctv');
  return {
    ...actual,
    pollDetectNow: jest.fn(),
    Cctv: {
      ...actual.Cctv,
      detections: jest.fn(),
      streams: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        detections: jest.fn(),
        detectNow: jest.fn(),
      },
      recording: {
        status: jest.fn().mockResolvedValue({
          active: false,
          cadence: null,
          agent_id: null,
          last_run_at: null,
          segments_24h: 0,
          bytes_24h: 0,
        }),
        control: jest.fn(),
      },
      recordings: {
        coverage: jest.fn().mockResolvedValue({ coverage: [] }),
      },
      gcps: { get: jest.fn().mockResolvedValue({ gcps: [], homography: null }), put: jest.fn(), remove: jest.fn() },
      bookmarks: { list: jest.fn().mockResolvedValue([]), create: jest.fn(), remove: jest.fn() },
    },
  };
});

import { Cctv } from '@/lib/api/cctv';
import CamerasPage from '@/app/cameras/page';

const mList = Cctv.streams.list as jest.Mock;

function stream(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 's1',
    name: 'Linha Sacária 01',
    url: 'http://contagem-sacos:8050/v1/ao-vivo',
    latitude: null,
    longitude: null,
    country: 'BR',
    city: 'Itapetininga/SP',
    status: 'online',
    source_type: 'contagem-sacos',
    detection_enabled: false,
    stream_metadata: {},
    tags: [],
    thumbnail_url: null,
    ...overrides,
  } as never;
}

test('câmera CON (bc-ready): sem hotlist, sem multidomínio; com Calibrar linha', async () => {
  mList.mockResolvedValue([
    stream({ tags: ['contagem-sacos', 'bc-ready', 'industrial'] }),
  ]);
  await act(async () => {
    render(<CamerasPage />);
  });
  const toolbar = screen.getByTestId('shell-toolbar');
  expect(toolbar.querySelector('[data-testid="abrir-linha"]')).not.toBeNull();
  expect(toolbar.querySelector('[data-testid="cam-ops-hotlist-btn"]')).toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-multidominio"]')).toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-calibrar"]')).toBeNull();
  // gestos universais seguem no ar
  expect(toolbar.querySelector('[data-testid="detectar-agora"]')).not.toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-exportar"]')).not.toBeNull();
});

test('câmera OCR: sem hotlist; com multidomínio e Calibrar posição', async () => {
  mList.mockResolvedValue([
    stream({ tags: ['ocr'], name: 'Guichê Doc' }),
  ]);
  await act(async () => {
    render(<CamerasPage />);
  });
  const toolbar = screen.getByTestId('shell-toolbar');
  expect(toolbar.querySelector('[data-testid="cam-ops-hotlist-btn"]')).toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-multidominio"]')).not.toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-calibrar"]')).not.toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-linha"]')).toBeNull();
});

test('câmera LPR (detection_enabled): hotlist de volta; sem linha', async () => {
  mList.mockResolvedValue([
    stream({ detection_enabled: true, tags: [], name: 'Portaria Norte' }),
  ]);
  await act(async () => {
    render(<CamerasPage />);
  });
  const toolbar = screen.getByTestId('shell-toolbar');
  expect(toolbar.querySelector('[data-testid="cam-ops-hotlist-btn"]')).not.toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-multidominio"]')).not.toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-calibrar"]')).not.toBeNull();
  expect(toolbar.querySelector('[data-testid="abrir-linha"]')).toBeNull();
});
