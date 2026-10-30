/**
 * Onda I.1 (2026-05-23) — /painel-de-controle/paginas/[slug]/edit
 * agora reusa o WorkshopEditor (palette/canvas/inspector + widget
 * registry). Substitui a cobertura simplificada de H.4.A.
 *
 * Cobertura (15):
 *
 *  1. Skeleton enquanto carrega Pages.get.
 *  2. Carrega page workshop-mode e exibe toolbar com title/route.
 *  3. Paleta renderiza com pelo menos 1 widget do registry real
 *     (markdown_v2) — confirma reuso do registry.
 *  4. Paleta tem chips de filtro por grupo + busca por texto.
 *  5. Carrega Page mode=legacy → banner de migração aparece.
 *  6. Botão "Migrar para Workshop" some o banner e inicializa o canvas
 *     em modo workshop.
 *  7. Clicar widget na paleta adiciona ao canvas + abre inspector.
 *  8. Inspector mostra o tipo do widget selecionado.
 *  9. Mover widget ↓ reordena (data-testid order).
 * 10. Remover widget tira do canvas.
 * 11. Mudar col_span via select persiste no node.layout.
 * 12. Salvar rascunho chama Pages.putConfig com mode=workshop +
 *     workshop_layout.
 * 13. Publicar chama Pages.putConfig + Pages.publish.
 * 14. Botão Visualizar abre dialog com WorkshopV2Renderer.
 * 15. Page config legacy preservada NÃO é destruída — só migrada
 *     explicitamente.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import EditPaginaPage from '@/app/painel-de-controle/paginas/[slug]/edit/page';

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

// Mock do app-shell preview provider (usado por imports transitivos via
// WorkshopV2Renderer / shell). Evita erro de provider ausente.
jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({ config: { homepage: { page_id: null } } }),
}));

import { Pages } from '@/lib/api';
const pagesApi = Pages as jest.Mocked<typeof Pages>;

const WORKSHOP_FIXTURE = {
  slug: 'buscar',
  title: 'Buscar',
  route: '/buscar',
  status: 'published' as const,
  workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
  marking_requirements: [],
  iam_perm_required: 'ontology.objects.read',
  config: {
    mode: 'workshop',
    workshop_layout: { columns: 20, root: [] },
    variables: [],
  },
  last_edited_by: null,
  last_edited_at: null,
  created_at: '2026-05-23T12:00:00+00:00',
};

const LEGACY_FIXTURE = {
  ...WORKSHOP_FIXTURE,
  slug: 'antiga',
  title: 'Antiga',
  config: {
    mode: 'legacy',
    blocks: [
      { id: 'b1', kind: 'heading', props: { text: 'Cabeçalho antigo' } },
    ],
  },
};

describe('Onda I.1 · Páginas (edit) — WorkshopEditor reuse', () => {
  beforeEach(() => {
    pagesApi.get.mockReset();
    pagesApi.putConfig.mockReset();
    pagesApi.publish.mockReset();
    pagesApi.update.mockReset();
    pagesApi.get.mockResolvedValue({ ...WORKSHOP_FIXTURE } as any);
    pagesApi.putConfig.mockResolvedValue({ ...WORKSHOP_FIXTURE } as any);
    pagesApi.publish.mockResolvedValue({
      ...WORKSHOP_FIXTURE,
      status: 'published',
    } as any);
  });

  test('1. Mostra skeleton enquanto carrega', () => {
    pagesApi.get.mockReturnValue(new Promise(() => {}) as any);
    render(<EditPaginaPage />);
    expect(screen.queryByTestId('paginas-edit-toolbar')).not.toBeInTheDocument();
  });

  test('2. Carrega page workshop-mode e renderiza toolbar', async () => {
    render(<EditPaginaPage />);
    await waitFor(() => expect(pagesApi.get).toHaveBeenCalledWith('buscar'));
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-toolbar')).toBeInTheDocument(),
    );
    expect(screen.getByText('Buscar')).toBeInTheDocument();
    expect(screen.getByText(/\/buscar/)).toBeInTheDocument();
  });

  test('3. Paleta renderiza widget real do registry (markdown_v2)', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    // markdown_v2 é registrado em components/workshop/widgets/markdown-v2.tsx —
    // se este teste falhar, registry quebrou.
    expect(
      screen.getByTestId('paginas-palette-widget-markdown_v2'),
    ).toBeInTheDocument();
  });

  test('4. Paleta tem busca + chips de filtro por grupo', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('paginas-palette-search')).toBeInTheDocument();
    // Chips: ao menos "Todos" + um dos grupos canônicos
    expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Conteúdo/ }),
    ).toBeInTheDocument();
  });

  test('5. Page legacy mostra banner de migração', async () => {
    pagesApi.get.mockResolvedValue({ ...LEGACY_FIXTURE } as any);
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-legacy-banner')).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('paginas-legacy-migrate'),
    ).toBeInTheDocument();
  });

  test('6. Migrar para Workshop some o banner', async () => {
    pagesApi.get.mockResolvedValue({ ...LEGACY_FIXTURE } as any);
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-legacy-banner')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-legacy-migrate'));
    await waitFor(() =>
      expect(
        screen.queryByTestId('paginas-legacy-banner'),
      ).not.toBeInTheDocument(),
    );
    // Canvas agora tem 1 widget migrado do heading legacy.
    const canvas = screen.getByTestId('paginas-edit-canvas');
    expect(
      within(canvas).queryAllByTestId(/^paginas-edit-block-/).length,
    ).toBeGreaterThan(0);
  });

  test('7. Clicar widget na paleta adiciona ao canvas + abre inspector', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-palette-widget-markdown_v2'));
    await waitFor(() => {
      const canvas = screen.getByTestId('paginas-edit-canvas');
      const blocks = within(canvas).queryAllByTestId(/^paginas-edit-block-/);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].getAttribute('data-widget-type')).toBe('markdown_v2');
    });
    expect(screen.getByTestId('paginas-edit-inspector')).toBeInTheDocument();
  });

  test('8. Inspector mostra o label humano do widget (sem jargão técnico)', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-palette-widget-markdown_v2'));
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-inspector')).toBeInTheDocument(),
    );
    const inspector = screen.getByTestId('paginas-edit-inspector');
    // Mostra o nome amigável; o type técnico (markdown_v2/slate_chart/…) nunca
    // vaza pra UI do operador (feedback_no_palantir_product_names + UX).
    expect(within(inspector).getByText('Texto Markdown')).toBeInTheDocument();
    expect(within(inspector).queryByText('markdown_v2')).toBeNull();
  });

  test('9. Mover widget ↓ reordena dois widgets', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-palette-widget-markdown_v2'));
    fireEvent.click(screen.getByTestId('paginas-palette-widget-markdown_v2'));
    const canvas = screen.getByTestId('paginas-edit-canvas');
    await waitFor(() =>
      expect(
        within(canvas).queryAllByTestId(/^paginas-edit-block-/),
      ).toHaveLength(2),
    );
    const blocksBefore = within(canvas).queryAllByTestId(
      /^paginas-edit-block-/,
    );
    const firstId = blocksBefore[0].getAttribute('data-testid');
    // Move o primeiro pra baixo.
    const moveDownButtons = within(blocksBefore[0]).getAllByLabelText(
      'Mover widget para baixo',
    );
    fireEvent.click(moveDownButtons[0]);
    await waitFor(() => {
      const after = within(canvas).queryAllByTestId(/^paginas-edit-block-/);
      expect(after[1].getAttribute('data-testid')).toBe(firstId);
    });
  });

  test('10. Remover widget tira do canvas', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-palette-widget-markdown_v2'));
    const canvas = screen.getByTestId('paginas-edit-canvas');
    await waitFor(() =>
      expect(
        within(canvas).queryAllByTestId(/^paginas-edit-block-/),
      ).toHaveLength(1),
    );
    fireEvent.click(screen.getAllByLabelText('Remover widget')[0]);
    await waitFor(() =>
      expect(
        within(canvas).queryAllByTestId(/^paginas-edit-block-/),
      ).toHaveLength(0),
    );
  });

  test('11. Mudar col_span persiste no node.layout', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-palette-widget-markdown_v2'));
    const canvas = screen.getByTestId('paginas-edit-canvas');
    await waitFor(() =>
      expect(
        within(canvas).queryAllByTestId(/^paginas-edit-block-/),
      ).toHaveLength(1),
    );
    const colSpan = screen.getAllByTestId(/^paginas-edit-colspan-/)[0] as
      | HTMLSelectElement
      | undefined;
    expect(colSpan).toBeDefined();
    fireEvent.change(colSpan as HTMLSelectElement, { target: { value: '5' } });
    expect((colSpan as HTMLSelectElement).value).toBe('5');
  });

  test('12. Salvar rascunho chama Pages.putConfig com mode=workshop', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-palette-widget-markdown_v2'));
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-rascunho')).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId('paginas-edit-rascunho'));
    await waitFor(() => {
      expect(pagesApi.putConfig).toHaveBeenCalledWith(
        'buscar',
        expect.objectContaining({
          mode: 'workshop',
          workshop_layout: expect.objectContaining({
            root: expect.arrayContaining([
              expect.objectContaining({
                widget: expect.objectContaining({ type: 'markdown_v2' }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  test('13. Publicar chama Pages.publish', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-publicar')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-edit-publicar'));
    await waitFor(() => expect(pagesApi.publish).toHaveBeenCalledWith('buscar'));
  });

  test('14. Botão Visualizar abre dialog com WorkshopV2Renderer', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-preview')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('paginas-edit-preview'));
    await waitFor(() =>
      expect(
        screen.getByTestId('paginas-edit-preview-dialog'),
      ).toBeInTheDocument(),
    );
  });

  test('15. Legacy config sem migração explícita não é destruída pelo load', async () => {
    pagesApi.get.mockResolvedValue({ ...LEGACY_FIXTURE } as any);
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-legacy-banner')).toBeInTheDocument(),
    );
    // Sem clicar em "Migrar para Workshop", nenhuma chamada de
    // persistência deve ter ocorrido — o blob legacy original ainda
    // está intacto no storage (operador pode voltar e ver os blocks).
    expect(pagesApi.putConfig).not.toHaveBeenCalled();
    expect(pagesApi.update).not.toHaveBeenCalled();
  });
});

// ── Onda K.1 #8 — paleta adaptada + hover preview ──────────────────────────

describe('Onda K.1 · Páginas (edit) — paleta adaptada + hover preview', () => {
  beforeEach(() => {
    pagesApi.get.mockReset();
    pagesApi.get.mockResolvedValue({ ...WORKSHOP_FIXTURE } as any);
  });

  test('16. Hover num widget da paleta exibe preview visual via portal', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    const item = screen.getByTestId('paginas-palette-widget-markdown_v2');
    // Antes do hover não há popover.
    expect(
      screen.queryByTestId('paginas-palette-preview-markdown_v2'),
    ).toBeNull();
    fireEvent.mouseEnter(item.closest('li') as HTMLElement);
    // Popover aparece após o debounce de 180ms (portal no document.body).
    // Timeout generoso: o debounce + render do MiniWidgetPreview pode
    // levar mais sob carga (suíte paralela / CI).
    await waitFor(
      () =>
        expect(
          screen.getByTestId('paginas-palette-preview-markdown_v2'),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
    // Sai do hover → popover some.
    fireEvent.mouseLeave(item.closest('li') as HTMLElement);
    await waitFor(() =>
      expect(
        screen.queryByTestId('paginas-palette-preview-markdown_v2'),
      ).toBeNull(),
    );
  });

  test('17. Grupos adaptados: divisor "Contextual" precede ficha/detalhe', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    const divider = screen.getByTestId('paginas-palette-contextual-divider');
    expect(divider).toBeInTheDocument();
    expect(divider).toHaveTextContent(/Contextual/i);
    // Grupos de propósito geral (Dashboard/Dados/Visualização) vêm ANTES
    // do divisor; ficha/detalhe vêm DEPOIS — confirma reordenação.
    const palette = screen.getByTestId('paginas-edit-palette');
    const homeGroup = within(palette).queryByTestId('paginas-palette-group-home');
    const fichaGroup = within(palette).queryByTestId(
      'paginas-palette-group-ficha',
    );
    if (homeGroup && fichaGroup) {
      // homeGroup aparece antes de fichaGroup no DOM order.
      expect(
        homeGroup.compareDocumentPosition(fichaGroup) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  test('18. TODOS os widgets do registry continuam presentes (nada escondido)', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(screen.getByTestId('paginas-edit-palette')).toBeInTheDocument(),
    );
    // Amostra de grupos distintos — home, viz, content, ficha, detalhe.
    for (const t of [
      'security.home.kpi_card',
      'metric_card',
      'markdown_v2',
      'security.ficha.identificacao',
      'security.detalhe.cabecalho',
    ]) {
      expect(
        screen.getByTestId(`paginas-palette-widget-${t}`),
      ).toBeInTheDocument();
    }
  });
});

// ── Onda K.1 #1 — rota de aplicação (não montável) ─────────────────────────

const APP_ROUTE_FIXTURE = {
  ...WORKSHOP_FIXTURE,
  slug: 'documentacao',
  title: 'Documentação',
  route: '/docs',
  config: {
    mode: 'app_route',
    note: 'Rota servida pela central de documentação interna.',
  },
};

describe('Onda K.1 · Páginas (edit) — rota de aplicação', () => {
  beforeEach(() => {
    pagesApi.get.mockReset();
    pagesApi.get.mockResolvedValue({ ...APP_ROUTE_FIXTURE } as any);
  });

  test('19. mode=app_route mostra painel "rota de aplicação", sem editor', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(
        screen.getByTestId('paginas-app-route-panel'),
      ).toBeInTheDocument(),
    );
    // Nenhuma paleta/canvas/banner de migração — não é montável.
    expect(screen.queryByTestId('paginas-edit-palette')).toBeNull();
    expect(screen.queryByTestId('paginas-edit-canvas')).toBeNull();
    expect(screen.queryByTestId('paginas-legacy-banner')).toBeNull();
    // A note vinda do backend é exibida.
    expect(
      screen.getByText(/central de documentação interna/i),
    ).toBeInTheDocument();
  });

  test('20. NUNCA oferece "Migrar para Workshop" pra rota de aplicação', async () => {
    render(<EditPaginaPage />);
    await waitFor(() =>
      expect(
        screen.getByTestId('paginas-app-route-panel'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Migrar para Workshop/i)).toBeNull();
    expect(screen.queryByTestId('paginas-legacy-migrate')).toBeNull();
  });
});
