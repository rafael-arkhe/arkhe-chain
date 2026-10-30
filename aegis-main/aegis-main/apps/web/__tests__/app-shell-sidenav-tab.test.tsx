/**
 * Wave H.4.Y (2026-05-23) — Sidenav tab tests.
 * Onda K.4 (2026-05-23) — Feedback #2 + #4:
 *   - O EDITOR semeia os grupos default (Operação · Análise · Conteúdo) quando
 *     o backend devolve seções vazias. Os tests partem dessa baseline.
 *   - href do item → dropdown de Páginas (RouteSelect); perm → dropdown do
 *     catálogo IAM (PermSelect); footer_link → dropdown de Páginas.
 *   - Botão "Restaurar padrão" repõe os grupos default.
 *
 * Cobertura (>= 12):
 *  1. Render inspector com width slider e dense toggle.
 *  2. Width slider muda valor (output em px).
 *  3. Dense toggle off → on.
 *  4. Footer link via dropdown de Páginas.
 *  5. Default semeado: grupos Operação/Análise/Conteúdo aparecem.
 *  6. Adicionar grupo (4º).
 *  7. Renomear label do grupo.
 *  8. Adicionar item no grupo.
 *  9. Editar perm via PermSelect (dropdown).
 * 10. Move grupo para cima (setas).
 * 11. Remover grupo.
 * 12. Save persiste groups + width + dense.
 * 13. Restaurar padrão repõe os grupos default.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppShellComposerPage from '@/app/painel-de-controle/app-shell/page';
import { _resetAppShellCacheForTests } from '@/lib/app-shell/use-app-shell';
import { _resetOptionSourceCaches } from '@/components/app-shell-editor';
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

// Regressão 2026-09-14 — o editor precisa do `tenant.cp_nav_hidden` para ver
// o menu EFETIVO. Principal mutável por teste (nome com prefixo `mock` é
// exigência do jest.mock hoisted).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockPrincipal: any = {
  username: 'admin',
  roles: ['admin'],
  permissions: ['workspace.publish'],
  tenant: null,
};

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: mockPrincipal,
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

const SAMPLE_PAGES = [
  { slug: 'buscar', title: 'Buscar', route: '/buscar', status: 'published' },
  { slug: 'docs', title: 'Documentação', route: '/docs', status: 'published' },
];
const SAMPLE_PERMS = [
  { key: 'ontology.objects.read', description: 'Ler objetos da ontologia', category: '' },
];

const env = () => ({
  source: 'default' as const,
  config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
});

beforeEach(() => {
  jest.clearAllMocks();
  _resetAppShellCacheForTests();
  _resetOptionSourceCaches();
  mockPrincipal = {
    username: 'admin',
    roles: ['admin'],
    permissions: ['workspace.publish'],
    tenant: null,
  };
  AppShell.getMe.mockResolvedValue(env());
  AppShell.putMe.mockImplementation(async (cfg) => ({ source: 'user', config: cfg }));
  Marketplace.list.mockResolvedValue([]);
  Workspaces.list.mockResolvedValue([]);
  Iam.roles.list.mockResolvedValue([]);
  Iam.permissions.list.mockResolvedValue(SAMPLE_PERMS);
  Pages.list.mockResolvedValue(SAMPLE_PAGES);
});

async function openSidenav() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-sidenav'));
  fireEvent.click(screen.getByTestId('app-shell-tab-sidenav'));
  return waitFor(() => screen.getByTestId('inspector-sidenav'));
}

describe('Wave H.4.Y · Sidenav tab (Onda K.4)', () => {
  it('1. Render inspector com width slider e dense toggle', async () => {
    await openSidenav();
    expect(screen.getByTestId('sidenav-width-slider')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-dense-toggle')).toBeInTheDocument();
  });

  it('2. Width slider muda valor', async () => {
    await openSidenav();
    fireEvent.change(screen.getByTestId('sidenav-width-slider'), {
      target: { value: '280' },
    });
    expect(screen.getByTestId('sidenav-width-value')).toHaveTextContent('280px');
  });

  it('3. Dense toggle off → on', async () => {
    await openSidenav();
    fireEvent.click(screen.getByTestId('sidenav-dense-toggle'));
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].sidenav.dense).toBe(true);
  });

  it('4. Footer link via dropdown de Páginas (Feedback #4)', async () => {
    await openSidenav();
    const wrap = screen.getByTestId('sidenav-footer-link-input');
    fireEvent.click(wrap.querySelector('button')!);
    fireEvent.click(
      await screen.findByTestId('sidenav-footer-link-input-option-/docs'),
    );
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    expect(AppShell.putMe.mock.calls[0][0].sidenav.footer_link).toBe('/docs');
  });

  it('5. Default semeado: grupos Operação/Análise/Conteúdo (Feedback #2)', async () => {
    await openSidenav();
    // Os grupos default (FALLBACK_NAV) aparecem no editor sem o operador
    // adicionar nada.
    expect(screen.getByTestId('sidenav-group-0')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-group-1')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-group-2')).toBeInTheDocument();
    expect(
      (screen.getByTestId('sidenav-group-0-label') as HTMLInputElement).value,
    ).toBe('Operação');
  });

  it('6. Adicionar grupo (4º)', async () => {
    await openSidenav();
    fireEvent.click(screen.getByTestId('sidenav-add-group'));
    expect(await screen.findByTestId('sidenav-group-3')).toBeInTheDocument();
  });

  it('7. Renomear label do grupo', async () => {
    await openSidenav();
    fireEvent.change(screen.getByTestId('sidenav-group-0-label'), {
      target: { value: 'Operações' },
    });
    expect(
      (screen.getByTestId('sidenav-group-0-label') as HTMLInputElement).value,
    ).toBe('Operações');
  });

  it('8. Adicionar item no grupo', async () => {
    await openSidenav();
    fireEvent.click(screen.getByTestId('sidenav-add-group'));
    fireEvent.click(await screen.findByTestId('sidenav-group-3-add-item'));
    expect(
      await screen.findByTestId('sidenav-group-3-item-0'),
    ).toBeInTheDocument();
  });

  it('9. Editar perm via PermSelect (dropdown, Feedback #4)', async () => {
    await openSidenav();
    fireEvent.click(screen.getByTestId('sidenav-add-group'));
    fireEvent.click(await screen.findByTestId('sidenav-group-3-add-item'));
    const permWrap = screen.getByTestId('sidenav-group-3-item-0-perm');
    fireEvent.click(permWrap.querySelector('button')!);
    fireEvent.click(
      await screen.findByTestId(
        'sidenav-group-3-item-0-perm-option-ontology.objects.read',
      ),
    );
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const sn = AppShell.putMe.mock.calls[0][0].sidenav;
    const lastGroup = sn.groups[sn.groups.length - 1];
    expect(lastGroup.items[0].perm_required).toBe('ontology.objects.read');
  });

  it('10. Move grupo para cima (setas)', async () => {
    await openSidenav();
    // group-0 = Operação, group-1 = Análise. Move group-1 pra cima.
    fireEvent.click(screen.getByTestId('sidenav-group-1-up'));
    expect(
      (screen.getByTestId('sidenav-group-0-label') as HTMLInputElement).value,
    ).toBe('Análise');
  });

  it('11. Remover grupo', async () => {
    await openSidenav();
    // 3 grupos default; remove o group-2 (Conteúdo) → restam 2.
    fireEvent.click(screen.getByTestId('sidenav-group-2-remove'));
    expect(screen.queryByTestId('sidenav-group-2')).toBeNull();
  });

  it('12. Save persiste groups + width + dense', async () => {
    await openSidenav();
    fireEvent.change(screen.getByTestId('sidenav-width-slider'), {
      target: { value: '260' },
    });
    fireEvent.click(screen.getByTestId('sidenav-dense-toggle'));
    fireEvent.change(screen.getByTestId('sidenav-group-0-label'), {
      target: { value: 'Grupo A' },
    });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const sn = AppShell.putMe.mock.calls[0][0].sidenav;
    expect(sn.width_px).toBe(260);
    expect(sn.dense).toBe(true);
    // 3 grupos default semeados.
    expect(sn.groups).toHaveLength(3);
    expect(sn.groups[0].label).toBe('Grupo A');
  });

  it('13. Restaurar padrão repõe os grupos default (Feedback #2)', async () => {
    await openSidenav();
    // Remove um grupo, depois restaura.
    fireEvent.click(screen.getByTestId('sidenav-group-2-remove'));
    expect(screen.queryByTestId('sidenav-group-2')).toBeNull();
    fireEvent.click(screen.getByTestId('sidenav-restore-default'));
    // ConfirmDialog → confirmar.
    fireEvent.click(await screen.findByTestId('confirm-ok'));
    await waitFor(() =>
      expect(screen.getByTestId('sidenav-group-2')).toBeInTheDocument(),
    );
    expect(
      (screen.getByTestId('sidenav-group-0-label') as HTMLInputElement).value,
    ).toBe('Operação');
  });

  // ─── Regressão 2026-09-14 — "salvei e a sidenav voltou cheia" ─────────────
  // O editor lia o nav vivo SEM `cp_nav_hidden`; o save persistia os ocultos
  // em `sidenav.groups` e o shell (groups SUBSTITUEM a árvore) os reabilitava.
  it('14. cp_nav_hidden do tenant NÃO é semeado no editor', async () => {
    mockPrincipal = {
      username: 'admin',
      roles: ['admin'],
      permissions: ['workspace.publish'],
      tenant: {
        id: 't1',
        slug: 'portaria',
        display_name: 'LR4 Tecnologia',
        features: [],
        cp_nav_hidden: [
          'buscar',
          'geo',
          'explorador',
          'rede',
          'briefings',
          'docs',
          'app-route-aip-threads',
          'app-route-agentes',
          'app-route-solutions',
        ],
      },
    };
    await openSidenav();
    // "Análise" fica 100% oculta (explorador/rede) e some; sobram 2 grupos.
    expect(screen.getByTestId('sidenav-group-0')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-group-1')).toBeInTheDocument();
    expect(screen.queryByTestId('sidenav-group-2')).toBeNull();
    const labels = Array.from(
      document.querySelectorAll('[data-testid$="-label"]'),
    ).map((el) => (el as HTMLInputElement).value);
    expect(labels).not.toContain('Buscar');
    expect(labels).not.toContain('Mapa');
    expect(labels).not.toContain('Conversas');
    expect(labels).toContain('Início');
    expect(labels).toContain('Câmeras');
  });

  it('15. save de config antiga LIMPA os itens ocultos dos grupos salvos', async () => {
    mockPrincipal = {
      username: 'admin',
      roles: ['admin'],
      permissions: ['workspace.publish'],
      tenant: {
        id: 't1',
        slug: 'portaria',
        display_name: 'LR4 Tecnologia',
        features: [],
        cp_nav_hidden: ['buscar', 'geo', 'docs'],
      },
    };
    AppShell.getMe.mockResolvedValue({
      source: 'tenant',
      config: {
        ...JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
        sidenav: {
          ...JSON.parse(JSON.stringify(DEFAULT_APP_SHELL.sidenav)),
          groups: [
            {
              key: 'operacao',
              label: 'Operação',
              collapsed_by_default: false,
              items: [
                { key: 'painel', label: 'Início', icon: 'layout-dashboard', href: '/', perm_required: null, badge: null },
                { key: 'buscar', label: 'Buscar', icon: 'search', href: '/buscar', perm_required: null, badge: null },
                { key: 'geo', label: 'Mapa', icon: 'map', href: '/geo', perm_required: null, badge: null },
                { key: 'cameras', label: 'Câmeras', icon: 'cctv', href: '/cameras', perm_required: null, badge: null },
              ],
            },
          ],
        },
      },
    });
    await openSidenav();
    // Edita algo para o save valer (o conteúdo oculto sai no mesmo save).
    fireEvent.change(screen.getByTestId('sidenav-width-slider'), {
      target: { value: '260' },
    });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const keys = (AppShell.putMe.mock.calls[0][0].sidenav.groups as {
      items: { key: string }[];
    }[]).flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain('painel');
    expect(keys).toContain('cameras');
    expect(keys).not.toContain('buscar');
    expect(keys).not.toContain('geo');
  });
});
