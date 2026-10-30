/**
 * Onda I.2 (2026-05-23) — Feedback #5: toggle "Editar em tela cheia" no
 * composer /painel-de-controle/app-shell. ON ⇒ composer ocupa 100vw/100vh
 * (classes fixed inset-0) e seta data-app-shell-fullscreen no <body>
 * (globals.css oculta a sidenav do Painel de Controle).
 *
 * Onda M1.a (#5) — default = tela cheia ao abrir (useState(true)). Estado
 * de view (não persiste). Testes ajustados para o novo default.
 *
 * Cobertura:
 *  1. Default ON: toggle renderiza com aria-pressed=true + label "Voltar ao Painel".
 *  2. Default ON ⇒ root já tem data-fullscreen="true" + classes fixed inset-0.
 *  3. Default ON ⇒ <body> já tem data-app-shell-fullscreen="true".
 *  4. Clicar desliga: aria-pressed=false + label muda + <body> perde o atributo.
 *  5. Religar ⇒ <body> recupera o atributo.
 *  6. Unmount limpa o atributo do body (sem vazar estado global).
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
  AppShell: { getMe: jest.fn(), putMe: jest.fn(), getTenant: jest.fn(), putTenant: jest.fn() },
  Marketplace: { list: jest.fn(), install: jest.fn() },
  Workspaces: { list: jest.fn() },
  Iam: { roles: { list: jest.fn() } },
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

const { AppShell, Marketplace, Workspaces, Iam } = jest.requireMock('@/lib/api') as {
  AppShell: { getMe: jest.Mock; putMe: jest.Mock; getTenant: jest.Mock; putTenant: jest.Mock };
  Marketplace: { list: jest.Mock; install: jest.Mock };
  Workspaces: { list: jest.Mock };
  Iam: { roles: { list: jest.Mock } };
};

beforeEach(() => {
  jest.clearAllMocks();
  _resetAppShellCacheForTests();
  AppShell.getMe.mockResolvedValue({
    source: 'default',
    config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
  });
  AppShell.putMe.mockImplementation(async (cfg) => ({ source: 'user', config: cfg }));
  Marketplace.list.mockResolvedValue([]);
  Workspaces.list.mockResolvedValue([]);
  Iam.roles.list.mockResolvedValue([]);
  document.body.removeAttribute('data-app-shell-fullscreen');
});

async function mountComposer() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-root'));
}

describe('Onda I.2 · Fullscreen mode (#5)', () => {
  it('1. default ON: toggle renderiza com aria-pressed=true + label "Voltar ao Painel"', async () => {
    await mountComposer();
    const toggle = screen.getByTestId('app-shell-fullscreen-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('app-shell-fullscreen-toggle-label')).toHaveTextContent(
      'Voltar ao Painel',
    );
  });

  it('2. default ON ⇒ root já tem data-fullscreen + classes fixed inset-0', async () => {
    await mountComposer();
    const root = screen.getByTestId('app-shell-root');
    expect(root).toHaveAttribute('data-fullscreen', 'true');
    expect(root.className).toMatch(/fixed/);
    expect(root.className).toMatch(/inset-0/);
  });

  it('3. default ON ⇒ body já tem data-app-shell-fullscreen', async () => {
    await mountComposer();
    await waitFor(() =>
      expect(document.body.getAttribute('data-app-shell-fullscreen')).toBe('true'),
    );
  });

  it('4. clicar desliga: aria-pressed=false + label muda + body perde o atributo', async () => {
    await mountComposer();
    await waitFor(() =>
      expect(document.body.getAttribute('data-app-shell-fullscreen')).toBe('true'),
    );
    fireEvent.click(screen.getByTestId('app-shell-fullscreen-toggle'));
    const toggle = screen.getByTestId('app-shell-fullscreen-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('app-shell-fullscreen-toggle-label')).toHaveTextContent(
      'Editar em tela cheia',
    );
    await waitFor(() =>
      expect(document.body.hasAttribute('data-app-shell-fullscreen')).toBe(false),
    );
  });

  it('5. religar ⇒ body recupera o atributo', async () => {
    await mountComposer();
    // desliga
    fireEvent.click(screen.getByTestId('app-shell-fullscreen-toggle'));
    await waitFor(() =>
      expect(document.body.hasAttribute('data-app-shell-fullscreen')).toBe(false),
    );
    // religa
    fireEvent.click(screen.getByTestId('app-shell-fullscreen-toggle'));
    await waitFor(() =>
      expect(document.body.getAttribute('data-app-shell-fullscreen')).toBe('true'),
    );
  });

  it('6. unmount limpa o atributo do body', async () => {
    const { unmount } = render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-root'));
    // default ON já setou o atributo.
    await waitFor(() =>
      expect(document.body.getAttribute('data-app-shell-fullscreen')).toBe('true'),
    );
    unmount();
    expect(document.body.hasAttribute('data-app-shell-fullscreen')).toBe(false);
  });
});
