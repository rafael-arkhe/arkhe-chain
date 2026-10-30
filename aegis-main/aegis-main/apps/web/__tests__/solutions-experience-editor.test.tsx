/**
 * W2 (2026-06-28) — configurador da experiência /solutions (AIP Arquiteto).
 *
 * Cobre:
 *   - auto-registro do kind `solutions` ao importar o editor;
 *   - /paginas mostra "Configurar experiência" para uma Page app_route com
 *     experience_kind='solutions' (roteamento genérico pelo kind, não slug);
 *   - o editor persiste via Pages.putConfig PRESERVANDO mode/experience_kind/
 *     note + params existentes (model) e sobrescrevendo só depth/scope.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  getExperienceConfig,
  hasExperienceConfig,
} from '@/lib/pages/experience-registry';

// ── Mocks compartilhados (API + auth + diálogos + next) ─────────────────────
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

// O editor é importado pelo módulo de Páginas (side-effect), mas importamos
// aqui também para garantir o auto-registro independente da ordem de import.
import '@/components/pages-editor/solutions-experience-editor';
import { SolutionsExperienceEditor } from '@/components/pages-editor/solutions-experience-editor';
import PaginasPage from '@/app/painel-de-controle/paginas/page';
import { Pages } from '@/lib/api';
import { _resetOptionSourceCaches } from '@/components/app-shell-editor/option-sources';

const pagesApi = Pages as jest.Mocked<typeof Pages>;

function makePage(over: Record<string, unknown>) {
  return {
    slug: 'solutions',
    title: 'Soluções',
    route: '/paginas/solutions/view',
    status: 'published',
    workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
    marking_requirements: [],
    iam_perm_required: 'solution.diagram.read',
    config: { mode: 'app_route', experience_kind: 'solutions', note: 'n' },
    last_edited_by: null,
    last_edited_at: null,
    created_at: '2026-06-28T12:00:00+00:00',
    ...over,
  } as any;
}

describe('experience-registry · auto-registro do kind solutions', () => {
  it('importar solutions-experience-editor registra o kind `solutions`', () => {
    expect(hasExperienceConfig('solutions')).toBe(true);
    const def = getExperienceConfig('solutions');
    expect(def?.ConfigEditor).toBeTruthy();
    expect(def?.labelKey).toBe('pages.configureExperience');
  });
});

describe('Páginas (list) · /solutions roteia pelo experience_kind', () => {
  beforeEach(() => {
    _resetOptionSourceCaches();
    pagesApi.list.mockReset();
  });

  it('Page app_route experience_kind=solutions mostra "Configurar experiência"', async () => {
    pagesApi.list.mockResolvedValue([
      makePage({ config: { mode: 'app_route', experience_kind: 'solutions', note: 'n' } }),
    ]);
    render(<PaginasPage />);
    const detail = await screen.findByTestId('paginas-detail');
    await waitFor(() =>
      expect(within(detail).getByTestId('paginas-params-button')).toBeInTheDocument(),
    );
    const btn = within(detail).getByTestId('paginas-params-button');
    expect(btn).toHaveTextContent('Configurar experiência');
    expect(btn).toHaveAttribute('data-experience-kind', 'solutions');
  });
});

describe('SolutionsExperienceEditor · persiste params preservando o blob', () => {
  beforeEach(() => {
    pagesApi.putConfig.mockReset();
    pagesApi.putConfig.mockResolvedValue(makePage({}));
  });

  it('exibe o codinome AIP do modelo efetivo (nunca o id cru de vendor)', () => {
    const page = makePage({
      config: {
        mode: 'app_route',
        experience_kind: 'solutions',
        note: 'NOTE',
        params: { model: 'anthropic/claude-opus-4-7' },
      },
    });
    render(<SolutionsExperienceEditor page={page} />);
    const chip = screen.getByTestId('solutions-experience-model');
    expect(chip).toHaveTextContent('AIP-Concilio-Ultra');
    expect(chip).not.toHaveTextContent(/anthropic|claude/i);
    // o link aponta pra centralização de modelos (não recria seletor de vendor)
    expect(screen.getByTestId('solutions-experience-model-link')).toHaveAttribute(
      'href',
      '/painel-de-controle/dados?aba=modelos',
    );
  });

  it('salva depth+scope PRESERVANDO mode/experience_kind/note + params.model', async () => {
    const page = makePage({
      config: {
        mode: 'app_route',
        experience_kind: 'solutions',
        note: 'NOTE',
        params: { model: 'anthropic/claude-opus-4-7' },
      },
    });
    render(<SolutionsExperienceEditor page={page} />);

    fireEvent.change(screen.getByTestId('solutions-experience-depth'), {
      target: { value: 'full' },
    });
    fireEvent.change(screen.getByTestId('solutions-experience-scope'), {
      target: { value: 'module' },
    });
    fireEvent.click(screen.getByTestId('solutions-experience-salvar'));

    await waitFor(() => expect(pagesApi.putConfig).toHaveBeenCalledTimes(1));
    const [slug, cfg] = pagesApi.putConfig.mock.calls[0] as [string, any];
    expect(slug).toBe('solutions');
    expect(cfg.mode).toBe('app_route');
    expect(cfg.experience_kind).toBe('solutions');
    expect(cfg.note).toBe('NOTE');
    // params: model preservado + depth/scope novos
    expect(cfg.params).toEqual({
      model: 'anthropic/claude-opus-4-7',
      depth: 'full',
      scope: 'module',
    });
    // feedback de salvo
    expect(await screen.findByText('Salvo')).toBeInTheDocument();
  });

  it('sem params no blob → grava só depth/scope (defaults lean/full) e injeta experience_kind', async () => {
    const page = makePage({
      // app_route SEM experience_kind nem params (tenant antigo pré-backfill).
      config: { mode: 'app_route', note: 'só código' },
    });
    render(<SolutionsExperienceEditor page={page} />);
    fireEvent.click(screen.getByTestId('solutions-experience-salvar'));

    await waitFor(() => expect(pagesApi.putConfig).toHaveBeenCalledTimes(1));
    const [, cfg] = pagesApi.putConfig.mock.calls[0] as [string, any];
    expect(cfg.mode).toBe('app_route');
    expect(cfg.experience_kind).toBe('solutions'); // injetado (preserva contrato)
    expect(cfg.note).toBe('só código');
    expect(cfg.params).toEqual({ depth: 'lean', scope: 'full' });
  });
});
