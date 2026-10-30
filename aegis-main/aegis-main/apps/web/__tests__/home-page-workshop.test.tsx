/**
 * Onda J.1 (2026-05-23) — `/` (app/page.tsx) renderiza via Workshop.
 *
 * A home não tem mais 3 camadas. Resolução única:
 *   - `config.homepage.page_id` setado → resolve essa Página do Registro
 *     de Páginas e renderiza via WorkshopV2Renderer (adapter I.1).
 *   - sem escolha → seed HOME_SEED_APP.
 *
 * Camadas removidas: `HomepageMount` (4 tipos) + `home-shell-config`
 * (hero_text/sections). Os testes garantem que sumiram do DOM.
 *
 * Cobertura (6):
 *  1. Sem page_id → renderiza o seed (data-home-source=fallback/server).
 *  2. page_id setado → resolve Pages.get(slug) e passa a Página pro
 *     renderer (data-home-source=page, data-home-page-slug=slug).
 *  3. O layout passado ao renderer vem da Página (id `page::<slug>`).
 *  4. Pages.get com erro → cai pro seed silenciosamente.
 *  5. `home-shell-config` (hero/sections) NÃO renderiza mais.
 *  6. `homepage-mount` NÃO existe mais no DOM.
 */
import { render, screen, waitFor } from '@testing-library/react';
import PainelOperacionalPage from '@/app/page';
import { HOME_SEED_APP } from '@/lib/workshop/seeds/home';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/shell/page-shell', () => ({
  // Expõe title/subtitle p/ asserção (fix do header: home=Página não mostra
  // o subtítulo CCTV do dashboard de inteligência).
  PageShell: ({
    children,
    title,
    subtitle,
  }: {
    children: React.ReactNode;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
  }) => (
    <div data-testid="page-shell" data-title={String(title ?? '')}>
      {subtitle != null && <p data-testid="page-shell-subtitle">{subtitle}</p>}
      {children}
    </div>
  ),
}));

jest.mock('@/components/painel/home-skeleton', () => ({
  HomeSkeleton: () => <div data-testid="home-skeleton" />,
}));

// Renderer mockado: expõe o id + nº de nós do app recebido pra asserção.
jest.mock('@/components/workshop/WorkshopV2Renderer', () => ({
  WorkshopV2Renderer: ({ app }: { app: { id: string; layout: { root: unknown[] } } }) => (
    <div
      data-testid="workshop-renderer"
      data-app-id={app.id}
      data-node-count={app.layout?.root?.length ?? 0}
    />
  ),
}));

// Side-effect import dos widgets — no-op nos testes.
jest.mock('@/components/workshop/widgets', () => ({}));

const mockUseResolvedApp = jest.fn();
jest.mock('@/lib/workshop/runtime', () => ({
  useResolvedApp: (fallback: unknown) => mockUseResolvedApp(fallback),
}));

const mockUseAppShellConfig = jest.fn();
jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => mockUseAppShellConfig(),
}));

jest.mock('@/lib/api', () => ({
  Pages: { get: jest.fn() },
  Me: { home: jest.fn() },
  // SHELL HONESTO (2026-06-12): banner/rodapé leem o /me/context real.
  MeContextApi: { get: () => new Promise(() => {}) },
}));

jest.mock('@/lib/api/cctv', () => ({
  Cctv: { count: jest.fn() },
}));

const { Pages, Me } = jest.requireMock('@/lib/api') as {
  Pages: { get: jest.Mock };
  Me: { home: jest.Mock };
};
const { Cctv } = jest.requireMock('@/lib/api/cctv') as {
  Cctv: { count: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  Cctv.count.mockResolvedValue({
    streams_total: 0,
    streams_online: 0,
    detections_total: 0,
  });
  Me.home.mockResolvedValue({});
  // Default: seed resolvido como server (não loading).
  mockUseResolvedApp.mockReturnValue({
    app: HOME_SEED_APP,
    source: 'server',
    loading: false,
  });
  // Default: sem Página inicial escolhida.
  mockUseAppShellConfig.mockReturnValue({
    config: { homepage: { page_id: null } },
    isPreview: false,
    loading: false,
  });
});

