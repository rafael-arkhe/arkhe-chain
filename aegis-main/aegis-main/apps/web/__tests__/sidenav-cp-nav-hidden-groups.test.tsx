/**
 * Regressão (2026-09-14) — "salvei o app-shell e a sidenav voltou cheia".
 *
 * Sintoma medido na VPS do vertical contagem (tenant com `cp_nav_hidden`):
 * o operador salvava o Layout do App e a navigate lateral amanhecia com
 * Buscar/Mapa/Conversas/Explorador/Rede/Agentes/Briefings/Documentação/
 * Soluções — itens que o vendor esconde.
 *
 * Causa: o EDITOR semeava o draft a partir do `useNavTree()` SEM o
 * `cp_nav_hidden`; o save persistia esses grupos em `sidenav.groups`, e o
 * renderizador usa groups NO LUGAR da árvore filtrada.
 *
 * Esta suíte fixa a guarda NO RENDERIZADOR (defesa em profundidade): item
 * escondido não aparece por nenhuma origem — groups salvos, sections legado
 * ou árvore default; grupo que fica 100% oculto some inteiro.
 */
import { render, screen } from '@testing-library/react';
import { Sidenav } from '@/components/shell/sidenav';
import type { AppShellConfig } from '@/lib/api';
import type { WhoAmI } from '@/lib/auth/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCurrentConfig: AppShellConfig = {} as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCurrentPrincipal: WhoAmI = {} as any;

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/use-nav-tree', () => ({
  overrideAlertBadge: jest.requireActual('@/lib/use-nav-tree').overrideAlertBadge,
  useNavTree: () => ({
    tree: {
      sections: [
        {
          id: 'fallback',
          label: 'Fallback',
          default_open: true,
          items: [
            {
              id: 'painel',
              label: 'Início',
              href: '/',
              icon: 'layout-dashboard',
              perm_key: null,
              badge: null,
            },
          ],
        },
      ],
    },
    alertBadge: null,
    live: false,
    loading: false,
  }),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: mockCurrentPrincipal,
    loading: false,
    logout: jest.fn(),
  }),
  useCan: () => true,
}));

jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({
    config: mockCurrentConfig,
    isPreview: false,
    loading: false,
  }),
}));

const baseCfg = (over: Partial<AppShellConfig['sidenav']> = {}): AppShellConfig =>
  ({
    homepage: { logo: null, hero_text: null, sections: [], page_id: null },
    navbar: { logo: null, items: [] },
    sidenav: {
      style: 'default',
      sections: [],
      groups: [],
      width_px: 220,
      dense: false,
      footer_link: null,
      ...over,
    },
    footer: { visible: true, columns: [], status_bar_items: [], copyright_text: null, version_visible: true },
    banner: { visible: true, subtitle: null, enabled: true, classification_default: null, custom_text: null, bg: null, text: null, position: 'top', show_clock: false, show_timezone: false, dismissible: false },
    context_switcher: { visible: true, default_scope: 'org', show_promoted_workspaces: true },
    theme: 'light',
    marketplace: { enabled_app_slugs: [] },
    permissions: { default_workspace_id: null, landing_page_overrides: [] },
    user_menu: { items: [] },
  } as AppShellConfig);

function principalCom(tenant: WhoAmI['tenant']): WhoAmI {
  return {
    user_id: 'u1',
    username: 'admin',
    display_name: 'Admin',
    email: null,
    tenant,
    clearances: [],
    roles: ['admin'],
    permissions: [],
    must_change_password: false,
    totp_enabled: false,
  };
}

const TENANT_PORTARIA: WhoAmI['tenant'] = {
  id: 't1',
  slug: 'portaria',
  display_name: 'LR4 Tecnologia',
  features: [],
  cp_nav_hidden: [
    'buscar',
    'geo',
    'mapa',
    'explorador',
    'rede',
    'briefings',
    'app-route-aip-threads',
    'docs',
    'app-route-solutions',
    'app-route-agentes',
  ],
};

beforeEach(() => {
  mockCurrentPrincipal = principalCom(null);
});

