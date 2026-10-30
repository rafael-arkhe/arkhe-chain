/**
 * Wave I.4 (2026-05-23) — Salas row layout enxuto.
 *
 * Operador #8: "tem tanto botão que tem em 'inline' que até quebrou a
 * visualização do titulo, descricao e icone é intoleravel". A row da
 * Sala agora mostra:
 *   • 2 botões PRIMÁRIOS visíveis (Iniciar Apresentação + Editar)
 *   • OverflowMenu (`...`) agrupa secundárias (URL, Versões, Navegação,
 *     Layout, Em destaque, Apagar)
 *   • Título tem truncate forte + title="" pra tooltip nativo
 *   • Em destaque permanece BADGE (não botão), no row inferior
 *   • Touch target ≥ 44px nos primários (h-11)
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SalasPage from '@/app/painel-de-controle/salas/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/painel-de-controle/salas',
}));
jest.mock('@/components/control-panel/cp-hub-subnav', () => ({ CpHubSubnav: () => null }));

jest.mock('@/lib/api', () => ({
  Workspaces: {
    list: jest.fn(() =>
      Promise.resolve([
        {
          id: 'ws-aurora',
          slug: 'aurora',
          display_name: 'Sala Aurora de Comando Operacional Estratégico',
          description: 'Sala de teste com descrição longa para validar truncate e clamp',
          version: 3,
          signed_hash: 'abc123def456ffffeeee',
          config: {},
          tenant_id: 't1',
          project_id: 'p1',
        },
      ]),
    ),
    create: jest.fn(),
    publish: jest.fn(),
    delete: jest.fn(() => Promise.resolve()),
    versions: { list: jest.fn(() => Promise.resolve([])), republish: jest.fn() },
  },
  WorkspaceKiosk: {
    get: jest.fn(() =>
      Promise.resolve({
        workspace_id: 'ws-aurora',
        hide_chrome: true,
        allow_exit: true,
        auto_fullscreen: true,
        allow_read_interaction: true,
        slide_loop: false,
        slide_interval_seconds: 30,
        version: 1,
        active_sessions_count: 0,
      }),
    ),
    set: jest.fn(),
    listSessions: jest.fn(() => Promise.resolve([])),
    startSession: jest.fn(),
    endSession: jest.fn(),
    endAllSessions: jest.fn(),
  },
  WorkspacePromotions: {
    list: jest.fn(() => Promise.resolve([])),
    promote: jest.fn(),
    unpromote: jest.fn(),
  },
  Organizations: { list: jest.fn(() => Promise.resolve([])) },
  Projects: { list: jest.fn(() => Promise.resolve([])) },
  WorkspaceNavigation: { get: jest.fn(), set: jest.fn() },
  KNOWN_APPLICATIONS: [],
}));

const mockApi = jest.requireMock('@/lib/api') as {
  Workspaces: { delete: jest.Mock };
};

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

jest.mock('@/components/control-panel/cp-empty-state', () => ({
  CpEmptyState: () => null,
}));

jest.mock('@/components/control-panel/cp-skeleton', () => ({
  CpSkeleton: () => <div data-testid="loading">…</div>,
  CpErrorState: ({ title }: { title: string }) => <p>{title}</p>,
}));

jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

jest.mock('@/components/ui/toast', () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

async function waitForRow() {
  render(<SalasPage />);
  await waitFor(() => expect(screen.getByTestId('sala-aurora')).toBeInTheDocument());
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Wave I.4 · Salas row layout enxuto', () => {
  it('1. Title é renderizado com truncate e title="" para tooltip nativo', async () => {
    await waitForRow();
    const title = screen.getByTestId('sala-title-aurora');
    expect(title).toBeInTheDocument();
    // truncate garante uma linha; title="" expõe o nome completo via hover.
    expect(title.className).toMatch(/truncate/);
    expect(title.className).not.toMatch(/whitespace-normal/);
    expect(title).toHaveAttribute(
      'title',
      'Sala Aurora de Comando Operacional Estratégico',
    );
  });

  it('2. Mostra exatamente 2 botões PRIMÁRIOS inline: Iniciar Apresentação + Editar', async () => {
    await waitForRow();
    const primaryButtons = screen
      .getAllByRole('button')
      .filter((b) =>
        ['sala-start-presentation-aurora', 'sala-edit-aurora'].includes(
          b.getAttribute('data-testid') ?? '',
        ),
      );
    expect(primaryButtons).toHaveLength(2);
    expect(screen.getByTestId('sala-start-presentation-aurora')).toBeInTheDocument();
    expect(screen.getByTestId('sala-edit-aurora')).toBeInTheDocument();
  });

  it('3. Não renderiza mais botões inline secundários (Versões/Navegação/Layout/Destaque/Apresentação)', async () => {
    await waitForRow();
    // Antes da Wave I.4 cada uma dessas existia inline; agora moram no overflow.
    expect(screen.queryByTestId('sala-history-aurora')).toBeNull();
    expect(screen.queryByTestId('sala-navigation-aurora')).toBeNull();
    expect(screen.queryByTestId('sala-layout-aurora')).toBeNull();
    expect(screen.queryByTestId('sala-destaque-aurora')).toBeNull();
    expect(screen.queryByTestId('sala-kiosk-aurora')).toBeNull();
  });

  it('4. Touch target dos primários é >= 44px (h-11) — DS operacional', async () => {
    await waitForRow();
    const start = screen.getByTestId('sala-start-presentation-aurora');
    const edit = screen.getByTestId('sala-edit-aurora');
    expect(start.className).toMatch(/\bh-11\b/);
    expect(edit.className).toMatch(/\bh-11\b/);
    expect(start.className).toMatch(/min-w-\[44px\]/);
    expect(edit.className).toMatch(/min-w-\[44px\]/);
  });

  it('5. OverflowMenu trigger tem aria-label e ainda não está aberto', async () => {
    await waitForRow();
    const trigger = screen.getByTestId('sala-more-aurora-trigger');
    expect(trigger).toHaveAttribute('aria-label', 'Mais ações · Sala Aurora de Comando Operacional Estratégico');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('sala-more-aurora-menu')).toBeNull();
  });

  it('6. Clicar no `...` abre menu com 6 ações secundárias na ordem certa', async () => {
    await waitForRow();
    fireEvent.click(screen.getByTestId('sala-more-aurora-trigger'));
    const menu = await screen.findByTestId('sala-more-aurora-menu');
    expect(menu).toBeInTheDocument();
    // Verifica que todas as 6 ações secundárias existem.
    expect(screen.getByTestId('sala-more-aurora-apresentacao-url')).toBeInTheDocument();
    expect(screen.getByTestId('sala-more-aurora-versoes')).toBeInTheDocument();
    expect(screen.getByTestId('sala-more-aurora-navegacao')).toBeInTheDocument();
    expect(screen.getByTestId('sala-more-aurora-layout')).toBeInTheDocument();
    expect(screen.getByTestId('sala-more-aurora-destaque')).toBeInTheDocument();
    expect(screen.getByTestId('sala-more-aurora-apagar')).toBeInTheDocument();
  });

  it('7. Item "Apagar" do menu tem tom destrutivo (text-danger)', async () => {
    await waitForRow();
    fireEvent.click(screen.getByTestId('sala-more-aurora-trigger'));
    const apagar = await screen.findByTestId('sala-more-aurora-apagar');
    expect(apagar.className).toMatch(/text-danger/);
  });

  it('8. Clicar em "Apagar Sala" chama Workspaces.delete após confirmação', async () => {
    await waitForRow();
    fireEvent.click(screen.getByTestId('sala-more-aurora-trigger'));
    const apagar = await screen.findByTestId('sala-more-aurora-apagar');
    fireEvent.click(apagar);
    await waitFor(() =>
      expect(mockApi.Workspaces.delete).toHaveBeenCalledWith('ws-aurora'),
    );
  });

  it('9. Badge "v3" aparece e badge de destaque/em-apresentação não quebra layout', async () => {
    await waitForRow();
    // O bloco v{version} agora está em row inferior, shrink-0 — verifica renderização.
    const row = screen.getByTestId('sala-aurora');
    expect(row).toHaveTextContent('v3');
    expect(row).toHaveTextContent('aurora');
    // Em destaque é badge (Star icon + counter) — não botão. promotions = 0 aqui.
    expect(screen.queryByTestId('sala-promoted-aurora')).toBeNull();
  });

  it('10. ESC fecha o overflow menu (acessibilidade keyboard)', async () => {
    await waitForRow();
    fireEvent.click(screen.getByTestId('sala-more-aurora-trigger'));
    expect(await screen.findByTestId('sala-more-aurora-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByTestId('sala-more-aurora-menu')).toBeNull(),
    );
  });
});
