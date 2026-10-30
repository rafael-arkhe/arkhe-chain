/**
 * "Parear novo dispositivo" — diálogo de concessões (grantsModal).
 *
 * Prova: o diálogo usa linguagem neutra (sem "ilha"/"gestos"/"estação"/
 * "bancada de aparelhos"/"app de mesa"/nome de vendor), oferece as duas
 * permissões como cartões independentes, e o resultado marcado (ou vazio,
 * se fechado) chega intacto em `Edge.createPairingCode`.
 */
import * as React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

import { EdgeSection } from '@/components/dados/edge-section';

jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Edge: { nodes: jest.fn(), createPairingCode: jest.fn(), revoke: jest.fn() },
  Connectors: { pairingStart: jest.fn(), pairingPoll: jest.fn() },
}));

const { Edge } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
};

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Edge.nodes.mockResolvedValue({ expected_version: '', nodes: [] });
  Edge.createPairingCode.mockResolvedValue({
    code: 'A1B2-C3D4-E5F6', expires_at: new Date(Date.now() + 600_000).toISOString(), label: '',
  });
});

// grantsModal monta a própria raiz via createRoot (fora da árvore do RTL) —
// o cleanup automático do RTL não a desmonta. Um teste que abre o diálogo e
// não resolve (confirma/cancela/fecha) vaza esse host pro próximo teste.
afterEach(async () => {
  const leftover = screen.queryByTestId('grants-close');
  if (leftover) {
    fireEvent.click(leftover);
    await flush();
  }
});

it('abre o diálogo de concessões ao clicar em Parear novo dispositivo', async () => {
  render(<EdgeSection />);
  fireEvent.click(await screen.findByTestId('edge-pair'));
  await flush();
  expect(screen.getByTestId('grants-dialog')).toBeInTheDocument();
});

it('não expõe jargão interno nem nome de vendor no diálogo', async () => {
  render(<EdgeSection />);
  fireEvent.click(await screen.findByTestId('edge-pair'));
  await flush();

  const dialogText = screen.getByTestId('grants-dialog').textContent ?? '';
  for (const jargao of ['WhatsApp', 'ilha', 'gesto', 'estação', 'bancada', 'app de mesa']) {
    expect(dialogText).not.toMatch(new RegExp(jargao, 'i'));
  }
});

it('oferece as duas permissões como opções independentes, nenhuma pré-marcada', async () => {
  render(<EdgeSection />);
  fireEvent.click(await screen.findByTestId('edge-pair'));
  await flush();

  const retry = within(screen.getByTestId('grants-option-retry')).getByRole('checkbox');
  const qr = within(screen.getByTestId('grants-option-qr')).getByRole('checkbox');
  expect(retry).not.toBeChecked();
  expect(qr).not.toBeChecked();

  fireEvent.click(retry);
  expect(retry).toBeChecked();
  expect(qr).not.toBeChecked();
});

it('marca a opção de código como mais sensível', async () => {
  render(<EdgeSection />);
  fireEvent.click(await screen.findByTestId('edge-pair'));
  await flush();

  expect(within(screen.getByTestId('grants-option-qr')).getByText(/mais sensível/i)).toBeInTheDocument();
  expect(within(screen.getByTestId('grants-option-retry')).queryByText(/mais sensível/i)).toBeNull();
});

it('confirmar com uma permissão marcada envia exatamente essa concessão', async () => {
  render(<EdgeSection />);
  fireEvent.click(await screen.findByTestId('edge-pair'));
  await flush();

  fireEvent.click(within(screen.getByTestId('grants-option-qr')).getByRole('checkbox'));
  fireEvent.click(screen.getByTestId('grants-ok'));
  await flush();

  expect(Edge.createPairingCode).toHaveBeenCalledWith({ grants: ['qr'] });
  expect(screen.getByTestId('edge-pair-modal')).toBeInTheDocument();
  expect(screen.getByTestId('edge-pair-code')).toHaveTextContent('A1B2-C3D4-E5F6');
});

it('fechar sem marcar nada ainda assim gera pareamento, só que somente leitura', async () => {
  render(<EdgeSection />);
  fireEvent.click(await screen.findByTestId('edge-pair'));
  await flush();

  fireEvent.click(screen.getByTestId('grants-close'));
  await flush();

  expect(Edge.createPairingCode).toHaveBeenCalledWith({});
  expect(screen.getByTestId('edge-pair-modal')).toBeInTheDocument();
});
