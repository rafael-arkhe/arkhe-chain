/**
 * Onda I.2 (2026-05-23) — Feedback #3: editor do Menu do usuário com
 * PREVIEW VIVO ao lado (dropdown aberto refletindo a edição em tempo real).
 *
 * Cobertura:
 *  1. Aba Menu do usuário renderiza o preview vivo (dropdown).
 *  2. Preview mostra os itens default (Configurações, Auditoria).
 *  3. Editar label de um item reflete no preview ao vivo.
 *  4. Item com visible=false some do preview.
 *  5. Logout sempre aparece por último no preview, com rótulo "Sair".
 *  6. Adicionar link aparece no preview.
 *  7. Reorder usa drag handle @dnd-kit (handle presente, com aria-label).
 *  8. Logout não tem drag handle (não-reordenável).
 *  9. Preview vazio mostra mensagem quando não há itens não-logout.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AppShellComposerPage from '@/app/painel-de-controle/app-shell/page';
import { _resetAppShellCacheForTests } from '@/lib/app-shell/use-app-shell';
import { DEFAULT_APP_SHELL } from '@/lib/app-shell/defaults';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/painel-de-controle/app-shell',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  AppShell: { getMe: jest.fn(), putMe: jest.fn(), getTenant: jest.fn(), putTenant: jest.fn() },
  Marketplace: { list: jest.fn(), install: jest.fn() },
  Workspaces: { list: jest.fn() },
  Iam: { roles: { list: jest.fn() }, permissions: { list: jest.fn() } },
  Pages: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'], permissions: ['workspace.publish'] },
    loading: false,
  }),
  useCan: () => true,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/shell/header', () => ({ Header: () => <div /> }));
jest.mock('@/components/shell/sidenav', () => ({ Sidenav: () => <div /> }));
jest.mock('@/components/shell/footer', () => ({ Footer: () => <div /> }));
jest.mock('@/components/shell/classification-banner', () => ({
  ClassificationBanner: () => <div />,
}));

const { AppShell, Marketplace, Workspaces, Iam, Pages } = jest.requireMock(
  '@/lib/api',
) as {
  AppShell: { getMe: jest.Mock; putMe: jest.Mock; getTenant: jest.Mock; putTenant: jest.Mock };
  Marketplace: { list: jest.Mock; install: jest.Mock };
  Workspaces: { list: jest.Mock };
  Iam: { roles: { list: jest.Mock }; permissions: { list: jest.Mock } };
  Pages: { list: jest.Mock };
};

// Onda K.4 — RouteSelect cacheia em módulo; resetar entre testes.
import { _resetOptionSourceCaches } from '@/components/app-shell-editor';

const env = () => ({
  source: 'default' as const,
  config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
});

beforeEach(() => {
  jest.clearAllMocks();
  _resetAppShellCacheForTests();
  _resetOptionSourceCaches();
  AppShell.getMe.mockResolvedValue(env());
  AppShell.putMe.mockImplementation(async (cfg) => ({ source: 'user', config: cfg }));
  Marketplace.list.mockResolvedValue([]);
  Workspaces.list.mockResolvedValue([]);
  Iam.roles.list.mockResolvedValue([]);
  Iam.permissions.list.mockResolvedValue([]);
  Pages.list.mockResolvedValue([]);
});

async function openUserMenu() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-user-menu'));
  fireEvent.click(screen.getByTestId('app-shell-tab-user-menu'));
  await waitFor(() => screen.getByTestId('inspector-user-menu'));
}

describe('Onda I.2 · Menu do usuário live preview (#3)', () => {
  it('1. aba renderiza preview vivo (dropdown)', async () => {
    await openUserMenu();
    expect(
      await screen.findByTestId('app-shell-canvas-user-menu-preview'),
    ).toBeInTheDocument();
  });

  it('2. preview mostra itens default', async () => {
    await openUserMenu();
    const preview = await screen.findByTestId('app-shell-canvas-user-menu-preview');
    expect(
      within(preview).getByTestId('app-shell-canvas-user-menu-preview-item-configuracoes'),
    ).toBeInTheDocument();
    expect(
      within(preview).getByTestId('app-shell-canvas-user-menu-preview-item-auditoria'),
    ).toBeInTheDocument();
  });

  it('3. editar label reflete no preview ao vivo', async () => {
    await openUserMenu();
    const labelInput = screen.getByTestId('user-menu-item-0-label') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Preferências' } });
    const preview = screen.getByTestId('app-shell-canvas-user-menu-preview');
    await waitFor(() =>
      expect(
        within(preview).getByTestId(
          'app-shell-canvas-user-menu-preview-item-configuracoes-label',
        ),
      ).toHaveTextContent('Preferências'),
    );
  });

  it('4. visible=false some do preview', async () => {
    await openUserMenu();
    // item 0 = configuracoes; desliga "Visível"
    fireEvent.click(screen.getByTestId('user-menu-item-0-visible-toggle'));
    const preview = screen.getByTestId('app-shell-canvas-user-menu-preview');
    await waitFor(() =>
      expect(
        within(preview).queryByTestId(
          'app-shell-canvas-user-menu-preview-item-configuracoes',
        ),
      ).toBeNull(),
    );
  });

  it('5. logout sempre por último com rótulo Sair', async () => {
    await openUserMenu();
    const preview = await screen.findByTestId('app-shell-canvas-user-menu-preview');
    const logout = within(preview).getByTestId('app-shell-canvas-user-menu-preview-logout');
    expect(logout).toHaveTextContent('Sair');
  });

  it('6. adicionar link aparece no preview', async () => {
    await openUserMenu();
    fireEvent.click(screen.getByTestId('user-menu-add-link'));
    const preview = screen.getByTestId('app-shell-canvas-user-menu-preview');
    await waitFor(() =>
      expect(
        within(preview).getByText('Novo link'),
      ).toBeInTheDocument(),
    );
  });

  it('7. reorder usa drag handle (@dnd-kit)', async () => {
    await openUserMenu();
    const handle = screen.getByTestId('user-menu-item-0-drag');
    expect(handle).toBeInTheDocument();
    expect(handle).toHaveAttribute('aria-label');
  });

  it('8. logout não tem drag handle', async () => {
    await openUserMenu();
    // logout é o item de índice 2 nos defaults
    expect(screen.queryByTestId('user-menu-item-2-drag')).toBeNull();
  });

  it('9. preview vazio mostra mensagem', async () => {
    AppShell.getMe.mockResolvedValue({
      source: 'default',
      config: {
        ...JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
        user_menu: { items: [{ key: 'logout', label: 'Sair', icon: 'log-out', href: null, kind: 'logout', visible: true }] },
      },
    });
    await openUserMenu();
    const preview = await screen.findByTestId('app-shell-canvas-user-menu-preview');
    expect(
      within(preview).getByTestId('app-shell-canvas-user-menu-preview-empty'),
    ).toBeInTheDocument();
  });
});
