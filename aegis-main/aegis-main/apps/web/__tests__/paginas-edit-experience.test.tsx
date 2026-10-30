/**
 * W0 (2026-06-28) — editor de Páginas: o AppRoutePanel resolve o
 * configurador da experiência bespoke pelo experience_kind (registry
 * genérico), substituindo o special-case slug==='buscar'.
 *
 * Cobre:
 *   - app_route experience_kind='buscar' → abre o BuscarParamsEditor pelo
 *     caminho genérico (zero regressão na /buscar);
 *   - app_route com kind sem configurador → painel app_route padrão.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/api', () => ({
  Pages: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    duplicate: jest.fn(),
    putConfig: jest.fn(),
    publish: jest.fn(),
  },
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

jest.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'buscar' }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({ config: { homepage: { page_id: null } } }),
}));

import EditPaginaPage from '@/app/painel-de-controle/paginas/[slug]/edit/page';
import { Pages } from '@/lib/api';

const pagesApi = Pages as jest.Mocked<typeof Pages>;

const BASE = {
  slug: 'buscar',
  title: 'Buscar',
  route: '/buscar',
  status: 'published' as const,
  workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
  marking_requirements: [],
  iam_perm_required: 'ontology.objects.read',
  last_edited_by: null,
  last_edited_at: null,
  created_at: '2026-06-28T12:00:00+00:00',
};

describe('Páginas (edit) · AppRoutePanel roteia pelo experience_kind', () => {
  beforeEach(() => {
    pagesApi.get.mockReset();
  });

  test('experience_kind=buscar abre o BuscarParamsEditor pelo caminho genérico', async () => {
    pagesApi.get.mockResolvedValue({
      ...BASE,
      config: { mode: 'app_route', experience_kind: 'buscar', note: 'n' },
    } as any);
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-app-route-panel')).toBeInTheDocument(),
    );
    // Configurador real da /buscar montado via registry (não por slug).
    await waitFor(() =>
      expect(screen.getByTestId('buscar-params-editor')).toBeInTheDocument(),
    );
  });

  test('kind sem configurador registrado → painel app_route padrão (sem configurador)', async () => {
    pagesApi.get.mockResolvedValue({
      ...BASE,
      slug: 'rota-de-codigo',
      title: 'Rota de código',
      route: '/rota-de-codigo',
      config: { mode: 'app_route', experience_kind: 'sem-config-xyz', note: 'só código' },
    } as any);
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-app-route-panel')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('buscar-params-editor')).not.toBeInTheDocument();
    expect(
      screen.getByText('Esta página é servida pela aplicação'),
    ).toBeInTheDocument();
  });
});
