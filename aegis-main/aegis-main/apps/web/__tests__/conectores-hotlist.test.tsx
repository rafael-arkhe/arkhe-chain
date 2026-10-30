/**
 * Onda 2 (2026-06-15) — Hotlist de placas procuradas na central de Conectores.
 *
 * Cobre: a lista popula com os dados reais (placa em mono, motivo, severidade
 * humana, ativa, quem adicionou, acertos); "Adicionar placa" valida o formato
 * (Mercosul ABC1D23 / antigo ABC1234) e SÓ chama o POST com placa válida —
 * placa inválida bloqueia com erro honesto e nenhuma chamada de rede; remover
 * confirma via confirmModal (NUNCA diálogo nativo) e chama o endpoint; sem a
 * perm security.cameras.hotlist a seção inteira não existe; a central
 * (ConectoresWorkspace) embute a seção; estados vazio/erro honestos.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { HotlistSection } from '@/components/dados/hotlist-section';
import { CamerasWorkspace } from '@/components/dados/cameras-workspace';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ actions }: any) => <div>{actions}</div>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: jest.fn() }));
// A seção fala com o backend pelo cliente Cctv.hotlist (importado direto de
// lib/api/cctv); isValidPlate/normalizePlate ficam REAIS (validação de verdade).
jest.mock('@/lib/api/cctv', () => {
  const actual = jest.requireActual('@/lib/api/cctv');
  return {
    ...actual,
    Cctv: {
      ...actual.Cctv,
      hotlist: { list: jest.fn(), add: jest.fn(), remove: jest.fn() },
      streams: { ...actual.Cctv.streams, page: jest.fn(), update: jest.fn() },
    },
  };
});
// A central embute outras seções (Edge/Pipeline) + fala com várias APIs.
jest.mock('@/lib/api', () => ({
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

const { Cctv } = jest.requireMock('@/lib/api/cctv') as {
  Cctv: { hotlist: Record<string, jest.Mock>; streams: Record<string, jest.Mock> };
};
const { Edge, Connectors, Skills } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
  Connectors: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
};
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog') as {
  confirmModal: jest.Mock;
};
const { useCan } = jest.requireMock('@/lib/auth/useAuth') as { useCan: jest.Mock };

const PLATES = [
  {
    id: 'wp-1', plate: 'ABC1D23', reason: 'Veículo de interesse — operação Centro',
    severity: 'critical', active: true, added_by: 'ferreira', hits: 4,
    markings: ['PII'], created_at: '2026-06-14T10:00:00Z',
  },
  {
    id: 'wp-2', plate: 'XYZ4567', reason: null,
    severity: 'medium', active: false, added_by: 'plantao', hits: 0,
    markings: ['PII'], created_at: '2026-06-13T08:00:00Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useCan.mockReturnValue(true);
  confirmModal.mockResolvedValue(true);
  Cctv.hotlist.list.mockResolvedValue(PLATES);
  Cctv.hotlist.add.mockResolvedValue({
    id: 'wp-3', plate: 'DEF2G34', reason: null, severity: 'medium',
    active: true, added_by: 'ferreira', hits: 0, markings: ['PII'],
    created_at: '2026-06-15T12:00:00Z',
  });
  Cctv.hotlist.remove.mockResolvedValue(undefined);
  Cctv.streams.page.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 50 });
  // central
  Edge.nodes.mockResolvedValue({ expected_version: '', nodes: [] });
  Connectors.list.mockResolvedValue([]);
  Skills.catalog.mockResolvedValue([]);
});

it('a lista popula: placa em mono, motivo, severidade humana, ativa e quem adicionou', async () => {
  render(<HotlistSection />);
  await screen.findByTestId('hotlist-row-wp-1');

  const row = screen.getByTestId('hotlist-row-wp-1');
  // placa em fonte mono (JetBrains Mono p/ dados)
  const plate = screen.getByTestId('hotlist-plate-wp-1');
  expect(plate).toHaveTextContent('ABC1D23');
  expect(plate.className).toContain('font-mono');
  // motivo + quem adicionou + acertos
  expect(row).toHaveTextContent('Veículo de interesse — operação Centro');
  expect(row).toHaveTextContent('ferreira');
  // severidade com rótulo HUMANO (i18n), nunca o token cru sozinho
  expect(screen.getByTestId('hotlist-severity-wp-1')).toHaveTextContent('alertas.severity.critical');
  // placa inativa: rótulo de estado honesto
  expect(screen.getByTestId('hotlist-active-wp-2')).toHaveTextContent('hotlist.inactive');
});

it('Adicionar placa VÁLIDA (Mercosul) chama o POST com o corpo certo', async () => {
  render(<HotlistSection />);
  await screen.findByTestId('hotlist-row-wp-1');

  fireEvent.change(screen.getByTestId('hotlist-plate-input'), { target: { value: 'def2g34' } });
  fireEvent.change(screen.getByTestId('hotlist-severity-input'), { target: { value: 'high' } });
  fireEvent.click(screen.getByTestId('hotlist-add'));

  await waitFor(() => expect(Cctv.hotlist.add).toHaveBeenCalled());
  // placa NORMALIZADA (alnum-upper) viaja pro backend; severity do dropdown
  expect(Cctv.hotlist.add.mock.calls[0][0]).toMatchObject({ plate: 'DEF2G34', severity: 'high' });
  // recarrega a lista após adicionar
  await waitFor(() => expect(Cctv.hotlist.list).toHaveBeenCalledTimes(2));
});

it('placa INVÁLIDA bloqueia com erro honesto e NÃO chama o POST', async () => {
  render(<HotlistSection />);
  await screen.findByTestId('hotlist-row-wp-1');

  // 'ABCD123' não é Mercosul nem antiga
  fireEvent.change(screen.getByTestId('hotlist-plate-input'), { target: { value: 'ABCD123' } });
  fireEvent.click(screen.getByTestId('hotlist-add'));

  expect(await screen.findByTestId('hotlist-form-error')).toBeInTheDocument();
  expect(Cctv.hotlist.add).not.toHaveBeenCalled();
});

it('Remover confirma via confirmModal (destrutivo) e chama o endpoint; cancelar não chama', async () => {
  confirmModal.mockResolvedValueOnce(false);
  render(<HotlistSection />);
  await screen.findByTestId('hotlist-row-wp-1');

  fireEvent.click(screen.getByTestId('hotlist-remove-wp-1'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  expect(confirmModal.mock.calls[0][0]).toMatchObject({ tone: 'danger' });
  expect(Cctv.hotlist.remove).not.toHaveBeenCalled();

  confirmModal.mockResolvedValueOnce(true);
  fireEvent.click(screen.getByTestId('hotlist-remove-wp-1'));
  await waitFor(() => expect(Cctv.hotlist.remove).toHaveBeenCalledWith('wp-1'));
});

it('sem security.cameras.hotlist a seção inteira não existe', async () => {
  useCan.mockReturnValue(false);
  render(<HotlistSection />);
  expect(screen.queryByTestId('hotlist-section')).toBeNull();
  expect(Cctv.hotlist.list).not.toHaveBeenCalled();
});

it('estados honestos: vazio e erro (sem dado inventado)', async () => {
  Cctv.hotlist.list.mockResolvedValueOnce([]);
  render(<HotlistSection />);
  await screen.findByTestId('hotlist-empty');

  Cctv.hotlist.list.mockRejectedValueOnce(new Error('offline'));
  render(<HotlistSection />);
  await screen.findByTestId('hotlist-error');
});

it('§C C5 — a seção Câmeras (/dados) embute a Hotlist de placas', async () => {
  render(<CamerasWorkspace />);
  await screen.findByTestId('hotlist-section');
  await screen.findByTestId('hotlist-row-wp-1');
});
