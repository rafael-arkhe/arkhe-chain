/**
 * W3 (2026-06-28) — o board da /agentes LÊ os defaults da frota gravados em
 * Page.config.params (registry de Páginas) e os aplica:
 *   - a faixa "Padrão da frota" mostra a cadência configurada;
 *   - um agente sem agenda própria herda a CADÊNCIA DEFAULT da frota no
 *     seletor de cron (em vez do literal "off").
 *
 * Pages.get é parcialmente mockado (requireActual + override) para injetar a
 * config sem quebrar os demais exports de @/lib/api usados pelo shell.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
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

// Partial mock: mantém todos os exports reais de @/lib/api, só troca Pages.get.
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
    // sem cron próprio → deve herdar a cadência default da frota
    last_run_at: null,
    last_run_status: null,
    ...overrides,
  } as AgentOut;
}

function pageWithCron(defaultCron: string) {
  return {
    slug: 'agentes',
    title: 'Agentes',
    route: '/agentes',
    status: 'published',
    workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
    marking_requirements: [],
    iam_perm_required: 'security.agentes.view',
    config: {
      mode: 'app_route',
      experience_kind: 'agents',
      note: 'n',
      params: { default_cron: defaultCron },
    },
    last_edited_by: null,
    last_edited_at: null,
    created_at: null,
  };
}

describe('W3 — board /agentes lê defaults da frota', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Agentes.list.mockResolvedValue([makeAgent({ cron: undefined })]);
    Agentes.runs.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('faixa "Padrão da frota" mostra a cadência configurada', async () => {
    Pages.get.mockResolvedValue(pageWithCron('every_hour'));
    render(<AgentesPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agentes-fleet-cron')).toHaveTextContent('Toda hora'),
    );
  });

  it('agente sem agenda herda a cadência default no seletor de cron', async () => {
    Pages.get.mockResolvedValue(pageWithCron('every_hour'));
    render(<AgentesPage />);
    const card = await screen.findByTestId('agente-card-worker-news');
    await waitFor(() => {
      const select = within(card).getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('every_hour');
    });
  });

  it('offline (Pages.get rejeita) → cai no default "off" sem quebrar o board', async () => {
    Pages.get.mockRejectedValue(new Error('offline'));
    render(<AgentesPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agentes-fleet-cron')).toHaveTextContent('Sem cron'),
    );
  });
});
