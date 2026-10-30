/**
 * DLQ operável (2026-06-12) — seção "Pipeline de detecções" na central de
 * Conectores.
 *
 * Cobre: cards pending/fila-morta com os números vivos; tabela da DLQ com
 * motivo humano + origem + evento; Reprocessar e Descartar confirmam via
 * confirmModal (NUNCA diálogo nativo) e chamam o endpoint certo (purge com
 * tone danger); sem events.pipeline.manage os gestos somem; sem
 * events.pipeline.view a seção inteira não existe; estados vazio e de erro
 * honestos; a central (ConectoresWorkspace) embute a seção.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PipelineSection } from '@/components/dados/pipeline-section';
import { CamerasWorkspace } from '@/components/dados/cameras-workspace';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ actions }: any) => <div>{actions}</div>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: jest.fn() }));
jest.mock('@/lib/api', () => ({
  EventsPipeline: {
    status: jest.fn(), dlq: jest.fn(), retry: jest.fn(), purge: jest.fn(),
  },
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
// §C C5 — a seção Câmeras (CamerasWorkspace) embute o pipeline; ela fala com
// Cctv.streams.page (lista gerida) e Cctv.hotlist. Mock p/ não bater na rede real.
jest.mock('@/lib/api/cctv', () => {
  const actual = jest.requireActual('@/lib/api/cctv');
  return {
    ...actual,
    Cctv: {
      ...actual.Cctv,
      streams: {
        ...actual.Cctv.streams,
        page: jest.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 50 }),
        update: jest.fn(),
      },
      hotlist: { list: jest.fn().mockResolvedValue([]), add: jest.fn(), remove: jest.fn() },
    },
  };
});

const { EventsPipeline, Edge, Connectors, Skills, Ontology, Markings } =
  jest.requireMock('@/lib/api') as {
    EventsPipeline: Record<string, jest.Mock>;
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

const STATUS = {
  bus_kind: 'redis',
  topic: 'aegis.detections',
  group: 'cctv-projector',
  pending: 7,
  dlq_count: 2,
  consumers: [{ name: 'cctv-projector', consumers: 3, pending: 7 }],
};
const DLQ = {
  topic: 'aegis.detections',
  count: 2,
  items: [
    {
      id: '100-0', key: 'tn1:cam-portaria', reason: 'max_deliveries=5',
      orig_id: '90-0', ts: new Date(Date.now() - 120_000).toISOString(),
      payload: {
        event_id: 'ev-abc', kind: 'lpr', source_id: 'cam-portaria',
        preview: '{"event_id":"ev-abc"}',
      },
    },
    {
      id: '101-0', key: 'tn1:cam-doca', reason: 'max_deliveries=5',
      orig_id: '91-0', ts: null,
      payload: {
        event_id: 'ev-def', kind: 'face', source_id: 'cam-doca',
        preview: '{"event_id":"ev-def"}',
      },
    },
  ],
};

function grantAll() {
  useCan.mockImplementation(() => true);
}

function grantViewOnly() {
  useCan.mockImplementation((perm: string) => perm === 'events.pipeline.view');
}

beforeEach(() => {
  jest.clearAllMocks();
  grantAll();
  EventsPipeline.status.mockResolvedValue(STATUS);
  EventsPipeline.dlq.mockResolvedValue(DLQ);
  EventsPipeline.retry.mockResolvedValue({ topic: 'aegis.detections', retried: 1, ids: ['100-0'] });
  EventsPipeline.purge.mockResolvedValue({ topic: 'aegis.detections', purged: 1, ids: ['100-0'] });
});

test('cards mostram pending e fila-morta + tabela com motivo humano e origem', async () => {
  render(<PipelineSection />);
  await waitFor(() => expect(screen.getByTestId('pipeline-card-pending')).toHaveTextContent('7'));
  expect(screen.getByTestId('pipeline-card-dlq')).toHaveTextContent('2');
  // metadados técnicos em mono (tópico + barramento + consumidores)
  expect(screen.getByTestId('pipeline-meta')).toHaveTextContent('aegis.detections');
  // tabela: motivo HUMANO (nunca o cru sozinho), origem e event_id
  expect(screen.getAllByText('pipeline.reason.poison')).toHaveLength(2);
  expect(screen.getByText('tn1:cam-portaria')).toBeInTheDocument();
  expect(screen.getByText('ev-abc')).toBeInTheDocument();
});

test('Reprocessar confirma via confirmModal e chama retry com o id', async () => {
  confirmModal.mockResolvedValue(true);
  render(<PipelineSection />);
  await waitFor(() => screen.getByTestId('pipeline-retry-100-0'));
  fireEvent.click(screen.getByTestId('pipeline-retry-100-0'));
  await waitFor(() => expect(EventsPipeline.retry).toHaveBeenCalledWith({ ids: ['100-0'] }));
  expect(confirmModal).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'pipeline.confirm.retryTitle' }),
  );
  // recarrega os números depois do gesto
  await waitFor(() => expect(EventsPipeline.status).toHaveBeenCalledTimes(2));
});

test('Descartar usa tone danger e cancela sem chamar a API', async () => {
  confirmModal.mockResolvedValue(false);
  render(<PipelineSection />);
  await waitFor(() => screen.getByTestId('pipeline-purge-100-0'));
  fireEvent.click(screen.getByTestId('pipeline-purge-100-0'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalledWith(
    expect.objectContaining({ tone: 'danger' }),
  ));
  expect(EventsPipeline.purge).not.toHaveBeenCalled();
});

test('Descartar tudo confirmado chama purge {all:true}', async () => {
  confirmModal.mockResolvedValue(true);
  render(<PipelineSection />);
  // espera os números chegarem — antes disso o botão de lote fica desabilitado
  await waitFor(() => expect(screen.getByTestId('pipeline-card-dlq')).toHaveTextContent('2'));
  fireEvent.click(screen.getByTestId('pipeline-purge-all'));
  await waitFor(() => expect(EventsPipeline.purge).toHaveBeenCalledWith({ all: true }));
});

test('sem events.pipeline.manage os gestos somem (view-only)', async () => {
  grantViewOnly();
  render(<PipelineSection />);
  await waitFor(() => screen.getByTestId('pipeline-card-dlq'));
  expect(screen.queryByTestId('pipeline-retry-all')).toBeNull();
  expect(screen.queryByTestId('pipeline-purge-all')).toBeNull();
  expect(screen.queryByTestId('pipeline-retry-100-0')).toBeNull();
});

test('sem events.pipeline.view a seção inteira não existe', () => {
  useCan.mockImplementation(() => false);
  render(<PipelineSection />);
  expect(screen.queryByTestId('pipeline-section')).toBeNull();
  expect(EventsPipeline.status).not.toHaveBeenCalled();
});

test('fila-morta vazia mostra estado honesto e desabilita o lote', async () => {
  EventsPipeline.status.mockResolvedValue({ ...STATUS, dlq_count: 0 });
  EventsPipeline.dlq.mockResolvedValue({ topic: 'aegis.detections', count: 0, items: [] });
  render(<PipelineSection />);
  await waitFor(() => screen.getByTestId('pipeline-dlq-empty'));
  expect(screen.getByTestId('pipeline-retry-all')).toBeDisabled();
  expect(screen.getByTestId('pipeline-purge-all')).toBeDisabled();
});

test('erro da API aparece como alerta honesto', async () => {
  EventsPipeline.status.mockRejectedValue(new Error('backend fora'));
  EventsPipeline.dlq.mockRejectedValue(new Error('backend fora'));
  render(<PipelineSection />);
  await waitFor(() => screen.getByTestId('pipeline-error'));
  expect(screen.getByTestId('pipeline-error')).toHaveTextContent('backend fora');
});

test('§C C5 — a seção Câmeras (/dados) embute a seção do pipeline', async () => {
  render(<CamerasWorkspace />);
  await waitFor(() => expect(screen.getByTestId('pipeline-section')).toBeInTheDocument());
});
