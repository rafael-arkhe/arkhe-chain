/**
 * Sprint 5 (Estação WhatsApp) — Dispositivos (ex-"AEGIS Edge").
 *
 * Prova: título/subtítulo renderizam "Dispositivos" (marca removida); badge de
 * kind aparece p/ whatsapp_station e camera_gateway; a linha de diagnóstico de
 * câmeras só aparece no gateway (estação não mostra, mesmo com sinal); NENHUM
 * texto "AEGIS Edge" é renderizado.
 *
 * i18n REAL (sem mock do provider): useT fora do Provider resolve pt-BR do
 * DICT, então as strings traduzidas aparecem de verdade.
 */
import * as React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { EdgeSection } from '@/components/dados/edge-section';

jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Edge: { nodes: jest.fn(), createPairingCode: jest.fn(), revoke: jest.fn() },
  // O StationPairingDialog (aberto pela linha do dispositivo) fala com Connectors.
  Connectors: { pairingStart: jest.fn(), pairingPoll: jest.fn() },
}));

const { Edge, Connectors } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
  Connectors: Record<string, jest.Mock>;
};

const RECENT = new Date().toISOString();
const NODES = {
  expected_version: '1.2.0',
  nodes: [
    {
      edge_id: 'e-cam', name: 'Portaria', kind: 'camera_gateway', status: 'online',
      version: '1.2.0', last_seen_at: RECENT, update_available: false, cameras_ok: 3,
      // gateway de câmeras pareia pelo código GLOBAL do Edge → sem `pairing`.
      pairing: null,
      diagnostics_summary: {
        selftest_ok: true, selftest_persons: 2, last_error: null,
        loop_restarts_total: 1, uptime_seconds: 100,
      },
    },
    {
      edge_id: 'e-wa', name: 'Estação Portaria', kind: 'whatsapp_station', status: 'online',
      version: '2.0.0', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: { agent_id: 'ag-wa', skill_key: 'connector.whatsapp_station' },
      // Tem SINAL de diagnóstico, mas por não ser câmera a linha NÃO deve sair.
      diagnostics_summary: {
        selftest_ok: false, selftest_persons: 0, last_error: 'algo',
        loop_restarts_total: 2, uptime_seconds: 50,
      },
    },
    {
      // Backend diz offline: mesmo com contato recente no payload, a UI NÃO
      // pode promover a online.
      edge_id: 'e-as', name: 'Ponte do AJX', kind: 'autosync_bridge', status: 'offline',
      version: '', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: { agent_id: 'ag-as', skill_key: 'connector.autosync' },
      diagnostics_summary: null,
    },
  ],
};

// Flush do microtask do mock async (Edge.nodes / pairingStart).
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Edge.nodes.mockResolvedValue(NODES);
  Connectors.pairingStart.mockResolvedValue({
    state: 'awaiting_scan', qr_data_url: null, code: 'A1B2-C3D4',
    expires_at: null, detail: '',
  });
  Connectors.pairingPoll.mockResolvedValue({
    state: 'awaiting_scan', qr_data_url: null, code: 'A1B2-C3D4',
    expires_at: null, detail: '',
  });
});

it('renderiza "Dispositivos" e o subtítulo sem marca', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-cam');
  expect(screen.getByText('Dispositivos')).toBeInTheDocument();
  expect(screen.getByText(/Equipamentos e estações/)).toBeInTheDocument();
});

it('badge de kind: Estação WhatsApp, Gateway de câmeras e Ponte AutoSync', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-wa');
  expect(screen.getByTestId('edge-kind-e-wa')).toHaveTextContent('Estação WhatsApp');
  expect(screen.getByTestId('edge-kind-e-cam')).toHaveTextContent('Gateway de câmeras');
  expect(screen.getByTestId('edge-kind-e-as')).toHaveTextContent('Ponte AutoSync');
});

it('status é o do backend: offline não vira online por contato recente', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-as');
  expect(screen.getByTestId('edge-status-e-as')).toHaveTextContent('Offline');
  expect(screen.getByTestId('edge-status-e-as')).not.toHaveTextContent('Online');
  expect(screen.getByTestId('edge-status-e-cam')).toHaveTextContent('Online');
});

it('status "paired" aparece como Pareado (nem online, nem offline)', async () => {
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      edge_id: 'e-new', name: 'Recém-pareado', kind: 'whatsapp_station', status: 'paired',
      version: '', last_seen_at: null, update_available: false, cameras_ok: null,
      pairing: { agent_id: 'ag-wa', skill_key: 'connector.whatsapp_station' },
      diagnostics_summary: null,
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-new');
  expect(screen.getByTestId('edge-status-e-new')).toHaveTextContent('Pareado');
});

it('só o dispositivo com `pairing` ganha o botão Parear da linha', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-cam');
  expect(screen.getByTestId('device-pair-e-wa')).toBeInTheDocument();
  expect(screen.getByTestId('device-pair-e-as')).toBeInTheDocument();
  // gateway de câmeras pareia pelo código global — nada na linha.
  expect(screen.queryByTestId('device-pair-e-cam')).toBeNull();
});

it('Parear abre o diálogo com o agente/skill DAQUELE dispositivo', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-as');

  fireEvent.click(screen.getByTestId('device-pair-e-as'));
  await flush();

  expect(screen.getByTestId('connector-pair-modal')).toBeInTheDocument();
  expect(Connectors.pairingStart).toHaveBeenCalledWith('ag-as', 'connector.autosync', {});
  // título neutro (mesmo diálogo p/ estação e ponte)
  expect(screen.getByTestId('connector-pair-title')).toHaveTextContent('Parear dispositivo');
});

it('diagnóstico de câmeras só no gateway; estação não mostra', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-cam');
  expect(screen.getByTestId('edge-diag-e-cam')).toBeInTheDocument();
  expect(screen.queryByTestId('edge-diag-e-wa')).toBeNull();
});

it('não renderiza nenhum texto "AEGIS Edge"', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-cam');
  expect(screen.getByTestId('edge-section').textContent).not.toMatch(/AEGIS Edge/);
});
