/**
 * Tarefa X — ExportModal REAL (server-side clip export).
 *
 * O modal antigo gerava comando ffmpeg pro operador copiar e rodar no
 * terminal — violação direta da regra "operador nunca roda shell".
 * Este guarda certifica o fluxo novo: escolher duração → Exportar →
 * processando → Baixar clipe (link autenticado via proxy) + sha256
 * (cadeia de custódia). E que NENHUM texto ffmpeg/copiar-comando voltou.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api/cctv', () => ({
  exportClip: jest.fn(),
  pollExport: jest.fn(),
  downloadUrl: (job: { download_url: string | null }) =>
    job.download_url ? `/api${job.download_url}` : null,
}));

import { exportClip, pollExport } from '@/lib/api/cctv';
import { ExportModal } from '@/components/cameras/export-modal';

const mockExport = exportClip as jest.Mock;
const mockPoll = pollExport as jest.Mock;

const STREAM = {
  id: 'st-1',
  name: 'Cam Tamoios KM 26',
  url: 'https://hls.example/cam.m3u8',
  latitude: null,
  longitude: null,
  country: null,
  city: null,
  status: 'online',
  source_type: null,
  detection_enabled: true,
  stream_metadata: {},
  tags: [],
  thumbnail_url: null,
};

const SHA = 'a'.repeat(64);

const DONE_JOB = {
  id: 'job-1',
  stream_id: 'st-1',
  status: 'done',
  duration_s: 15,
  sha256: SHA,
  error: null,
  download_url: '/api/v1/cctv/exports/job-1/download',
};

beforeEach(() => jest.clearAllMocks());

test('zero ffmpeg/copiar-comando/terminal no modal', () => {
  const { container } = render(<ExportModal stream={STREAM} onClose={() => {}} />);
  expect(container.textContent).not.toMatch(/ffmpeg/i);
  expect(container.textContent).not.toMatch(/copiar comando/i);
  expect(container.textContent).not.toMatch(/terminal/i);
  expect(container.querySelector('textarea')).toBeNull();
});

test('fluxo real: duração → Exportar → processando → Baixar + sha256', async () => {
  mockExport.mockResolvedValue({ ...DONE_JOB, status: 'queued', sha256: null, download_url: null });
  mockPoll.mockResolvedValue(DONE_JOB);

  render(<ExportModal stream={STREAM} onClose={() => {}} />);

  // duração 30s
  fireEvent.click(screen.getByTestId('export-dur-30'));
  fireEvent.click(screen.getByTestId('export-start'));

  await waitFor(() => expect(mockExport).toHaveBeenCalledWith('st-1', 30));
  await waitFor(() => expect(mockPoll).toHaveBeenCalledWith('job-1'));

  // pronto: link de download autenticado (via proxy /api) + sha256 exibido
  const link = await screen.findByTestId('export-download');
  expect(link).toHaveAttribute('href', '/api/api/v1/cctv/exports/job-1/download');
  expect(screen.getByTestId('export-sha')).toHaveTextContent(SHA);
});

test('falha do remux aparece como erro honesto', async () => {
  mockExport.mockResolvedValue({ ...DONE_JOB, status: 'queued', sha256: null, download_url: null });
  mockPoll.mockResolvedValue({
    ...DONE_JOB,
    status: 'failed',
    sha256: null,
    download_url: null,
    error: 'hls timeout: sem pacotes em 10s',
  });

  render(<ExportModal stream={STREAM} onClose={() => {}} />);
  fireEvent.click(screen.getByTestId('export-start'));

  const err = await screen.findByTestId('export-error');
  expect(err).toHaveTextContent('hls timeout');
  expect(screen.queryByTestId('export-download')).toBeNull();
});

test('erro do POST não trava o modal', async () => {
  mockExport.mockRejectedValue(new Error('missing permission: video.exports.create'));
  render(<ExportModal stream={STREAM} onClose={() => {}} />);
  fireEvent.click(screen.getByTestId('export-start'));
  const err = await screen.findByTestId('export-error');
  expect(err).toHaveTextContent('missing permission');
});

test('modo Gravação: envia from_ms/to_ms da seleção (posição atual + duração)', async () => {
  mockExport.mockResolvedValue({ ...DONE_JOB, status: 'queued', sha256: null, download_url: null });
  mockPoll.mockResolvedValue(DONE_JOB);

  const START = 1_000_000;
  render(
    <ExportModal stream={STREAM} recordingStartMs={START} onClose={() => {}} />,
  );

  fireEvent.click(screen.getByTestId('export-dur-30'));
  fireEvent.click(screen.getByTestId('export-start'));

  await waitFor(() =>
    expect(mockExport).toHaveBeenCalledWith('st-1', 30, {
      from_ms: START,
      to_ms: START + 30_000,
    }),
  );
  // sha continua exposto como hoje (cadeia de custódia)
  expect(await screen.findByTestId('export-sha')).toHaveTextContent(SHA);
  // o trecho selecionado é visível pro operador
  expect(screen.getByTestId('export-range')).toBeInTheDocument();
});

test('ao vivo (sem recordingStartMs): POST continua só com a duração', async () => {
  mockExport.mockResolvedValue({ ...DONE_JOB, status: 'queued', sha256: null, download_url: null });
  mockPoll.mockResolvedValue(DONE_JOB);
  render(<ExportModal stream={STREAM} onClose={() => {}} />);
  fireEvent.click(screen.getByTestId('export-start'));
  await waitFor(() => expect(mockExport).toHaveBeenCalledWith('st-1', 15));
  expect(screen.queryByTestId('export-range')).toBeNull();
});
