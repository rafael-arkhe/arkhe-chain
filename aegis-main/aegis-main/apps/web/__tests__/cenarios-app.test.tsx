/**
 * Onda 10 (UI) — Workshop Scenario Manager em /painel-de-controle/cenarios-app.
 * Seleciona app → cria cenário → adiciona delta (ação do app) → COMMIT aplica de
 * verdade e reporta deltas_applied/deltas_failed (Onda 10). Distinto do /scenarios.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CenariosAppPage from '@/app/painel-de-controle/cenarios-app/page';

jest.mock('@/lib/workshop/client', () => ({
  Workshop: { list: jest.fn() },
}));
jest.mock('@/lib/api', () => ({
  WorkshopScenarios: {
    list: jest.fn(), create: jest.fn(), deltas: jest.fn(),
    applyAction: jest.fn(), commit: jest.fn(), discard: jest.fn(),
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'op', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));
jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

const { Workshop } = jest.requireMock('@/lib/workshop/client') as { Workshop: { list: jest.Mock } };
const { WorkshopScenarios } = jest.requireMock('@/lib/api') as { WorkshopScenarios: Record<string, jest.Mock> };

const APP = {
  id: 'app-1', display: 'Gestão Condomínio', schema_version: 2, variables: [], layout: { root: [] },
  actions: [{
    id: 'act-criar', label: 'Criar morador', permissions: [],
    params: [{ name: 'nome', label: 'Nome', type: 'String', required: true }],
  }],
};
const SCEN = { id: 'sc-1', app_id: 'app-1', name: 'E se...', description: '', status: 'active', delta_count: 0, created_at: '2026-05-30T10:00:00Z', updated_at: null, created_by: 'op' };

describe('Cenários de App — Workshop Scenario Manager (Onda 10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workshop.list.mockResolvedValue([APP]);
    WorkshopScenarios.list.mockResolvedValue([SCEN]);
    WorkshopScenarios.deltas.mockResolvedValue([
      { id: 'd-1', scenario_id: 'sc-1', action_id: 'act-criar', params: {}, target_node_id: null, status: 'pending', applied_at: null, created_at: '2026-05-30T10:01:00Z' },
    ]);
    WorkshopScenarios.applyAction.mockResolvedValue({ id: 'd-2', scenario_id: 'sc-1', action_id: 'act-criar', params: {}, target_node_id: null, status: 'pending', applied_at: null, created_at: '2026-05-30T10:02:00Z' });
    WorkshopScenarios.commit.mockResolvedValue({ scenario_id: 'sc-1', status: 'committed', deltas_applied: 1, deltas_failed: 0 });
  });

  async function pickApp() {
    render(<CenariosAppPage />);
    fireEvent.change(await screen.findByTestId('cenapp-app'), { target: { value: 'app-1' } });
    await waitFor(() => expect(WorkshopScenarios.list).toHaveBeenCalledWith('app-1'));
  }

  it('lista cenários do app + add-action mostra as ações do app', async () => {
    await pickApp();
    expect(await screen.findByTestId('cenapp-scenario-sc-1')).toHaveTextContent('E se...');
    fireEvent.click(screen.getByTestId('cenapp-scenario-sc-1'));
    const addAction = await screen.findByTestId('cenapp-add-action');
    expect(addAction).toHaveTextContent(/Criar morador/);   // ação do app, não texto livre
  });

  it('commit aplica de verdade e reporta applied/failed (Onda 10)', async () => {
    await pickApp();
    fireEvent.click(await screen.findByTestId('cenapp-scenario-sc-1'));
    await screen.findByTestId('cenapp-delta-d-1');
    fireEvent.click(screen.getByTestId('cenapp-commit'));
    await waitFor(() => expect(WorkshopScenarios.commit).toHaveBeenCalledWith('app-1', 'sc-1'));
    const res = await screen.findByTestId('cenapp-commit-result');
    expect(res).toHaveTextContent(/1 cenapp\.applied/);   // deltas_applied=1
    expect(res).toHaveTextContent(/0 cenapp\.failed/);    // deltas_failed=0
  });

  it('adicionar delta escolhe ação + preenche params tipados (dropdown+form, não texto cru)', async () => {
    await pickApp();
    fireEvent.click(await screen.findByTestId('cenapp-scenario-sc-1'));
    fireEvent.change(await screen.findByTestId('cenapp-add-action'), { target: { value: 'act-criar' } });
    // form de params da ação aparece (campo 'nome' tipado)
    const nome = await screen.findByTestId('cenapp-param-nome');
    fireEvent.change(nome, { target: { value: 'João' } });
    fireEvent.click(screen.getByTestId('cenapp-add-delta'));
    await waitFor(() => expect(WorkshopScenarios.applyAction).toHaveBeenCalledWith('app-1', 'sc-1', 'act-criar', { nome: 'João' }));
  });
});
