/**
 * Wave H.4.Y (2026-05-23) — Footer com status_bar_items dinâmicos (render).
 *
 * Cobertura (>= 6):
 *  1. Sem status_bar_items → legacy strip.
 *  2. Com 1 item custom left → render no left.
 *  3. Item type=system com key system.cpu → render label.
 *  4. Item type=custom com href → renderiza anchor.
 *  5. copyright_text aparece como extra.
 *  6. version_visible=false esconde versão.
 */
import { render, screen } from '@testing-library/react';
import { Footer } from '@/components/shell/footer';
import type { AppShellConfig } from '@/lib/api';

// SHELL HONESTO (2026-06-12): o footer consulta o /me/context real.
// Promise pendente = estado 'verificando…' estável durante estes testes.
jest.mock('@/lib/api', () => ({
  MeContextApi: { get: () => new Promise(() => {}) },
}));

// `mock`-prefixed name allows jest.mock factory to reference it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCurrentConfig: AppShellConfig = {} as any;

jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({
    config: mockCurrentConfig,
    isPreview: true,
    loading: false,
  }),
}));

const baseConfig = (overrides: Partial<AppShellConfig['footer']> = {}): AppShellConfig =>
  ({
    homepage: { logo: null, hero_text: null, sections: [], page_id: null },
    navbar: { logo: null, items: [] },
    sidenav: { style: 'default', sections: [], groups: [], width_px: 220, dense: false, footer_link: null },
    footer: {
      visible: true,
      columns: [],
      status_bar_items: [],
      copyright_text: null,
      version_visible: true,
      ...overrides,
    },
    banner: {
      visible: true,
      subtitle: null,
      enabled: true,
      classification_default: null,
      custom_text: null,
      bg: null,
      text: null,
      position: 'top',
      show_clock: false,
      show_timezone: false,
      dismissible: false,
    },
    context_switcher: { visible: true, default_scope: 'org', show_promoted_workspaces: true },
    theme: 'light',
    marketplace: { enabled_app_slugs: [] },
    permissions: { default_workspace_id: null, landing_page_overrides: [] },
    user_menu: { items: [] },
  } as AppShellConfig);

describe('Wave H.4.Y · Footer dynamic items', () => {
  it('1. Sem status_bar_items renderiza legacy strip', () => {
    mockCurrentConfig = baseConfig();
    render(<Footer />);
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.queryByTestId('footer-status-bar')).toBeNull();
  });

  it('2. Item custom left renderizado', () => {
    mockCurrentConfig = baseConfig({
      status_bar_items: [
        {
          key: 'op',
          label: 'OP',
          icon: null,
          type: 'custom',
          value: 'ATIVA',
          href: null,
          position: 'left',
        },
      ],
    });
    render(<Footer />);
    expect(screen.getByTestId('footer-status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('footer-status-item-op')).toHaveTextContent('OP');
    expect(screen.getByTestId('footer-status-item-op')).toHaveTextContent('ATIVA');
  });

  it('3. Item system cpu renderiza label CPU', () => {
    mockCurrentConfig = baseConfig({
      status_bar_items: [
        {
          key: 'system.cpu',
          label: 'CPU',
          icon: 'cpu',
          type: 'system',
          value: null,
          href: null,
          position: 'right',
        },
      ],
    });
    render(<Footer />);
    expect(screen.getByTestId('footer-status-item-system.cpu')).toHaveTextContent(
      'CPU',
    );
  });

  it('4. Item custom com href renderiza anchor', () => {
    mockCurrentConfig = baseConfig({
      status_bar_items: [
        {
          key: 'link',
          label: 'Operações',
          icon: null,
          type: 'custom',
          value: null,
          href: '/operacoes',
          position: 'center',
        },
      ],
    });
    render(<Footer />);
    const el = screen.getByTestId('footer-status-item-link');
    expect(el.tagName.toLowerCase()).toBe('a');
    expect(el).toHaveAttribute('href', '/operacoes');
  });

  it('5. copyright_text aparece como extra', () => {
    mockCurrentConfig = baseConfig({
      status_bar_items: [
        {
          key: 'op',
          label: 'OP',
          icon: null,
          type: 'custom',
          value: 'X',
          href: null,
          position: 'left',
        },
      ],
      copyright_text: '© 2026 Safe-Core',
    });
    render(<Footer />);
    expect(screen.getByTestId('footer-extras')).toHaveTextContent('© 2026 Safe-Core');
  });

  it('6. version_visible=false esconde versão (legacy strip)', () => {
    mockCurrentConfig = baseConfig({ version_visible: false });
    render(<Footer />);
    expect(screen.queryByText(/v0\.1\.0/)).toBeNull();
  });
});
