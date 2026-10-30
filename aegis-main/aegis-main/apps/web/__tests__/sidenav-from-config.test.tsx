/**
 * Wave H.4.Y (2026-05-23) — Sidenav consumindo config.groups.
 *
 * Cobertura (>= 8):
 *  1. Sem groups → tree.sections (fallback default).
 *  2. Com 1 group + 1 item → renderiza section-grp-${key}.
 *  3. Item href + label aparecem.
 *  4. perm_required filtrado quando principal sem perm.
 *  5. badge renderizado quando definido.
 *  6. width_px aplica style.
 *  7. dense=true marca data-dense.
 *  8. footer_link aparece se setado.
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
  // helper puro real — só o hook é mockado (Sprint 6: o sidenav aplica
  // overrideAlertBadge sobre groups persistidos).
  overrideAlertBadge: jest.requireActual('@/lib/use-nav-tree').overrideAlertBadge,
  useNavTree: () => ({
    tree: {
      sections: [
        { id: 'fallback', label: 'Fallback', default_open: true, items: [] },
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

beforeEach(() => {
  mockCurrentPrincipal = {
    user_id: 'u1',
    username: 'admin',
    display_name: 'Admin',
    email: null,
    tenant: null,
    clearances: [],
    roles: ['admin'],
    permissions: [],
    must_change_password: false,
    totp_enabled: false,
  };
});

describe('Wave H.4.Y · Sidenav from config', () => {
  it('1. Sem groups, cai pro fallback tree', () => {
    mockCurrentConfig = baseCfg();
    render(<Sidenav />);
    expect(screen.getByTestId('section-fallback')).toBeInTheDocument();
  });

  it('2. Com 1 group renderiza section-grp-${key}', () => {
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'ops',
          label: 'Operações',
          collapsed_by_default: false,
          items: [
            {
              key: 'mapa',
              label: 'Mapa',
              icon: 'map',
              href: '/geo',
              perm_required: null,
              badge: null,
            },
          ],
        },
      ],
    });
    render(<Sidenav />);
    expect(screen.getByTestId('section-grp-ops')).toBeInTheDocument();
  });

  it('3. Item href + label visíveis', () => {
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'ops',
          label: 'Operações',
          collapsed_by_default: false,
          items: [
            { key: 'mapa', label: 'Mapa', icon: 'map', href: '/geo', perm_required: null, badge: null },
          ],
        },
      ],
    });
    render(<Sidenav />);
    const link = screen.getByTestId('nav-grp-ops-mapa');
    expect(link).toHaveAttribute('href', '/geo');
    expect(link).toHaveTextContent('Mapa');
  });

  it('4. perm_required: sem perm, item fica disabled', () => {
    mockCurrentPrincipal = { ...mockCurrentPrincipal, roles: ['viewer'], permissions: [] };
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'ops',
          label: 'Operações',
          collapsed_by_default: false,
          items: [
            {
              key: 'restrita',
              label: 'Sigilosa',
              icon: 'shield',
              href: '/x',
              perm_required: 'super.duper',
              badge: null,
            },
          ],
        },
      ],
    });
    render(<Sidenav />);
    const link = screen.getByTestId('nav-grp-ops-restrita');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('5. badge renderizado (item genérico); em /alertas o badge persistido NUNCA fabrica número', () => {
    // Sprint 6 (2026-06-12): o item que roteia pra /alertas mostra SEMPRE o
    // badge real (count_pending — aqui null via mock), nunca o decorativo
    // persistido no config. Itens genéricos seguem mostrando o que o
    // operador salvou.
    mockCurrentConfig = baseCfg({
      groups: [
        {
          key: 'ops',
          label: 'Operações',
          collapsed_by_default: false,
          items: [
            { key: 'fila', label: 'Fila', icon: 'list', href: '/fila', perm_required: null, badge: '7' },
            { key: 'alertas', label: 'Alertas', icon: 'bell', href: '/alertas', perm_required: null, badge: '5' },
          ],
        },
      ],
    });
    render(<Sidenav />);
    expect(screen.getByTestId('nav-grp-ops-fila')).toHaveTextContent('7');
    expect(screen.getByTestId('nav-grp-ops-alertas')).not.toHaveTextContent('5');
  });

  it('6. width_px aplica style', () => {
    mockCurrentConfig = baseCfg({ width_px: 280 });
    render(<Sidenav />);
    const nav = screen.getByTestId('sidenav') as HTMLElement;
    expect(nav.style.width).toBe('280px');
  });

  it('7. dense=true marca data-dense=true', () => {
    mockCurrentConfig = baseCfg({ dense: true });
    render(<Sidenav />);
    expect(screen.getByTestId('sidenav')).toHaveAttribute('data-dense', 'true');
  });

  it('8. footer_link aparece quando setado', () => {
    mockCurrentConfig = baseCfg({ footer_link: '/docs' });
    render(<Sidenav />);
    expect(screen.getByTestId('sidenav-footer-link')).toBeInTheDocument();
  });
});
