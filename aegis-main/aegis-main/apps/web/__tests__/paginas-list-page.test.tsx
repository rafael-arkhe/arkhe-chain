/**
 * Wave H.4.A (2026-05-23) — /painel-de-controle/paginas list page.
 *
 * Cobertura (>= 10):
 *  1. Skeleton enquanto carrega.
 *  2. Lista 14 cards (seed default) após GET.
 *  3. Search filtra cards por título/slug/rota.
 *  4. Filter status=published chama Pages.list({status:'published'}).
 *  5. Auto-seleciona primeiro card e popula painel direito.
 *  6. Painel direito mostra status select + perm input + bindings inputs.
 *  7. Click "Editar layout" tem link pro /edit/{slug}.
 *  8. Botão "Nova página" abre dialog de criação.
 *  9. Submit do dialog chama Pages.create com slug/title/route.
 * 10. Click "Arquivar" dispara ConfirmDialog (requireConfirmText='arquivar').
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PaginasPage from '@/app/painel-de-controle/paginas/page';

jest.mock('@/lib/api', () => ({
  Pages: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    duplicate: jest.fn(),
  },
  // Mission #8 — selects técnicos puxam catálogos reais. Stubamos vazios
  // (os dropdowns ainda renderizam com os testids esperados).
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

// ConfirmDialog hook: stub que captura chamadas e devolve sempre true.
// `confirmMock` lazy-init dentro do factory pra evitar out-of-scope no jest.mock.
jest.mock('@/components/dialog/confirm-dialog', () => {
  const mockFn = jest.fn(() => Promise.resolve(true));
  return {
    useConfirm: () => mockFn,
    __confirmMock: mockFn,
  };
});

// Next/Link stub.
jest.mock('next/link', () => {
  // eslint-disable-next-line react/display-name
  return ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

import { Pages } from '@/lib/api';
import { _resetOptionSourceCaches } from '@/components/app-shell-editor/option-sources';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const confirmMock = (require('@/components/dialog/confirm-dialog') as any)
  .__confirmMock as jest.Mock;
const pagesApi = Pages as jest.Mocked<typeof Pages>;

const SEED_14 = Array.from({ length: 14 }, (_, i) => ({
  slug: `seed-${i}`,
  title: `Seed ${i}`,
  route: `/seed-${i}`,
  status: i === 0 ? 'draft' : 'published',
  workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
  marking_requirements: [],
  iam_perm_required: i === 1 ? 'ontology.objects.read' : null,
  config: {},
  last_edited_by: null,
  last_edited_at: null,
  created_at: '2026-05-23T12:00:00+00:00',
}));

describe('Painel · Páginas (list)', () => {
  beforeEach(() => {
    confirmMock.mockClear();
    _resetOptionSourceCaches();
    pagesApi.list.mockReset();
    pagesApi.create.mockReset();
    pagesApi.update.mockReset();
    pagesApi.delete.mockReset();
    pagesApi.duplicate.mockReset();
    pagesApi.list.mockResolvedValue(SEED_14 as any);
  });

  test('1. Mostra skeleton enquanto carrega', async () => {
    pagesApi.list.mockReturnValue(new Promise(() => {}) as any);
    render(<PaginasPage />);
    // CpSkeleton renderiza placeholders animados. Usa o heading (h1) — a aba
    // "Páginas" do hub Personalização (CpHubSubnav, Fase 4) também tem esse texto.
    expect(screen.getByRole('heading', { name: 'Páginas' })).toBeInTheDocument();
  });

  test('2. Renderiza 14 cards após resolver Pages.list', async () => {
    render(<PaginasPage />);
    await waitFor(() => {
      expect(pagesApi.list).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('paginas-card-seed-0')).toBeInTheDocument();
    });
    const grid = screen.getByTestId('paginas-grid');
    const cards = within(grid).queryAllByTestId(/^paginas-card-/);
    expect(cards).toHaveLength(14);
  });

  test('3. Search filtra cards por slug/title/route', async () => {
    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-card-seed-0')).toBeInTheDocument(),
    );
    const input = screen.getByTestId('paginas-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'seed-3' } });
    await waitFor(() => {
      expect(screen.queryByTestId('paginas-card-seed-3')).toBeInTheDocument();
      expect(screen.queryByTestId('paginas-card-seed-0')).not.toBeInTheDocument();
    });
  });

  test('4. Filter radio status=published chama Pages.list com status', async () => {
    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-card-seed-0')).toBeInTheDocument(),
    );
    const radio = screen.getByTestId('paginas-filter-status-published');
    fireEvent.click(radio);
    await waitFor(() => {
      const calls = pagesApi.list.mock.calls;
      // O último call deve carregar {status:'published'}.
      const last = calls[calls.length - 1][0];
      expect(last).toEqual(expect.objectContaining({ status: 'published' }));
    });
  });

  test('5. Auto-seleciona o primeiro card e popula painel direito', async () => {
    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-card-seed-0')).toBeInTheDocument(),
    );
    // Detalhe renderiza o título do primeiro card (auto-select roda em
    // useEffect — pode demorar mais um tick).
    await waitFor(() => {
      const detail = screen.getByTestId('paginas-detail');
      expect(within(detail).getByText('Seed 0')).toBeInTheDocument();
    });
  });

  test('6. Painel direito tem status select + perm input + bindings inputs', async () => {
    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-detail-status')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('paginas-detail-status')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-detail-perm')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-detail-operacao')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-detail-espaco')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-detail-sala')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-detail-markings')).toBeInTheDocument();
  });

  test('7. Click "Editar layout" tem href para /edit/{slug}', async () => {
    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-button')).toBeInTheDocument(),
    );
    const btn = screen.getByTestId('paginas-edit-button') as HTMLAnchorElement;
    expect(btn.getAttribute('href')).toBe('/painel-de-controle/paginas/seed-0/edit');
  });

  test('8. Botão "Nova página" abre dialog de criação', async () => {
    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-novo')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-novo'));
    expect(screen.getByTestId('paginas-create-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-create-slug')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-create-title')).toBeInTheDocument();
    expect(screen.getByTestId('paginas-create-route')).toBeInTheDocument();
  });

  test('9. Submit do dialog chama Pages.create com slug/title/route', async () => {
    pagesApi.create.mockResolvedValue({
      slug: 'ronda',
      title: 'Ronda',
      route: '/ronda',
      status: 'draft',
      workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
      marking_requirements: [],
      iam_perm_required: null,
      config: {},
      last_edited_by: null,
      last_edited_at: null,
      created_at: '2026-05-23T12:00:00+00:00',
    } as any);

    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-novo')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-novo'));
    fireEvent.change(screen.getByTestId('paginas-create-slug'), {
      target: { value: 'ronda' },
    });
    fireEvent.change(screen.getByTestId('paginas-create-title'), {
      target: { value: 'Ronda' },
    });
    fireEvent.change(screen.getByTestId('paginas-create-route'), {
      target: { value: '/ronda' },
    });
    fireEvent.click(screen.getByTestId('paginas-create-submit'));
    await waitFor(() => {
      expect(pagesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'ronda',
          title: 'Ronda',
          route: '/ronda',
          status: 'draft',
        }),
      );
    });
  });

  test('10. Click "Arquivar" dispara ConfirmDialog com requireConfirmText="arquivar"', async () => {
    pagesApi.delete.mockResolvedValue({
      ...(SEED_14[0] as any),
      status: 'archived',
    });
    render(<PaginasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-archive')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-archive'));
    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'danger',
          requireConfirmText: 'arquivar',
        }),
      );
    });
    await waitFor(() => {
      expect(pagesApi.delete).toHaveBeenCalledWith('seed-0');
    });
  });
});
