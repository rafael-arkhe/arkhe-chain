/**
 * Onda K.3 (2026-05-23) — /painel-de-controle/styles-configurator aba
 * unificada "Identidade Visual" (Marca + Cores num só fluxo + 1 preview).
 *
 * Feedback #6: substituiu o par confuso de abas "Marca" / "Cores por
 * região" (dois previews) por UMA aba com UM preview vivo. Estes testes
 * preservam a cobertura de comportamento (editar marca, editar cores,
 * presets, save, payload) na nova aba.
 *
 * Cobre:
 *  1. Render mostra 6 tabs (4 base + global-stylesheet + visual-identity).
 *  2. Aba Identidade Visual renderiza form de Marca + seções de Cores.
 *  3. Editar slogan reflete state local.
 *  4. Save Brand chama Styles.updateBrand com payload.
 *  5. Editar primary_color via color picker → hex sync.
 *  6. Editar pwa_name + pwa_short_name.
 *  7. Upload logo chama Styles.uploadLogo + atualiza preview.
 *  8. As 6 seções de cores (regions) renderizam.
 *  9. Editar banner.bg via color picker.
 * 10. Click "Restaurar padrão" zera a região.
 * 11. Save Region Colors chama Styles.updateRegionColors.
 * 12. Payload de region colors filtra strings vazias.
 * 13. Preview isolado de região reflete bg aplicado.
 * 14. backdrop.opacity é text input, não color.
 * 15. Erros do backend (marca e cores) aparecem no UI.
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
    getBrand: jest.fn(),
    updateBrand: jest.fn(),
    getRegionColors: jest.fn(),
    updateRegionColors: jest.fn(),
    uploadLogo: jest.fn(),
    getBrandDefaults: jest.fn(),
    getRegionColorPresets: jest.fn(),
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
  Styles: Record<string, jest.Mock>;
};

const EMPTY_BRAND = {
  logo_url: null,
  slogan: null,
  primary_color: null,
  favicon_url: null,
  pwa_name: null,
  pwa_short_name: null,
};

const EMPTY_REGIONS = {
  banner: {},
  sidenav: {},
  navbar: {},
  footer: {},
  comunicados: {},
  backdrop: {},
};

const LAYOUT_TEMPLATES = [
  { slug: 'sidebar-canvas-inspector', label: 'A', description: 'a' },
  { slug: 'single-pane', label: 'B', description: 'b' },
  { slug: 'two-col', label: 'C', description: 'c' },
  { slug: 'three-col', label: 'D', description: 'd' },
  { slug: 'tabbed', label: 'E', description: 'e' },
];

// Onda K.3: a aba unificada é "Identidade Visual". O botão da aba e o
// painel compartilham testid; clicamos no primeiro (botão) e esperamos o
// painel renderizar.
async function openVisualIdentity() {
  render(<StylesConfiguratorPage />);
  await screen.findByTestId('styles-tabs');
  fireEvent.click(screen.getByTestId('styles-tab-visual-identity'));
  await screen.findByTestId('brand-slogan');
}

describe('StylesConfiguratorPage · Identidade Visual unificada · Onda K.3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Styles.get.mockResolvedValue({ tokens: {} });
    Styles.update.mockImplementation(async (tokens) => ({ tokens }));
    Styles.getLayouts.mockResolvedValue({
      default_template: null,
      available: LAYOUT_TEMPLATES,
    });
    Styles.updateLayouts.mockImplementation(async (slug) => ({
      default_template: slug,
      available: LAYOUT_TEMPLATES,
    }));
    Styles.getGlobalStylesheet.mockResolvedValue({
      css: '',
      enabled: true,
      updated_at: null,
    });
    Styles.updateGlobalStylesheet.mockImplementation(async (css, enabled) => ({
      css,
      enabled,
      updated_at: '2026-05-23T00:00:00Z',
    }));
    Styles.getBrand.mockResolvedValue(EMPTY_BRAND);
    Styles.updateBrand.mockImplementation(async (b) => ({ ...EMPTY_BRAND, ...b }));
    Styles.getRegionColors.mockResolvedValue(EMPTY_REGIONS);
    Styles.updateRegionColors.mockImplementation(async (r) => ({
      ...EMPTY_REGIONS,
      ...r,
    }));
    Styles.uploadLogo.mockResolvedValue({
      storage_ref: 'minio://tenant-assets/logo/abc.png',
      url: 'http://minio/logo.png',
      filename: 'logo.png',
      content_type: 'image/png',
      bytes: 123,
      sha256: 'abc',
    });
    Styles.getBrandDefaults.mockResolvedValue({
      company_name_default: 'Safe Core',
      logo_default_url: '/aegis-logo.svg',
      slogan_default: 'Operar com clareza.',
      primary_color_default: '#2D77BE',
      favicon_default: '/favicon.ico',
      pwa_name: 'AEGIS',
      pwa_short_name: 'AEGIS',
    });
    Styles.getRegionColorPresets.mockResolvedValue({ presets: [] });
  });

  /* 1 */
  it('renderiza 6 tabs (base + global-stylesheet + identidade visual)', async () => {
    render(<StylesConfiguratorPage />);
    await screen.findByTestId('styles-tabs');
    expect(screen.getByTestId('styles-tab-text-styles')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-spacing')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-colors')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-layouts')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-global-stylesheet')).toBeInTheDocument();
    expect(screen.getByTestId('styles-tab-visual-identity')).toBeInTheDocument();
    // As abas antigas separadas NÃO existem mais.
    expect(screen.queryByTestId('styles-tab-brand')).not.toBeInTheDocument();
    expect(screen.queryByTestId('styles-tab-region-colors')).not.toBeInTheDocument();
  });

  /* 2 */
  it('aba Identidade Visual renderiza form de Marca + seções de Cores', async () => {
    await openVisualIdentity();
    expect(screen.getByTestId('brand-slogan')).toBeInTheDocument();
    expect(screen.getByTestId('brand-primary-color')).toBeInTheDocument();
    expect(screen.getByTestId('brand-favicon')).toBeInTheDocument();
    expect(screen.getByTestId('visual-identity-brand-section')).toBeInTheDocument();
    expect(screen.getByTestId('visual-identity-colors-section')).toBeInTheDocument();
  });

  /* 3 */
  it('Editar slogan reflete state', async () => {
    await openVisualIdentity();
    const slogan = screen.getByTestId('brand-slogan') as HTMLInputElement;
    fireEvent.change(slogan, { target: { value: 'Operar com clareza.' } });
    expect(slogan.value).toBe('Operar com clareza.');
  });

  /* 4 */
  it('Save Brand chama Styles.updateBrand', async () => {
    await openVisualIdentity();
    const slogan = screen.getByTestId('brand-slogan');
    fireEvent.change(slogan, { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('brand-save'));
    await waitFor(() =>
      expect(Styles.updateBrand).toHaveBeenCalledWith(
        expect.objectContaining({ slogan: 'X' }),
      ),
    );
  });

  /* 5 */
  it('color picker sincroniza com hex input', async () => {
    await openVisualIdentity();
    const picker = screen.getByTestId('brand-primary-color') as HTMLInputElement;
    fireEvent.change(picker, { target: { value: '#4A8FD1' } });
    const hex = screen.getByTestId('brand-primary-color-hex') as HTMLInputElement;
    expect(hex.value.toLowerCase()).toBe('#4a8fd1');
  });

  /* 6 */
  it('Editar pwa_name + pwa_short_name', async () => {
    await openVisualIdentity();
    const name = screen.getByTestId('brand-pwa-name') as HTMLInputElement;
    const short = screen.getByTestId('brand-pwa-short-name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'AEGIS-CP' } });
    fireEvent.change(short, { target: { value: 'AEGIS' } });
    fireEvent.click(screen.getByTestId('brand-save'));
    await waitFor(() =>
      expect(Styles.updateBrand).toHaveBeenCalledWith(
        expect.objectContaining({ pwa_name: 'AEGIS-CP', pwa_short_name: 'AEGIS' }),
      ),
    );
  });

  /* 7 */
  it('upload logo chama Styles.uploadLogo + atualiza preview', async () => {
    await openVisualIdentity();
    const input = screen.getByTestId('brand-logo-upload') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', {
      type: 'image/png',
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(Styles.uploadLogo).toHaveBeenCalled());
    expect(await screen.findByTestId('brand-logo-preview')).toBeInTheDocument();
  });

  /* 8 */
  it('as 6 seções de cores renderizam', async () => {
    await openVisualIdentity();
    expect(screen.getByTestId('region-colors-banner')).toBeInTheDocument();
    expect(screen.getByTestId('region-colors-sidenav')).toBeInTheDocument();
    expect(screen.getByTestId('region-colors-navbar')).toBeInTheDocument();
    expect(screen.getByTestId('region-colors-footer')).toBeInTheDocument();
    expect(screen.getByTestId('region-colors-comunicados')).toBeInTheDocument();
    expect(screen.getByTestId('region-colors-backdrop')).toBeInTheDocument();
  });

  /* 9 */
  it('Editar banner.bg via color picker', async () => {
    await openVisualIdentity();
    const picker = screen.getByTestId('region-input-banner-bg') as HTMLInputElement;
    fireEvent.change(picker, { target: { value: '#101010' } });
    const hex = screen.getByTestId('region-input-banner-bg-hex') as HTMLInputElement;
    expect(hex.value).toBe('#101010');
  });

  /* 10 */
  it('Restaurar padrão zera a região', async () => {
    Styles.getRegionColors.mockResolvedValue({
      ...EMPTY_REGIONS,
      banner: { bg: '#ABCDEF', text: '#FFFFFF' },
    });
    await openVisualIdentity();
    const hex = screen.getByTestId('region-input-banner-bg-hex') as HTMLInputElement;
    expect(hex.value).toBe('#ABCDEF');
    fireEvent.click(screen.getByTestId('region-colors-reset-banner'));
    await waitFor(() => {
      const after = screen.getByTestId(
        'region-input-banner-bg-hex',
      ) as HTMLInputElement;
      expect(after.value).toBe('');
    });
  });

  /* 11 */
  it('Save Region Colors chama Styles.updateRegionColors', async () => {
    await openVisualIdentity();
    const picker = screen.getByTestId('region-input-navbar-bg');
    fireEvent.change(picker, { target: { value: '#222222' } });
    fireEvent.click(screen.getByTestId('region-colors-save'));
    await waitFor(() =>
      expect(Styles.updateRegionColors).toHaveBeenCalledWith(
        expect.objectContaining({
          navbar: expect.objectContaining({ bg: '#222222' }),
        }),
      ),
    );
  });

  /* 12 */
  it('payload filtra strings vazias', async () => {
    await openVisualIdentity();
    fireEvent.click(screen.getByTestId('region-colors-save'));
    await waitFor(() => expect(Styles.updateRegionColors).toHaveBeenCalled());
    const payload = Styles.updateRegionColors.mock.calls[0][0];
    expect(payload.banner).toEqual({});
    expect(payload.sidenav).toEqual({});
  });

  /* 13 */
  it('preview isolado de região reflete bg aplicado', async () => {
    await openVisualIdentity();
    const picker = screen.getByTestId('region-input-banner-bg');
    fireEvent.change(picker, { target: { value: '#123456' } });
    const preview = screen.getByTestId('region-preview-banner') as HTMLElement;
    expect(preview.style.backgroundColor).toBeTruthy();
  });

  /* 14 */
  it('backdrop.opacity é text input, não color', async () => {
    await openVisualIdentity();
    const input = screen.getByTestId('region-input-backdrop-opacity') as HTMLInputElement;
    expect(input.type).toBe('text');
    fireEvent.change(input, { target: { value: '0.6' } });
    expect(input.value).toBe('0.6');
  });

  /* 15 */
  it('erros do backend (marca e cores) aparecem no UI', async () => {
    Styles.updateRegionColors.mockRejectedValueOnce(
      new Error('banner.bg=blue is not a valid hex color'),
    );
    Styles.updateBrand.mockRejectedValueOnce(new Error('logo_url inválido'));
    await openVisualIdentity();
    // Erro de cores
    fireEvent.click(screen.getByTestId('region-colors-save'));
    expect(await screen.findByTestId('region-colors-error')).toHaveTextContent(
      /not a valid hex color/,
    );
    // Erro de marca (independente)
    fireEvent.click(screen.getByTestId('brand-save'));
    expect(await screen.findByTestId('brand-error')).toHaveTextContent(
      /inválido/,
    );
  });
});
