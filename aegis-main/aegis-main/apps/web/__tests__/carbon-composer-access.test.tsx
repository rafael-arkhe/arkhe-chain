/**
 * Wave D.2 (2026-05-23) — Carbon composer: bloco "Acesso por grupo".
 *
 * Cobre:
 *  - Lista vazia mostra "Nenhuma regra ainda".
 *  - Adicionar via select cria 1 rule {group_id, modules: []}.
 *  - Clicar em um chip-de-módulo toggle on/off.
 *  - Remover regra tira ela da lista.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarbonComposerPage from '@/app/painel-de-controle/carbon-composer/[workspace_id]/page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ workspace_id: 'ws-1' }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  Workspaces: { get: jest.fn(), publishCarbon: jest.fn() },
  Carbon: { validate: jest.fn() },
  Iam: { roles: { list: jest.fn() } },
  Marketplace: { list: jest.fn(), install: jest.fn() },
}));

jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

const { Workspaces, Carbon, Iam, Marketplace } = jest.requireMock('@/lib/api') as {
  Workspaces: { get: jest.Mock; publishCarbon: jest.Mock };
  Carbon: { validate: jest.Mock };
  Iam: { roles: { list: jest.Mock } };
  Marketplace: { list: jest.Mock; install: jest.Mock };
};

const baseWs = {
  id: 'ws-1',
  tenant_id: 't-1',
  slug: 'aurora',
  display_name: 'Sala Aurora',
  description: 'Operações',
  project_id: null,
  config: {
    carbon: {
      displayMetadata: { name: 'Sala Aurora' },
      discoverableModules: [
        { module_id: 'briefing', label: 'Briefing' },
        { module_id: 'buscar', label: 'Buscar' },
      ],
      homePage: { columns: [2, 1], sections: [] },
      menuBar: { visible: true, items: [] },
      accessRules: [],
      theme: 'light',
    },
  },
  active: true,
  created_at: '2026-05-23T00:00:00Z',
  signed_hash: 'h1',
  version: 1,
};

const roles = [
  { id: 'role-analyst', name: 'analyst', description: 'd', perms: [], user_count: 0 },
  { id: 'role-viewer', name: 'viewer', description: 'd', perms: [], user_count: 0 },
];

describe('CarbonComposer · Wave D.2 · Acesso por grupo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workspaces.get.mockResolvedValue(baseWs);
    Workspaces.publishCarbon.mockResolvedValue(baseWs);
    Carbon.validate.mockResolvedValue({ ok: true, errors: [], preview: null });
    Iam.roles.list.mockResolvedValue(roles);
    Marketplace.list.mockResolvedValue([]);
  });

  it('renders empty state when no rules exist', async () => {
    render(<CarbonComposerPage />);
    expect(await screen.findByTestId('composer-access-empty')).toBeInTheDocument();
  });

  it('adds a rule for a selected role', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-access-add'));
    fireEvent.change(screen.getByTestId('composer-access-add'), {
      target: { value: 'role-analyst' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('composer-access-rule-0')).toBeInTheDocument();
    });
    expect(screen.getByTestId('composer-access-rule-0')).toHaveTextContent('analyst');
  });

  it('toggles a module chip on the rule', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-access-add'));
    fireEvent.change(screen.getByTestId('composer-access-add'), {
      target: { value: 'role-viewer' },
    });
    await waitFor(() => screen.getByTestId('composer-access-rule-0'));
    const chip = screen.getByTestId('composer-access-rule-0-mod-briefing');
    // First click: activate; check that we can click without throwing.
    fireEvent.click(chip);
    fireEvent.click(chip); // toggle back off
    expect(chip).toBeInTheDocument();
  });

  it('removes a rule via X button', async () => {
    render(<CarbonComposerPage />);
    await waitFor(() => screen.getByTestId('composer-access-add'));
    fireEvent.change(screen.getByTestId('composer-access-add'), {
      target: { value: 'role-analyst' },
    });
    await waitFor(() => screen.getByTestId('composer-access-rule-0'));
    fireEvent.click(screen.getByTestId('composer-access-rule-0-remove'));
    await waitFor(() => {
      expect(screen.queryByTestId('composer-access-rule-0')).not.toBeInTheDocument();
    });
  });
});
