/**
 * /cameras — gesto "Calibrar posição" + selo "Posição calibrada · ±X m".
 *
 * O GCP picker vive na página da câmera (onde o player e os gestos por
 * câmera já estão — detect-now/exportar/gravação): botão na toolbar gated
 * pela perm do PUT gcps (`security.cameras.manage`); o selo discreto vem do
 * GET gcps da câmera ATIVA (homography presente = calibrada) e o frame do
 * modal é o mais recente já arquivado pelas detecções (caminho mais barato).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: jest.fn(() => true),
}));
jest.mock('@/components/shell/page-shell', () => ({
  PageShell: ({
    toolbar,
    children,
  }: {
    toolbar?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-shell">
      <div data-testid="shell-toolbar">{toolbar}</div>
      {children}
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
jest.mock('@/components/cameras/register-camera-modal', () => ({
  RegisterCameraModal: () => <div data-testid="register-camera-modal" />,
}));
jest.mock('@/components/cameras/calibrate-modal', () => ({
  CalibrateModal: (props: { frameUrl: string | null }) => (
    <div data-testid="calibrate-modal" data-frame={String(props.frameUrl)} />
  ),
}));

jest.mock('@/lib/api/cctv', () => {
  const actual = jest.requireActual('@/lib/api/cctv');
  return {
    ...actual,
    Cctv: {
      ...actual.Cctv,
      streams: {
        list: jest.fn(),
        detections: jest.fn(),
        update: jest.fn(),
        detectNow: jest.fn(),
      },
      gcps: { get: jest.fn(), put: jest.fn(), remove: jest.fn() },
      bookmarks: { list: jest.fn().mockResolvedValue([]) },
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
        playlistUrl: jest.fn(() => ''),
      },
    },
  };
});

import { Cctv } from '@/lib/api/cctv';
import { useCan } from '@/lib/auth/useAuth';
import CamerasPage from '@/app/cameras/page';

const mList = Cctv.streams.list as jest.Mock;
const mDetections = Cctv.streams.detections as jest.Mock;
const mGcpsGet = (Cctv as unknown as { gcps: { get: jest.Mock } }).gcps.get;
const mUseCan = useCan as jest.Mock;

const STREAM = {
  id: 's1',
  name: 'Portaria Norte',
  url: 'https://example.org/s1.m3u8',
  latitude: -23.55,
  longitude: -46.64,
  country: 'BR',
  city: 'Sorocaba/SP',
  status: 'online',
  source_type: 'condominio',
  detection_enabled: true,
  stream_metadata: {},
  tags: [],
  thumbnail_url: null,
};

const CALIBRATED = {
  stream_id: 's1',
  gcps: [],
  homography: {
    matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    reproj_error_m: 1.5,
    n_gcps: 5,
    residual_meaningful: true,
    calibrated_at: '2026-06-12T10:00:00+00:00',
    calibrated_by: 'ferreira',
  },
};

/** Calibração mínima (4 GCPs): o erro ~0 é interpolação exata, não mede a
 *  marcação — o selo NUNCA mostra o número (±— em vez de ±0.0). */
const CALIBRATED_MINIMAL = {
  stream_id: 's1',
  gcps: [],
  homography: {
    matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    reproj_error_m: 0,
    n_gcps: 4,
    residual_meaningful: false,
    calibrated_at: '2026-06-12T10:00:00+00:00',
    calibrated_by: 'ferreira',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mUseCan.mockReturnValue(true);
  mList.mockResolvedValue([STREAM]);
  mDetections.mockResolvedValue([]);
  mGcpsGet.mockResolvedValue({ stream_id: 's1', gcps: [], homography: null });
});

test('câmera calibrada ganha o selo discreto com o erro em metros', async () => {
  mGcpsGet.mockResolvedValue(CALIBRATED);
  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');
  await waitFor(() => expect(mGcpsGet).toHaveBeenCalledWith('s1'));
  const badge = await screen.findByTestId('calibrated-badge');
  expect(badge.textContent).toContain('1.5');
});

test('calibração mínima (4 GCPs): selo mostra ±— em vez de ±0.0', async () => {
  mGcpsGet.mockResolvedValue(CALIBRATED_MINIMAL);
  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');
  const badge = await screen.findByTestId('calibrated-badge');
  expect(badge.textContent).toContain('±—');
  expect(badge.textContent).not.toContain('0.0');
});

test('descalibrada: SEM selo (estado honesto)', async () => {
  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');
  await waitFor(() => expect(mGcpsGet).toHaveBeenCalled());
  expect(screen.queryByTestId('calibrated-badge')).toBeNull();
});

test('botão Calibrar abre o modal com o frame mais recente das detecções', async () => {
  mDetections.mockResolvedValue([
    {
      id: 'd1',
      stream_id: 's1',
      kind: 'object',
      label: 'person',
      confidence: 0.9,
      t_start_ms: 0,
      t_end_ms: 0,
      bbox: null,
      metadata: { frame_url: 'https://files.example/f1.jpg' },
      detected_at: '2026-06-12T10:00:00+00:00',
      linked_entity_id: null,
    },
  ]);
  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');
  await waitFor(() => expect(mDetections).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('abrir-calibrar'));
  const modal = await screen.findByTestId('calibrate-modal');
  expect(modal.getAttribute('data-frame')).toBe('https://files.example/f1.jpg');
});

test('sem a perm security.cameras.manage o gesto NÃO aparece', async () => {
  mUseCan.mockImplementation((perm: string) => perm !== 'security.cameras.manage');
  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');
  expect(screen.queryByTestId('abrir-calibrar')).toBeNull();
});
