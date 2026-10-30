/**
 * Tarefa E (2026-06-11) — "Detectar agora" em /cameras.
 *
 * Contrato (backend Tarefa D): POST /api/v1/cctv/streams/{id}/detect-now →
 * 202 {provider, provider_id, endpoint_id, job_id, push, status, poll}; o
 * `poll` é o MESMO path de status do /compute/vision/jobs (sem /api/v1).
 *
 * Invariantes:
 *  - clique no botão (data-testid="detectar-agora") chama o POST do stream
 *    ativo e mostra o boot assíncrono ("GPU inicializando · Xs") — mesmo
 *    padrão do provedores-workspace, sem timeout no cold-start;
 *  - COMPLETED → banner discreto com N objetos + destino (push/job);
 *  - FAILED → mensagem honesta de erro;
 *  - client: detectNow envia o body do contrato; pollDetectNow consulta o
 *    path `poll` retornado (reuso do client de vision jobs).
 *
 * Tarefa W (validação ao vivo 2026-06-11) — poll resiliente:
 *  - IN_QUEUE com workers.throttled>0 e ready+initializing+running==0 →
 *    banner "provedor de GPU sem capacidade" (mantendo o elapsed);
 *  - EXPIRED / PROVIDER_ERROR → erro honesto + botão "Tentar novamente"
 *    que RE-SUBMETE o job;
 *  - elapsed é wall-clock (Date.now() - startedAt) — não atrasa quando os
 *    timers da aba são throttled fora de foco.
 */
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
        // a página monta o RecordingControl — GET de estado mockado inerte
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
    },
  };
});

import { Cctv, pollDetectNow } from '@/lib/api/cctv';
import CamerasPage from '@/app/cameras/page';

const mList = Cctv.streams.list as jest.Mock;
const mDetections = Cctv.streams.detections as jest.Mock;
const mDetectNow = Cctv.streams.detectNow as jest.Mock;
const mPoll = pollDetectNow as jest.Mock;

const STREAM = {
  id: 's1',
  name: 'Portaria Norte',
  url: 'https://example.org/s1.m3u8',
  latitude: null,
  longitude: null,
  country: 'BR',
  city: 'Sorocaba/SP',
  status: 'online',
  source_type: 'condominio',
  detection_enabled: true,
  stream_metadata: {},
  tags: [],
  thumbnail_url: null,
};

const SUBMIT_202 = {
  provider: 'runpod-gpu-conta',
  provider_id: 'p1',
  endpoint_id: 'e1',
  job_id: 'j1',
  push: true,
  status: 'submitted',
  poll: '/compute/vision/jobs/p1/e1/j1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mList.mockResolvedValue([STREAM]);
  mDetections.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

test('clique em detectar-agora chama o POST do stream ativo e mostra o boot', async () => {
  mDetectNow.mockResolvedValue(SUBMIT_202);
  mPoll.mockResolvedValue({ status: 'IN_QUEUE', delay_ms: 5000 });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await waitFor(() => expect(mDetectNow).toHaveBeenCalledWith('s1'));

  // 202 aceito → fase de boot (GPU fria leva minutos; a UI só acompanha)
  const status = await screen.findByTestId('detect-status');
  await waitFor(() => expect(status.textContent).toMatch(/GPU inicializando/));

  // botão não dispara job duplicado durante o boot
  expect(screen.getByTestId('detectar-agora')).toBeDisabled();

  // 1º poll (4s) usa o submit retornado (path `poll` do contrato)
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });
  await waitFor(() => expect(mPoll).toHaveBeenCalledWith(SUBMIT_202));
  expect(screen.getByTestId('detect-status').textContent).toMatch(/GPU inicializando/);
});

test('COMPLETED → banner com N objetos e destino push', async () => {
  mDetectNow.mockResolvedValue(SUBMIT_202);
  mPoll.mockResolvedValue({ status: 'COMPLETED', count: 3, execution_ms: 1200 });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await screen.findByTestId('detect-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  await waitFor(() =>
    expect(screen.getByTestId('detect-status').textContent).toMatch(
      /3 objetos detectados/,
    ),
  );
  // push=true → as detecções aparecem via polling normal da lista
  expect(screen.getByTestId('detect-status').textContent).toMatch(/enviadas/);
  // terminou → botão liberado de novo
  expect(screen.getByTestId('detectar-agora')).not.toBeDisabled();
});

test('FAILED → mensagem honesta de erro do job', async () => {
  mDetectNow.mockResolvedValue({ ...SUBMIT_202, push: false });
  mPoll.mockResolvedValue({ status: 'FAILED', error: 'camera stream unreachable' });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await screen.findByTestId('detect-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  await waitFor(() =>
    expect(screen.getByTestId('detect-status').textContent).toMatch(
      /camera stream unreachable/,
    ),
  );
});

