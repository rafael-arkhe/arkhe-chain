/**
 * Estação de Números (pool) — Dispositivos lista N números.
 *
 * Prova: card kind=whatsapp_pool rende o badge traduzido; o bloco de números
 * aparece pela PRESENÇA de nodes[].pool (nunca por tipo); cada linha mostra
 * número mono + papel + estado TRADUZIDO com rótulo (valor cru jamais);
 * resumo de prontidão + fila de gesto; "Parear" só em quem precisa de gesto
 * e abre o diálogo DIRIGIDO ao número (target); ban temporário mostra o
 * prazo de volta; dispositivo sem pool não ganha o bloco.
 *
 * i18n REAL (useT fora do Provider resolve pt-BR do DICT).
 */
import * as React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { EdgeSection } from '@/components/dados/edge-section';

jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Edge: { nodes: jest.fn(), createPairingCode: jest.fn(), revoke: jest.fn() },
  Connectors: { pairingStart: jest.fn(), pairingPoll: jest.fn() },
}));

const { Edge, Connectors } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
  Connectors: Record<string, jest.Mock>;
};

const RECENT = new Date().toISOString();
const SOON = new Date(Date.now() + 12 * 60_000).toISOString();

const NODES = {
  expected_version: '',
  nodes: [
    {
      edge_id: 'e-pool', name: 'Estação Hotel', kind: 'whatsapp_pool', status: 'online',
      version: '0.2.0', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: {
        agent_id: 'ag-pool', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_pool',
      },
      diagnostics_summary: null,
      pool: {
        station: 'estacao-hotel',
        state: 'connected',
        health: {
          total: 3, sendable: 1, standby: 0, needs_gesture: 1,
          temp_banned: 1, connected: true,
        },
        numbers: [
          { id: 'tit', msisdn: '5515991044002', role: 'titular', state: 'paired',
            sendable: true, needs_gesture: false, sent: 42 },
          { id: 'v1', msisdn: '5515999990001', role: 'vazao', state: 'needs_relink',
            sendable: false, needs_gesture: true, sent: 7 },
          { id: 'v2', msisdn: '5515999990002', role: 'vazao', state: 'temp_banned',
            sendable: false, needs_gesture: false, banned_until: SOON, sent: 3 },
        ],
      },
    },
    {
      // estação única: SEM pool → nada de bloco de números.
      edge_id: 'e-wa', name: 'Estação Portaria', kind: 'whatsapp_station', status: 'online',
      version: '', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: {
        agent_id: 'ag-wa', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_station',
      },
      diagnostics_summary: null,
      pool: null,
    },
  ],
};

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Edge.nodes.mockResolvedValue(NODES);
  Connectors.pairingStart.mockResolvedValue({
    state: 'awaiting_scan', qr_data_url: null, code: 'POOL-CODE',
    expires_at: null, detail: '', pairing_number: '5515999990001',
  });
  Connectors.pairingPoll.mockResolvedValue({
    state: 'awaiting_scan', qr_data_url: null, code: 'POOL-CODE',
    expires_at: null, detail: '', pairing_number: '5515999990001',
  });
});

it('badge do kind + bloco de números só onde há pool', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-pool');
  expect(screen.getByTestId('edge-kind-e-pool')).toHaveTextContent('Estação de números');
  expect(screen.getByTestId('edge-pool-e-pool')).toBeInTheDocument();
  // estação única sem snapshot: nenhum bloco (a UI rende pela presença do dado)
  expect(screen.queryByTestId('edge-pool-e-wa')).toBeNull();
});

it('linhas: número mono, papel e estado TRADUZIDO (nunca o valor cru)', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.getByTestId('edge-pool-num-e-pool-tit')).toHaveTextContent('5515991044002');
  expect(screen.getByTestId('edge-pool-num-e-pool-tit')).toHaveTextContent('Titular');
  expect(screen.getByTestId('edge-pool-state-e-pool-tit')).toHaveTextContent('Pareado');
  expect(screen.getByTestId('edge-pool-state-e-pool-v1')).toHaveTextContent('Reconexão necessária');
  expect(screen.getByTestId('edge-pool-state-e-pool-v2')).toHaveTextContent('Suspenso temporariamente');
  // o vocabulário cru do fio não vaza pra tela
  const block = screen.getByTestId('edge-pool-e-pool').textContent ?? '';
  expect(block).not.toMatch(/needs_relink|temp_banned|paired/);
});

it('resumo de prontidão + fila de gesto + prazo do ban', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.getByTestId('edge-pool-summary-e-pool'))
    .toHaveTextContent('1 de 3 prontos para enviar');
  expect(screen.getByTestId('edge-pool-queue-e-pool'))
    .toHaveTextContent('1 aguardando gesto');
  expect(screen.getByTestId('edge-pool-num-e-pool-v2').textContent)
    .toMatch(/volta em \d+ min/);
});

it('Parear por número: só em quem precisa de gesto, e o diálogo é DIRIGIDO', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  // pareado e banido temporário NÃO pedem gesto — sem botão
  expect(screen.queryByTestId('edge-pool-pair-e-pool-tit')).toBeNull();
  expect(screen.queryByTestId('edge-pool-pair-e-pool-v2')).toBeNull();

  fireEvent.click(screen.getByTestId('edge-pool-pair-e-pool-v1'));
  await flush();

  expect(screen.getByTestId('connector-pair-modal')).toBeInTheDocument();
  expect(Connectors.pairingStart).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', { target: 'v1' });
  // aditivo: o diálogo diz QUAL número está pareando
  expect(screen.getByTestId('connector-pair-number')).toHaveTextContent('5515999990001');
});

it('health ausente: resumo e fila DERIVAM das linhas (nunca "0 de N" mentiroso)', async () => {
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      edge_id: 'e-h', name: 'Estação', kind: 'whatsapp_pool', status: 'online',
      version: '', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: null, diagnostics_summary: null,
      // snapshot sem health (sanitização pode devolver {}): as contagens têm
      // que sair das próprias linhas — pareado abaixo ⇒ pronto no resumo.
      pool: {
        numbers: [
          { id: 'a', msisdn: '5515000000001', state: 'paired', sendable: true,
            needs_gesture: false },
          { id: 'b', msisdn: '5515000000002', state: 'needs_relink', sendable: false,
            needs_gesture: true },
        ],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-h');
  expect(screen.getByTestId('edge-pool-summary-e-h'))
    .toHaveTextContent('1 de 2 prontos para enviar');
  expect(screen.getByTestId('edge-pool-queue-e-h'))
    .toHaveTextContent('1 aguardando gesto');
});

it('estado fora do vocabulário rende o rótulo neutro, nunca o valor', async () => {
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      edge_id: 'e-x', name: 'Estação', kind: 'whatsapp_pool', status: 'online',
      version: '', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: null, diagnostics_summary: null,
      pool: {
        health: { total: 1, sendable: 0 },
        numbers: [{ id: 'n1', msisdn: '551500000000', state: 'estado_novo_v9' }],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-x');
  expect(screen.getByTestId('edge-pool-state-e-x-n1')).toHaveTextContent('Estado desconhecido');
  expect(screen.getByTestId('edge-pool-e-x').textContent).not.toMatch(/estado_novo_v9/);
});
