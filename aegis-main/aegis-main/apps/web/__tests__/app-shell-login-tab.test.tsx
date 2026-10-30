/**
 * M2 (2026-05-24) — Seção "Login" no Layout do App.
 *
 * Cobertura:
 *  1. Tab "Login" existe na paleta e abre o inspetor.
 *  2. Default = "usar marca padrão AEGIS" ligado; campos de marca ocultos.
 *  3. Desligar o toggle revela os campos (logo/slogan/cor/fundo/mensagem).
 *  4. Editar slogan + cor + mensagem persiste via putMe.
 *  5. Preview ao vivo reflete o toggle (brand-default) e o slogan.
 *  6. Religar o toggle volta a marca padrão (use_default_aegis=true salvo).
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
  Styles: { uploadLogo: jest.fn() },
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

const env = () => ({
  source: 'default' as const,
  config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
});

beforeEach(() => {
  jest.clearAllMocks();
  _resetAppShellCacheForTests();
  AppShell.getMe.mockResolvedValue(env());
  AppShell.putMe.mockImplementation(async (cfg) => ({ source: 'user', config: cfg }));
  Marketplace.list.mockResolvedValue([]);
  Workspaces.list.mockResolvedValue([]);
  Iam.roles.list.mockResolvedValue([]);
});

async function openLogin() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-login'));
  fireEvent.click(screen.getByTestId('app-shell-tab-login'));
  return waitFor(() => screen.getByTestId('inspector-login'));
}

describe('M2 · Tab Login no Layout do App', () => {
  it('1. tab Login existe e abre o inspetor', async () => {
    await openLogin();
    expect(screen.getByTestId('inspector-login')).toBeInTheDocument();
    expect(screen.getByTestId('login-use-default-toggle')).toBeInTheDocument();
  });

  it('2. default = marca padrão AEGIS ligada, campos ocultos', async () => {
    await openLogin();
    const toggle = screen.getByTestId('login-use-default-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.queryByTestId('login-brand-fields')).not.toBeInTheDocument();
  });

  it('3. desligar o toggle revela os campos de marca', async () => {
    await openLogin();
    fireEvent.click(screen.getByTestId('login-use-default-toggle'));
    expect(screen.getByTestId('login-brand-fields')).toBeInTheDocument();
    expect(screen.getByTestId('login-slogan-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-primary-color-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-message-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-logo-file')).toBeInTheDocument();
  });

  it('4. editar slogan/cor/mensagem persiste via putMe', async () => {
    await openLogin();
    fireEvent.click(screen.getByTestId('login-use-default-toggle'));
    fireEvent.change(screen.getByTestId('login-slogan-input'), {
      target: { value: 'Guarda Municipal' },
    });
    fireEvent.change(screen.getByTestId('login-primary-color-input'), {
      target: { value: '#C8341F' },
    });
    fireEvent.change(screen.getByTestId('login-message-input'), {
      target: { value: 'Acesso restrito.' },
    });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const called = AppShell.putMe.mock.calls[0][0];
    expect(called.login.use_default_aegis).toBe(false);
    expect(called.login.slogan).toBe('Guarda Municipal');
    expect(called.login.primary_color).toBe('#C8341F');
    expect(called.login.message).toBe('Acesso restrito.');
  });

  it('5. preview reflete o toggle e o slogan', async () => {
    await openLogin();
    expect(screen.getByTestId('login-preview')).toHaveAttribute(
      'data-brand-default',
      'true',
    );
    fireEvent.click(screen.getByTestId('login-use-default-toggle'));
    fireEvent.change(screen.getByTestId('login-slogan-input'), {
      target: { value: 'Defesa Civil' },
    });
    expect(screen.getByTestId('login-preview')).toHaveAttribute(
      'data-brand-default',
      'false',
    );
    expect(screen.getByTestId('login-preview-slogan')).toHaveTextContent(
      'Defesa Civil',
    );
  });

  it('5a. Onda M3 — logo da prévia NÃO tem filtro invert (não fica laranja)', async () => {
    // Bug: o logo AEGIS (azul #2D77BE) ganhava `invert` e virava laranja.
    // O logo deve seguir a cor real da marca — idêntico à /login.
    await openLogin();
    const logo = screen.getByTestId('login-preview-logo');
    expect(logo.className).not.toContain('invert');
    // Mesmo após ligar marca custom, segue sem filtro.
    fireEvent.click(screen.getByTestId('login-use-default-toggle'));
    expect(screen.getByTestId('login-preview-logo').className).not.toContain(
      'invert',
    );
  });

  it('6. religar o toggle salva use_default_aegis=true', async () => {
    await openLogin();
    fireEvent.click(screen.getByTestId('login-use-default-toggle')); // off
    fireEvent.change(screen.getByTestId('login-slogan-input'), {
      target: { value: 'X' },
    });
    fireEvent.click(screen.getByTestId('login-use-default-toggle')); // on again
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].login.use_default_aegis).toBe(true);
  });
});
