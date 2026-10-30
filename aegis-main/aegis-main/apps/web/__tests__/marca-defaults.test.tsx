/**
 * Onda K.3 (2026-05-23) — Feedback #6/#7: aba unificada "Identidade Visual"
 * pré-carrega VALORES DEFAULT da marca (logo placeholder, slogan, favicon,
 * PWA name + short name) e mostra UM ÚNICO preview vivo ao lado do form que
 * reflete marca E cores no mesmo shell mock.
 *
 * Cobertura:
 *  1. Form pré-populado com defaults quando backend devolve brand vazio.
 *  2. Defaults vêm de Styles.getBrandDefaults (não hardcoded só no client).
 *  3. Brand persistido sobrescreve o default (campo não-null vence).
 *  4. Campo null no brand cai pro default correspondente (merge parcial).
 *  5. Preview unificado renderiza e reflete o logo-texto/slogan da marca.
 *  6. Editar slogan reflete no preview ao vivo.
 *  7. Hint de "valores padrão pré-carregados" aparece.
 *  8. UNIFICAÇÃO: marca E cor refletem no MESMO preview (um só shell).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  company_name: null,
  logo_url: null,
  slogan: null,
  primary_color: null,
  favicon_url: null,
  pwa_name: null,
  pwa_short_name: null,
};

const DEFAULTS = {
  company_name_default: 'Safe Core',
  logo_default_url: '/aegis-logo.svg',
  slogan_default: 'Operar com clareza.',
  primary_color_default: '#2D77BE',
  favicon_default: '/favicon.ico',
  pwa_name: 'AEGIS',
  pwa_short_name: 'AEGIS',
};

const EMPTY_REGIONS = {
  banner: {},
  sidenav: {},
  navbar: {},
  footer: {},
  comunicados: {},
  backdrop: {},
};

async function openVisualIdentity() {
  render(<StylesConfiguratorPage />);
  await screen.findByTestId('styles-tabs');
  // O botão da aba e o painel compartilham testid; clica no botão (primeiro
  // match) e espera um elemento único do painel.
  fireEvent.click(screen.getAllByTestId('styles-tab-visual-identity')[0]);
  await screen.findByTestId('brand-slogan');
}

describe('Onda K.3 · Identidade Visual: marca defaults + preview unificado (#6/#7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Styles.get.mockResolvedValue({ tokens: {} });
    Styles.getLayouts.mockResolvedValue({ default_template: null, available: [] });
    Styles.getGlobalStylesheet.mockResolvedValue({ css: '', enabled: true, updated_at: null });
    Styles.getBrand.mockResolvedValue(EMPTY_BRAND);
    Styles.updateBrand.mockImplementation(async (b) => ({ ...EMPTY_BRAND, ...b }));
    Styles.getRegionColors.mockResolvedValue(EMPTY_REGIONS);
    Styles.getBrandDefaults.mockResolvedValue(DEFAULTS);
    Styles.getRegionColorPresets.mockResolvedValue({ presets: [] });
  });

  it('1. form pré-populado com defaults quando brand vazio', async () => {
    await openVisualIdentity();
    const slogan = screen.getByTestId('brand-slogan') as HTMLInputElement;
    const pwaName = screen.getByTestId('brand-pwa-name') as HTMLInputElement;
    const pwaShort = screen.getByTestId('brand-pwa-short-name') as HTMLInputElement;
    await waitFor(() => expect(slogan.value).toBe('Operar com clareza.'));
    expect(pwaName.value).toBe('AEGIS');
    expect(pwaShort.value).toBe('AEGIS');
  });

  it('2. defaults vêm de Styles.getBrandDefaults', async () => {
    await openVisualIdentity();
    await waitFor(() => expect(Styles.getBrandDefaults).toHaveBeenCalled());
  });

  it('3. brand persistido sobrescreve default', async () => {
    Styles.getBrand.mockResolvedValue({ ...EMPTY_BRAND, slogan: 'Slogan custom' });
    await openVisualIdentity();
    const slogan = screen.getByTestId('brand-slogan') as HTMLInputElement;
    await waitFor(() => expect(slogan.value).toBe('Slogan custom'));
  });

  it('4. campo null no brand cai pro default', async () => {
    Styles.getBrand.mockResolvedValue({ ...EMPTY_BRAND, slogan: 'Só slogan' });
    await openVisualIdentity();
    const pwaName = screen.getByTestId('brand-pwa-name') as HTMLInputElement;
    await waitFor(() => expect(pwaName.value).toBe('AEGIS'));
  });

  it('5. preview unificado reflete logo e slogan da marca', async () => {
    await openVisualIdentity();
    const preview = await screen.findByTestId('identidade-visual-preview');
    expect(preview).toBeInTheDocument();
    // Default tem logo_url=/aegis-logo.svg → logo IMG no canvas.
    expect(
      within(preview).getByTestId('identidade-visual-preview-canvas-logo'),
    ).toBeInTheDocument();
    // Slogan default aparece no canvas (size=normal mostra slogan).
    expect(
      within(preview).getByTestId('identidade-visual-preview-canvas-slogan'),
    ).toHaveTextContent('Operar com clareza.');
  });

  it('5b. preview mostra logo-texto AEGIS quando marca sem logo', async () => {
    Styles.getBrandDefaults.mockResolvedValue({ ...DEFAULTS, logo_default_url: '' });
    Styles.getBrand.mockResolvedValue({ ...EMPTY_BRAND });
    await openVisualIdentity();
    const preview = await screen.findByTestId('identidade-visual-preview');
    // Sem logo → fallback logo-texto "AEGIS".
    expect(
      within(preview).getByTestId('identidade-visual-preview-canvas-logo-text'),
    ).toHaveTextContent('AEGIS');
  });

  it('6. editar slogan reflete no preview ao vivo', async () => {
    await openVisualIdentity();
    const slogan = screen.getByTestId('brand-slogan') as HTMLInputElement;
    fireEvent.change(slogan, { target: { value: 'Novo lema' } });
    const preview = screen.getByTestId('identidade-visual-preview');
    await waitFor(() =>
      expect(
        within(preview).getByTestId('identidade-visual-preview-canvas-slogan'),
      ).toHaveTextContent('Novo lema'),
    );
  });

  it('7. hint de valores padrão aparece', async () => {
    await openVisualIdentity();
    expect(await screen.findByTestId('brand-defaults-hint')).toBeInTheDocument();
  });

  it('7a. Onda M3 — campo "Nome da empresa" pré-populado com o default', async () => {
    await openVisualIdentity();
    const company = screen.getByTestId('brand-company-name') as HTMLInputElement;
    await waitFor(() => expect(company.value).toBe('Safe Core'));
  });

  it('7b. Onda M3 — brand persistido sobrescreve o nome da empresa', async () => {
    Styles.getBrand.mockResolvedValue({
      ...EMPTY_BRAND,
      company_name: 'Guarda Municipal',
    });
    await openVisualIdentity();
    const company = screen.getByTestId('brand-company-name') as HTMLInputElement;
    await waitFor(() => expect(company.value).toBe('Guarda Municipal'));
  });

  it('7c. Onda M3 — editar + salvar persiste company_name via updateBrand', async () => {
    await openVisualIdentity();
    const company = screen.getByTestId('brand-company-name') as HTMLInputElement;
    await waitFor(() => expect(company.value).toBe('Safe Core'));
    fireEvent.change(company, { target: { value: 'Polícia Civil' } });
    fireEvent.click(screen.getByTestId('brand-save'));
    await waitFor(() =>
      expect(Styles.updateBrand).toHaveBeenCalledWith(
        expect.objectContaining({ company_name: 'Polícia Civil' }),
      ),
    );
  });

  it('8. UNIFICAÇÃO — marca E cor refletem no MESMO preview', async () => {
    await openVisualIdentity();
    const preview = screen.getByTestId('identidade-visual-preview');
    // Editar uma cor de região (banner.bg) reflete no banner do MESMO canvas
    // onde a marca também é exibida — prova de preview único.
    const bannerBg = screen.getByTestId('region-input-banner-bg');
    fireEvent.change(bannerBg, { target: { value: '#112233' } });
    const banner = within(preview).getByTestId('identidade-visual-preview-canvas-banner');
    await waitFor(() => expect(banner.style.backgroundColor).toBe('rgb(17, 34, 51)'));
    // E o slogan da marca continua no mesmo preview.
    expect(
      within(preview).getByTestId('identidade-visual-preview-canvas-slogan'),
    ).toBeInTheDocument();
  });
});
