/**
 * W0 (2026-06-28) — registry genérico de CONFIGURAÇÃO de experiências
 * bespoke (app_route) + lista de Páginas roteando pelo experience_kind.
 *
 * Cobre:
 *   - registry unit: register/get/has + kind desconhecido → null/false;
 *   - auto-registro de `buscar` ao importar buscar-params-editor;
 *   - /paginas mostra "Configurar experiência" para uma Page com
 *     experience_kind='buscar' E para uma Page legada slug='buscar' sem o
 *     campo (fallback LEGACY_SLUG_KIND) — zero regressão;
 *   - kind desconhecido → sem botão (painel app_route padrão).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  registerExperienceConfig,
  getExperienceConfig,
  hasExperienceConfig,
} from '@/lib/pages/experience-registry';
// Auto-registro do configurador da /buscar (side-effect, igual ao app.tsx).
import '@/components/pages-editor/buscar-params-editor';

describe('experience-registry (unit)', () => {
  it('registra e resolve um configurador por kind', () => {
    const Dummy = () => <div data-testid="dummy-config">ok</div>;
    expect(hasExperienceConfig('kind-de-teste-xyz')).toBe(false);
    registerExperienceConfig('kind-de-teste-xyz', { ConfigEditor: Dummy });
    expect(hasExperienceConfig('kind-de-teste-xyz')).toBe(true);
    expect(getExperienceConfig('kind-de-teste-xyz')?.ConfigEditor).toBe(Dummy);
  });

  it('kind desconhecido / vazio resolve null e false', () => {
    expect(getExperienceConfig('nao-existe-nunca')).toBeNull();
    expect(hasExperienceConfig('nao-existe-nunca')).toBe(false);
    expect(getExperienceConfig(undefined)).toBeNull();
    expect(getExperienceConfig(null)).toBeNull();
    expect(hasExperienceConfig(undefined)).toBe(false);
    expect(hasExperienceConfig('')).toBe(false);
  });

  it('importar buscar-params-editor auto-registra o kind `buscar`', () => {
    expect(hasExperienceConfig('buscar')).toBe(true);
    const def = getExperienceConfig('buscar');
    expect(def?.ConfigEditor).toBeTruthy();
    expect(def?.labelKey).toBe('pages.configureExperience');
  });
});

// ── /paginas (list) — botão "Configurar experiência" pelo kind ──────────────

jest.mock('@/lib/api', () => ({
  Pages: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    duplicate: jest.fn(),
  },
  Iam: { permissions: { list: jest.fn(() => Promise.resolve([])) } },
  Markings: { list: jest.fn(() => Promise.resolve([])) },
  Workspaces: { list: jest.fn(() => Promise.resolve([])) },
  Organizations: { list: jest.fn(() => Promise.resolve([])) },
  Spaces: { list: jest.fn(() => Promise.resolve([])) },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'] },
    loading: false,
  }),
  useCan: () => true,
}));

jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => jest.fn(() => Promise.resolve(true)),
}));

jest.mock('next/link', () => {
  // eslint-disable-next-line react/display-name
  return ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

import PaginasPage from '@/app/painel-de-controle/paginas/page';
import { Pages } from '@/lib/api';
import { _resetOptionSourceCaches } from '@/components/app-shell-editor/option-sources';

const pagesApi = Pages as jest.Mocked<typeof Pages>;

function makePage(over: Record<string, unknown>) {
  return {
    slug: 'x',
    title: 'X',
    route: '/x',
    status: 'published',
    workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
    marking_requirements: [],
    iam_perm_required: null,
    config: {},
    last_edited_by: null,
    last_edited_at: null,
    created_at: '2026-06-28T12:00:00+00:00',
    ...over,
  };
}

describe('Páginas (list) · roteamento por experience_kind', () => {
  beforeEach(() => {
    _resetOptionSourceCaches();
    pagesApi.list.mockReset();
  });

  it('Page app_route COM experience_kind=buscar mostra "Configurar experiência"', async () => {
    pagesApi.list.mockResolvedValue([
      makePage({
        slug: 'buscar',
        title: 'Buscar',
        route: '/buscar',
        config: { mode: 'app_route', experience_kind: 'buscar', note: 'n' },
      }),
    ] as any);
    render(<PaginasPage />);
    const detail = await screen.findByTestId('paginas-detail');
    await waitFor(() =>
      expect(
        within(detail).getByTestId('paginas-params-button'),
      ).toBeInTheDocument(),
    );
    const btn = within(detail).getByTestId('paginas-params-button');
    expect(btn).toHaveTextContent('Configurar experiência');
    expect(btn).toHaveAttribute('data-experience-kind', 'buscar');
  });

  it('Page legada slug=buscar SEM experience_kind também mostra o botão (fallback)', async () => {
    pagesApi.list.mockResolvedValue([
      makePage({
        slug: 'buscar',
        title: 'Buscar',
        route: '/buscar',
        // Tenant antigo: app_route sem o rótulo ainda não backfilled.
        config: { mode: 'app_route', note: 'n' },
      }),
    ] as any);
    render(<PaginasPage />);
    const detail = await screen.findByTestId('paginas-detail');
    await waitFor(() =>
      expect(
        within(detail).getByTestId('paginas-params-button'),
      ).toBeInTheDocument(),
    );
    expect(
      within(detail).getByTestId('paginas-params-button'),
    ).toHaveAttribute('data-experience-kind', 'buscar');
  });

  it('Page app_route com kind desconhecido NÃO mostra o botão', async () => {
    pagesApi.list.mockResolvedValue([
      makePage({
        slug: 'rota-de-codigo',
        title: 'Rota de código',
        route: '/rota-de-codigo',
        config: { mode: 'app_route', experience_kind: 'sem-config-xyz' },
      }),
    ] as any);
    render(<PaginasPage />);
    const detail = await screen.findByTestId('paginas-detail');
    // É app_route → mostra o aviso de rota de aplicação…
    await waitFor(() =>
      expect(
        within(detail).getByTestId('paginas-app-route-note'),
      ).toBeInTheDocument(),
    );
    // …mas SEM configurador registrado → sem botão.
    expect(
      within(detail).queryByTestId('paginas-params-button'),
    ).not.toBeInTheDocument();
  });
});
