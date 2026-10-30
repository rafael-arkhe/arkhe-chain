/**
 * Wave H.4.Y (2026-05-23) — Footer tab tests (status bar editor).
 *
 * Cobertura (>= 10):
 *  1. Render inspector com toggle visível.
 *  2. Toggle visibility footer.
 *  3. Adicionar item sistema (CPU).
 *  4. Adicionar item custom com label.
 *  5. Reorder item via setas (up/down).
 *  6. Trocar position para center/right.
 *  7. Remover item.
 *  8. Save persiste status_bar_items.
 *  9. Toggle version_visible.
 * 10. Copyright text input.
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

// Onda K.4 — RouteSelect cacheia em módulo; resetar entre testes.
import { _resetOptionSourceCaches } from '@/components/app-shell-editor';

const SAMPLE_PAGES = [
  { slug: 'operacoes', title: 'Operações', route: '/operacoes', status: 'published' },
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

async function openFooter() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-footer'));
  fireEvent.click(screen.getByTestId('app-shell-tab-footer'));
  return waitFor(() => screen.getByTestId('inspector-footer'));
}

describe('Wave H.4.Y · Footer tab', () => {
  it('1. Render inspector com toggles', async () => {
    await openFooter();
    expect(screen.getByTestId('footer-visible-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('footer-version-visible-toggle')).toBeInTheDocument();
  });

  it('2. Toggle visibility footer', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-visible-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].footer.visible).toBe(false);
  });

  it('3. Adicionar item sistema CPU', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-status-add-system'));
    expect(await screen.findByTestId('footer-status-item-0')).toBeInTheDocument();
    const sel = screen.getByTestId('footer-status-item-0-system-key') as HTMLSelectElement;
    expect(sel.value).toBe('system.cpu');
  });

  it('4. Adicionar item custom com label', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-status-add-custom'));
    fireEvent.change(screen.getByTestId('footer-status-item-0-label'), {
      target: { value: 'Operação ATIVA' },
    });
    expect(
      (screen.getByTestId('footer-status-item-0-label') as HTMLInputElement).value,
    ).toBe('Operação ATIVA');
  });

  it('5. Reorder item via setas', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-status-add-system'));
    fireEvent.click(screen.getByTestId('footer-status-add-custom'));
    // O segundo é custom; clico no up para tornar #0.
    fireEvent.click(screen.getByTestId('footer-status-item-1-up'));
    // Após swap o custom virou #0; verificar tipo.
    expect(
      (screen.getByTestId('footer-status-item-0-label') as HTMLInputElement).value,
    ).toBe('Novo item');
  });

  it('6. Trocar position para center/right', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-status-add-system'));
    fireEvent.click(screen.getByTestId('footer-status-item-0-pos-center'));
    expect(screen.getByTestId('footer-status-item-0-pos-center')).toHaveClass(
      'bg-primary',
    );
    fireEvent.click(screen.getByTestId('footer-status-item-0-pos-right'));
    expect(screen.getByTestId('footer-status-item-0-pos-right')).toHaveClass(
      'bg-primary',
    );
  });

  it('7. Remover item', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-status-add-system'));
    fireEvent.click(screen.getByTestId('footer-status-item-0-remove'));
    expect(screen.queryByTestId('footer-status-item-0')).toBeNull();
  });

  it('8. Save persiste status_bar_items', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-status-add-custom'));
    fireEvent.change(screen.getByTestId('footer-status-item-0-label'), {
      target: { value: 'OP-CENTRAL' },
    });
    fireEvent.click(screen.getByTestId('footer-status-item-0-pos-center'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const items = AppShell.putMe.mock.calls[0][0].footer.status_bar_items;
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('OP-CENTRAL');
    expect(items[0].position).toBe('center');
  });

  it('9. Toggle version_visible off', async () => {
    await openFooter();
    fireEvent.click(screen.getByTestId('footer-version-visible-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].footer.version_visible).toBe(false);
  });

  it('10. Copyright text input', async () => {
    await openFooter();
    fireEvent.change(screen.getByTestId('footer-copyright-input'), {
      target: { value: '© 2026 Safe-Core' },
    });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].footer.copyright_text).toBe(
      '© 2026 Safe-Core',
    );
  });
});
