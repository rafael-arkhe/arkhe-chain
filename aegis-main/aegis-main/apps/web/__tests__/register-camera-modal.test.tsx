/**
 * Onda 2.1 — RegisterCameraModal: registrar câmera pela UI (fim do curl/shell).
 * Certificado ao vivo no browser; este guarda evita regressão.
 *
 * Tarefa D (2026-06-11) — "Testar stream" no onboarding: o operador valida a
 * URL ANTES de salvar. O teste roda na GPU (POST /api/v1/cctv/streams/test →
 * job camera_url frames=1 sem push) e a UI acompanha com o MESMO padrão de
 * poll/boot do detect-now (GPU inicializando/Processando). COMPLETED →
 * "Stream OK · WxH" (frame_size do output); FAILED → erro honesto (errors[0]).
 *
 * Onda 4 (2026-06-12) — onboarding completo no modal:
 *  - presets DINÂMICOS de GET /api/v1/cctv/presets (dropdown agrupado por
 *    concessionária; filtro multidomínio é do BACKEND) — zero hardcode;
 *  - "Descobertas na rede local" de GET /api/v1/edge/discovered (clicar
 *    pré-preenche url=suggested_url + nome sugerido);
 *  - picker de mapa (MapboxMap, prop ADITIVA onMapClick) seta lat/lng +
 *    reverse geocoding best-effort da cidade (falha silenciosa).
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { create: jest.fn(), test: jest.fn() }, presets: jest.fn() },
  pollDetectNow: jest.fn(),
}));
jest.mock('@/lib/api', () => ({ Edge: { discovered: jest.fn() } }));
// MapboxMap e CesiumPoints entram via next/dynamic(ssr:false) — no jest,
// troca pelo stub que expõe um botão disparando onMapClick (as superfícies
// reais são certificadas no browser, mesmo padrão dos testes de map-live).
// O loader é inspecionado por toString(): o path literal do import dinâmico
// sobrevive ao babel ('cesium-points' vs 'mapbox-map') e decide o stub.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: unknown) => {
    const React = require('react');
    const isCesium = String(loader).includes('cesium-points');
    if (isCesium) {
      return function MockCesiumPoints(props: {
        onMapClick?: (lat: number, lng: number) => void;
        points?: { id: string; lat: number; lng: number }[];
      }) {
        return React.createElement(
          'div',
          { 'data-testid': 'cesium-points', 'data-points': JSON.stringify(props.points ?? []) },
          React.createElement('button', {
            'data-testid': 'mock-globe-click',
            onClick: () => props.onMapClick?.(-23.62028, -45.41306),
          }),
        );
      };
    }
    return function MockMapboxMap(props: {
      onMapClick?: (lat: number, lng: number) => void;
      markers?: { id: string; lat: number; lng: number }[];
    }) {
      return React.createElement(
        'div',
        { 'data-testid': 'mapbox-map', 'data-markers': JSON.stringify(props.markers ?? []) },
        React.createElement('button', {
          'data-testid': 'mock-map-click',
          onClick: () => props.onMapClick?.(-23.62028, -45.41306),
        }),
      );
    };
  },
}));

import { Cctv, pollDetectNow } from '@/lib/api/cctv';
import { Edge } from '@/lib/api';
import { RegisterCameraModal } from '@/components/cameras/register-camera-modal';

const mockCreate = (Cctv as unknown as { streams: { create: jest.Mock } }).streams.create;
const mockTest = (Cctv as unknown as { streams: { test: jest.Mock } }).streams.test;
const mockPresets = (Cctv as unknown as { presets: jest.Mock }).presets;
const mockDiscovered = (Edge as unknown as { discovered: jest.Mock }).discovered;
const mockPoll = pollDetectNow as jest.Mock;

const SUBMIT_202 = {
  provider: 'runpod-gpu-conta',
  provider_id: 'p1',
  endpoint_id: 'e1',
  job_id: 'j1',
  push: false,
  status: 'submitted',
  poll: '/compute/vision/jobs/p1/e1/j1',
};

// Fixture = shape EXATO do contrato GET /api/v1/cctv/presets (Onda 4).
const PRESET_GROUPS = [
  {
    key: 'nova-tamoios',
    group: 'Nova Tamoios',
    domains: ['rodovias'],
    presets: [
      {
        key: 'sp123-km026b',
        name: 'SP-123 · Tamoios · KM 26 · Sentido B (Litoral → Capital)',
        url: 'https://34.104.32.249.nip.io/SP123-KM026B/stream.m3u8',
        latitude: -23.5215,
        longitude: -45.7679,
        city: 'Caraguatatuba/SP',
        country: 'BR',
        source_type: 'concessionaria-tamoios',
        detection_enabled: true,
        stream_metadata: { rodovia: 'SP-123', concessionaria: 'Tamoios', km: 26, sentido: 'B' },
        tags: ['rodovia', 'sp-123', 'tamoios'],
      },
    ],
  },
  {
    key: 'der-sp',
    group: 'DER-SP',
    domains: ['rodovias'],
    presets: [
      {
        key: 'sp055-km110a',
        name: 'SP-055 · Rio-Santos · KM 110 · Sentido A (Bertioga)',
        url: 'https://34.104.32.249.nip.io/SP055-KM110A/stream.m3u8',
        latitude: -23.8525,
        longitude: -45.9885,
        city: 'Bertioga/SP',
        country: 'BR',
        source_type: 'rodovia-sp',
        detection_enabled: true,
        stream_metadata: { rodovia: 'SP-055', km: 110, sentido: 'A' },
        tags: ['rodovia', 'sp-055', 'rio-santos'],
      },
    ],
  },
];

// Fixture = shape EXATO do contrato GET /api/v1/edge/discovered (Onda 4).
const DISCOVERED = [
  {
    edge_id: 'e-1',
    edge_name: 'Portaria',
    cameras: [
      {
        ip: '192.168.0.23',
        port: 3702,
        source: 'onvif',
        suggested_url: 'http://192.168.0.23/onvif/device_service',
        last_seen: '2026-06-12T10:00:00+00:00',
      },
      {
        ip: '192.168.0.40',
        port: 554,
        source: 'rtsp-port',
        suggested_url: 'rtsp://192.168.0.40:554/',
        last_seen: null,
      },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  // default honesto: catálogo vazio + nenhuma descoberta (seções ausentes)
  mockPresets.mockResolvedValue([]);
  mockDiscovered.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

// ── Onda 4 — presets dinâmicos (dropdown agrupado, zero hardcode) ───────────

test('preset do catálogo preenche TODOS os campos + Registrar envia stream_metadata/country', async () => {
  mockPresets.mockResolvedValue(PRESET_GROUPS);
  mockCreate.mockResolvedValue({ id: 's1', name: 'SP-123', url: 'x' });
  const onCreated = jest.fn();
  render(<RegisterCameraModal onClose={() => {}} onCreated={onCreated} />);

  // botão desabilitado sem nome/url
  expect(screen.getByTestId('reg-submit')).toBeDisabled();

  const select = (await screen.findByTestId('preset-select')) as HTMLSelectElement;
  // agrupado por concessionária (optgroup com o rótulo do grupo)
  const groups = select.querySelectorAll('optgroup');
  expect(Array.from(groups).map((g) => g.label)).toEqual(['Nova Tamoios', 'DER-SP']);

  fireEvent.change(select, { target: { value: 'sp123-km026b' } });

  expect((screen.getByTestId('reg-name') as HTMLInputElement).value).toContain('SP-123');
  expect((screen.getByTestId('reg-url') as HTMLInputElement).value).toContain('SP123-KM026B');
  expect((screen.getByTestId('reg-lat') as HTMLInputElement).value).toBe('-23.5215');
  expect((screen.getByTestId('reg-lng') as HTMLInputElement).value).toBe('-45.7679');
  expect((screen.getByTestId('reg-city') as HTMLInputElement).value).toBe('Caraguatatuba/SP');
  expect((screen.getByTestId('reg-source') as HTMLInputElement).value).toBe('concessionaria-tamoios');
  expect((screen.getByTestId('reg-tags') as HTMLInputElement).value).toContain('tamoios');
  expect(screen.getByTestId('reg-submit')).not.toBeDisabled();

  fireEvent.click(screen.getByTestId('reg-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  const body = mockCreate.mock.calls[0][0];
  expect(body.url).toContain('SP123-KM026B');
  expect(body.latitude).toBeCloseTo(-23.5215);
  expect(body.city).toBe('Caraguatatuba/SP');
  expect(body.country).toBe('BR');
  expect(body.stream_metadata).toMatchObject({ rodovia: 'SP-123', km: 26 });
  expect(body.tags).toContain('tamoios');
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
});

test('editar a URL manualmente após o preset descarta stream_metadata/country herdados', async () => {
  mockPresets.mockResolvedValue(PRESET_GROUPS);
  mockCreate.mockResolvedValue({ id: 's1' });
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);

  const select = await screen.findByTestId('preset-select');
  fireEvent.change(select, { target: { value: 'sp055-km110a' } });
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'rtsp://10.0.0.50:554/minha-camera' },
  });
  fireEvent.click(screen.getByTestId('reg-submit'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  const body = mockCreate.mock.calls[0][0];
  expect(body.stream_metadata).toBeUndefined();
  expect(body.country).toBeUndefined();
});

test('catálogo vazio (domínio do tenant sem presets) → seção de presets ausente', async () => {
  mockPresets.mockResolvedValue([]);
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  await waitFor(() => expect(mockPresets).toHaveBeenCalled());
  expect(screen.queryByTestId('preset-select')).toBeNull();
});

test('erro no GET de presets → seção ausente (sem quebrar o cadastro manual)', async () => {
  mockPresets.mockRejectedValue(new Error('403'));
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  await waitFor(() => expect(mockPresets).toHaveBeenCalled());
  expect(screen.queryByTestId('preset-select')).toBeNull();
  // cadastro manual segue vivo
  expect(screen.getByTestId('reg-url')).toBeInTheDocument();
});

// ── Onda 4 — descobertas na rede local (edge) ───────────────────────────────

test('descoberta clicada pré-preenche url=suggested_url + nome sugerido; fonte tem rótulo humano', async () => {
  mockDiscovered.mockResolvedValue(DISCOVERED);
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);

  const row = await screen.findByTestId('discovered-192.168.0.23-3702');
  // rótulo humano da fonte (i18n key, nunca o valor técnico cru "onvif")
  expect(row.textContent).toContain('cameras.sourceOnvif');
  const row2 = screen.getByTestId('discovered-192.168.0.40-554');
  expect(row2.textContent).toContain('cameras.sourceRtspPort');
  expect(row2.textContent).not.toContain('rtsp-port');

  fireEvent.click(row);
  expect((screen.getByTestId('reg-url') as HTMLInputElement).value).toBe(
    'http://192.168.0.23/onvif/device_service',
  );
  expect((screen.getByTestId('reg-name') as HTMLInputElement).value).toBe(
    'cameras.discoveredName 192.168.0.23',
  );
});

test('sem descobertas → seção ausente', async () => {
  mockDiscovered.mockResolvedValue([{ edge_id: 'e-1', edge_name: '', cameras: [] }]);
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  await waitFor(() => expect(mockDiscovered).toHaveBeenCalled());
  expect(screen.queryByTestId('discovered-section')).toBeNull();
});

test('erro no GET de descobertas → aviso honesto, sem lista', async () => {
  mockDiscovered.mockRejectedValue(new Error('500'));
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  expect(await screen.findByTestId('discovered-error')).toHaveTextContent(
    'cameras.discoveredError',
  );
  expect(screen.queryByTestId('discovered-section')).toBeNull();
});

// ── Onda 4 — picker de mapa (onMapClick + reverse geocoding best-effort) ────

test('clique no mapa seta lat/lng e o reverse geocoding preenche a cidade', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'tok-teste';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      features: [{ text: 'Caraguatatuba', context: [{ id: 'region.9', short_code: 'BR-SP' }] }],
    }),
  }) as unknown as typeof fetch;

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  fireEvent.click(await screen.findByTestId('mock-map-click'));

  expect((screen.getByTestId('reg-lat') as HTMLInputElement).value).toBe('-23.62028');
  expect((screen.getByTestId('reg-lng') as HTMLInputElement).value).toBe('-45.41306');
  await waitFor(() =>
    expect((screen.getByTestId('reg-city') as HTMLInputElement).value).toBe('Caraguatatuba/SP'),
  );
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('api.mapbox.com/geocoding/v5/mapbox.places/-45.41306,-23.62028.json'),
  );
});

test('geocoding fora → falha SILENCIOSA (lat/lng setados, cidade manual preservada)', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'tok-teste';
  global.fetch = jest.fn().mockRejectedValue(new Error('rede fora')) as unknown as typeof fetch;

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  fireEvent.change(screen.getByTestId('reg-city'), { target: { value: 'Minha Cidade' } });
  fireEvent.click(await screen.findByTestId('mock-map-click'));

  expect((screen.getByTestId('reg-lat') as HTMLInputElement).value).toBe('-23.62028');
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect((screen.getByTestId('reg-city') as HTMLInputElement).value).toBe('Minha Cidade');
});

test('editar lat/lng nos inputs move o marker do mapa', async () => {
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  const map = await screen.findByTestId('mapbox-map');
  expect(JSON.parse(map.getAttribute('data-markers') || '[]')).toHaveLength(0);

  fireEvent.change(screen.getByTestId('reg-lat'), { target: { value: '-23.5' } });
  fireEvent.change(screen.getByTestId('reg-lng'), { target: { value: '-46.6' } });
  const markers = JSON.parse(
    screen.getByTestId('mapbox-map').getAttribute('data-markers') || '[]',
  );
  expect(markers).toHaveLength(1);
  expect(markers[0]).toMatchObject({ lat: -23.5, lng: -46.6 });
});

// ── paridade dual-surface — picker 2D (Mapbox) ↔ 3D (Cesium) ────────────────

test('picker abre em 2D (default analítico) com alternância 2D/3D visível', async () => {
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  expect(await screen.findByTestId('mapbox-map')).toBeInTheDocument();
  expect(screen.queryByTestId('cesium-points')).toBeNull();
  expect(screen.getByTestId('map-mode-2d')).toBeInTheDocument();
  expect(screen.getByTestId('map-mode-3d')).toBeInTheDocument();
});

test('alternar pra 3D troca a superfície; clique no globo seta lat/lng (mesmo contrato)', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = ''; // geocoding silencioso (no-op)
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);

  fireEvent.click(screen.getByTestId('map-mode-3d'));
  expect(await screen.findByTestId('cesium-points')).toBeInTheDocument();
  expect(screen.queryByTestId('mapbox-map')).toBeNull();

  fireEvent.click(screen.getByTestId('mock-globe-click'));
  expect((screen.getByTestId('reg-lat') as HTMLInputElement).value).toBe('-23.62028');
  expect((screen.getByTestId('reg-lng') as HTMLInputElement).value).toBe('-45.41306');
});

test('em 3D, editar lat/lng nos inputs move o ponto do globo; voltar pra 2D preserva', async () => {
  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);

  fireEvent.click(screen.getByTestId('map-mode-3d'));
  const globe = await screen.findByTestId('cesium-points');
  expect(JSON.parse(globe.getAttribute('data-points') || '[]')).toHaveLength(0);

  fireEvent.change(screen.getByTestId('reg-lat'), { target: { value: '-23.5' } });
  fireEvent.change(screen.getByTestId('reg-lng'), { target: { value: '-46.6' } });
  const points = JSON.parse(
    screen.getByTestId('cesium-points').getAttribute('data-points') || '[]',
  );
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ lat: -23.5, lng: -46.6 });

  // de volta pro 2D: mesma posição vira marker do Mapbox
  fireEvent.click(screen.getByTestId('map-mode-2d'));
  const markers = JSON.parse(
    (await screen.findByTestId('mapbox-map')).getAttribute('data-markers') || '[]',
  );
  expect(markers[0]).toMatchObject({ lat: -23.5, lng: -46.6 });
});

test('alternância 3D + reverse geocoding best-effort preenche a cidade', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'tok-teste';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      features: [{ text: 'Caraguatatuba', context: [{ id: 'region.9', short_code: 'BR-SP' }] }],
    }),
  }) as unknown as typeof fetch;

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  fireEvent.click(screen.getByTestId('map-mode-3d'));
  fireEvent.click(await screen.findByTestId('mock-globe-click'));

  await waitFor(() =>
    expect((screen.getByTestId('reg-city') as HTMLInputElement).value).toBe('Caraguatatuba/SP'),
  );
});

// ── erro de criação (inalterado) ────────────────────────────────────────────

test('erro do backend aparece e não fecha', async () => {
  mockPresets.mockResolvedValue(PRESET_GROUPS);
  mockCreate.mockRejectedValue(new Error('sem permissão'));
  const onCreated = jest.fn();
  render(<RegisterCameraModal onClose={() => {}} onCreated={onCreated} />);
  const select = await screen.findByTestId('preset-select');
  fireEvent.change(select, { target: { value: 'sp055-km110a' } });
  fireEvent.click(screen.getByTestId('reg-submit'));
  expect(await screen.findByTestId('reg-error')).toHaveTextContent('sem permissão');
  expect(onCreated).not.toHaveBeenCalled();
});

// ── Tarefa D — "Testar stream" ──────────────────────────────────────────────

test('Testar stream: desabilitado sem URL; com URL chama o POST certo e mostra o boot', async () => {
  mockTest.mockResolvedValue(SUBMIT_202);
  mockPoll.mockResolvedValue({ status: 'IN_QUEUE', delay_ms: 5000 });
  jest.useFakeTimers();

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);

  // sem URL → botão desabilitado
  expect(screen.getByTestId('testar-stream')).toBeDisabled();

  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'rtsp://10.0.0.9/cam1' },
  });
  expect(screen.getByTestId('testar-stream')).not.toBeDisabled();

  fireEvent.click(screen.getByTestId('testar-stream'));
  await waitFor(() => expect(mockTest).toHaveBeenCalledWith('rtsp://10.0.0.9/cam1'));

  // 202 aceito → fase de boot (GPU fria leva minutos; a UI só acompanha)
  const status = await screen.findByTestId('stream-test-status');
  await waitFor(() => expect(status.textContent).toMatch(/provedores\.testBooting/));

  // botão não dispara teste duplicado durante o boot
  expect(screen.getByTestId('testar-stream')).toBeDisabled();

  // 1º poll (4s) usa o submit retornado (path `poll` do contrato)
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });
  await waitFor(() => expect(mockPoll).toHaveBeenCalledWith(SUBMIT_202));
  expect(screen.getByTestId('stream-test-status').textContent).toMatch(
    /provedores\.testBooting/,
  );
});

test('COMPLETED com frame_size → "Stream OK · WxH"', async () => {
  mockTest.mockResolvedValue(SUBMIT_202);
  mockPoll.mockResolvedValue({
    status: 'COMPLETED',
    count: 0,
    frame_size: [1280, 720],
  });
  jest.useFakeTimers();

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'https://cam.example/stream.m3u8' },
  });
  fireEvent.click(screen.getByTestId('testar-stream'));
  await screen.findByTestId('stream-test-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  const ok = await screen.findByTestId('stream-test-ok');
  expect(ok.textContent).toMatch(/cameras\.streamOk/);
  expect(ok.textContent).toMatch(/1280×720/);
  // terminou → botão liberado de novo
  expect(screen.getByTestId('testar-stream')).not.toBeDisabled();
});

test('FAILED → erro honesto do job (errors[0])', async () => {
  mockTest.mockResolvedValue(SUBMIT_202);
  mockPoll.mockResolvedValue({
    status: 'FAILED',
    errors: ['falha ao abrir camera_url: connection timed out'],
  });
  jest.useFakeTimers();

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'rtsp://morta.example/x' },
  });
  fireEvent.click(screen.getByTestId('testar-stream'));
  await screen.findByTestId('stream-test-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  const err = await screen.findByTestId('stream-test-error');
  expect(err.textContent).toMatch(/falha ao abrir camera_url: connection timed out/);
});

test('FAILED sem errors[] cai no error do job', async () => {
  mockTest.mockResolvedValue(SUBMIT_202);
  mockPoll.mockResolvedValue({ status: 'FAILED', error: 'camera stream unreachable' });
  jest.useFakeTimers();

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'rtsp://morta.example/x' },
  });
  fireEvent.click(screen.getByTestId('testar-stream'));
  await screen.findByTestId('stream-test-status');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4100);
  });

  const err = await screen.findByTestId('stream-test-error');
  expect(err.textContent).toMatch(/camera stream unreachable/);
});

test('erro no próprio POST (ex.: 409 sem provedor) → mensagem honesta', async () => {
  mockTest.mockRejectedValue(new Error('sem provedor RunPod habilitado neste tenant'));

  render(<RegisterCameraModal onClose={() => {}} onCreated={() => {}} />);
  fireEvent.change(screen.getByTestId('reg-url'), {
    target: { value: 'rtsp://10.0.0.9/cam1' },
  });
  fireEvent.click(screen.getByTestId('testar-stream'));

  const err = await screen.findByTestId('stream-test-error');
  expect(err.textContent).toMatch(/sem provedor RunPod habilitado/);
});

// ── higiene Onda 4: zero preset hardcodado no componente ────────────────────

test('higiene: nenhum preset hardcodado restou no componente', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(process.cwd(), 'components/cameras/register-camera-modal.tsx'),
    'utf8',
  );
  expect(src).not.toContain('SP123-KM026B');
  expect(src).not.toContain('SP055-KM110A');
  expect(src).not.toContain('const PRESETS');
});
