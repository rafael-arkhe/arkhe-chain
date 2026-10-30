/**
 * Onda 4b — EmbedSection ("Tornar pesquisável") no inspetor de dataset.
 *
 * Cobre: estado honesto (nunca indexado / pesquisável N docs / falhou) + o gesto
 * (confirma → Datasets.embedDataset → poll de status). Honra: confirmModal (nunca
 * diálogo nativo), useT() (i18n), progresso honesto.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// t() devolve a CHAVE (padrão dos testes irmãos); exceto a que tem {n}, p/ provar
// a substituição da contagem.
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => (k === 'dsw.embedSearchable' ? 'Pesquisável · {n} documentos' : k),
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({ confirmModal: jest.fn() }));
jest.mock('@/components/markings/property-marking-pill', () => ({ PropertyMarkingPill: () => null }));
jest.mock('@/lib/api', () => ({
  Datasets: { getEmbedStatus: jest.fn(), embedDataset: jest.fn() },
  Markings: {},
}));

import { EmbedSection } from '@/components/dados/dataset-browser';
const { Datasets } = jest.requireMock('@/lib/api') as { Datasets: Record<string, jest.Mock> };
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog') as { confirmModal: jest.Mock };

beforeEach(() => jest.clearAllMocks());

test('dataset nunca indexado → mostra "ainda não" e o botão "Tornar pesquisável"', async () => {
  Datasets.getEmbedStatus.mockResolvedValue(null);
  render(<EmbedSection dataset="placas" />);
  await waitFor(() => expect(Datasets.getEmbedStatus).toHaveBeenCalledWith('placas'));
  expect(await screen.findByTestId('ds-embed-none')).toBeInTheDocument();
  expect(screen.getByTestId('ds-embed-trigger')).toHaveTextContent('dsw.embedTrigger');
});

test('dataset já indexado → mostra "pesquisável · N documentos" + Reindexar', async () => {
  Datasets.getEmbedStatus.mockResolvedValue({
    id: 'r1', dataset_name: 'placas', collection: 'ds_t1_placas',
    status: 'succeeded', rows: 1234, est_cost_brl: 0.02,
  });
  render(<EmbedSection dataset="placas" />);
  const ok = await screen.findByTestId('ds-embed-ok');
  expect(ok).toHaveTextContent('1234'); // {n} substituído
  expect(screen.getByTestId('ds-embed-trigger')).toHaveTextContent('dsw.embedReindex');
});

test('falha do guardrail → mostra o erro honesto', async () => {
  Datasets.getEmbedStatus.mockResolvedValue({
    id: 'r1', dataset_name: 'placas', collection: 'ds_t1_placas',
    status: 'failed', rows: 0, error: 'custo estimado R$5.00 excede o teto R$2.00',
  });
  render(<EmbedSection dataset="placas" />);
  expect(await screen.findByTestId('ds-embed-failed')).toHaveTextContent('excede o teto');
});

test('gesto: confirma → embedDataset é chamado e o estado vira "indexando"', async () => {
  Datasets.getEmbedStatus.mockResolvedValue(null);
  confirmModal.mockResolvedValue(true);
  Datasets.embedDataset.mockResolvedValue({
    id: 'r1', dataset_name: 'placas', collection: 'ds_t1_placas', status: 'queued', rows: 0,
  });
  render(<EmbedSection dataset="placas" />);
  fireEvent.click(await screen.findByTestId('ds-embed-trigger'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  await waitFor(() => expect(Datasets.embedDataset).toHaveBeenCalledWith('placas'));
  // queued → o display passa a "indexando" (poll honesto começa)
  expect(await screen.findByTestId('ds-embed-running')).toBeInTheDocument();
});

test('cancelar a confirmação NÃO dispara o embed', async () => {
  Datasets.getEmbedStatus.mockResolvedValue(null);
  confirmModal.mockResolvedValue(false);
  render(<EmbedSection dataset="placas" />);
  fireEvent.click(await screen.findByTestId('ds-embed-trigger'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  expect(Datasets.embedDataset).not.toHaveBeenCalled();
});