test('IN_QUEUE + só workers throttled → banner de provedor sem capacidade (com elapsed)', async () => {
  mDetectNow.mockResolvedValue(SUBMIT_202);
  mPoll.mockResolvedValue({
    status: 'IN_QUEUE',
    delay_ms: 5000,
    workers: { ready: 0, initializing: 0, running: 0, throttled: 1, idle: 0 },
  });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await screen.findByTestId('detect-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  await waitFor(() =>
    expect(screen.getByTestId('detect-status').textContent).toMatch(
      /sem capacidade no momento/,
    ),
  );
  // mantém o elapsed no banner
  expect(screen.getByTestId('detect-status').textContent).toMatch(/\d+s/);
});

test('IN_QUEUE com worker subindo → banner normal de boot (não "sem capacidade")', async () => {
  mDetectNow.mockResolvedValue(SUBMIT_202);
  mPoll.mockResolvedValue({
    status: 'IN_QUEUE',
    workers: { ready: 0, initializing: 1, running: 0, throttled: 1 },
  });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await screen.findByTestId('detect-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  await waitFor(() =>
    expect(screen.getByTestId('detect-status').textContent).toMatch(
      /GPU inicializando/,
    ),
  );
  expect(screen.getByTestId('detect-status').textContent).not.toMatch(
    /sem capacidade/,
  );
});

test('EXPIRED → erro honesto + "Tentar novamente" re-submete o job', async () => {
  mDetectNow.mockResolvedValue(SUBMIT_202);
  mPoll.mockResolvedValue({ status: 'EXPIRED' });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await screen.findByTestId('detect-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  await waitFor(() =>
    expect(screen.getByTestId('detect-status').textContent).toMatch(/expirou/),
  );
  const retry = screen.getByTestId('detect-retry');
  fireEvent.click(retry);
  await waitFor(() => expect(mDetectNow).toHaveBeenCalledTimes(2));
});

test('PROVIDER_ERROR → erro honesto do provedor + "Tentar novamente"', async () => {
  mDetectNow.mockResolvedValue(SUBMIT_202);
  mPoll.mockResolvedValue({ status: 'PROVIDER_ERROR', error: 'vendor 502' });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await screen.findByTestId('detect-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  await waitFor(() =>
    expect(screen.getByTestId('detect-status').textContent).toMatch(
      /provedor de GPU falhou/,
    ),
  );
  expect(screen.getByTestId('detect-status').textContent).toMatch(/vendor 502/);
  expect(screen.getByTestId('detect-retry')).toBeInTheDocument();
});

test('elapsed é wall-clock — não atrasa quando os timers ficam throttled', async () => {
  mDetectNow.mockResolvedValue(SUBMIT_202);
  mPoll.mockResolvedValue({ status: 'IN_QUEUE' });
  jest.useFakeTimers();

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  await screen.findByTestId('detect-status');

  // aba fora de foco: o relógio anda 10min sem NENHUM tick de timer;
  // ao voltar, 1 único tick deve mostrar o tempo REAL decorrido.
  await act(async () => {
    jest.setSystemTime(Date.now() + 600_000);
    await jest.advanceTimersByTimeAsync(1000);
  });

  const text = screen.getByTestId('detect-status').textContent || '';
  const m = text.match(/(\d+)s/);
  expect(m).not.toBeNull();
  expect(Number(m![1])).toBeGreaterThanOrEqual(600);
});

test('erro no próprio POST (ex.: 409 sem provedor) → mensagem honesta', async () => {
  mDetectNow.mockRejectedValue(new Error('sem provedor RunPod habilitado neste tenant'));

  render(<CamerasPage />);
  await screen.findByTestId('stream-card-s1');

  fireEvent.click(screen.getByTestId('detectar-agora'));
  const status = await screen.findByTestId('detect-status');
  await waitFor(() =>
    expect(status.textContent).toMatch(/sem provedor RunPod habilitado/),
  );
});

describe('client real (sem mock do módulo)', () => {
  const real = jest.requireActual('@/lib/api/cctv') as typeof import('@/lib/api/cctv');

  afterEach(() => {
    // @ts-expect-error — limpa o stub global
    delete global.fetch;
  });

  test('detectNow → POST /api/v1/cctv/streams/{id}/detect-now com body do contrato', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => SUBMIT_202,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const out = await real.Cctv.streams.detectNow('abc', {
      frames: 8,
      frame_stride: 12,
      push: false,
    });
    expect(out).toEqual(SUBMIT_202);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/api/v1/cctv/streams/abc/detect-now');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ frames: 8, frame_stride: 12, push: false });
  });

  test('pollDetectNow consulta o path `poll` do submit (mesmo do vision jobs)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'COMPLETED', count: 2 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const st = await real.pollDetectNow(SUBMIT_202);
    expect(st.status).toBe('COMPLETED');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/compute/vision/jobs/p1/e1/j1');
  });

  test('pollDetectNow reconstrói o path quando `poll` falta', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'IN_QUEUE' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await real.pollDetectNow({ ...SUBMIT_202, poll: '' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/compute/vision/jobs/p1/e1/j1');
  });
});
