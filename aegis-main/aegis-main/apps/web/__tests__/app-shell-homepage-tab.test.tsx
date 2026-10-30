/**
 * Onda J.1 (2026-05-23) — aba "Página inicial" = seletor + atalho.
 *
 * A aba não tem mais editor inline de blocos de 4 tipos
 * (`feedback_no_deprecation` — delete limpo). Ela agora:
 *   1. Lista as Páginas (dropdown) + opção "Home padrão (seed)".
 *   2. Persiste a escolha em `config.homepage.page_id`.
 *   3. Botão "Editar página inicial no editor de Páginas".
 *
 * Cobertura (>= 6):
 *  1. Render aba com seletor + botão editar.
 *  2. Dropdown lista as Páginas vindas de Pages.list().
 *  3. Opção "Home padrão (seed)" é o default (value vazio).
 *  4. Escolher uma Página seta page_id (texto explicativo muda).
 *  5. Não renderiza mais o editor de blocos (4 tipos) — testids sumiram.
 *  6. Botão "Editar" presente e habilitado.
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
  Iam: { roles: { list: jest.fn() } },
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
  Iam: { roles: { list: jest.Mock } };
  Pages: { get: jest.Mock; create: jest.Mock; list: jest.Mock };
};

const env = () => ({
  source: 'default' as const,
  config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
});

const PAGES = [
  { slug: 'buscar', title: 'Buscar' },
  { slug: 'painel-tatico', title: 'Painel Tático' },
];

beforeEach(() => {
  jest.clearAllMocks();
  _resetAppShellCacheForTests();
  AppShell.getMe.mockResolvedValue(env());
  AppShell.putMe.mockImplementation(async (cfg) => ({ source: 'user', config: cfg }));
  Marketplace.list.mockResolvedValue([]);
  Workspaces.list.mockResolvedValue([]);
  Iam.roles.list.mockResolvedValue([]);
  Pages.list.mockResolvedValue(PAGES);
  Pages.get.mockResolvedValue({ slug: 'inicio', title: 'Início' });
});

async function openHomepage() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-homepage'));
  fireEvent.click(screen.getByTestId('app-shell-tab-homepage'));
  return waitFor(() => screen.getByTestId('inspector-homepage'));
}

describe('Onda J.1 · Página inicial tab (seletor + atalho)', () => {
  it('1. Render aba com seletor e botão editar', async () => {
    await openHomepage();
    expect(screen.getByTestId('homepage-page-select')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-open-editor')).toBeInTheDocument();
  });

  it('2. Dropdown lista as Páginas vindas de Pages.list()', async () => {
    await openHomepage();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Buscar — \/buscar/ })).toBeInTheDocument();
    });
    expect(
      screen.getByRole('option', { name: /Painel Tático — \/painel-tatico/ }),
    ).toBeInTheDocument();
  });

  it('3. Opção Home padrão (seed) é o default (value vazio)', async () => {
    await openHomepage();
    const select = screen.getByTestId('homepage-page-select') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(
      screen.getByRole('option', { name: 'Home padrão (seed)' }),
    ).toBeInTheDocument();
  });

  it('4. Escolher uma Página seta page_id e muda a explicação', async () => {
    await openHomepage();
    await waitFor(() =>
      screen.getByRole('option', { name: /Buscar — \/buscar/ }),
    );
    const select = screen.getByTestId('homepage-page-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'buscar' } });
    expect(select.value).toBe('buscar');
    expect(screen.getByTestId('inspector-homepage')).toHaveTextContent(
      '/buscar',
    );
  });

  it('5. Não renderiza mais o editor de blocos de 4 tipos', async () => {
    await openHomepage();
    expect(screen.queryByTestId('homepage-add-heading')).toBeNull();
    expect(screen.queryByTestId('homepage-add-paragraph')).toBeNull();
    expect(screen.queryByTestId('homepage-add-divider')).toBeNull();
    expect(screen.queryByTestId('homepage-add-link')).toBeNull();
    expect(screen.queryByTestId('homepage-block-edit-0')).toBeNull();
    expect(screen.queryByTestId('homepage-slug-input')).toBeNull();
  });

  it('6. Botão Editar habilitado', async () => {
    await openHomepage();
    const btn = screen.getByTestId('homepage-open-editor') as HTMLButtonElement;
    expect(btn).not.toBeDisabled();
  });
});
