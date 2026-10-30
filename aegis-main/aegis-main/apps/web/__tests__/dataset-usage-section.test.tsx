/**
 * F7.2 (plano V3.1) — UsageSection ("Conexões deste dataset", padrão Foundry
 * "Used in N"). Prova: produtor board/conector/manual, consumidores com
 * deep-link ?aba=pipelines&board=, pesquisável-em, e falha honesta.
 */
import { render, screen } from '@testing-library/react';
import { UsageSection } from '@/components/dados/dataset-browser';

jest.mock('@/lib/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'pt-BR' }),
  useT: () => (k: string) => k,
}));
jest.mock('@/components/auth/require-perm', () => ({ RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/lib/api', () => ({
  Datasets: { usage: jest.fn() },
  Markings: { list: jest.fn().mockResolvedValue([]) },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('@/lib/api');

describe('F7.2 — UsageSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lista consumidores com deep-link e produtor conector', async () => {
    api.Datasets.usage.mockResolvedValue({
      dataset: 'osint_x',
      produced_by: { kind: 'connector', agent_id: 'a1', agent_slug: 'coletor-x', skill_key: 'connector.http' },
      used_by_boards: [
        { id: 'b1', slug: 'fluxo-1', display_name: 'Fluxo 1', tags: [], node_id: 's', last_run_status: 'OK' },
      ],
      searchable_in: { collection: 'ds_t_osint_x', status: 'succeeded' },
    });
    render(<UsageSection dataset="osint_x" />);
    const link = await screen.findByTestId('ds-usage-board-b1');
    expect(link).toHaveAttribute('href', '/painel-de-controle/dados?aba=pipelines&board=b1');
    expect(link).toHaveTextContent('Fluxo 1');
    expect(screen.getByTestId('ds-usage-producer-connector')).toHaveTextContent('coletor-x');
    expect(screen.getByTestId('ds-usage-searchable')).toHaveTextContent('ds_t_osint_x');
  });

  it('produtor board linka para o fluxo; sem consumidores = vazio honesto', async () => {
    api.Datasets.usage.mockResolvedValue({
      dataset: 'board.meu.derived',
      produced_by: { kind: 'board', id: 'b9', slug: 'meu', display_name: 'Meu Fluxo', tags: ['geo'] },
      used_by_boards: [],
      searchable_in: null,
    });
    render(<UsageSection dataset="board.meu.derived" />);
    const prod = await screen.findByTestId('ds-usage-producer-board');
    expect(prod).toHaveAttribute('href', '/painel-de-controle/dados?aba=pipelines&board=b9');
    expect(screen.getByTestId('ds-usage-none')).toBeInTheDocument();
    expect(screen.queryByTestId('ds-usage-searchable')).toBeNull();
  });

  it('sem produtor = manual/upload; erro de rede = indisponível honesto', async () => {
    api.Datasets.usage.mockResolvedValueOnce({
      dataset: 'manual_ds', produced_by: null, used_by_boards: [], searchable_in: null,
    });
    const { unmount } = render(<UsageSection dataset="manual_ds" />);
    expect(await screen.findByTestId('ds-usage-producer-none')).toBeInTheDocument();
    unmount();
    api.Datasets.usage.mockRejectedValueOnce(new Error('403'));
    render(<UsageSection dataset="negado" />);
    expect(await screen.findByText('dsw.usageUnavailable')).toBeInTheDocument();
  });
});