describe('Onda J.1 · / renderiza via Workshop', () => {
  it('1. Sem page_id → renderiza o seed', async () => {
    render(<PainelOperacionalPage />);
    const r = await screen.findByTestId('workshop-renderer');
    expect(r).toHaveAttribute('data-app-id', HOME_SEED_APP.id);
  });

  it('2. page_id setado → resolve a Página e marca source=page', async () => {
    mockUseAppShellConfig.mockReturnValue({
      config: { homepage: { page_id: 'painel-tatico' } },
      isPreview: false,
      loading: false,
    });
    Pages.get.mockResolvedValue({
      slug: 'painel-tatico',
      title: 'Painel Tático',
      route: '/painel-tatico',
      status: 'published',
      workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
      marking_requirements: [],
      iam_perm_required: null,
      config: {
        mode: 'workshop',
        workshop_layout: {
          columns: 20,
          root: [
            { id: 'm1', widget: { type: 'metric_card', props: {} }, layout: { col_span: 4 } },
          ],
        },
      },
    });

    render(<PainelOperacionalPage />);

    await waitFor(() => expect(Pages.get).toHaveBeenCalledWith('painel-tatico'));
    const wrapper = await screen.findByTestId('page-shell');
    await waitFor(() => {
      expect(
        wrapper.querySelector('[data-home-source="page"]'),
      ).toBeInTheDocument();
    });
    expect(
      wrapper.querySelector('[data-home-page-slug="painel-tatico"]'),
    ).toBeInTheDocument();
  });

  it('3. Layout passado ao renderer vem da Página (id page::<slug>, nós corretos)', async () => {
    mockUseAppShellConfig.mockReturnValue({
      config: { homepage: { page_id: 'painel-tatico' } },
      isPreview: false,
      loading: false,
    });
    Pages.get.mockResolvedValue({
      slug: 'painel-tatico',
      title: 'Painel Tático',
      route: '/painel-tatico',
      status: 'published',
      workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
      marking_requirements: [],
      iam_perm_required: null,
      config: {
        mode: 'workshop',
        workshop_layout: {
          columns: 20,
          root: [
            { id: 'a', widget: { type: 'metric_card', props: {} }, layout: { col_span: 4 } },
            { id: 'b', widget: { type: 'object_table', props: {} }, layout: { col_span: 16 } },
          ],
        },
      },
    });

    render(<PainelOperacionalPage />);

    await waitFor(() => {
      const r = screen.getByTestId('workshop-renderer');
      expect(r).toHaveAttribute('data-app-id', 'page::painel-tatico');
    });
    expect(screen.getByTestId('workshop-renderer')).toHaveAttribute(
      'data-node-count',
      '2',
    );
  });

  it('4. Pages.get com erro → cai pro seed', async () => {
    mockUseAppShellConfig.mockReturnValue({
      config: { homepage: { page_id: 'sumiu' } },
      isPreview: false,
      loading: false,
    });
    Pages.get.mockRejectedValue(new Error('404'));

    render(<PainelOperacionalPage />);

    await waitFor(() => expect(Pages.get).toHaveBeenCalled());
    await waitFor(() => {
      const r = screen.getByTestId('workshop-renderer');
      expect(r).toHaveAttribute('data-app-id', HOME_SEED_APP.id);
    });
  });

  it('5. home-shell-config (hero/sections) sumiu do DOM', async () => {
    render(<PainelOperacionalPage />);
    await screen.findByTestId('workshop-renderer');
    expect(screen.queryByTestId('home-shell-config')).toBeNull();
    expect(screen.queryByTestId('home-hero-text')).toBeNull();
    expect(screen.queryByTestId('home-section-0')).toBeNull();
  });

  it('6. homepage-mount sumiu do DOM', async () => {
    render(<PainelOperacionalPage />);
    await screen.findByTestId('workshop-renderer');
    expect(screen.queryByTestId('homepage-mount')).toBeNull();
  });

  it('7. Sem page_id → header do dashboard: título Início + subtítulo CCTV', async () => {
    render(<PainelOperacionalPage />);
    await screen.findByTestId('workshop-renderer');
    expect(screen.getByTestId('page-shell')).toHaveAttribute('data-title', 'Início');
    expect(screen.getByTestId('page-shell-subtitle')).toHaveTextContent(/CCTV/);
  });

  it('8. Home = Página → título da Página e SEM o subtítulo CCTV (nem no load)', async () => {
    mockUseAppShellConfig.mockReturnValue({
      config: { homepage: { page_id: 'inicio-condominio' } },
      isPreview: false,
      loading: false,
    });
    let resolvePage: (v: unknown) => void = () => {};
    Pages.get.mockReturnValue(
      new Promise((res) => {
        resolvePage = res;
      }),
    );

    render(<PainelOperacionalPage />);

    // durante o load da Página o subtítulo CCTV já NÃO aparece (sem flash)
    expect(screen.queryByTestId('page-shell-subtitle')).toBeNull();

    resolvePage({
      slug: 'inicio-condominio',
      title: 'Início do Condomínio',
      route: '/paginas/inicio-condominio/view',
      status: 'published',
      workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
      marking_requirements: [],
      iam_perm_required: null,
      config: {
        mode: 'workshop',
        workshop_layout: {
          columns: 20,
          root: [
            { id: 'k1', widget: { type: 'metric_card', props: {} }, layout: { col_span: 5 } },
          ],
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('page-shell')).toHaveAttribute(
        'data-title',
        'Início do Condomínio',
      );
    });
    expect(screen.queryByTestId('page-shell-subtitle')).toBeNull();
  });

  it('9. Página inicial inválida → seed volta E o subtítulo CCTV volta junto', async () => {
    mockUseAppShellConfig.mockReturnValue({
      config: { homepage: { page_id: 'sumiu' } },
      isPreview: false,
      loading: false,
    });
    Pages.get.mockRejectedValue(new Error('404'));

    render(<PainelOperacionalPage />);

    await waitFor(() => {
      const r = screen.getByTestId('workshop-renderer');
      expect(r).toHaveAttribute('data-app-id', HOME_SEED_APP.id);
    });
    expect(screen.getByTestId('page-shell')).toHaveAttribute('data-title', 'Início');
    expect(screen.getByTestId('page-shell-subtitle')).toHaveTextContent(/CCTV/);
  });
});