describe('cp_nav_hidden filtra grupos salvos do app-shell', () => {
  it('1. item escondido NÃO aparece mesmo dentro de grupo salvo pelo operador', () => {
    mockCurrentPrincipal = principalCom(TENANT_PORTARIA);
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'operacao',
          label: 'Operação',
          collapsed_by_default: false,
          items: [
            { key: 'painel', label: 'Início', icon: 'layout-dashboard', href: '/', perm_required: null, badge: null },
            { key: 'buscar', label: 'Buscar', icon: 'search', href: '/buscar', perm_required: null, badge: null },
            { key: 'cameras', label: 'Câmeras', icon: 'cctv', href: '/cameras', perm_required: null, badge: null },
          ],
        },
        {
          key: 'conteudo',
          label: 'Conteúdo',
          collapsed_by_default: false,
          items: [
            { key: 'alertas', label: 'Alertas', icon: 'bell', href: '/alertas', perm_required: null, badge: null },
            { key: 'app-route-solutions', label: 'Soluções', icon: 'workflow', href: '/paginas/solutions/view', perm_required: null, badge: null },
          ],
        },
      ],
    });
    render(<Sidenav />);
    expect(screen.getByTestId('nav-grp-operacao-painel')).toBeInTheDocument();
    expect(screen.getByTestId('nav-grp-operacao-cameras')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-grp-operacao-buscar')).toBeNull();
    expect(screen.getByTestId('nav-grp-conteudo-alertas')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-grp-conteudo-app-route-solutions')).toBeNull();
  });

  it('2. grupo que fica 100% oculto some inteiro', () => {
    mockCurrentPrincipal = principalCom(TENANT_PORTARIA);
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'analise',
          label: 'Análise',
          collapsed_by_default: false,
          items: [
            { key: 'explorador', label: 'Explorador', icon: 'funnel', href: '/explorador', perm_required: null, badge: null },
            { key: 'rede', label: 'Rede', icon: 'share-2', href: '/rede', perm_required: null, badge: null },
          ],
        },
        {
          key: 'operacao',
          label: 'Operação',
          collapsed_by_default: false,
          items: [
            { key: 'painel', label: 'Início', icon: 'layout-dashboard', href: '/', perm_required: null, badge: null },
          ],
        },
      ],
    });
    render(<Sidenav />);
    expect(screen.queryByTestId('section-grp-analise')).toBeNull();
    expect(screen.getByTestId('section-grp-operacao')).toBeInTheDocument();
  });

  it('3. sem cp_nav_hidden nada muda (degrada em silêncio)', () => {
    mockCurrentPrincipal = principalCom({ id: 't2', slug: 'aegis', display_name: 'AEGIS', features: [] });
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'operacao',
          label: 'Operação',
          collapsed_by_default: false,
          items: [
            { key: 'buscar', label: 'Buscar', icon: 'search', href: '/buscar', perm_required: null, badge: null },
          ],
        },
      ],
    });
    render(<Sidenav />);
    expect(screen.getByTestId('nav-grp-operacao-buscar')).toBeInTheDocument();
  });

  it('4. groups salvos que ficam vazios → renderizador cai na árvore filtrada', () => {
    mockCurrentPrincipal = principalCom(TENANT_PORTARIA);
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'analise',
          label: 'Análise',
          collapsed_by_default: false,
          items: [
            { key: 'explorador', label: 'Explorador', icon: 'funnel', href: '/explorador', perm_required: null, badge: null },
          ],
        },
      ],
    });
    render(<Sidenav />);
    expect(screen.queryByTestId('section-grp-analise')).toBeNull();
    // `sidenav.groups` não substitui mais a árvore quando não sobra nada dele.
    expect(screen.getByTestId('section-fallback')).toBeInTheDocument();
  });

  it('5. sections legado também são filtradas (id derivado do href)', () => {
    mockCurrentPrincipal = principalCom(TENANT_PORTARIA);
    mockCurrentConfig = baseCfg({
      groups: [],
      sections: [
        {
          title: 'Legado',
          items: [
            { label: 'Buscar', href: '/buscar', icon: 'search', perm_key: null },
            { label: 'Alertas', href: '/alertas', icon: 'bell', perm_key: null },
            { label: 'Conversas', href: '/paginas/aip-threads/view', icon: 'audio-lines', perm_key: null },
          ],
        },
      ],
    });
    render(<Sidenav />);
    expect(screen.queryByTestId('nav-cfg-0-0')).toBeNull();
    expect(screen.getByTestId('nav-cfg-0-1')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-cfg-0-2')).toBeNull();
  });
});
