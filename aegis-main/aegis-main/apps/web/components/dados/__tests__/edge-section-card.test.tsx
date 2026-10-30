/**
 * Dispositivos — ficha técnica do dispositivo (redesign 2026-07-26).
 *
 * Prova: o card entrega a GRADE DE METADADOS (versão / heartbeat / último
 * contato / câmeras ok) em vez da linha mono apertada; o estado é o do backend
 * (offline não vira online); um dispositivo com `pairing` ganha Configurar E
 * Parear e um gateway de câmeras (pairing null) não ganha nenhum dos dois; as
 * LINHAS não têm ícone decorativo (nem Server no card, nem Plug no Parear); o
 * Configurar do dispositivo monta o form pelo param_schema da skill e submete
 * pela ACTION GOVERNADA com {connector: slug, params}.
 *
 * useT mockado como identidade (padrão do projeto): a asserção é sobre a
 * CHAVE, não sobre a tradução.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { EdgeSection } from '@/components/dados/edge-section';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/components/dialog/confirm-dialog', () => ({ confirmModal: jest.fn() }));
jest.mock('@/lib/api', () => ({
  Edge: { nodes: jest.fn(), createPairingCode: jest.fn(), revoke: jest.fn() },
  Connectors: { bindings: jest.fn(), pairingStart: jest.fn(), pairingPoll: jest.fn() },
  Skills: { catalog: jest.fn() },
  ActionTypes: { list: jest.fn(), execute: jest.fn() },
}));

const { Edge, Connectors, Skills, ActionTypes } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
  Connectors: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
  ActionTypes: Record<string, jest.Mock>;
};

const RECENT = new Date().toISOString();
const NODES = {
  expected_version: '1.2.0',
  nodes: [
    {
      // gateway de câmeras: pareia pelo código GLOBAL do Edge → sem `pairing`
      edge_id: 'e-cam', name: 'Portaria', kind: 'camera_gateway', status: 'online',
      version: '1.2.0', last_seen_at: RECENT, update_available: false, cameras_ok: 3,
      pairing: null, diagnostics_summary: null,
    },
    {
      edge_id: 'e-wa', name: 'Estação Portaria', kind: 'whatsapp_station', status: 'online',
      version: '', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: { agent_id: 'ag-wa', slug: 'estacao-whatsapp', skill_key: 'connector.whatsapp_station' },
      diagnostics_summary: null,
    },
    {
      // backend disse offline: a UI NÃO promove a online por contato recente
      edge_id: 'e-as', name: 'Ponte do AJX', kind: 'autosync_bridge', status: 'offline',
      version: '0.9.0', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: { agent_id: 'ag-as', slug: 'autosync-ponte', skill_key: 'connector.autosync' },
      diagnostics_summary: null,
    },
  ],
};

const SCHEMA = [
  { key: 'janela', label: 'Janela', param_type: 'int', required: false, min: 10, max: 600 },
];

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Edge.nodes.mockResolvedValue(NODES);
  Skills.catalog.mockResolvedValue([
    { skill_key: 'connector.autosync', label: 'Ponte', description: '', category: 'ingestion',
      source: 'native', platforms: [], requires_secrets: [], param_schema: SCHEMA },
    { skill_key: 'connector.whatsapp_station', label: 'Estação', description: '', category: 'ingestion',
      source: 'native', platforms: [], requires_secrets: [], param_schema: [] },
  ]);
  Connectors.bindings.mockResolvedValue([
    { skill_key: 'connector.autosync', active: true, config: { janela: 30 } },
  ]);
  ActionTypes.list.mockResolvedValue([
    { id: 'act-1', code_ref: 'aegis.connector.configure' },
  ]);
  ActionTypes.execute.mockResolvedValue({ status: 'SUCCESS', output: { ok: true, result: {} } });
});

it('card entrega a grade de metadados: versão, heartbeat e último contato', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-cam');

  expect(screen.getByTestId('edge-meta-e-cam')).toBeInTheDocument();
  expect(screen.getByTestId('edge-version-e-cam')).toHaveTextContent('1.2.0');
  expect(screen.getByTestId('edge-heartbeat-e-cam')).toHaveTextContent('edge.hb.active');
  expect(screen.getByTestId('edge-lastseen-e-cam')).toHaveTextContent('edge.last_seen.now');
  expect(screen.getByTestId('edge-cameras-e-cam')).toHaveTextContent('3');
});

it('versão ausente rende rótulo explícito, nunca vazio', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-wa');
  expect(screen.getByTestId('edge-version-e-wa')).toHaveTextContent('edge.meta.version.none');
});

it('heartbeat acompanha o estado: online pulsa, offline diz "sem sinal"', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-as');

  expect(screen.getByTestId('edge-heartbeat-e-as')).toHaveTextContent('edge.hb.silent');
  expect(screen.getByTestId('edge-status-e-as')).toHaveTextContent('edge.status.offline');
  expect(screen.getByTestId('edge-status-e-as')).not.toHaveTextContent('edge.status.online');
  // o pulso é motion-safe (prefers-reduced-motion desliga a animação)
  expect(screen.getByTestId('edge-heartbeat-e-cam').innerHTML)
    .toMatch(/motion-safe:animate-pulse/);
  expect(screen.getByTestId('edge-heartbeat-e-as').innerHTML)
    .not.toMatch(/animate-pulse/);
});

it('a grade NÃO tem câmeras ok quando o backend não manda o número', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-wa');
  expect(screen.queryByTestId('edge-cameras-e-wa')).toBeNull();
});

it('dispositivo com pairing mostra Configurar E Parear; gateway de câmeras, nenhum dos dois', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-cam');

  expect(screen.getByTestId('device-configurar-e-wa')).toBeInTheDocument();
  expect(screen.getByTestId('device-pair-e-wa')).toBeInTheDocument();
  expect(screen.getByTestId('device-configurar-e-as')).toBeInTheDocument();
  expect(screen.getByTestId('device-pair-e-as')).toBeInTheDocument();
  // gateway pareia pelo código global → nada de estação no card dele
  expect(screen.queryByTestId('device-configurar-e-cam')).toBeNull();
  expect(screen.queryByTestId('device-pair-e-cam')).toBeNull();
});

it('linhas e botões de ação não carregam ícone decorativo (sem <svg> em Parear/Revogar)', async () => {
  render(<EdgeSection />);
  const card = await screen.findByTestId('edge-card-e-as');

  // o Plug saiu do Parear e o Ban saiu do Revogar: verbo puro
  expect(screen.getByTestId('device-pair-e-as').querySelector('svg')).toBeNull();
  expect(screen.getByTestId('edge-revoke-e-as').querySelector('svg')).toBeNull();
  expect(screen.getByTestId('device-configurar-e-as').querySelector('svg')).toBeNull();
  // o card não abre com o ícone Server à esquerda (o único svg tolerado seria
  // o selo de atualização, que este node não tem)
  expect(card.querySelector('svg')).toBeNull();
});

it('Configurar do dispositivo monta o form pelo param_schema da skill', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-as');

  fireEvent.click(screen.getByTestId('device-configurar-e-as'));
  await flush();

  expect(Skills.catalog).toHaveBeenCalled();
  expect(Connectors.bindings).toHaveBeenCalledWith('ag-as');
  const field = (await screen.findByTestId('dev-cfg-field-janela')) as HTMLInputElement;
  // config ATUAL do binding pré-preenchida
  expect(field.value).toBe('30');
});

it('Configurar submete pela ação governada com {connector: slug, params}', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-as');

  fireEvent.click(screen.getByTestId('device-configurar-e-as'));
  const field = (await screen.findByTestId('dev-cfg-field-janela')) as HTMLInputElement;
  fireEvent.change(field, { target: { value: '45' } });
  fireEvent.click(screen.getByTestId('device-configurar-submit'));

  await waitFor(() => expect(ActionTypes.execute).toHaveBeenCalled());
  expect(ActionTypes.execute).toHaveBeenCalledWith('act-1', {
    connector: 'autosync-ponte',
    params: { janela: 45 },
  });
  await waitFor(() => expect(screen.queryByTestId('device-configurar-modal')).toBeNull());
  expect(screen.getByTestId('edge-res-e-as')).toHaveTextContent('conectores.configure.applied');
});

it('valor fora do limite declarado bloqueia o submit (nada viaja)', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-as');

  fireEvent.click(screen.getByTestId('device-configurar-e-as'));
  const field = (await screen.findByTestId('dev-cfg-field-janela')) as HTMLInputElement;
  fireEvent.change(field, { target: { value: '9999' } });
  fireEvent.click(screen.getByTestId('device-configurar-submit'));

  expect(await screen.findByTestId('device-configurar-err'))
    .toHaveTextContent('conectores.err.param_range');
  expect(ActionTypes.execute).not.toHaveBeenCalled();
});

it('skill sem parâmetros declarados cai no estado "sem parâmetros"', async () => {
  Connectors.bindings.mockResolvedValue([
    { skill_key: 'connector.whatsapp_station', active: true, config: {} },
  ]);
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-wa');

  fireEvent.click(screen.getByTestId('device-configurar-e-wa'));
  expect(await screen.findByTestId('device-configurar-vazio'))
    .toHaveTextContent('conectores.configure.no_schema');
});

it('o cabeçalho da seção traz título + contagem de dispositivos', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-cam');
  expect(screen.getByTestId('edge-head-count')).toHaveTextContent('3');
});

it('faz POLLING do /nodes — status/heartbeat vivo sem apertar Atualizar', async () => {
  // Regressão do que o dono viu: a lista carregava e CONGELAVA; um dispositivo
  // que ficou offline numa lacuna de restart parecia offline pra sempre, mesmo
  // com o backend já online. Agora a seção repolla enquanto a aba está visível.
  jest.useFakeTimers();
  try {
    render(<EdgeSection />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const afterMount = Edge.nodes.mock.calls.length;
    expect(afterMount).toBeGreaterThanOrEqual(1);
    // ~15s depois: mais um fetch (polling), sem gesto do operador
    await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
    expect(Edge.nodes.mock.calls.length).toBeGreaterThan(afterMount);
  } finally {
    jest.useRealTimers();
  }
});
