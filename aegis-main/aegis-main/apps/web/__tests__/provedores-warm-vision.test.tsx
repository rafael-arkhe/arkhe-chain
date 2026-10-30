/**
 * Onda 2.1 — PistaPanel: aquecimento + teste de detecção com boot SEM timeout.
 *
 * Invariantes da UI (certificadas ao vivo no browser; este guarda evita regressão):
 *  - toggle "Manter aquecida" chama Compute.visionWarm(true) e mostra o aviso de custo;
 *  - "Testar detecção" submete async (visionJobSubmit) e POLLA (visionJobStatus)
 *    mostrando "GPU inicializando · Xs" — nunca estoura/erra no cold-start.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

jest.mock('@/lib/api', () => ({
  Compute: {
    list: jest.fn(), catalog: jest.fn(), create: jest.fn(), update: jest.fn(),
    remove: jest.fn(), test: jest.fn(),
    listReleases: jest.fn(), listEndpoints: jest.fn(), deleteEndpoint: jest.fn(),
    visionWarm: jest.fn(), visionJobSubmit: jest.fn(), visionJobStatus: jest.fn(),
  },
}));

import { Compute } from '@/lib/api';
import { ProvedoresWorkspace } from '@/components/dados/provedores-workspace';

const mc = Compute as unknown as Record<string, jest.Mock>;

const runpodRow = {
  id: 'rp1', slug: 'runpod-gpu-conta', display_name: 'RunPod GPU', vendor: 'runpod',
  provider_kind: 'cloud_gpu', base_url: 'https://api.runpod.ai/v2/ep1', country: 'US',
  jurisdictions: ['US'], capabilities: ['detect'], cert_metadata: {}, pricing_hint: null,
  enabled: true, has_credential: true, validation_status: 'valid', created_at: '2026-06-10T00:00:00Z',
};
const catalog = { vendors: [], capabilities: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mc.list.mockResolvedValue([runpodRow]);
  mc.catalog.mockResolvedValue(catalog);
  mc.listReleases.mockResolvedValue({ releases: [] });
  mc.listEndpoints.mockResolvedValue({ endpoints: [{ id: 'ep1', name: 'svc-x', workersMin: 0 }] });
  mc.visionWarm.mockResolvedValue({ endpoint_id: 'ep1', warm: true, workers_min: 1 });
});

async function openPista() {
  render(<ProvedoresWorkspace />);
  await screen.findByText('RunPod GPU');
  fireEvent.click(screen.getByTestId('pista-toggle-runpod-gpu-conta'));
  await screen.findByTestId('warm-panel-runpod-gpu-conta');
}

test('warm toggle chama visionWarm(true) e mostra aviso de custo', async () => {
  await openPista();
  expect(screen.getByText('provedores.warmCost')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('warm-toggle-runpod-gpu-conta'));
  await waitFor(() => expect(mc.visionWarm).toHaveBeenCalledWith(true, 'runpod-gpu-conta'));
});

test('testar detecção submete async e mostra boot incrementando (sem timeout)', async () => {
  mc.visionJobSubmit.mockResolvedValue({
    provider_id: 'rp1', provider: 'runpod-gpu-conta', endpoint_id: 'ep1',
    job_id: 'job1', status: 'IN_QUEUE',
  });
  // sempre IN_QUEUE (boot) — prova que a UI segue mostrando progresso, não erra.
  mc.visionJobStatus.mockResolvedValue({ status: 'IN_QUEUE', delay_ms: 5000 });
  jest.useFakeTimers();
  try {
    await openPista();
    fireEvent.click(screen.getByTestId('endpoint-test-runpod-gpu-conta'));
    await waitFor(() => expect(mc.visionJobSubmit).toHaveBeenCalled());
    // avança o 1º poll (4s)
    await act(async () => { await jest.advanceTimersByTimeAsync(4100); });
    await waitFor(() => expect(mc.visionJobStatus).toHaveBeenCalled());
    const status = await screen.findByTestId('endpoint-test-status-runpod-gpu-conta');
    expect(status.textContent).toMatch(/provedores\.testBooting/);
  } finally {
    jest.useRealTimers();
  }
});
