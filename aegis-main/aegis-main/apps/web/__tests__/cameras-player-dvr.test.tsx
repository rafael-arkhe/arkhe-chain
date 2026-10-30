/**
 * /cameras — player OPERACIONAL: nenhum controle decorativo sobrevive.
 *
 * Invariantes:
 *  - Pausar/Reproduzir chama o video DE VERDADE via ref do HlsPlayer e o
 *    ícone segue o estado REAL (eventos play/pause), não um boolean solto;
 *  - Voltar 10s = seek real; em AO VIVO fica DESABILITADO (title honesto)
 *    até existir janela de buffer atrás da posição;
 *  - velocidades setam playbackRate real; o destaque segue o ratechange
 *    REAL do video;
 *  - modo Gravação (DVR): alternância visível só com coverage; carrega a
 *    playlist VOD da API no MESMO HlsPlayer; seletor de janela 1h/6h/24h;
 *  - timeline real: marcadores por detected_at, bookmarks distintos,
 *    coverage sombreada;
 *  - bookmarks: criar via promptModal (NUNCA prompt nativo) + remover via
 *    confirmModal; POST/DELETE reais no client.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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
jest.mock('@/components/cameras/hls-player', () => {
  const ReactM = require('react');
  const handle = {
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    seekBy: jest.fn(),
    setRate: jest.fn(),
    getCurrentTime: jest.fn(() => 0),
    getSeekable: jest.fn(() => null),
  };
  const state: { props: Record<string, unknown> | null; handle: typeof handle } = {
    props: null,
    handle,
  };
  const HlsPlayer = ReactM.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      state.props = props;
      ReactM.useImperativeHandle(ref, () => handle);
      return ReactM.createElement('div', {
        'data-testid': 'hls-player',
        'data-url': props.url,
      });
    },
  );
  return { __esModule: true, HlsPlayer, HlsBadge: () => null, __playerMock: state };
});
jest.mock('@/components/cameras/lpr-overlay', () => ({ LprOverlay: () => null }));
jest.mock('@/components/cameras/mosaic-view', () => ({ MosaicView: () => null }));
jest.mock('@/components/cameras/heatmap-modal', () => ({ HeatmapModal: () => null }));
jest.mock('@/components/cameras/export-modal', () => ({ ExportModal: () => null }));
jest.mock('@/components/cameras/register-camera-modal', () => ({
  RegisterCameraModal: () => null,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  promptModal: jest.fn(),
  confirmModal: jest.fn(),
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
        test: jest.fn(),
      },
      recordings: {
        coverage: jest.fn(),
        playlistUrl: actual.Cctv.recordings.playlistUrl,
      },
      recording: {
        status: jest.fn(),
        control: jest.fn(),
      },
      bookmarks: {
        list: jest.fn(),
        create: jest.fn(),
        remove: jest.fn(),
      },
    },
  };
});

import { Cctv } from '@/lib/api/cctv';
import { promptModal, confirmModal } from '@/components/dialog/confirm-dialog';
import * as playerModule from '@/components/cameras/hls-player';
import CamerasPage from '@/app/cameras/page';

const playerMock = (playerModule as unknown as {
  __playerMock: {
    props: Record<string, any> | null;
    handle: Record<string, jest.Mock>;
  };
}).__playerMock;

const STREAM = {
  id: 'st-1',
  name: 'Cam Portão',
  url: 'https://cam.example/live.m3u8',
  latitude: null,
  longitude: null,
  country: null,
  city: 'Caraguatatuba',
  status: 'online',
  source_type: 'hls',
  detection_enabled: true,
  stream_metadata: {},
  tags: [],
  thumbnail_url: null,
};

const NOW = Date.now();
const COVERAGE_OK = {
  stream_id: 'st-1',
  from_ms: NOW - 3_600_000,
  to_ms: NOW,
  coverage: [{ t_start_ms: NOW - 1_800_000, t_end_ms: NOW - 600_000 }],
  segments_count: 200,
  bytes_total: 1024,
};
const BOOKMARK = {
  id: 'b1',
  stream_id: 'st-1',
  camera_node_id: 'cam-node-1',
  t_ms: NOW - 900_000,
  t_end_ms: null,
  label: 'portão',
  severity: null,
  created_by: 'ferreira',
  created_at: new Date(NOW - 900_000).toISOString(),
  signed_hash: 'h'.repeat(64),
};
const DETECTION = {
  id: 'd9',
  stream_id: 'st-1',
  kind: 'lpr',
  label: 'ABC1D23',
  confidence: 0.91,
  t_start_ms: 0,
  t_end_ms: 0,
  bbox: null,
  metadata: {},
  detected_at: new Date(NOW - 1_200_000).toISOString(),
  linked_entity_id: null,
};

const mocked = Cctv as unknown as {
  streams: Record<string, jest.Mock>;
  recordings: { coverage: jest.Mock; playlistUrl: (id: string, f: number, t: number) => string };
  recording: Record<string, jest.Mock>;
  bookmarks: Record<string, jest.Mock>;
};

beforeEach(() => {
  jest.clearAllMocks();
  playerMock.props = null;
  mocked.streams.list.mockResolvedValue([STREAM]);
  mocked.recording.status.mockResolvedValue({
    active: false,
    cadence: null,
    agent_id: null,
    last_run_at: null,
    segments_24h: 0,
    bytes_24h: 0,
  });
  mocked.streams.detections.mockResolvedValue([DETECTION]);
  mocked.recordings.coverage.mockResolvedValue(COVERAGE_OK);
  mocked.bookmarks.list.mockResolvedValue([BOOKMARK]);
  mocked.bookmarks.create.mockResolvedValue({ ...BOOKMARK, id: 'b2', label: 'novo evento' });
  mocked.bookmarks.remove.mockResolvedValue(undefined);
});

async function renderPage() {
  render(<CamerasPage />);
  await screen.findByTestId('hls-player');
  return screen.getByTestId('hls-player');
}

test('Pausar chama video.pause() real e o ícone segue o estado REAL', async () => {
  await renderPage();
  const btn = await screen.findByTestId('player-playpause');
  expect(btn).toHaveAttribute('aria-label', 'Pausar');
  fireEvent.click(btn);
  expect(playerMock.handle.pause).toHaveBeenCalledTimes(1);
  // o estado do botão NÃO muda sozinho — segue o evento real do <video>
  act(() => playerMock.props!.onPlayState?.(false));
  expect(screen.getByTestId('player-playpause')).toHaveAttribute('aria-label', 'Reproduzir');
  fireEvent.click(screen.getByTestId('player-playpause'));
  expect(playerMock.handle.play).toHaveBeenCalledTimes(1);
});

test('Voltar 10s: desabilitado AO VIVO sem janela; habilita com buffer e faz seek real', async () => {
  await renderPage();
  const back = await screen.findByTestId('player-back10');
  expect(back).toBeDisabled();
  expect(back).toHaveAttribute('title');
  act(() =>
    playerMock.props!.onTime?.({ currentTime: 120, seekableStart: 60, seekableEnd: 125 }),
  );
  await waitFor(() => expect(screen.getByTestId('player-back10')).toBeEnabled());
  fireEvent.click(screen.getByTestId('player-back10'));
  expect(playerMock.handle.seekBy).toHaveBeenCalledWith(-10);
});

test('velocidades setam playbackRate real e o destaque segue o valor REAL', async () => {
  await renderPage();
  const r2 = await screen.findByTestId('player-rate-2');
  expect(screen.getByTestId('player-rate-1').className).toContain('bg-primary');
  fireEvent.click(r2);
  expect(playerMock.handle.setRate).toHaveBeenCalledWith(2);
  // destaque NÃO muda no clique — muda no ratechange real
  expect(screen.getByTestId('player-rate-2').className).not.toContain('bg-primary');
  act(() => playerMock.props!.onRate?.(2));
  expect(screen.getByTestId('player-rate-2').className).toContain('bg-primary');
});

test('sem coverage → alternância de Gravação NÃO aparece (nada decorativo)', async () => {
  mocked.recordings.coverage.mockResolvedValue({ ...COVERAGE_OK, coverage: [] });
  await renderPage();
  await waitFor(() => expect(mocked.recordings.coverage).toHaveBeenCalled());
  expect(screen.queryByTestId('mode-dvr')).toBeNull();
});

test('modo Gravação carrega a playlist VOD da API no MESMO HlsPlayer', async () => {
  const player = await renderPage();
  const dvrBtn = await screen.findByTestId('mode-dvr');
  fireEvent.click(dvrBtn);
  await waitFor(() =>
    expect(screen.getByTestId('hls-player').getAttribute('data-url')).toContain(
      '/recordings/playlist.m3u8?from_ms=',
    ),
  );
  expect(player.getAttribute('data-url')).toContain('/api/api/v1/cctv/streams/st-1/');
  // voltar pro ao vivo restaura a URL original
  fireEvent.click(screen.getByTestId('mode-live'));
  await waitFor(() =>
    expect(screen.getByTestId('hls-player').getAttribute('data-url')).toBe(STREAM.url),
  );
});

test('seletor de janela 1h/6h/24h re-consulta coverage com a janela certa', async () => {
  await renderPage();
  await waitFor(() => expect(mocked.recordings.coverage).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('window-6h'));
  await waitFor(() => {
    const calls = mocked.recordings.coverage.mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('st-1');
    expect(last[2] - last[1]).toBe(6 * 3_600_000);
  });
});

test('timeline real: detecção por detected_at + bookmark + coverage sombreada', async () => {
  await renderPage();
  expect(await screen.findByTestId('timeline-detection-d9')).toBeInTheDocument();
  expect(await screen.findByTestId('timeline-bookmark-b1')).toBeInTheDocument();
  expect(await screen.findByTestId('timeline-coverage-0')).toBeInTheDocument();
});

test('Marcar momento: promptModal (nunca prompt nativo) → POST real', async () => {
  (promptModal as jest.Mock).mockResolvedValue('novo evento');
  await renderPage();
  fireEvent.click(await screen.findByTestId('bookmark-add'));
  await waitFor(() =>
    expect(mocked.bookmarks.create).toHaveBeenCalledWith(
      'st-1',
      expect.objectContaining({ label: 'novo evento', t_ms: expect.any(Number) }),
    ),
  );
  expect(promptModal).toHaveBeenCalled();
});

test('remover bookmark: confirmModal → DELETE real; cancelar não deleta', async () => {
  (confirmModal as jest.Mock).mockResolvedValueOnce(false);
  await renderPage();
  const item = await screen.findByTestId('bookmark-item-b1');
  expect(item).toHaveTextContent('portão');
  fireEvent.click(screen.getByTestId('bookmark-remove-b1'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  expect(mocked.bookmarks.remove).not.toHaveBeenCalled();
  (confirmModal as jest.Mock).mockResolvedValueOnce(true);
  fireEvent.click(screen.getByTestId('bookmark-remove-b1'));
  await waitFor(() => expect(mocked.bookmarks.remove).toHaveBeenCalledWith('b1'));
});
