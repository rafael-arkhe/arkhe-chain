/**
 * Análise multidomínio hospedada da câmera (2026-06-16).
 *
 * Modal que roda um modelo PRÉ-TREINADO hospedado (Roboflow serverless,
 * GPU-free) sobre o último quadro arquivado da câmera; o backend lê os bytes
 * do acervo e faz POST-bytes. Cada predição vira Event governado.
 *
 * Invariantes cobertos:
 *  - lista os domínios (GET /domains) no mount e popula o seletor;
 *  - SOBERANIA: o botão "Analisar na nuvem" fica DESABILITADO até o opt-in
 *    explícito de egress ser marcado (nunca egressa em silêncio);
 *  - submeter chama Cctv.multidomain.detect com allow_cloud_egress=true +
 *    frame_object (caminho POST-bytes), e mostra o resultado REAL;
 *  - sem quadro arquivado → estado honesto + botão desabilitado (nada roda).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
}));
jest.mock('@/components/ui/toast', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/api/cctv', () => ({
  __esModule: true,
  Cctv: { multidomain: { domains: jest.fn(), detect: jest.fn() } },
}));

import { Cctv } from '@/lib/api/cctv';
import { MultidomainModal } from '@/components/cameras/multidomain-modal';

const domainsFn = Cctv.multidomain.domains as jest.Mock;
const detectFn = Cctv.multidomain.detect as jest.Mock;

const DOMAINS = [
  {
    domain: 'fogo_fumaca', domain_label: 'Fogo / fumaça', workspace_project: 'x/y',
    endpoint: 'https://serverless/x/3', version: '3', type: 'object-detection',
    classes: ['fire', 'smoke'], has_hosted_model: true, license: 'CC BY 4.0',
    commercial_ok: true, data_egress: 'roboflow_cloud', recommended_use: 'demo-eval',
    metric: { map: 52.89 }, is_replacement: true, coverage_note: 'fogo + fumaça (FASDD)',
    live_verified_at: '2026-06-16',
  },
];

beforeEach(() => {
  domainsFn.mockReset();
  detectFn.mockReset();
  domainsFn.mockResolvedValue({ domains: DOMAINS });
});

test('lista domínios no mount e exige opt-in de soberania antes de analisar', async () => {
  detectFn.mockResolvedValue({
    ok: true, domain: 'fogo_fumaca', status: 200, predictions: 1, events: ['ev-1'],
    model: 'x/3', data_egress: 'roboflow_cloud', recommended_use: 'demo-eval',
    is_replacement: true, coverage_note: 'fogo + fumaça (FASDD)', error: null,
  });

  render(
    <MultidomainModal streamName="Cam 1" streamId="stream-1" frameObject="deadbeef.jpg" onClose={() => {}} />,
  );

  // domínios carregados (GET /domains chamado)
  await waitFor(() => expect(domainsFn).toHaveBeenCalledTimes(1));
  await screen.findByDisplayValue('Fogo / fumaça');

  const runBtn = screen.getByTestId('multidomain-run') as HTMLButtonElement;
  // SOBERANIA: travado sem o opt-in
  expect(runBtn.disabled).toBe(true);

  fireEvent.click(screen.getByTestId('multidomain-optin'));
  expect(runBtn.disabled).toBe(false);

  fireEvent.click(runBtn);
  await waitFor(() => expect(detectFn).toHaveBeenCalledTimes(1));
  // o egress vai com opt-in explícito + frame por POST-bytes (frame_object) +
  // o stream id (backend resolve o nó Camera e geo-ancora o Event)
  expect(detectFn).toHaveBeenCalledWith({
    domain: 'fogo_fumaca', frame_object: 'deadbeef.jpg',
    camera_stream_id: 'stream-1', allow_cloud_egress: true,
  });
  await screen.findByTestId('multidomain-result');
});

test('sem quadro arquivado: estado honesto e análise bloqueada', async () => {
  render(<MultidomainModal streamName="Cam 2" streamId="stream-2" frameObject={null} onClose={() => {}} />);
  await waitFor(() => expect(domainsFn).toHaveBeenCalled());

  expect(screen.getByTestId('multidomain-noframe')).toBeInTheDocument();
  // mesmo marcando o opt-in, sem frame não roda
  fireEvent.click(screen.getByTestId('multidomain-optin'));
  expect((screen.getByTestId('multidomain-run') as HTMLButtonElement).disabled).toBe(true);
  expect(detectFn).not.toHaveBeenCalled();
});
