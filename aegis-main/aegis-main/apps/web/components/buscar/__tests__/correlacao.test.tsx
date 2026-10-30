/**
 * correlacao.test.tsx — P3 Onda 3: cadeia de correlação no detalhe do /buscar.
 *
 * Prova os 4 gestos do operador (jsdom):
 *   1. AUTO-LEVE     · abrir um resultado com seletor (CPF) chama quick-links e
 *                      lista os VÍNCULOS IMEDIATOS (rótulo da relação + vizinho).
 *   2. APROFUNDAR    · "Expandir em cadeia" dispara a corrida assíncrona
 *                      (runChainToCompletion) com profundidade/orçamento.
 *   3. PREVIEW       · concluída a corrida, a prévia (buscar-correlacao-grafo)
 *                      mostra os NÓS retornados.
 *   4. SALVAR        · "Salvar na rede" confirma (confirmModal, nunca nativo) e
 *                      chama o endpoint de materialização (saveChain).
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// next/link / useRouter usados indiretamente.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/buscar',
  useSearchParams: () => new URLSearchParams(),
}));

// Operador COM as duas perms (correlation.run + correlation.save).
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => true,
  useAuth: () => ({ principal: { roles: ['admin'], permissions: [] }, loading: false }),
}));

// RedeCanvas é dynamic (force-graph/canvas) — stub leve no jsdom.
jest.mock('@/components/rede/RedeCanvas', () => ({
  RedeCanvas: () => <div data-testid="rede-canvas-stub" />,
}));

// confirmModal: aprova sem diálogo nativo.
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(() => Promise.resolve(true)),
}));

// SDK de correlação — mock dos 3 verbos que o componente usa.
// (prefixo `mock` é exigido pelo jest p/ refs dentro do factory de jest.mock)
const mockQuickLinks = jest.fn();
const mockRunChainToCompletion = jest.fn();
const mockSaveChain = jest.fn();
jest.mock('@/lib/api/correlation', () => ({
  Correlation: {
    quickLinks: (...a: unknown[]) => mockQuickLinks(...a),
    runChainToCompletion: (...a: unknown[]) => mockRunChainToCompletion(...a),
    saveChain: (...a: unknown[]) => mockSaveChain(...a),
  },
}));

import { BuscarCorrelacao } from '@/components/buscar/correlacao';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import type { NormalizedResult } from '@/lib/buscar/types';

/* Grafo quick-links: semente (CPF, depth 0) + 2 vizinhos (depth 1). */
const QUICK_GRAPH = {
  nodes: [
    { id: 'cpf:12345678909', kind: 'cpf', value: '12345678909', display: '123.456.789-09', canonical: '12345678909', confidence: 1, depth: 0, properties: {} },
    { id: 'cnpj:11222333000181', kind: 'cnpj', value: '11222333000181', display: 'ACME LTDA', canonical: 'acme ltda', confidence: 0.9, depth: 1, properties: {} },
    { id: 'phone:11999992222', kind: 'phone', value: '11999992222', display: '(11) 99999-2222', canonical: '11999992222', confidence: 0.8, depth: 1, properties: {} },
  ],
  edges: [
    { src: 'cpf:12345678909', dst: 'cnpj:11222333000181', rel: 'socio_de', score: 0.9, evidence: {} },
    { src: 'cpf:12345678909', dst: 'phone:11999992222', rel: 'telefone', score: 0.8, evidence: {} },
  ],
  stats: {},
};

/* Grafo da cadeia (chain): semente + 2 nós alcançados. */
const CHAIN_GRAPH = {
  nodes: [
    { id: 'cpf:12345678909', kind: 'cpf', value: '12345678909', display: '123.456.789-09', canonical: '12345678909', confidence: 1, depth: 0, properties: {} },
    { id: 'cnpj:11222333000181', kind: 'cnpj', value: '11222333000181', display: 'ACME LTDA', canonical: 'acme ltda', confidence: 0.9, depth: 1, properties: {} },
    { id: 'person:joao', kind: 'person', value: 'João Sócio', display: 'João Sócio', canonical: 'joao socio', confidence: 0.7, depth: 2, properties: {} },
  ],
  edges: [
    { src: 'cpf:12345678909', dst: 'cnpj:11222333000181', rel: 'socio_de', score: 0.9, evidence: {} },
    { src: 'cnpj:11222333000181', dst: 'person:joao', rel: 'socio', score: 0.7, evidence: {} },
  ],
  stats: { hops: 2 },
};

/** Resultado cujo seletor extraído é um CPF (dispara o auto-leve). */
function cpfResult(): NormalizedResult {
  return {
    externalId: 'r1',
    name: 'João da Silva',
    kind: 'person',
    action: { label: 'Aprofundar CPF', value: '123.456.789-09' },
  };
}

