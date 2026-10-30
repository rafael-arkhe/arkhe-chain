/**
 * Onda I.5 (2026-05-23) — aba "Loja de apps" refinada do composer
 * /painel-de-controle/app-shell (Feedback operador #4).
 *
 * A aba antiga era só Habilitar/Instalar. Agora gere a NAVEGAÇÃO dos apps
 * instalados: header explicativo, toggle global do menu Apps, lista de
 * apps instalados com toggle "Visível" + dropdown Posição + reorder
 * (@dnd-kit), preview do header com o menu Apps populado, e link pra Loja.
 *
 * Cobertura (>= 10):
 *  1. Header explicativo presente.
 *  2. Carrega apps instalados (storefront + installed) e renderiza rows.
 *  3. Empty-state quando nada instalado + link pra Loja.
 *  4. Toggle global "Mostrar menu de Apps" dirties + persiste no save.
 *  5. Dropdown Posição muda position do app no apps_menu.
 *  6. Toggle "Visível na navegação" → position hidden.
 *  7. Save envia marketplace.apps_menu com items normalizados.
 *  8. Preview (canvas) mostra item no menu Apps quando enabled+position=menu.
 *  9. Preview mostra "desativado" quando enabled=false.
 * 10. Link "Gerenciar marketplace completo" navega para /loja.
 * 11. DS audit: zero rounded-*, zero Sparkles.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import AppShellComposerPage from '@/app/painel-de-controle/app-shell/page';
import { _resetAppShellCacheForTests } from '@/lib/app-shell/use-app-shell';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
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
  Marketplace: {
    storefront: jest.fn(),
    installed: jest.fn(),
  },
  Workspaces: { list: jest.fn() },
  Iam: { roles: { list: jest.fn() } },
  Pages: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
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

const { AppShell, Marketplace } = jest.requireMock('@/lib/api') as {
  AppShell: {
    getMe: jest.Mock;
    putMe: jest.Mock;
    getTenant: jest.Mock;
    putTenant: jest.Mock;
  };
  Marketplace: { storefront: jest.Mock; installed: jest.Mock };
};

import { DEFAULT_APP_SHELL } from '@/lib/app-shell/defaults';

const DEFAULT_ENVELOPE = {
  source: 'default' as const,
  config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
};

const RICH = [
  {
    id: 'prod-cctv',
    slug: 'app-cctv',
    display_name: 'CCTV ao vivo',
    category: null,
    description: 'Câmeras',
    version: '1.0.0',
    manifest: {},
    published: true,
    markings: [],
    created_at: null,
    thumbnail_url: null,
    author: null,
    tags: [],
    rating: 0,
    downloads_count: 0,
    usa_ontologia_tipos: [],
    usa_datasources: [],
    requer_projeto: false,
    requer_espaco: false,
    modulos_dependentes: [],
    interacao_descricao: null,
    outputs: [],
    correlacao_widgets: [],
    recursos_externos: [],
  },
  {
    id: 'prod-mapa',
    slug: 'app-mapa',
    display_name: 'Mapa tático',
    category: null,
    description: null,
    version: '2.0.0',
    manifest: {},
    published: true,
    markings: [],
    created_at: null,
    thumbnail_url: null,
    author: null,
    tags: [],
    rating: 0,
    downloads_count: 0,
    usa_ontologia_tipos: [],
    usa_datasources: [],
    requer_projeto: false,
    requer_espaco: false,
    modulos_dependentes: [],
    interacao_descricao: null,
    outputs: [],
    correlacao_widgets: [],
    recursos_externos: [],
  },
];

const INSTALLED = [
  {
    id: 'inst-1',
    product_id: 'prod-cctv',
    installed_version: '1.0.0',
    status: 'installed',
    notes: null,
    installed_at: null,
  },
  {
    id: 'inst-2',
    product_id: 'prod-mapa',
    installed_version: '2.0.0',
    status: 'installed',
    notes: null,
    installed_at: null,
  },
];

async function openMarketplaceTab() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-marketplace'));
  fireEvent.click(screen.getByTestId('app-shell-tab-marketplace'));
}

beforeEach(() => {
  jest.clearAllMocks();
  _resetAppShellCacheForTests();
  AppShell.getMe.mockResolvedValue({ ...DEFAULT_ENVELOPE });
  AppShell.putMe.mockImplementation(async (cfg) => ({ source: 'user', config: cfg }));
  AppShell.putTenant.mockImplementation(async (cfg) => ({
    source: 'tenant',
    config: cfg,
  }));
  Marketplace.storefront.mockResolvedValue(RICH);
  Marketplace.installed.mockResolvedValue(INSTALLED);
});

// 1.
test('header explicativo presente na aba', async () => {
  await openMarketplaceTab();
  await waitFor(() =>
    expect(screen.getByTestId('inspector-marketplace')).toBeInTheDocument(),
  );
  expect(
    screen.getByText(/Apps disponíveis na navegação principal/i),
  ).toBeInTheDocument();
});

// 2.
test('carrega apps instalados e renderiza rows com nome', async () => {
  await openMarketplaceTab();
  await waitFor(() =>
    expect(screen.getByTestId('apps-menu-row-prod-cctv')).toBeInTheDocument(),
  );
  expect(Marketplace.storefront).toHaveBeenCalled();
  expect(Marketplace.installed).toHaveBeenCalled();
  expect(screen.getByTestId('apps-menu-row-prod-cctv')).toHaveTextContent(
    'CCTV ao vivo',
  );
  expect(screen.getByTestId('apps-menu-row-prod-mapa')).toHaveTextContent(
    'Mapa tático',
  );
});

// 3.
test('empty-state quando nada instalado + link pra Loja', async () => {
  Marketplace.installed.mockResolvedValue([]);
  await openMarketplaceTab();
  await waitFor(() =>
    expect(screen.getByTestId('marketplace-empty')).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByTestId('apps-menu-go-loja-empty'));
  expect(mockPush).toHaveBeenCalledWith('/painel-de-controle/loja');
});

// 4.
test('toggle global "Mostrar menu de Apps" dirties + persiste', async () => {
  await openMarketplaceTab();
  await waitFor(() => screen.getByTestId('apps-menu-enabled-toggle'));
  fireEvent.click(screen.getByTestId('apps-menu-enabled-toggle'));
  fireEvent.click(screen.getByTestId('app-shell-save'));
  await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
  const cfg = AppShell.putMe.mock.calls[0][0];
  expect(cfg.marketplace.apps_menu.enabled).toBe(true);
});

// 5.
test('dropdown Posição muda position do app', async () => {
  await openMarketplaceTab();
  await waitFor(() => screen.getByTestId('apps-menu-row-prod-cctv-position'));
  fireEvent.change(screen.getByTestId('apps-menu-row-prod-cctv-position'), {
    target: { value: 'sidenav' },
  });
  fireEvent.click(screen.getByTestId('app-shell-save'));
  await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
  const cfg = AppShell.putMe.mock.calls[0][0];
  const item = cfg.marketplace.apps_menu.items.find(
    (i: { product_id: string }) => i.product_id === 'prod-cctv',
  );
  expect(item.position).toBe('sidenav');
});

// 6.
test('toggle "Visível na navegação" desligado → position hidden', async () => {
  await openMarketplaceTab();
  await waitFor(() => screen.getByTestId('apps-menu-row-prod-mapa-visible'));
  fireEvent.click(screen.getByTestId('apps-menu-row-prod-mapa-visible'));
  fireEvent.click(screen.getByTestId('app-shell-save'));
  await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
  const cfg = AppShell.putMe.mock.calls[0][0];
  const item = cfg.marketplace.apps_menu.items.find(
    (i: { product_id: string }) => i.product_id === 'prod-mapa',
  );
  expect(item.position).toBe('hidden');
});

// 7.
test('save envia apps_menu com items normalizados (order sequencial)', async () => {
  await openMarketplaceTab();
  await waitFor(() => screen.getByTestId('apps-menu-row-prod-cctv-position'));
  // qualquer mudança força commit de todas as rows.
  fireEvent.change(screen.getByTestId('apps-menu-row-prod-cctv-position'), {
    target: { value: 'menu' },
  });
  fireEvent.click(screen.getByTestId('app-shell-save'));
  await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
  const cfg = AppShell.putMe.mock.calls[0][0];
  const items = cfg.marketplace.apps_menu.items;
  expect(items).toHaveLength(2);
  expect(items.map((i: { order: number }) => i.order)).toEqual([0, 1]);
});

// 8.
test('preview do canvas mostra item no menu Apps quando habilitado', async () => {
  await openMarketplaceTab();
  await waitFor(() => screen.getByTestId('apps-menu-enabled-toggle'));
  // habilita menu Apps.
  fireEvent.click(screen.getByTestId('apps-menu-enabled-toggle'));
  // canvas preview renderiza header + dropdown com os apps em 'menu'.
  await waitFor(() =>
    expect(screen.getByTestId('apps-menu-preview')).toBeInTheDocument(),
  );
  // apps default entram como 'menu' → aparecem no preview.
  await waitFor(() =>
    expect(
      screen.getByTestId('apps-menu-preview-item-prod-cctv'),
    ).toBeInTheDocument(),
  );
});

// 9.
test('preview mostra "desativado" quando menu Apps off', async () => {
  await openMarketplaceTab();
  await waitFor(() =>
    expect(screen.getByTestId('apps-menu-preview')).toBeInTheDocument(),
  );
  // DEFAULT_APP_SHELL.apps_menu.enabled = false.
  expect(
    screen.getByTestId('apps-menu-preview-disabled'),
  ).toBeInTheDocument();
});

// 10.
test('link "Gerenciar marketplace completo" navega para /loja', async () => {
  await openMarketplaceTab();
  await waitFor(() => screen.getByTestId('apps-menu-go-loja'));
  fireEvent.click(screen.getByTestId('apps-menu-go-loja'));
  expect(mockPush).toHaveBeenCalledWith('/painel-de-controle/loja');
});

// 11. DS audit.
test('DS audit: zero rounded-* não-none, zero Sparkles', async () => {
  await openMarketplaceTab();
  await waitFor(() => screen.getByTestId('inspector-marketplace'));
  const html = document.body.innerHTML;
  expect(html).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/);
  expect(html).not.toMatch(/lucide-sparkles/i);
});
