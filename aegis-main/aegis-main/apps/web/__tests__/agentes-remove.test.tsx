/**
 * Fix #2 — Remover agente instalado a partir do kanban /agentes.
 *
 * Cobre: botão Remover por card, confirmação sharp (ConfirmProvider),
 * chamada DELETE via Agentes.uninstall, toast de sucesso e remoção
 * otimista do card da lista.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// W8 (2026-06-28): /agentes virou redirect; o kanban é AgentesApp (app_route).
import { AgentesApp as AgentesPage } from '@/components/agentes/AgentesApp';
import type { AgentOut } from '@/lib/api/agentes';

jest.mock('@/lib/api/agentes', () => ({
  Agentes: {
    list: jest.fn(),
    runs: jest.fn(),
    manualRun: jest.fn(),
    setCron: jest.fn(),
    uninstall: jest.fn(),
  },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

// AgentConfigEditor é pesado (Monaco etc.) — stub é suficiente aqui.
jest.mock('@/components/agentes/AgentConfigEditor', () => ({
  AgentConfigEditor: () => null,
}));

jest.mock('@/components/ui/toast', () => {
  const toast = Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  });
  return { toast, Toaster: () => null };
});

const { Agentes } = jest.requireMock('@/lib/api/agentes') as {
  Agentes: { list: jest.Mock; runs: jest.Mock; uninstall: jest.Mock };
};
const { toast } = jest.requireMock('@/components/ui/toast') as {
  toast: jest.Mock & { success: jest.Mock; error: jest.Mock };
};

function makeAgent(overrides: Partial<AgentOut> = {}): AgentOut {
  return {
    id: 'agent-1',
    slug: 'worker-x-teste',
    name: 'Coletor X — teste',
    kind: 'worker',
    status: 'idle',
    config: {},
    cron: 'off',
    last_run_at: null,
    last_run_status: null,
    ...overrides,
  } as AgentOut;
}

describe('Fix #2 — remover agente no kanban', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Agentes.list.mockResolvedValue([makeAgent()]);
    Agentes.runs.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('mostra o botão Remover por card', async () => {
    render(<AgentesPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agent-remove-agent-1')).toBeInTheDocument(),
    );
  });

  it('confirma e remove: chama uninstall, toast de sucesso, some o card', async () => {
    Agentes.uninstall.mockResolvedValue(undefined);
    render(<AgentesPage />);

    await waitFor(() =>
      expect(screen.getByTestId('agent-remove-agent-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('agent-remove-agent-1'));

    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByTestId('confirm-ok'));

    await waitFor(() => expect(Agentes.uninstall).toHaveBeenCalledWith('agent-1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Agente removido.'));
    await waitFor(() =>
      expect(screen.queryByTestId('agente-card-worker-x-teste')).not.toBeInTheDocument(),
    );
  });

  it('cancelar não chama uninstall', async () => {
    render(<AgentesPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agent-remove-agent-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('agent-remove-agent-1'));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByTestId('confirm-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument(),
    );
    expect(Agentes.uninstall).not.toHaveBeenCalled();
  });

  it('falha de uninstall dispara toast.error e mantém o card', async () => {
    Agentes.uninstall.mockRejectedValue(new Error('boom'));
    render(<AgentesPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agent-remove-agent-1')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('agent-remove-agent-1'));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByTestId('confirm-ok'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect((toast.error as jest.Mock).mock.calls[0][0]).toContain('Falha ao remover');
    expect(screen.getByTestId('agente-card-worker-x-teste')).toBeInTheDocument();
  });
});
