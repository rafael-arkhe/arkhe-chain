/**
 * Wave E.1 (2026-05-23) — /painel-de-controle/app-shell composer.
 *
 * Cobertura (>= 8):
 *  1. Renderiza skeleton enquanto carrega.
 *  2. Carrega config via AppShell.getMe e popula draft.
 *  3. Tab Banner: edita subtitle, salva, chama putMe.
 *  4. Tab Página inicial: adiciona section + item.
 *  5. Tab Aparência: toggle Dark muda tema.
 *  6. Tab Rodapé: adiciona coluna + link.
 *  7. Tab Barra superior: adiciona item Manuais.
 *  8. Scope tenant dispara ConfirmDialog antes de chamar putTenant.
 *  9. Erro do backend mostra mensagem inline.
 * 10. Origin label muda quando source="user" vs "tenant".
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppShellComposerPage from '@/app/painel-de-controle/app-shell/page';
import { _resetAppShellCacheForTests } from '@/lib/app-shell/use-app-shell';

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
  // Wave F.1 — Marketplace + Permissões padrão tabs.
  // Onda I.5: a aba "Loja de apps" foi refinada e agora consome
  // storefront()+installed() (gestão de navegação dos apps instalados);
  // o fluxo de Habilitar/Instalar migrou para /painel-de-controle/loja.
  Marketplace: {
    storefront: jest.fn(),
    installed: jest.fn(),
  },
  Workspaces: {
    list: jest.fn(),
  },
  Iam: {
    roles: {
      list: jest.fn(),
    },
    // Onda K.4 — PermSelect consome o catálogo IAM.
    permissions: {
      list: jest.fn(),
    },
  },
  // Wave H.4.Y — Pages used by Homepage tab; Onda K.4 — RouteSelect.
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
    principal: {
      username: 'admin',
      roles: ['admin'],
      permissions: ['workspace.publish'],
    },
    loading: false,
  }),
  useCan: () => true,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mocks dos componentes shell que entrariam no canvas (não renderizam
// nada pesado em jest jsdom — só validam o composer mesmo).
jest.mock('@/components/shell/header', () => ({
  Header: () => <div data-testid="mock-header" />,
}));
jest.mock('@/components/shell/sidenav', () => ({
  Sidenav: () => <div data-testid="mock-sidenav" />,
}));
jest.mock('@/components/shell/footer', () => ({
  Footer: () => <div data-testid="mock-footer" />,
}));
jest.mock('@/components/shell/classification-banner', () => ({
  ClassificationBanner: () => <div data-testid="mock-banner" />,
}));

const { AppShell, Marketplace, Workspaces, Iam, Pages } = jest.requireMock(
  '@/lib/api',
) as {
  AppShell: {
    getMe: jest.Mock;
    putMe: jest.Mock;
    getTenant: jest.Mock;
    putTenant: jest.Mock;
  };
  Marketplace: { storefront: jest.Mock; installed: jest.Mock };
  Workspaces: { list: jest.Mock };
  Iam: { roles: { list: jest.Mock }; permissions: { list: jest.Mock } };
  Pages: { list: jest.Mock };
};

// Onda K.4 — RouteSelect/PermSelect cacheiam em módulo; resetar entre testes.
import { _resetOptionSourceCaches } from '@/components/app-shell-editor';

// Sample data para popular RouteSelect (Pages) e PermSelect (catálogo IAM).
const SAMPLE_PAGES = [
  { slug: 'buscar', title: 'Buscar', route: '/buscar', status: 'published' },
  { slug: 'mapa', title: 'Mapa', route: '/geo', status: 'published' },
  { slug: 'docs', title: 'Documentação', route: '/docs', status: 'published' },
  { slug: 'cockpit', title: 'Cockpit', route: '/sala/cockpit', status: 'published' },
];
const SAMPLE_PERMS = [
  { key: 'ontology.objects.read', description: 'Ler objetos da ontologia', category: '' },
  { key: 'security.geo.view', description: 'Ver o mapa', category: '' },
];

// Wave H.4.Y — DEFAULT_ENVELOPE mirrors DEFAULT_APP_SHELL so that draft
// hydration ends equal to the envelope (dirty=false on first render).
import { DEFAULT_APP_SHELL } from '@/lib/app-shell/defaults';

const DEFAULT_ENVELOPE = {
  source: 'default' as const,
  config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
};

describe('AppShellComposerPage · Wave E.1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetAppShellCacheForTests();
    _resetOptionSourceCaches();
    Iam.permissions.list.mockResolvedValue(SAMPLE_PERMS);
    Pages.list.mockResolvedValue(SAMPLE_PAGES);
    AppShell.getMe.mockResolvedValue({ ...DEFAULT_ENVELOPE });
    AppShell.putMe.mockImplementation(async (cfg) => ({
      source: 'user',
      config: cfg,
    }));
    AppShell.putTenant.mockImplementation(async (cfg) => ({
      source: 'tenant',
      config: cfg,
    }));
    // Wave F.1 + Onda I.5 defaults — aba "Loja de apps" refinada.
    Marketplace.storefront.mockResolvedValue([]);
    Marketplace.installed.mockResolvedValue([]);
    Workspaces.list.mockResolvedValue([]);
    Iam.roles.list.mockResolvedValue([]);
  });

  it('shows skeleton while loading', () => {
    AppShell.getMe.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AppShellComposerPage />);
    expect(screen.getByTestId('cp-skeleton')).toBeInTheDocument();
  });

  it('loads config and renders tabs', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => {
      expect(screen.getByTestId('app-shell-palette')).toBeInTheDocument();
    });
    expect(screen.getByTestId('app-shell-tab-banner')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-tab-homepage')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-tab-theme')).toBeInTheDocument();
  });

  // Onda K.4 (Feedback #3) — "Subtítulo (legacy)" foi consolidado em
  // "Texto livre" (custom_text). A duplicação foi removida.
  it('edits banner custom_text and saves via putMe', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() =>
      expect(screen.getByTestId('banner-custom-text-input')).toBeInTheDocument(),
    );
    const input = screen.getByTestId(
      'banner-custom-text-input',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'TEST · 7ª BPM' } });
    expect(input.value).toBe('TEST · 7ª BPM');
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const calledWith = AppShell.putMe.mock.calls[0][0];
    expect(calledWith.banner.custom_text).toBe('TEST · 7ª BPM');
  });

  // Onda K.4 (Feedback #3) — o campo "Subtítulo (legacy)" não existe mais.
  it('banner tab: campo "Subtítulo (legacy)" foi removido (sem duplicação)', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('banner-custom-text-input'));
    expect(screen.queryByTestId('banner-subtitle-input')).toBeNull();
  });

  // Onda K.4 (Feedback #3) — slots de contexto dinâmico no banner.
  it('banner tab: toggles de contexto dinâmico (org/espaço/operação)', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('banner-slot-organization'));
    expect(screen.getByTestId('banner-slot-space')).toBeInTheDocument();
    expect(screen.getByTestId('banner-slot-project')).toBeInTheDocument();
    expect(screen.getByTestId('banner-show-switcher-toggle')).toBeInTheDocument();
    // Liga o slot de Operação e salva.
    fireEvent.click(screen.getByTestId('banner-slot-project'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const cfg = AppShell.putMe.mock.calls[0][0];
    expect(cfg.banner.context_slots.project).toBe(true);
  });

  it('homepage tab: seletor de Página inicial + atalho (Onda J.1)', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-homepage'));
    fireEvent.click(screen.getByTestId('app-shell-tab-homepage'));
    // Novo comportamento: seletor + botão "Editar no editor de Páginas".
    expect(
      await screen.findByTestId('homepage-page-select'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-open-editor')).toBeInTheDocument();
    // Editor de blocos de 4 tipos foi removido (feedback_no_deprecation).
    expect(screen.queryByTestId('homepage-add-paragraph')).toBeNull();
  });

  it('theme tab: toggle Dark dirties draft + save', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-theme'));
    fireEvent.click(screen.getByTestId('app-shell-tab-theme'));
    fireEvent.click(await screen.findByTestId('theme-dark'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const calledWith = AppShell.putMe.mock.calls[0][0];
    expect(calledWith.theme).toBe('dark');
  });

  it('footer tab: adds column with a link', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-footer'));
    fireEvent.click(screen.getByTestId('app-shell-tab-footer'));
    fireEvent.click(await screen.findByTestId('footer-add-column'));
    const title = await screen.findByTestId('footer-col-title-0');
    fireEvent.change(title, { target: { value: 'Suporte' } });
    fireEvent.click(screen.getByTestId('footer-add-link-0'));
    expect(
      await screen.findByTestId('footer-link-label-0-0'),
    ).toBeInTheDocument();
  });

  it('navbar tab: adds Manuais item right-position', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-navbar'));
    fireEvent.click(screen.getByTestId('app-shell-tab-navbar'));
    fireEvent.click(await screen.findByTestId('navbar-add'));
    const label = await screen.findByTestId('navbar-item-label-0');
    fireEvent.change(label, { target: { value: 'Manuais' } });
    fireEvent.click(screen.getByTestId('navbar-item-pos-right-0'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const calledWith = AppShell.putMe.mock.calls[0][0];
    expect(calledWith.navbar.items[0].label).toBe('Manuais');
    expect(calledWith.navbar.items[0].position).toBe('right');
  });

  // Onda M1.a (#4) — config do campo de busca do header.
  it('navbar tab: edita placeholder + compacto da busca e persiste', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-navbar'));
    fireEvent.click(screen.getByTestId('app-shell-tab-navbar'));
    const placeholder = (await screen.findByTestId(
      'navbar-search-placeholder-input',
    )) as HTMLInputElement;
    expect(placeholder.value).toBe(
      'Buscar pessoa, veículo, BO, mandado, endereço…',
    );
    fireEvent.change(placeholder, { target: { value: 'Buscar registros' } });
    fireEvent.click(screen.getByTestId('navbar-search-compact-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const cfg = AppShell.putMe.mock.calls[0][0];
    expect(cfg.navbar.search.placeholder).toBe('Buscar registros');
    expect(cfg.navbar.search.compact).toBe(true);
  });

  it('scope tenant requires confirm before putTenant', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('banner-custom-text-input'));
    const input = screen.getByTestId(
      'banner-custom-text-input',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'TENANT-WIDE' } });
    fireEvent.click(screen.getByTestId('app-shell-scope-tenant'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    // ConfirmDialog aparece — typed input + confirm
    const confirmInput = await screen.findByTestId('confirm-text-input');
    fireEvent.change(confirmInput, { target: { value: 'TENANT' } });
    fireEvent.click(screen.getByTestId('confirm-ok'));
    await waitFor(() => expect(AppShell.putTenant).toHaveBeenCalled());
    expect(AppShell.putMe).not.toHaveBeenCalled();
  });

  it('shows backend error inline', async () => {
    AppShell.putMe.mockRejectedValue(new Error('boom'));
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('banner-custom-text-input'));
    const input = screen.getByTestId(
      'banner-custom-text-input',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => {
      expect(screen.getByTestId('app-shell-error')).toHaveTextContent('boom');
    });
  });

  it('save with no changes is disabled', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('banner-custom-text-input'));
    const btn = screen.getByTestId('app-shell-save') as HTMLButtonElement;
    expect(btn).toBeDisabled();
  });

  it('shows origin label when source=tenant', async () => {
    AppShell.getMe.mockResolvedValue({
      ...DEFAULT_ENVELOPE,
      source: 'tenant',
    });
    render(<AppShellComposerPage />);
    await waitFor(() => {
      expect(screen.getByText(/padrão da unidade/i)).toBeInTheDocument();
    });
  });

  // ── Wave F.1 (2026-05-23) — R2 extras/marketplace.md + permissions/*.md ──
  // Onda I.5: a aba "Loja de apps" foi refinada. O detalhamento (gestão de
  // navegação dos apps instalados, reorder, posição) vive em
  // app-shell-loja-de-apps-refined.test.tsx; aqui fica só o smoke de que a
  // aba abre e consome storefront()+installed().

  it('loja de apps tab: abre e consome storefront + installed (Onda I.5)', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-marketplace'));
    fireEvent.click(screen.getByTestId('app-shell-tab-marketplace'));
    await waitFor(() =>
      expect(screen.getByTestId('inspector-marketplace')).toBeInTheDocument(),
    );
    expect(Marketplace.storefront).toHaveBeenCalled();
    expect(Marketplace.installed).toHaveBeenCalled();
    expect(
      screen.getByTestId('apps-menu-enabled-toggle'),
    ).toBeInTheDocument();
  });

  it('permissions tab: selects default workspace', async () => {
    Workspaces.list.mockResolvedValue([
      {
        id: 'ws-1',
        tenant_id: 't',
        slug: 'cockpit',
        display_name: 'Cockpit',
        description: null,
        active: true,
        version: 1,
        config: {},
        signed_hash: null,
        created_at: null,
        updated_at: null,
        project_id: null,
      },
    ]);
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-permissions'));
    fireEvent.click(screen.getByTestId('app-shell-tab-permissions'));
    const sel = await screen.findByTestId('permissions-default-select');
    fireEvent.change(sel, { target: { value: 'ws-1' } });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const cfg = AppShell.putMe.mock.calls[0][0];
    expect(cfg.permissions.default_workspace_id).toBe('ws-1');
  });

  it('permissions tab: adds landing-page override for a role', async () => {
    Iam.roles.list.mockResolvedValue([
      { id: 'role-admin', name: 'Administrador', description: null, perms: [] },
    ]);
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-permissions'));
    fireEvent.click(screen.getByTestId('app-shell-tab-permissions'));
    await waitFor(() =>
      expect(screen.getByTestId('permissions-add-override')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('permissions-add-override'), {
      target: { value: 'role-admin' },
    });
    // Onda K.4 (Feedback #4) — a URL agora é um dropdown de Páginas
    // (RouteSelect), não mais texto livre. Abre e escolhe a página Cockpit.
    const urlSelect = await screen.findByTestId('permissions-override-0-url');
    fireEvent.click(urlSelect.querySelector('button')!);
    fireEvent.click(
      await screen.findByTestId(
        'permissions-override-0-url-option-/sala/cockpit',
      ),
    );
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const cfg = AppShell.putMe.mock.calls[0][0];
    expect(cfg.permissions.landing_page_overrides).toHaveLength(1);
    expect(cfg.permissions.landing_page_overrides[0].group_id).toBe(
      'role-admin',
    );
    expect(cfg.permissions.landing_page_overrides[0].url).toBe(
      '/sala/cockpit',
    );
  });

  it('renders all 9 tabs (Wave F.1 — 7 base + Marketplace + Permissões)', async () => {
    render(<AppShellComposerPage />);
    await waitFor(() => screen.getByTestId('app-shell-tab-banner'));
    [
      'banner',
      'navbar',
      'sidenav',
      'homepage',
      'footer',
      'context',
      'theme',
      'marketplace',
      'permissions',
    ].forEach((k) => {
      expect(screen.getByTestId(`app-shell-tab-${k}`)).toBeInTheDocument();
    });
  });
});
