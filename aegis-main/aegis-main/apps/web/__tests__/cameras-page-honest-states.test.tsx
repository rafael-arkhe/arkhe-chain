/**
 * Tarefa E (2026-06-11) — /cameras SEM fallback fake.
 *
 * O fallback fabricado (placas ABC1D23/XYZ9A87, face pes-001, "arma
 * sugerida") renderizava como dado REAL. Este guarda prova que:
 *  1. backend fora → estado de ERRO honesto (i18n) + "Tentar novamente",
 *     e NENHUMA detecção/stream fictícia no DOM;
 *  2. zero câmeras → EMPTY STATE com CTA "Registrar câmera" que abre o
 *     modal existente;
 *  3. higiene de código: ABC1D23 / FALLBACK_CCTV / "modo demo" sumiram
 *     dos arquivos de produto (client, página e painéis).
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
    subtitle,
    toolbar,
    children,
  }: {
    subtitle?: React.ReactNode;
    toolbar?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-shell">
      <div data-testid="shell-subtitle">{subtitle}</div>
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

import { Cctv } from '@/lib/api/cctv';
import CamerasPage from '@/app/cameras/page';

const mList = Cctv.streams.list as jest.Mock;
const mDetections = Cctv.streams.detections as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mDetections.mockResolvedValue([]);
});

test('backend fora → estado de erro honesto, sem placa/detecção fictícia', async () => {
  mList.mockRejectedValue(new Error('fetch failed'));
  render(<CamerasPage />);

  const err = await screen.findByTestId('cameras-error');
  expect(err).toHaveTextContent('Backend indisponível');

  // NENHUM dado fabricado renderizado como real
  expect(document.body.textContent).not.toContain('ABC1D23');
  expect(document.body.textContent).not.toContain('arma sugerida');
  expect(document.body.textContent).not.toContain('modo demo');
  expect(screen.queryByTestId('stream-card-fb-sp123-026b')).toBeNull();
  expect(screen.queryByTestId('stream-card-fb-sp055-110a')).toBeNull();

  // ação honesta: tentar de novo recarrega a lista
  mList.mockResolvedValue([]);
  fireEvent.click(screen.getByTestId('cameras-retry'));
  await screen.findByTestId('cameras-empty');
  expect(mList).toHaveBeenCalledTimes(2);
});

test('zero câmeras → empty state honesto SEM CTA de registro (§C C5: provisionamento é do gestor em /dados)', async () => {
  mList.mockResolvedValue([]);
  render(<CamerasPage />);

  const empty = await screen.findByTestId('cameras-empty');
  expect(empty).toHaveTextContent('Nenhuma câmera registrada');

  // §C C5 — "Registrar câmera" saiu de /cameras: sem botão de registro e sem
  // modal aqui (o cadastro vive na seção Câmeras de /painel-de-controle/dados).
  expect(screen.queryByTestId('cameras-empty-register')).toBeNull();
  expect(screen.queryByTestId('abrir-registrar-camera')).toBeNull();
  expect(screen.queryByTestId('register-camera-modal')).toBeNull();
});

test('com câmeras reais a lista renderiza sem rótulos de fallback', async () => {
  mList.mockResolvedValue([
    {
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
    },
  ]);
  render(<CamerasPage />);

  await screen.findByTestId('stream-card-s1');
  expect(document.body.textContent).not.toContain('fallback');
  expect(document.body.textContent).not.toContain('modo demo');
});

test('higiene: dados fabricados sumiram do código de produto', () => {
  const root = path.join(__dirname, '..');
  const files = [
    'lib/api/cctv.ts',
    'app/cameras/page.tsx',
    'components/painel/cameras-prioritarias.tsx',
    'components/painel/alertas-destaque.tsx',
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    expect(src).not.toMatch(/ABC1D23/);
    expect(src).not.toMatch(/FALLBACK_CCTV/);
    expect(src).not.toMatch(/modo demo/);
  }
});
