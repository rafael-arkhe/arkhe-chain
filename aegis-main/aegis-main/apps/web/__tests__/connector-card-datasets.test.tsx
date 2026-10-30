/**
 * F7.2b (plano V3.1) — ConnectorCard "Datasets gerados" (cross-link do
 * organismo /dados). Prova: lazy-fetch ao abrir, linha com deep-link
 * ?aba=datasets&ds=, vazio honesto e falha honesta.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorCard } from '@/components/dados/connector-card';

jest.mock('@/lib/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'pt-BR' }),
  useT: () => (k: string) => k,
}));
jest.mock('@/lib/i18n/skill-labels', () => ({ skillLabel: (k: string) => k }));
jest.mock('@/lib/api', () => ({
  Connectors: { datasets: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('@/lib/api');

const AGENT = {
  id: 'ag1', slug: 'coletor-x', display_name: 'Coletor X', status: 'active',
  kind: 'worker', skill_keys: ['connector.http'], cron_preset: null,
  last_run_at: null, last_run_status: null, config: {}, markings: [],
} as never;

function renderCard() {
  return render(
    <ConnectorCard
      agent={AGENT} result={null as never} runs={null} openRuns={false} busy={null}
      canManage={true} catalogLabelBySkill={{}}
      onToggleRuns={() => {}} onTest={() => {}} onRun={() => {}}
      onToggleStatus={() => {}} onConfigure={() => {}} onRetry={() => {}}
    />,
  );
}

describe('F7.2b — ConnectorCard datasets gerados', () => {
  beforeEach(() => jest.clearAllMocks());

  it('abre o painel, busca lazy e lista com deep-link ?aba=datasets&ds=', async () => {
    api.Connectors.datasets.mockResolvedValue([
      { dataset: 'osint_x', rows: 42, last_at: '2026-07-03T10:00:00Z', pulls: 3 },
    ]);
    renderCard();
    expect(api.Connectors.datasets).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('conector-datasets-coletor-x'));
    const link = await screen.findByTestId('conector-dataset-osint_x');
    expect(api.Connectors.datasets).toHaveBeenCalledWith('ag1');
    expect(link).toHaveAttribute('href', '/painel-de-controle/dados?aba=datasets&ds=osint_x');
  });

  it('vazio honesto quando o conector nunca materializou', async () => {
    api.Connectors.datasets.mockResolvedValue([]);
    renderCard();
    fireEvent.click(screen.getByTestId('conector-datasets-coletor-x'));
    expect(await screen.findByText('conectores.datasets.empty')).toBeInTheDocument();
  });

  it('falha honesta quando o endpoint erra', async () => {
    api.Connectors.datasets.mockRejectedValue(new Error('500'));
    renderCard();
    fireEvent.click(screen.getByTestId('conector-datasets-coletor-x'));
    expect(await screen.findByText('conectores.datasets.unavailable')).toBeInTheDocument();
  });
});