beforeEach(() => {
  mockQuickLinks.mockReset().mockResolvedValue({ graph: QUICK_GRAPH });
  mockRunChainToCompletion.mockReset().mockResolvedValue({
    task_id: 'task-1',
    status: 'done',
    progress_steps: [{ label: 'hop 1', detail: 'ok' }],
    graph: CHAIN_GRAPH,
    error_message: null,
  });
  mockSaveChain.mockReset().mockResolvedValue({ created_nodes: 3, created_edges: 2 });
  (confirmModal as jest.Mock).mockClear().mockResolvedValue(true);
});

describe('AUTO-LEVE — vínculos imediatos a partir do grafo quick-links', () => {
  it('chama quick-links com o seletor inferido e lista os vizinhos com a relação', async () => {
    render(<BuscarCorrelacao result={cpfResult()} />);

    // quick-links chamado com o CPF normalizado (só dígitos) + kind cpf.
    await waitFor(() =>
      expect(mockQuickLinks).toHaveBeenCalledWith({ value: '12345678909', kind: 'cpf' }),
    );

    const lista = await screen.findByTestId('buscar-correlacao-vinculos');
    // 2 vizinhos (depth 1), a semente (depth 0) NÃO aparece.
    expect(within(lista).getByText('ACME LTDA')).toBeInTheDocument();
    expect(within(lista).getByText('(11) 99999-2222')).toBeInTheDocument();
    expect(within(lista).queryByText('123.456.789-09')).toBeNull();
    // Rótulo da relação visível.
    expect(within(lista).getByText('socio_de')).toBeInTheDocument();
  });
});

describe('APROFUNDAR — "Expandir em cadeia" dispara a corrida', () => {
  it('clicar expandir chama runChainToCompletion com depth/budget e abre a prévia', async () => {
    render(<BuscarCorrelacao result={cpfResult()} />);
    await screen.findByTestId('buscar-correlacao-vinculos');

    fireEvent.click(screen.getByTestId('buscar-correlacao-expandir'));

    await waitFor(() => expect(mockRunChainToCompletion).toHaveBeenCalledTimes(1));
    const [body] = mockRunChainToCompletion.mock.calls[0];
    expect(body).toMatchObject({ value: '12345678909', kind: 'cpf', max_depth: 2, budget_nodes: 40 });
    // modal de prévia abre.
    expect(await screen.findByTestId('buscar-correlacao-modal')).toBeInTheDocument();
  });

  it('o popover ajusta a profundidade e a corrida usa o novo valor', async () => {
    render(<BuscarCorrelacao result={cpfResult()} />);
    await screen.findByTestId('buscar-correlacao-vinculos');

    fireEvent.click(screen.getByTestId('buscar-correlacao-config'));
    const depth = await screen.findByTestId('buscar-correlacao-depth');
    fireEvent.change(depth, { target: { value: '4' } });

    fireEvent.click(screen.getByTestId('buscar-correlacao-expandir'));
    await waitFor(() => expect(mockRunChainToCompletion).toHaveBeenCalledTimes(1));
    expect(mockRunChainToCompletion.mock.calls[0][0]).toMatchObject({ max_depth: 4 });
  });
});

describe('PREVIEW — a prévia mostra os nós da cadeia', () => {
  it('após concluir, buscar-correlacao-grafo lista os nós retornados', async () => {
    render(<BuscarCorrelacao result={cpfResult()} />);
    await screen.findByTestId('buscar-correlacao-vinculos');

    fireEvent.click(screen.getByTestId('buscar-correlacao-expandir'));

    const grafo = await screen.findByTestId('buscar-correlacao-grafo');
    // 3 nós da CHAIN_GRAPH viram linhas na lista lateral da prévia.
    await waitFor(() => expect(screen.getByTestId('buscar-correlacao-no-2')).toBeInTheDocument());
    expect(within(grafo).getByText('João Sócio')).toBeInTheDocument();
    expect(within(grafo).getAllByText('ACME LTDA').length).toBeGreaterThan(0);
  });
});

describe('SALVAR — opt-in materializa via endpoint (confirma sem diálogo nativo)', () => {
  it('clicar salvar confirma e chama saveChain com o task_id da corrida', async () => {
    render(<BuscarCorrelacao result={cpfResult()} />);
    await screen.findByTestId('buscar-correlacao-vinculos');

    fireEvent.click(screen.getByTestId('buscar-correlacao-expandir'));
    const salvar = await screen.findByTestId('buscar-correlacao-salvar');

    fireEvent.click(salvar);

    await waitFor(() => expect(confirmModal).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSaveChain).toHaveBeenCalledWith('task-1'));
    // Feedback de sucesso + link pra /rede (nova aba).
    expect(await screen.findByTestId('buscar-correlacao-salvo')).toBeInTheDocument();
    const verRede = screen.getByTestId('buscar-correlacao-ver-rede');
    expect(verRede).toHaveAttribute('href', '/rede');
    expect(verRede).toHaveAttribute('target', '_blank');
    expect(verRede).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
