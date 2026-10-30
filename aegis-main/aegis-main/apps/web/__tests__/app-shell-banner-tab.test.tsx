/**
 * Wave H.4.Y (2026-05-23) — Banner tab tests.
 *
 * Cobertura (>= 8):
 *  1. Render aba banner com toggle visível e enabled coerentes.
 *  2. Mudar classification_default → reflete no preview.
 *  3. custom_text + show_clock toggle.
 *  4. Position top/bottom switch.
 *  5. Save chama putMe com banner.{custom_text,show_clock}.
 *  6. Dismissible toggle.
 *  7. BG/text color inputs.
 *  8. Preview reage a custom_text.
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

async function openBanner() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-banner'));
  fireEvent.click(screen.getByTestId('app-shell-tab-banner'));
  return waitFor(() => screen.getByTestId('inspector-banner'));
}

describe('Wave H.4.Y · Banner tab', () => {
  it('1. Renderiza aba com inspetor e toggle padrão', async () => {
    await openBanner();
    expect(screen.getByTestId('banner-visible-toggle')).toBeInTheDocument();
  });

  it('2. Mudar classification_default reflete no preview', async () => {
    await openBanner();
    const select = screen.getByTestId('banner-classification-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'confidencial' } });
    expect(screen.getByTestId('banner-preview')).toHaveTextContent('CONFIDENCIAL');
  });

  it('3. custom_text + show_clock toggle', async () => {
    await openBanner();
    fireEvent.change(screen.getByTestId('banner-custom-text-input'), {
      target: { value: 'Operação Alfa' },
    });
    fireEvent.click(screen.getByTestId('banner-show-clock-toggle'));
    expect(screen.getByTestId('banner-preview')).toHaveTextContent('Operação Alfa');
    expect(screen.getByTestId('banner-preview-clock')).toBeInTheDocument();
  });

  it('4. Position top/bottom switch', async () => {
    await openBanner();
    fireEvent.click(screen.getByTestId('banner-position-bottom'));
    fireEvent.click(screen.getByTestId('banner-position-top'));
    expect(screen.getByTestId('banner-position-top')).toHaveClass('bg-primary');
  });

  it('5. Save chama putMe com banner extendido', async () => {
    await openBanner();
    fireEvent.change(screen.getByTestId('banner-custom-text-input'), {
      target: { value: 'OP·X' },
    });
    fireEvent.click(screen.getByTestId('banner-show-clock-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const called = AppShell.putMe.mock.calls[0][0];
    expect(called.banner.custom_text).toBe('OP·X');
    expect(called.banner.show_clock).toBe(true);
  });

  it('6. Dismissible toggle', async () => {
    await openBanner();
    fireEvent.click(screen.getByTestId('banner-dismissible-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].banner.dismissible).toBe(true);
  });

  it('7. BG/text color inputs setam strings hex', async () => {
    await openBanner();
    fireEvent.change(screen.getByTestId('banner-bg-input'), {
      target: { value: '#0d2c4d' },
    });
    fireEvent.change(screen.getByTestId('banner-text-color-input'), {
      target: { value: '#ffffff' },
    });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const called = AppShell.putMe.mock.calls[0][0];
    expect(called.banner.bg).toBe('#0d2c4d');
    expect(called.banner.text).toBe('#ffffff');
  });

  it('8. Preview reage a custom_text imediatamente', async () => {
    await openBanner();
    fireEvent.change(screen.getByTestId('banner-custom-text-input'), {
      target: { value: 'TESTANDO' },
    });
    expect(screen.getByTestId('banner-preview')).toHaveTextContent('TESTANDO');
  });

  // ── Onda M1.a (#11) — controles de truncamento ──────────────────────────
  it('9. controles de truncamento aparecem com defaults', async () => {
    await openBanner();
    const enabled = screen.getByTestId(
      'banner-truncate-enabled-toggle',
    ) as HTMLInputElement;
    const maxChars = screen.getByTestId(
      'banner-truncate-max-chars-input',
    ) as HTMLInputElement;
    const responsive = screen.getByTestId(
      'banner-truncate-responsive-toggle',
    ) as HTMLInputElement;
    expect(enabled.checked).toBe(true);
    expect(maxChars.value).toBe('24');
    expect(responsive.checked).toBe(true);
  });

  it('10. Save persiste banner.truncate editado', async () => {
    await openBanner();
    fireEvent.change(screen.getByTestId('banner-truncate-max-chars-input'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByTestId('banner-truncate-responsive-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const called = AppShell.putMe.mock.calls[0][0];
    expect(called.banner.truncate.enabled).toBe(true);
    expect(called.banner.truncate.max_chars_per_slot).toBe(12);
    expect(called.banner.truncate.responsive).toBe(false);
  });

  it('11. desligar truncamento desabilita o campo de máximo', async () => {
    await openBanner();
    fireEvent.click(screen.getByTestId('banner-truncate-enabled-toggle'));
    expect(screen.getByTestId('banner-truncate-max-chars-input')).toBeDisabled();
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].banner.truncate.enabled).toBe(false);
  });
});
