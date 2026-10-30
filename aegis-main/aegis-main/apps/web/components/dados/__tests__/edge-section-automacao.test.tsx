/**
 * Automação de religação na linha do número (o celular é um edge).
 *
 * Prova: a linha acompanha a automação pela PRESENÇA do dado
 * (numbers[].automation) — número sem aparelho declarado não muda de
 * aparência; "Religando (2ª de 3)" mostra a tentativa em curso; a desistência
 * aparece como "Precisa de gente no aparelho" COM o motivo vindo do aparelho;
 * neutro, nunca o valor cru; o botão "Parear" segue disponível (o operador
 * nunca fica refém da automação).
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

const { Edge } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
};

const RECENT = new Date().toISOString();

function nodesCom(numbers: unknown[]) {
  return {
    expected_version: '',
    nodes: [{
      edge_id: 'e-pool', name: 'Estação Hotel', kind: 'whatsapp_pool',
      status: 'online', version: '0.3.0', last_seen_at: RECENT,
      update_available: false, cameras_ok: null,
      pairing: {
        agent_id: 'ag-pool', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_pool',
      },
      diagnostics_summary: null,
      pool: { health: { total: numbers.length, sendable: 0 }, numbers },
    }],
  };
}

beforeEach(() => jest.clearAllMocks());

it('tentativa em curso aparece na linha, com o número da tentativa', async () => {
  // o gesto é gated pela capability DECLARADA: sem ela o botão não existe
  Edge.nodes.mockResolvedValue(nodesCom([
    { id: 'v1', msisdn: '5515999990001', role: 'vazao', state: 'needs_relink',
      sendable: false, needs_gesture: true, sent: 7,
      automation: { state: 'attempting', attempts: 2, max_attempts: 3,
        device: { serial: 'R58M1', battery: 88, screen_on: true } } },
  ]));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.getByTestId('edge-pool-auto-e-pool-v1'))
    .toHaveTextContent('Religando (2ª de 3)');
  // bateria saudável não vira ruído na linha
  expect(screen.queryByTestId('edge-pool-battery-e-pool-v1')).toBeNull();
  // e o gesto manual continua disponível — a automação não sequestra o operador
  expect(screen.getByTestId('edge-pool-pair-e-pool-v1')).toBeInTheDocument();
});

it('desistência mostra que precisa de gente E por quê', async () => {
  Edge.nodes.mockResolvedValue(nodesCom([
    { id: 'v1', msisdn: '5515999990001', role: 'vazao', state: 'needs_relink',
      sendable: false, needs_gesture: true, sent: 7,
      automation: { state: 'needs_human', attempts: 3, max_attempts: 3,
        last_error: 'aparelho R58M1 não está conectado ao adb',
        device: { serial: 'R58M1', battery: 9, screen_on: false } } },
  ]));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.getByTestId('edge-pool-auto-e-pool-v1'))
    .toHaveTextContent('Precisa de gente no aparelho');
  // o motivo é DADO do aparelho: sem ele o operador procura defeito na
  // mensageria quando o problema é o celular
  expect(screen.getByTestId('edge-pool-auto-reason-e-pool-v1'))
    .toHaveTextContent('não está conectado ao adb');
  // bateria baixa É o incidente aqui, então aparece
  expect(screen.getByTestId('edge-pool-battery-e-pool-v1'))
    .toHaveTextContent('bateria 9%');
});

it('número sem automação declarada não muda de aparência', async () => {
  Edge.nodes.mockResolvedValue(nodesCom([
    { id: 'tit', msisdn: '5515991044002', role: 'titular', state: 'paired',
      sendable: true, needs_gesture: false, sent: 42 },
  ]));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.queryByTestId('edge-pool-auto-e-pool-tit')).toBeNull();
  expect(screen.queryByTestId('edge-pool-battery-e-pool-tit')).toBeNull();
});

it('automação ociosa não diz nada (número saudável não vira linha nova)', async () => {
  Edge.nodes.mockResolvedValue(nodesCom([
    { id: 'tit', msisdn: '5515991044002', role: 'titular', state: 'paired',
      sendable: true, needs_gesture: false, sent: 42,
      automation: { state: 'idle', attempts: 0, max_attempts: 3,
        device: { serial: 'R58M1', battery: 90, screen_on: false } } },
  ]));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.queryByTestId('edge-pool-auto-e-pool-tit')).toBeNull();
});

it('fila e confirmação têm rótulo próprio', async () => {
  Edge.nodes.mockResolvedValue(nodesCom([
    { id: 'a', msisdn: '5515000000001', state: 'needs_relink', needs_gesture: true,
      automation: { state: 'pending', attempts: 0, max_attempts: 3 } },
    { id: 'b', msisdn: '5515000000002', state: 'needs_relink', needs_gesture: true,
      automation: { state: 'confirming', attempts: 1, max_attempts: 3 } },
  ]));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.getByTestId('edge-pool-auto-e-pool-a'))
    .toHaveTextContent('Religação na fila');
  expect(screen.getByTestId('edge-pool-auto-e-pool-b'))
    .toHaveTextContent('Aguardando confirmação');
});

it('estado de automação desconhecido rende rótulo neutro, nunca o valor cru', async () => {
  Edge.nodes.mockResolvedValue(nodesCom([
    { id: 'a', msisdn: '5515000000001', state: 'needs_relink', needs_gesture: true,
      automation: { state: 'modo_novo_v9', attempts: 1, max_attempts: 3 } },
  ]));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.getByTestId('edge-pool-auto-e-pool-a'))
    .toHaveTextContent('Automação em estado desconhecido');
  expect(screen.getByTestId('edge-pool-e-pool').textContent)
    .not.toMatch(/modo_novo_v9/);
});

function nodesComCaps(nums: unknown[]) {
  const base = nodesCom(nums) as { nodes: Record<string, unknown>[] };
  return {
    ...base,
    nodes: base.nodes.map((n) => ({
      ...n,
      pairing: n.pairing
        ? { ...(n.pairing as object), capabilities: ['pairing', 'inventory'] }
        : n.pairing,
    })),
  };
}

it('automação que desistiu ganha "Tentar de novo"', async () => {
  // `needs_human` era um beco: a automação só voltava se o número reconectasse
  // sozinho. Em campo, o operador conserta o aparelho (troca o celular, corrige
  // o PIN, religa o Wi-Fi) e precisa poder dizer "pronto, tenta de novo".
  const { Connectors } = jest.requireMock('@/lib/api') as {
    Connectors: Record<string, jest.Mock>;
  };
  Connectors.inventoryApply = jest.fn().mockResolvedValue({ ok: true, detail: '' });
  Edge.nodes.mockResolvedValue(nodesComCaps([
    { id: 'v1', msisdn: '5515999990001', role: 'vazao', state: 'needs_relink',
      sendable: false, needs_gesture: true, sent: 7,
      automation: { state: 'needs_human', attempts: 3, max_attempts: 3,
        last_error: 'o PIN não desbloqueou o aparelho' } },
  ]));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  fireEvent.click(screen.getByTestId('edge-pool-retry-e-pool-v1'));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'retry', { id: 'v1' },
  );
});
