/**
 * Onda I.2 (2026-05-23) — Feedback #2: navegação lateral é modelada SÓ por
 * `sidenav.groups`. A UI nunca mais expõe "Seções legacy". Configs antigas
 * (com `sections`/`tree`) são migradas silenciosamente pra groups na 1ª
 * carga; o operador edita só grupos, e o save persiste groups-only.
 *
 * Parte A — migrateSidenavLegacy (unit, pura).
 * Parte B — UI: zero strings legacy + reorder @dnd-kit + save groups-only.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppShellComposerPage from '@/app/painel-de-controle/app-shell/page';
import { _resetAppShellCacheForTests } from '@/lib/app-shell/use-app-shell';
import { DEFAULT_APP_SHELL } from '@/lib/app-shell/defaults';
import { migrateSidenavLegacy, hasLegacySidenav } from '@/lib/app-shell/migrate-sidenav';
import type { AppShellConfig } from '@/lib/api';

// ─── Parte A — migração pura ───────────────────────────────────────────────

function cfgWith(partialSidenav: Record<string, unknown>): AppShellConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)) as AppShellConfig;
  base.sidenav = { ...base.sidenav, ...partialSidenav } as AppShellConfig['sidenav'];
  return base;
}

describe('Onda I.2 · migrateSidenavLegacy (#2)', () => {
  it('A1. converte sections legacy em groups', () => {
    const cfg = cfgWith({
      groups: [],
      sections: [
        {
          title: 'Operações',
          items: [
            { label: 'Marcações', href: '/marcacoes', icon: 'flag', perm_key: 'ontology.read' },
          ],
        },
      ],
    });
    const out = migrateSidenavLegacy(cfg);
    expect(out.sidenav.groups).toHaveLength(1);
    expect(out.sidenav.groups[0].label).toBe('Operações');
    expect(out.sidenav.groups[0].items[0].href).toBe('/marcacoes');
    // perm_key legacy → perm_required
    expect(out.sidenav.groups[0].items[0].perm_required).toBe('ontology.read');
    // sections zeradas
    expect(out.sidenav.sections).toEqual([]);
  });

  it('A2. converte campo legacy `tree` quando sections vazio', () => {
    const cfg = cfgWith({
      groups: [],
      sections: [],
      tree: [{ title: 'Casos', items: [{ label: 'Lista', href: '/casos' }] }],
    });
    const out = migrateSidenavLegacy(cfg);
    expect(out.sidenav.groups).toHaveLength(1);
    expect(out.sidenav.groups[0].label).toBe('Casos');
    // campo tree descartado
    expect((out.sidenav as unknown as { tree?: unknown }).tree).toBeUndefined();
  });

  it('A3. respeita groups existentes (não sobrescreve)', () => {
    const cfg = cfgWith({
      groups: [{ key: 'g1', label: 'G1', collapsed_by_default: false, items: [] }],
      sections: [{ title: 'Legacy', items: [] }],
    });
    const out = migrateSidenavLegacy(cfg);
    expect(out.sidenav.groups).toHaveLength(1);
    expect(out.sidenav.groups[0].label).toBe('G1');
    expect(out.sidenav.sections).toEqual([]);
  });

  it('A4. idempotente — rodar de novo não muda', () => {
    const cfg = cfgWith({
      groups: [],
      sections: [{ title: 'Op', items: [{ label: 'A', href: '/a' }] }],
    });
    const once = migrateSidenavLegacy(cfg);
    const twice = migrateSidenavLegacy(once);
    expect(twice.sidenav.groups).toEqual(once.sidenav.groups);
  });

  it('A5. descarta itens sem href', () => {
    const cfg = cfgWith({
      groups: [],
      sections: [
        {
          title: 'Op',
          items: [
            { label: 'sem href', href: '' },
            { label: 'com href', href: '/ok' },
          ],
        },
      ],
    });
    const out = migrateSidenavLegacy(cfg);
    expect(out.sidenav.groups[0].items).toHaveLength(1);
    expect(out.sidenav.groups[0].items[0].href).toBe('/ok');
  });

  it('A6. hasLegacySidenav detecta resíduo', () => {
    expect(hasLegacySidenav(cfgWith({ groups: [], sections: [{ title: 'X', items: [] }] }))).toBe(true);
    expect(hasLegacySidenav(cfgWith({ groups: [], sections: [] }))).toBe(false);
  });
});

// ─── Parte B — UI ───────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/painel-de-controle/app-shell',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  AppShell: { getMe: jest.fn(), putMe: jest.fn(), getTenant: jest.fn(), putTenant: jest.fn() },
  Marketplace: { list: jest.fn(), install: jest.fn() },
  Workspaces: { list: jest.fn() },
  Iam: { roles: { list: jest.fn() }, permissions: { list: jest.fn() } },
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

const { AppShell, Marketplace, Workspaces, Iam, Pages } = jest.requireMock(
  '@/lib/api',
) as {
  AppShell: { getMe: jest.Mock; putMe: jest.Mock; getTenant: jest.Mock; putTenant: jest.Mock };
  Marketplace: { list: jest.Mock; install: jest.Mock };
  Workspaces: { list: jest.Mock };
  Iam: { roles: { list: jest.Mock }; permissions: { list: jest.Mock } };
  Pages: { list: jest.Mock };
};

// Onda K.4 — RouteSelect/PermSelect cacheiam em módulo; resetar entre testes.
import { _resetOptionSourceCaches } from '@/components/app-shell-editor';

async function openSidenav() {
  render(<AppShellComposerPage />);
  await waitFor(() => screen.getByTestId('app-shell-tab-sidenav'));
  fireEvent.click(screen.getByTestId('app-shell-tab-sidenav'));
  await waitFor(() => screen.getByTestId('inspector-sidenav'));
}

describe('Onda I.2 · Sidenav groups-only UI (#2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetAppShellCacheForTests();
    _resetOptionSourceCaches();
    AppShell.getMe.mockResolvedValue({
      source: 'default',
      config: JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
    });
    AppShell.putMe.mockImplementation(async (cfg) => ({ source: 'user', config: cfg }));
    Marketplace.list.mockResolvedValue([]);
    Workspaces.list.mockResolvedValue([]);
    Iam.roles.list.mockResolvedValue([]);
    Iam.permissions.list.mockResolvedValue([]);
    Pages.list.mockResolvedValue([]);
  });

  it('B1. zero strings "Seções legacy" no inspetor', async () => {
    await openSidenav();
    const inspector = screen.getByTestId('inspector-sidenav');
    expect(inspector.textContent ?? '').not.toMatch(/Seções legacy/i);
    expect(inspector.textContent ?? '').not.toMatch(/Seções extras/i);
    expect(inspector.textContent ?? '').not.toMatch(/recomendamos migrar/i);
  });

  it('B2. mostra editor de grupos', async () => {
    await openSidenav();
    expect(screen.getByTestId('sidenav-groups-editor')).toBeInTheDocument();
  });

  it('B3. config com sections legacy chega como groups (migração)', async () => {
    AppShell.getMe.mockResolvedValue({
      source: 'tenant',
      config: {
        ...JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
        sidenav: {
          ...DEFAULT_APP_SHELL.sidenav,
          groups: [],
          sections: [
            { title: 'Operações', items: [{ label: 'Marcações', href: '/marcacoes' }] },
          ],
        },
      },
    });
    await openSidenav();
    // grupo migrado aparece com o label da section
    const groupLabel = (await screen.findByTestId('sidenav-group-0-label')) as HTMLInputElement;
    expect(groupLabel.value).toBe('Operações');
  });

  it('B4. reorder de grupo usa drag handle @dnd-kit', async () => {
    await openSidenav();
    fireEvent.click(screen.getByTestId('sidenav-add-group'));
    const handle = await screen.findByTestId('sidenav-group-0-drag');
    expect(handle).toBeInTheDocument();
    expect(handle).toHaveAttribute('aria-label');
  });

  it('B5. reorder de item usa drag handle @dnd-kit', async () => {
    await openSidenav();
    fireEvent.click(screen.getByTestId('sidenav-add-group'));
    fireEvent.click(await screen.findByTestId('sidenav-group-0-add-item'));
    const handle = await screen.findByTestId('sidenav-group-0-item-0-drag');
    expect(handle).toBeInTheDocument();
  });

  it('B6. save persiste groups e zera sections', async () => {
    AppShell.getMe.mockResolvedValue({
      source: 'tenant',
      config: {
        ...JSON.parse(JSON.stringify(DEFAULT_APP_SHELL)),
        sidenav: {
          ...DEFAULT_APP_SHELL.sidenav,
          groups: [],
          sections: [{ title: 'Op', items: [{ label: 'A', href: '/a' }] }],
        },
      },
    });
    await openSidenav();
    await screen.findByTestId('sidenav-group-0-label');
    // edita pra ficar "dirty"
    fireEvent.change(screen.getByTestId('sidenav-group-0-label'), {
      target: { value: 'Operações Renomeado' },
    });
    fireEvent.click(screen.getByTestId('app-shell-save'));
    await waitFor(() => expect(AppShell.putMe).toHaveBeenCalled());
    const sn = AppShell.putMe.mock.calls[0][0].sidenav;
    expect(sn.sections).toEqual([]);
    expect(sn.groups.length).toBeGreaterThan(0);
    expect(sn.groups[0].label).toBe('Operações Renomeado');
  });
});
