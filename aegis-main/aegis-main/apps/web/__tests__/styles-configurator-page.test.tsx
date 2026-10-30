/**
 * Wave D.2 (2026-05-23) — /painel-de-controle/styles-configurator.
 *
 * Cobre:
 *  - Carrega tokens via Styles.get e mostra na lista ativa.
 *  - Adicionar token via paleta esquerda.
 *  - Selecionar token mostra inspector com input editável.
 *  - Salvar chama Styles.update.
 *  - Erro do backend (ex.: border-radius bloqueado) mostra mensagem.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StylesConfiguratorPage from '@/app/painel-de-controle/styles-configurator/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/painel-de-controle/styles-configurator',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  Styles: {
    get: jest.fn(),
    update: jest.fn(),
    getLayouts: jest.fn(),
    updateLayouts: jest.fn(),
    getGlobalStylesheet: jest.fn(),
    updateGlobalStylesheet: jest.fn(),
    // Wave H.4.C — mocks pras novas APIs (não usadas neste suite, mas
    // precisam existir pra não quebrar o import dos tabs Marca/Cores).
    getBrand: jest.fn().mockResolvedValue({
      logo_url: null, slogan: null, primary_color: null,
      favicon_url: null, pwa_name: null, pwa_short_name: null,
    }),
    updateBrand: jest.fn(),
    getRegionColors: jest.fn().mockResolvedValue({
      banner: {}, sidenav: {}, navbar: {}, footer: {}, comunicados: {}, backdrop: {},
    }),
    updateRegionColors: jest.fn(),
    uploadLogo: jest.fn(),
  },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

const { Styles } = jest.requireMock('@/lib/api') as {
  Styles: {
    get: jest.Mock;
    update: jest.Mock;
    getLayouts: jest.Mock;
    updateLayouts: jest.Mock;
    getGlobalStylesheet: jest.Mock;
    updateGlobalStylesheet: jest.Mock;
  };
};

const LAYOUT_TEMPLATES = [
  {
    slug: 'sidebar-canvas-inspector',
    label: 'Painel-Tela-Inspetor',
    description: 'Painel à esquerda, tela central, inspetor à direita',
  },
  { slug: 'single-pane', label: 'Tela única', description: 'sem colunas' },
  { slug: 'two-col', label: 'Duas colunas', description: '2 col' },
  { slug: 'three-col', label: 'Três colunas', description: '3 col' },
  { slug: 'tabbed', label: 'Abas', description: 'tabs' },
];

describe('StylesConfiguratorPage · Wave D.2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Styles.get.mockResolvedValue({ tokens: {} });
    Styles.update.mockImplementation(async (tokens: Record<string, string>) => ({
      tokens,
    }));
    Styles.getLayouts.mockResolvedValue({
      default_template: null,
      available: LAYOUT_TEMPLATES,
    });
    Styles.updateLayouts.mockImplementation(async (slug: string) => ({
      default_template: slug,
      available: LAYOUT_TEMPLATES,
    }));
    Styles.getGlobalStylesheet.mockResolvedValue({
      css: '',
      enabled: true,
      updated_at: null,
    });
    Styles.updateGlobalStylesheet.mockImplementation(
      async (css: string, enabled: boolean) => ({
        css,
        enabled,
        updated_at: '2026-05-23T00:00:00Z',
      }),
    );
  });

  it('renders empty state when tenant has no custom tokens', async () => {
    render(<StylesConfiguratorPage />);
    expect(await screen.findByTestId('styles-active-empty')).toBeInTheDocument();
  });

  it('adds a token via the palette button', async () => {
    render(<StylesConfiguratorPage />);
    await waitFor(() => screen.getByTestId('styles-active-empty'));
    fireEvent.click(screen.getByTestId('styles-add-text-h1.size'));
    await waitFor(() => {
      expect(screen.getByTestId('styles-active-text-h1.size')).toBeInTheDocument();
    });
  });

  it('selects a token and exposes inspector with editable value', async () => {
    Styles.get.mockResolvedValue({ tokens: { 'primary.color': '#2D77BE' } });
    render(<StylesConfiguratorPage />);
    const item = await screen.findByTestId('styles-active-primary.color');
    fireEvent.click(item);
    const input = (await screen.findByTestId(
      'styles-inspector-value',
    )) as HTMLInputElement;
    expect(input.value).toBe('#2D77BE');
    fireEvent.change(input, { target: { value: '#4A8FD1' } });
    expect(input.value).toBe('#4A8FD1');
  });

  it('saves via Styles.update', async () => {
    Styles.get.mockResolvedValue({ tokens: { 'spacing.gap': '8px' } });
    render(<StylesConfiguratorPage />);
    const item = await screen.findByTestId('styles-active-spacing.gap');
    fireEvent.click(item);
    const input = (await screen.findByTestId(
      'styles-inspector-value',
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12px' } });
    fireEvent.click(screen.getByTestId('styles-save'));
    await waitFor(() => {
      expect(Styles.update).toHaveBeenCalled();
    });
    const callArgs = (Styles.update.mock.calls[0] as unknown[])[0] as Record<
      string,
      string
    >;
    expect(callArgs['spacing.gap']).toBe('12px');
  });

  /* ── Wave F.2 (2026-05-23) — 5 abas slate-parity ────────────────── */

  it('renderiza 5 tabs (text-styles, spacing, colors, layouts, global-stylesheet)', async () => {
    render(<StylesConfiguratorPage />);
    await screen.findByTestId('styles-tabs');
    expect(screen.getByTestId('styles-tab-text-styles')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-spacing')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-colors')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-layouts')).toBeInTheDocument();
    expect(
      screen.getByTestId('styles-tab-global-stylesheet'),
    ).toBeInTheDocument();
  });

  /* ── Wave G.3 — Layouts + Global Stylesheet real ─────────────────── */

  it('aba Layouts lista 5 templates e permite selecionar + salvar', async () => {
    render(<StylesConfiguratorPage />);
    await screen.findByTestId('styles-tabs');
    fireEvent.click(screen.getByTestId('styles-tab-layouts'));

    await waitFor(() =>
      expect(screen.getByTestId('styles-layouts-list')).toBeInTheDocument(),
    );

    // 5 templates renderizados
    expect(screen.getByTestId('styles-layout-sidebar-canvas-inspector')).toBeInTheDocument();
    expect(screen.getByTestId('styles-layout-single-pane')).toBeInTheDocument();
    expect(screen.getByTestId('styles-layout-two-col')).toBeInTheDocument();
    expect(screen.getByTestId('styles-layout-three-col')).toBeInTheDocument();
    expect(screen.getByTestId('styles-layout-tabbed')).toBeInTheDocument();

    // Save desabilitado quando nada selecionado
    expect(screen.getByTestId('styles-layouts-save')).toBeDisabled();

    fireEvent.click(screen.getByTestId('styles-layout-three-col'));
    expect(screen.getByTestId('styles-layout-three-col')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await waitFor(() =>
      expect(screen.getByTestId('styles-layouts-save')).toBeEnabled(),
    );
    fireEvent.click(screen.getByTestId('styles-layouts-save'));

    await waitFor(() =>
      expect(Styles.updateLayouts).toHaveBeenCalledWith(
        'three-col',
        expect.any(String),
      ),
    );
  });

  it('aba Folha de estilo global mostra editor + salva CSS válido', async () => {
    render(<StylesConfiguratorPage />);
    await screen.findByTestId('styles-tabs');
    fireEvent.click(screen.getByTestId('styles-tab-global-stylesheet'));

    const editor = (await screen.findByTestId(
      'styles-css-editor',
    )) as HTMLTextAreaElement;
    expect(editor).toBeInTheDocument();
    expect(screen.getByTestId('styles-css-save')).toBeDisabled();

    fireEvent.change(editor, {
      target: {
        value: '.aegis-app-shell-banner { background: #000; color: #fff; }',
      },
    });

    await waitFor(() =>
      expect(screen.getByTestId('styles-css-save')).toBeEnabled(),
    );
    fireEvent.click(screen.getByTestId('styles-css-save'));

    await waitFor(() => expect(Styles.updateGlobalStylesheet).toHaveBeenCalled());
    const call = Styles.updateGlobalStylesheet.mock.calls[0] as unknown[];
    expect(call[0]).toMatch(/aegis-app-shell-banner/);
    expect(call[1]).toBe(true);
  });

  it('aba Folha de estilo global lint client-side bloqueia border-radius != 0', async () => {
    render(<StylesConfiguratorPage />);
    await screen.findByTestId('styles-tabs');
    fireEvent.click(screen.getByTestId('styles-tab-global-stylesheet'));

    const editor = (await screen.findByTestId(
      'styles-css-editor',
    )) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: { value: '.x { border-radius: 8px; }' },
    });

    await waitFor(() =>
      expect(screen.getByTestId('styles-css-lint')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('styles-css-lint-0')).toHaveTextContent(
      /border-radius/i,
    );
    // Save bloqueado enquanto houver lint error
    expect(screen.getByTestId('styles-css-save')).toBeDisabled();
  });

  it('aba Folha de estilo global aceita border-radius: 0 sem violations', async () => {
    render(<StylesConfiguratorPage />);
    await screen.findByTestId('styles-tabs');
    fireEvent.click(screen.getByTestId('styles-tab-global-stylesheet'));

    const editor = (await screen.findByTestId(
      'styles-css-editor',
    )) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: { value: '.sharp { border-radius: 0; }' },
    });

    // Sem erros de lint
    expect(screen.queryByTestId('styles-css-lint')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('styles-css-save')).toBeEnabled(),
    );
  });

  it('shows backend error (border-radius lock) inline', async () => {
    Styles.get.mockResolvedValue({ tokens: { 'primary.color': '#2D77BE' } });
    Styles.update.mockRejectedValue(new Error('border-radius must be 0'));
    render(<StylesConfiguratorPage />);
    // Edit something to make the form dirty.
    const item = await screen.findByTestId('styles-active-primary.color');
    fireEvent.click(item);
    const input = (await screen.findByTestId(
      'styles-inspector-value',
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#000000' } });
    fireEvent.click(screen.getByTestId('styles-save'));
    await waitFor(() => {
      expect(screen.getByTestId('styles-error')).toHaveTextContent(/border-radius/i);
    });
  });
});
