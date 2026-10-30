/**
 * Sprint 5 (Estação WhatsApp) — painel "Últimas mensagens".
 *
 * Prova: consulta os nós MessageDelivery via o client de object-sets
 * (Ontology.listNodes), filtra pela estação (properties.station_slug),
 * renderiza o status TRADUZIDO (conectores.msgs.status.*) e trata vazio/erro.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';

import { StationMessages } from '@/components/dados/station-messages';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({ Ontology: { listNodes: jest.fn() } }));

const { Ontology } = jest.requireMock('@/lib/api') as { Ontology: Record<string, jest.Mock> };

// Shape REAL do outbox (messaging_outbox.track_send): as properties expõem só
// `to_masked` — o destino pleno vive cifrado em payload_enc, nunca no nó.
const NODES = [
  {
    id: 'm1', name: '', node_type: 'MessageDelivery',
    properties: { station_slug: 'estacao-x', to_masked: '…8888', status: 'delivered', created_at: '2026-07-20T10:00:00Z' },
    created_at: '2026-07-20T10:00:00Z',
  },
  {
    id: 'm2', name: '', node_type: 'MessageDelivery',
    properties: { station_slug: 'estacao-x', to_masked: '…6666', status: 'failed', created_at: '2026-07-20T11:00:00Z' },
    created_at: '2026-07-20T11:00:00Z',
  },
  {
    id: 'm3', name: '', node_type: 'MessageDelivery',
    properties: { station_slug: 'outra-estacao', to_masked: '…0000', status: 'read', created_at: '2026-07-20T12:00:00Z' },
    created_at: '2026-07-20T12:00:00Z',
  },
] as never;

beforeEach(() => jest.clearAllMocks());

it('lista as mensagens da estação com status traduzido e filtra outras estações', async () => {
  Ontology.listNodes.mockResolvedValue(NODES);
  render(<StationMessages slug="estacao-x" />);
  await screen.findByTestId('station-msg-m2');

  expect(Ontology.listNodes).toHaveBeenCalledWith({ node_type: 'MessageDelivery', limit: 200 });
  expect(screen.getByTestId('station-msg-status-m1')).toHaveTextContent('conectores.msgs.status.delivered');
  expect(screen.getByTestId('station-msg-status-m2')).toHaveTextContent('conectores.msgs.status.failed');
  // F6: o destino vem de properties.to_masked (o backend NUNCA grava `to` cru)
  expect(screen.getByTestId('station-msg-m1')).toHaveTextContent('…8888');
  // mensagem de OUTRA estação não entra
  expect(screen.queryByTestId('station-msg-m3')).toBeNull();
});

it('vazio honesto quando a estação não tem mensagens', async () => {
  Ontology.listNodes.mockResolvedValue([]);
  render(<StationMessages slug="estacao-x" />);
  expect(await screen.findByTestId('station-messages-empty')).toBeInTheDocument();
});

it('falha honesta quando a consulta erra', async () => {
  Ontology.listNodes.mockRejectedValue(new Error('500'));
  render(<StationMessages slug="estacao-x" />);
  expect(await screen.findByTestId('station-messages-error')).toBeInTheDocument();
});
