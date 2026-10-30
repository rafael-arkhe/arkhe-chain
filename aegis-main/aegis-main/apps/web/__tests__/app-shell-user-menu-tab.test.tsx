/**
 * Wave H.4.Y (2026-05-23) — Menu do usuário tab tests.
 *
 * Cobertura (>= 8):
 *  1. Render inspector com items default (configuracoes/auditoria/logout).
 *  2. Adicionar link customizado.
 *  3. Adicionar divider.
 *  4. Move link com setas.
 *  5. Não permite mover além do logout.
 *  6. Remover link funciona; remover logout não.
 *  7. Toggle visibility item.
 *  8. Save persiste lista de items.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppShellComposerPage from '@/app/painel-de-controle/app-shell/page';
import { _resetAppShellCacheForTests } from '@/lib/app-shell/use-app-shell';
import { DEFAULT_APP_SHELL } from '@/lib/app-shell/defaults';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/painel-de-controle/app-shell',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  AppShell: {
    getMe: jest.fn(),
    putMe: jest.fn(),
    getTenant: jest.fn(),
    putTenant: jest.fn(),
  },
  Marketplace: { list: jest.fn(), install: jest.fn() },
  Workspaces: { list: jest.fn() },
  Iam: { roles: { list: jest.fn() }, permissions: { list: jest.fn() } },
  Pages: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    duplicate: jest.fn(),
    delete: jest.fn(),
  },
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

// Onda K.4 — RouteSelect/PermSelect cacheiam em módulo; resetar entre testes.
import { _resetOptionSourceCaches } from '@/components/app-shell-editor';

const SAMPLE_PAGES = [
  { slug: 'docs', title: 'Documentação', route: '/docs', status: 'published' },
];

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
  Pages.list.mockResolvedValue(SAMPLE_PAGES);
});

async function openUserMenu() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-user-menu'));
  fireEvent.click(screen.getByTestId('app-shell-tab-user-menu'));
  return waitFor(() => screen.getByTestId('inspector-user-menu'));
}

describe('Wave H.4.Y · Menu do usuário tab', () => {
  it('1. Render inspector com items default', async () => {
    await openUserMenu();
    expect(screen.getByTestId('user-menu-item-0')).toBeInTheDocument();
    // Pelo menos 3 items default em DEFAULT_APP_SHELL.user_menu.items.
    expect(screen.getByTestId('user-menu-item-2')).toBeInTheDocument();
  });

  it('2. Adicionar link customizado', async () => {
    await openUserMenu();
    fireEvent.click(screen.getByTestId('user-menu-add-link'));
    // novo link entrou ANTES do logout — encontrável por kind=link.
    const newLinkLabel = await screen.findAllByTestId(/^user-menu-item-\d+-label$/);
    expect(newLinkLabel.length).toBeGreaterThanOrEqual(3);
  });

  it('3. Adicionar divider', async () => {
    await openUserMenu();
    fireEvent.click(screen.getByTestId('user-menu-add-divider'));
    // Encontra item com kind=divider através do data-kind atrib.
    const items = screen.getAllByTestId(/^user-menu-item-\d+$/);
    const dividerIdx = items.findIndex(
      (el) => (el as HTMLElement).dataset.kind === 'divider',
    );
    expect(dividerIdx).toBeGreaterThanOrEqual(0);
  });

  it('4. Move link com setas', async () => {
    await openUserMenu();
    // Move o item 0 (configuracoes) para baixo.
    const label0 = (screen.getByTestId('user-menu-item-0-label') as HTMLInputElement).value;
    fireEvent.click(screen.getByTestId('user-menu-item-0-down'));
    const newLabel0 = (screen.getByTestId('user-menu-item-0-label') as HTMLInputElement).value;
    expect(newLabel0).not.toBe(label0);
  });

  it('5. Logout sempre last (item logout sem botão de remoção)', async () => {
    await openUserMenu();
    const items = screen.getAllByTestId(/^user-menu-item-\d+$/);
    const lastIdx = items.length - 1;
    expect(
      (items[lastIdx] as HTMLElement).dataset.kind,
    ).toBe('logout');
    // Logout não tem botão de remover.
    const removeBtn = screen.queryByTestId(`user-menu-item-${lastIdx}-remove`);
    expect(removeBtn).toBeNull();
    // up/down ficam disabled
    const upBtn = screen.getByTestId(`user-menu-item-${lastIdx}-up`);
    expect(upBtn).toBeDisabled();
  });

  it('6. Remover link funciona', async () => {
    await openUserMenu();
    fireEvent.click(screen.getByTestId('user-menu-item-0-remove'));
    // Items decrescem de 3 para 2 (logout sobrevive).
    const remaining = screen.getAllByTestId(/^user-menu-item-\d+$/);
    expect(remaining.length).toBeLessThan(3);
  });

  it('7. Toggle visibility item', async () => {
    await openUserMenu();
    fireEvent.click(screen.getByTestId('user-menu-item-0-visible-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const items = AppShell.putMe.mock.calls[0][0].user_menu.items;
    expect(items[0].visible).toBe(false);
  });

  it('8. Save persiste lista de items', async () => {
    await openUserMenu();
    fireEvent.click(screen.getByTestId('user-menu-add-link'));
    // Edita o newly inserted (índice 2, antes do logout)
    fireEvent.change(screen.getByTestId('user-menu-item-2-label'), {
      target: { value: 'Suporte' },
    });
    // Onda K.4 (Feedback #4) — href agora é dropdown de Páginas (RouteSelect).
    const hrefWrap = screen.getByTestId('user-menu-item-2-href');
    fireEvent.click(hrefWrap.querySelector('button')!);
    fireEvent.click(
      await screen.findByTestId('user-menu-item-2-href-option-/docs'),
    );
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const items = AppShell.putMe.mock.calls[0][0].user_menu.items;
    const suporte = items.find((it: { label: string }) => it.label === 'Suporte');
    expect(suporte).toBeTruthy();
    expect(suporte.href).toBe('/docs');
  });

  // Onda K.4 (Feedback #2) — "Restaurar padrão" repõe os itens default.
  it('9. Restaurar padrão repõe itens default', async () => {
    await openUserMenu();
    // Remove o item 0 (Configurações).
    fireEvent.click(screen.getByTestId('user-menu-item-0-remove'));
    fireEvent.click(screen.getByTestId('user-menu-restore-default'));
    fireEvent.click(await screen.findByTestId('confirm-ok'));
    // Após restaurar, o primeiro item volta a ser "Configurações".
    await waitFor(() =>
      expect(
        (screen.getByTestId('user-menu-item-0-label') as HTMLInputElement).value,
      ).toBe('Configurações'),
    );
  });
});
