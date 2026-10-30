/**
 * historico.test.tsx — Histórico de buscas RICO (BACKLOG #7b ELO 2).
 *
 * Prova os gestos do operador no dropdown (jsdom), tudo contra o BACKEND
 * (SearchHistory SDK mockado — nunca localStorage):
 *   1. LISTA      · abrir busca o histórico do backend e mostra consulta +
 *                   nº de fontes + quando.
 *   2. FILTRO     · digitar no filtro estreita a lista (client-side).
 *   3. RE-RODAR   · clicar "Re-rodar" chama onRerun com a ENTRADA COMPLETA
 *                   (contexto p/ a página restaurar + executar) e fecha.
 *   4. DETALHE    · abrir o detalhe mostra fontes + Busca avançada.
 *   5. LIMPAR     · "Limpar" passa pelo confirmModal (nunca diálogo nativo) e
 *                   chama DELETE total → lista vazia.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// SDK do histórico (backend). Cada método é um mock isolado.
const mockList = jest.fn();
const mockRemove = jest.fn();
const mockClear = jest.fn();
jest.mock('@/lib/api/search-history', () => ({
  SearchHistory: {
    list: (...a: unknown[]) => mockList(...a),
    remove: (...a: unknown[]) => mockRemove(...a),
    clear: (...a: unknown[]) => mockClear(...a),
  },
}));

// confirmModal — limpar exige confirmação, SEM diálogo nativo.
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(() => Promise.resolve(true)),
}));

import { Historico } from '@/components/buscar/historico';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import type { SearchHistoryEntry } from '@/lib/api/search-history';

const ENTRIES: SearchHistoryEntry[] = [
  {
    id: 'e1',
    query: 'fulano de tal',
    sources: ['camara_deputados@v1', 'senado_senadores@v1'],
    advanced: { fields: { uf: 'SP' }, purpose: 'investigacao', caseId: 'C-1' },
    result_summary: { 'camara_deputados@v1': 3 },
    created_at: '2026-06-20T10:00:00Z',
  },
  {
    id: 'e2',
    query: 'beltrano da silva',
    sources: ['maigret_username@v1'],
    advanced: { fields: {}, purpose: '', caseId: '' },
    result_summary: null,
    created_at: '2026-06-19T09:00:00Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue(ENTRIES);
  mockRemove.mockResolvedValue({ status: 'deleted', id: 'e1' });
  mockClear.mockResolvedValue({ status: 'cleared', deleted: 2 });
  (confirmModal as jest.Mock).mockResolvedValue(true);
});

async function open(onRerun = jest.fn()) {
  render(<Historico onRerun={onRerun} />);
  fireEvent.click(screen.getByTestId('buscar-historico-toggle'));
  await screen.findByTestId('buscar-historico-item-0');
  return onRerun;
}

describe('LISTA — vem do backend ao abrir', () => {
  it('busca o histórico (limit 50) e mostra consulta + nº de fontes', async () => {
    await open();
    expect(mockList).toHaveBeenCalledWith(50);

    expect(screen.getByText('fulano de tal')).toBeInTheDocument();
    expect(screen.getByText('beltrano da silva')).toBeInTheDocument();
    // contagem de fontes por item (2 fontes / 1 fonte).
    expect(screen.getByTestId('buscar-historico-item-0-fontes')).toHaveTextContent('2 fontes');
    expect(screen.getByTestId('buscar-historico-item-1-fontes')).toHaveTextContent('1 fonte');
  });
});

describe('FILTRO — estreita client-side', () => {
  it('digitar no filtro deixa só as entradas que casam', async () => {
    await open();
    fireEvent.change(screen.getByTestId('buscar-historico-filtro'), {
      target: { value: 'beltrano' },
    });
    expect(screen.queryByText('fulano de tal')).not.toBeInTheDocument();
    expect(screen.getByText('beltrano da silva')).toBeInTheDocument();
  });
});

describe('RE-RODAR — devolve a entrada COMPLETA p/ a página restaurar+executar', () => {
  it('clicar "Re-rodar" chama onRerun com a entrada e fecha o painel', async () => {
    const onRerun = await open();
    fireEvent.click(screen.getByTestId('buscar-historico-rerodar-0'));

    expect(onRerun).toHaveBeenCalledTimes(1);
    expect(onRerun).toHaveBeenCalledWith(ENTRIES[0]);
    // a entrada carrega o contexto (fontes + avançado) — não é só a query.
    expect(onRerun.mock.calls[0][0]).toMatchObject({
      query: 'fulano de tal',
      sources: ['camara_deputados@v1', 'senado_senadores@v1'],
      advanced: { fields: { uf: 'SP' }, purpose: 'investigacao', caseId: 'C-1' },
    });
    // fecha o dropdown.
    expect(screen.queryByTestId('buscar-historico-painel')).not.toBeInTheDocument();
  });
});

describe('DETALHE — contexto completo inline', () => {
  it('abrir o detalhe mostra fontes + Busca avançada', async () => {
    await open();
    fireEvent.click(screen.getByTestId('buscar-historico-detalhe-0'));
    const painel = await screen.findByTestId('buscar-historico-detalhe-painel-0');
    expect(within(painel).getByText('camara_deputados@v1')).toBeInTheDocument();
    expect(within(painel).getByText('senado_senadores@v1')).toBeInTheDocument();
    // campo avançado uf:SP + finalidade.
    expect(within(painel).getByText('uf:')).toBeInTheDocument();
    expect(within(painel).getByText('SP')).toBeInTheDocument();
    expect(within(painel).getByText('Finalidade:')).toBeInTheDocument();
  });
});

describe('LIMPAR — confirmModal (nunca nativo) → DELETE total', () => {
  it('clicar "Limpar" confirma e chama clear; a lista esvazia', async () => {
    await open();
    fireEvent.click(screen.getByTestId('buscar-historico-limpar'));

    await waitFor(() => expect(confirmModal).toHaveBeenCalledTimes(1));
    // tom de perigo + ação irreversível anunciada.
    expect((confirmModal as jest.Mock).mock.calls[0][0]).toMatchObject({ tone: 'danger' });
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
    // lista esvaziada → estado vazio.
    await screen.findByText('Nenhuma busca recente.');
  });

  it('cancelar o confirmModal NÃO chama clear', async () => {
    (confirmModal as jest.Mock).mockResolvedValueOnce(false);
    await open();
    fireEvent.click(screen.getByTestId('buscar-historico-limpar'));
    await waitFor(() => expect(confirmModal).toHaveBeenCalledTimes(1));
    expect(mockClear).not.toHaveBeenCalled();
  });
});

describe('REMOVER — uma entrada (backend), sem confirmar', () => {
  it('clicar remover chama SearchHistory.remove e tira o item da lista', async () => {
    await open();
    fireEvent.click(screen.getByTestId('buscar-historico-remover-0'));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(screen.queryByText('fulano de tal')).not.toBeInTheDocument());
    // a outra entrada permanece.
    expect(screen.getByText('beltrano da silva')).toBeInTheDocument();
  });
});
