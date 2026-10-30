/**
 * Wave D.2 (2026-05-23) — Carbon composer: bloco "Aparência" (theme).
 *
 * Cobre:
 *  - Render mostra 3 botões: claro/escuro/auto.
 *  - Default light fica selecionado quando config.carbon.theme === 'light'.
 *  - Clicar em Dark muda aria-checked.
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
      discoverableModules: [],
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

describe('CarbonComposer · Wave D.2 · Aparência (theme)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workspaces.get.mockResolvedValue(baseWs);
    Workspaces.publishCarbon.mockResolvedValue(baseWs);
    Carbon.validate.mockResolvedValue({ ok: true, errors: [], preview: null });
    Iam.roles.list.mockResolvedValue([]);
    Marketplace.list.mockResolvedValue([]);
  });

  it('renders the 3 theme buttons', async () => {
    render(<CarbonComposerPage />);
    expect(await screen.findByTestId('composer-theme-light')).toBeInTheDocument();
    expect(screen.getByTestId('composer-theme-dark')).toBeInTheDocument();
    expect(screen.getByTestId('composer-theme-auto')).toBeInTheDocument();
  });

  it('marks light as checked by default', async () => {
    render(<CarbonComposerPage />);
    const lightBtn = await screen.findByTestId('composer-theme-light');
    expect(lightBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles selection when dark is clicked', async () => {
    render(<CarbonComposerPage />);
    const dark = await screen.findByTestId('composer-theme-dark');
    expect(dark).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(dark);
    await waitFor(() => {
      expect(dark).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByTestId('composer-theme-light')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
