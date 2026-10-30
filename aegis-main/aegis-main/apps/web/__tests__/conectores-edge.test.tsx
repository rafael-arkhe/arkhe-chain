/**
 * Tarefa B (2026-06-11) — AEGIS Edge na central de Conectores.
 *
 * Cobre: lista renderiza os estados derivados (online/offline/revogado) e o
 * selo "Atualização disponível"; "Parear novo Edge" gera o código (POST
 * pairing-codes) e exibe código em destaque + expiração + copiar; Revogar
 * confirma via confirmModal (nunca diálogo nativo) e chama o endpoint; sem
 * connectors.manage a seção inteira não existe; a central
 * (ConectoresWorkspace) embute a seção.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { EdgeSection } from '@/components/dados/edge-section';
import { ConectoresWorkspace } from '@/components/dados/conectores-workspace';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ actions }: any) => <div>{actions}</div>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: jest.fn() }));
jest.mock('@/lib/api', () => ({
  Edge: { nodes: jest.fn(), createPairingCode: jest.fn(), revoke: jest.fn() },
  Connectors: {
    list: jest.fn(), register: jest.fn(), test: jest.fn(), run: jest.fn(),
    schedulerTick: jest.fn(), syncPreview: jest.fn(), update: jest.fn(),
    runs: jest.fn(), retryRun: jest.fn(),
  },
  Skills: { catalog: jest.fn() },
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Markings: { list: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));

const { Edge, Connectors, Skills, Ontology, Markings } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
  Connectors: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
};
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog') as {
  confirmModal: jest.Mock;
};
const { useCan } = jest.requireMock('@/lib/auth/useAuth') as { useCan: jest.Mock };

const AGORA = Date.now();
// Onda 4 (débito 3c): erro completo da API (≤160) — a UI trunca por CSS e
// carrega o texto INTEIRO no title= (tooltip nativo do navegador).
const ERRO_LONGO =
  'cam-7: rtsp timeout depois de 20s no stream da doca — verifique o cabo e a fonte da camera';
const NODES = {
  expected_version: '1.2.0',
  nodes: [
    {
      edge_id: 'e-online', name: 'Portaria Norte', status: 'online', version: '1.2.0',
      last_seen_at: new Date(AGORA - 30_000).toISOString(),
      update_available: false, cameras_ok: 3,
      diagnostics_summary: {
        selftest_ok: true, selftest_persons: 4, last_error: null,
        loop_restarts_total: 0, uptime_seconds: 3724,
      },
    },
    {
      // nunca conectou: resumo todo nulo → a linha de diagnóstico NEM aparece
      edge_id: 'e-offline', name: 'Garagem', status: 'paired', version: '',
      last_seen_at: null, update_available: false, cameras_ok: null,
      diagnostics_summary: {
        selftest_ok: null, selftest_persons: null, last_error: null,
        loop_restarts_total: 0, uptime_seconds: null,
      },
    },
    {
      edge_id: 'e-revoked', name: 'Antigo', status: 'revoked', version: '1.0.0',
      last_seen_at: new Date(AGORA - 86_400_000 * 3).toISOString(),
      update_available: false, cameras_ok: 0,
      diagnostics_summary: null,
    },
    {
      edge_id: 'e-update', name: 'Bloco B', status: 'online', version: '1.1.0',
      last_seen_at: new Date(AGORA - 120_000).toISOString(),
      update_available: true, cameras_ok: 1,
      diagnostics_summary: {
        selftest_ok: false, selftest_persons: 0, last_error: ERRO_LONGO,
        loop_restarts_total: 3, uptime_seconds: 99,
      },
    },
    {
      // staleness DERIVADA pelo backend (Tarefa A2): status 'offline' vindo
      // do servidor prevalece mesmo com last_seen dentro da janela local.
      // Sem diagnostics_summary (payload legado em cache): tolerado.
      edge_id: 'e-stale', name: 'Depósito', status: 'offline', version: '1.2.0',
      last_seen_at: new Date(AGORA - 60_000).toISOString(),
      update_available: false, cameras_ok: 2,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useCan.mockReturnValue(true);
  confirmModal.mockResolvedValue(true);
  Edge.nodes.mockResolvedValue(NODES);
  Edge.createPairingCode.mockResolvedValue({
    code: 'ABCD-2345',
    expires_at: new Date(AGORA + 600_000).toISOString(),
    label: '',
  });
  Edge.revoke.mockResolvedValue({ edge_id: 'e-online', status: 'revoked', revoked: true });
  Connectors.list.mockResolvedValue([]);
  Skills.catalog.mockResolvedValue([]);
  Ontology.listNodeTypes.mockResolvedValue([]);
  Markings.list.mockResolvedValue([]);
});

it('lista renderiza online/offline/revogado, versão, last_seen humanizado e câmeras', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-online');

  expect(screen.getByTestId('edge-status-e-online')).toHaveTextContent('edge.status.online');
  // 'paired' (credencial emitida, aparelho nunca reportou) tem badge PRÓPRIO:
  // não é offline (nunca deveria ter reportado ainda) nem online.
  expect(screen.getByTestId('edge-status-e-offline')).toHaveTextContent('edge.status.paired');
  expect(screen.getByTestId('edge-status-e-stale')).toHaveTextContent('edge.status.offline');
  expect(screen.getByTestId('edge-status-e-revoked')).toHaveTextContent('edge.status.revoked');

  // nome + ficha técnica (versão / câmeras ok como pares rótulo→valor)
  expect(screen.getByTestId('edge-card-e-online')).toHaveTextContent('Portaria Norte');
  expect(screen.getByTestId('edge-version-e-online')).toHaveTextContent('1.2.0');
  expect(screen.getByTestId('edge-cameras-e-online')).toHaveTextContent('3');
  // last_seen humanizado: recente → "agora mesmo"; nunca → "nunca conectou"
  expect(screen.getByTestId('edge-card-e-online')).toHaveTextContent('edge.last_seen.now');
  expect(screen.getByTestId('edge-card-e-offline')).toHaveTextContent('edge.last_seen.never');
});

it('offline derivado pelo backend renderiza mesmo com last_seen recente', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-stale');
  // o servidor já derivou 'offline' (3× heartbeat) — a UI respeita, sem
  // "promover" pra online só porque o last_seen está na janela local
  expect(screen.getByTestId('edge-status-e-stale')).toHaveTextContent('edge.status.offline');
});

it('linha de diagnóstico: selftest ok/falha, reinícios e último erro com title completo', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-online');

  // selftest OK + reinícios na linha mono discreta
  const diagOk = screen.getByTestId('edge-diag-e-online');
  expect(diagOk).toHaveTextContent('edge.diag.selftest.ok');
  expect(diagOk).toHaveTextContent('edge.diag.restarts');
  expect(screen.queryByTestId('edge-diag-error-e-online')).toBeNull();

  // selftest FALHO + erro truncado por CSS com o texto INTEIRO no title=
  const diagFail = screen.getByTestId('edge-diag-e-update');
  expect(diagFail).toHaveTextContent('edge.diag.selftest.fail');
  const err = screen.getByTestId('edge-diag-error-e-update');
  expect(err).toHaveAttribute('title', ERRO_LONGO);
  expect(err).toHaveTextContent('cam-7: rtsp timeout');
});

it('edge mudo (resumo nulo) ou payload legado sem resumo não mostram a linha', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-offline');
  // resumo todo nulo (nunca conectou) → sem linha (zero ruído)
  expect(screen.queryByTestId('edge-diag-e-offline')).toBeNull();
  // diagnostics_summary ausente (cache legado) → tolerado, sem linha
  expect(screen.queryByTestId('edge-diag-e-stale')).toBeNull();
  // null explícito → idem
  expect(screen.queryByTestId('edge-diag-e-revoked')).toBeNull();
});

it('selo "Atualização disponível" aparece só quando update_available', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-update');
  expect(screen.getByTestId('edge-update-e-update')).toHaveTextContent('edge.update_available');
  expect(screen.queryByTestId('edge-update-e-online')).toBeNull();
});

it('Parear novo Edge gera o código e exibe código + expiração + instrução + copiar', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-online');

  fireEvent.click(screen.getByTestId('edge-pair'));
  await waitFor(() => expect(Edge.createPairingCode).toHaveBeenCalled());

  const modal = await screen.findByTestId('edge-pair-modal');
  expect(modal).toBeInTheDocument();
  expect(screen.getByTestId('edge-pair-code')).toHaveTextContent('ABCD-2345');
  expect(screen.getByTestId('edge-pair-expiry')).toHaveTextContent('edge.pair.expires_in');
  expect(modal).toHaveTextContent('edge.pair.instruction');

  fireEvent.click(screen.getByTestId('edge-pair-copy'));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABCD-2345'));
});

it('Revogar confirma via confirmModal (destrutivo) e chama o endpoint; cancelar não chama', async () => {
  confirmModal.mockResolvedValueOnce(false);
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-online');

  fireEvent.click(screen.getByTestId('edge-revoke-e-online'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  expect(confirmModal.mock.calls[0][0]).toMatchObject({ tone: 'danger' });
  expect(Edge.revoke).not.toHaveBeenCalled();

  confirmModal.mockResolvedValueOnce(true);
  fireEvent.click(screen.getByTestId('edge-revoke-e-online'));
  await waitFor(() => expect(Edge.revoke).toHaveBeenCalledWith('e-online'));
  // lista é recarregada após revogar
  await waitFor(() => expect(Edge.nodes).toHaveBeenCalledTimes(2));
});

it('edge já revogado não exibe o botão Revogar', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-revoked');
  expect(screen.queryByTestId('edge-revoke-e-revoked')).toBeNull();
  expect(screen.getByTestId('edge-revoke-e-online')).toBeInTheDocument();
});

it('sem connectors.manage a seção inteira não existe', async () => {
  useCan.mockReturnValue(false);
  render(<EdgeSection />);
  expect(screen.queryByTestId('edge-section')).toBeNull();
  expect(Edge.nodes).not.toHaveBeenCalled();
});

it('a central de Conectores embute a seção AEGIS Edge', async () => {
  render(<ConectoresWorkspace />);
  await waitFor(() => expect(Connectors.list).toHaveBeenCalled());
  await screen.findByTestId('edge-section');
  await screen.findByTestId('edge-card-e-online');
});
