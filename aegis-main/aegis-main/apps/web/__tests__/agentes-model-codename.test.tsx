/**
 * W7 (GAP F) — o backend expõe `config.model` (slug cru) na frota
 * (_CONFIG_PUBLIC_KEYS). O card/lista de agente DEVE exibir o modelo pelo
 * CODINOME AIP (aipModelLabel), NUNCA o slug de vendor.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
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

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    Pages: { ...actual.Pages, get: jest.fn() },
  };
});

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));
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
  Agentes: { list: jest.Mock; runs: jest.Mock };
};
const { Pages } = jest.requireMock('@/lib/api') as { Pages: { get: jest.Mock } };

function makeAgent(overrides: Partial<AgentOut> = {}): AgentOut {
  return {
    id: 'agent-1',
    slug: 'worker-news',
    name: 'Coletor de Notícias',
    kind: 'worker',
    status: 'idle',
    config: {},
    last_run_at: null,
    last_run_status: null,
    ...overrides,
  } as AgentOut;
}

describe('GAP F — card de agente mostra o modelo por codinome AIP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Agentes.runs.mockResolvedValue([]);
    Pages.get.mockRejectedValue(new Error('offline')); // usa o FALLBACK_PAGE
  });

  afterEach(() => jest.clearAllTimers());

  it('exibe o codinome (AIP-Ipiranga-22B), nunca o slug cru (mistralai/…)', async () => {
    Agentes.list.mockResolvedValue([
      makeAgent({ config: { model: 'mistralai/mixtral-8x22b-instruct' } }),
    ]);
    render(<AgentesPage />);
    const chip = await screen.findByTestId('agente-model-worker-news');
    expect(chip).toHaveTextContent('AIP-Ipiranga-22B');
    // o slug de vendor NÃO aparece em lugar nenhum do card
    const card = await screen.findByTestId('agente-card-worker-news');
    expect(card.textContent).not.toContain('mistralai/');
    expect(card.textContent).not.toContain('mixtral');
  });

  it('agente sem config.model não renderiza a linha de modelo', async () => {
    Agentes.list.mockResolvedValue([makeAgent({ config: {} })]);
    render(<AgentesPage />);
    await screen.findByTestId('agente-card-worker-news');
    await waitFor(() =>
      expect(screen.queryByTestId('agente-model-worker-news')).not.toBeInTheDocument(),
    );
  });
});
