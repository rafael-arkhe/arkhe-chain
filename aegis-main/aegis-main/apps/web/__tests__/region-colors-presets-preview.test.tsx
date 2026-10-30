/**
 * Onda K.3 (2026-05-23) — Feedback #6: aba unificada "Identidade Visual"
 * tem UM preview vivo (`IdentidadeVisualPreview`) com os 3 presets de
 * paleta AEGIS (Padrão / Alto Contraste / Dark Operacional). Substitui o
 * antigo `RegionColorsPreview` que vivia numa aba separada.
 *
 * Cobertura:
 *  1. Preview component + os 3 chips de preset renderizam.
 *  2. Shell mock (canvas) renderiza com todas as regiões.
 *  3. Clicar "Alto Contraste" aplica cores em todas as regiões (banner.bg).
 *  4. Aplicar preset reflete no shell mock (banner bg muda).
 *  5. Preset "Padrão AEGIS" reproduz tokens default do sidenav.
 *  6. Restaurar zera as regiões.
 *  7. Presets do backend (quando presentes) sobrescrevem fallback local.
 *  8. Editar field manual após preset não trava o preview.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import StylesConfiguratorPage from '@/app/painel-de-controle/styles-configurator/page';
import { PRESET_DEFAULT_SHARP } from '@/lib/app-shell/defaults';

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

async function openVisualIdentity() {
  render(<StylesConfiguratorPage />);
  await screen.findByTestId('styles-tabs');
  fireEvent.click(screen.getByTestId('styles-tab-visual-identity'));
  await screen.findByTestId('identidade-visual-preview');
}

describe('Onda K.3 · Identidade Visual presets + preview unificado (#6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Styles.get.mockResolvedValue({ tokens: {} });
    Styles.getLayouts.mockResolvedValue({ default_template: null, available: [] });
    Styles.getGlobalStylesheet.mockResolvedValue({ css: '', enabled: true, updated_at: null });
    Styles.getBrand.mockResolvedValue(EMPTY_BRAND);
    Styles.getRegionColors.mockResolvedValue(EMPTY_REGIONS);
    Styles.updateRegionColors.mockImplementation(async (r) => ({ ...EMPTY_REGIONS, ...r }));
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

  it('1. preview + 3 chips de preset renderizam', async () => {
    await openVisualIdentity();
    expect(
      screen.getByTestId('identidade-visual-preview-preset-default-sharp'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('identidade-visual-preview-preset-alto-contraste'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('identidade-visual-preview-preset-dark-operacional'),
    ).toBeInTheDocument();
  });

  it('2. shell mock (canvas) renderiza com regiões', async () => {
    await openVisualIdentity();
    const canvas = screen.getByTestId('identidade-visual-preview-canvas');
    expect(
      within(canvas).getByTestId('identidade-visual-preview-canvas-banner'),
    ).toBeInTheDocument();
    expect(
      within(canvas).getByTestId('identidade-visual-preview-canvas-sidenav'),
    ).toBeInTheDocument();
    expect(
      within(canvas).getByTestId('identidade-visual-preview-canvas-footer'),
    ).toBeInTheDocument();
  });

  it('3. clicar Alto Contraste aplica cores em todas as regiões', async () => {
    await openVisualIdentity();
    fireEvent.click(
      screen.getByTestId('identidade-visual-preview-preset-alto-contraste'),
    );
    const hex = screen.getByTestId('region-input-banner-bg-hex') as HTMLInputElement;
    await waitFor(() => expect(hex.value.toLowerCase()).toBe('#000000'));
  });

  it('4. aplicar preset reflete no shell mock', async () => {
    await openVisualIdentity();
    fireEvent.click(
      screen.getByTestId('identidade-visual-preview-preset-dark-operacional'),
    );
    const banner = screen.getByTestId('identidade-visual-preview-canvas-banner');
    // Dark Operacional banner.bg = #0A0A0A → rgb(10,10,10)
    await waitFor(() => expect(banner.style.backgroundColor).toBe('rgb(10, 10, 10)'));
  });

  it('5. preset Padrão AEGIS reproduz tokens default', async () => {
    await openVisualIdentity();
    fireEvent.click(
      screen.getByTestId('identidade-visual-preview-preset-default-sharp'),
    );
    const bannerHex = screen.getByTestId('region-input-banner-bg-hex') as HTMLInputElement;
    const sidenavActive = screen.getByTestId(
      'region-input-sidenav-active-hex',
    ) as HTMLInputElement;
    await waitFor(() =>
      expect(bannerHex.value.toLowerCase()).toBe(
        PRESET_DEFAULT_SHARP.colors.banner.bg!.toLowerCase(),
      ),
    );
    expect(sidenavActive.value.toLowerCase()).toBe(
      PRESET_DEFAULT_SHARP.colors.sidenav.active!.toLowerCase(),
    );
  });

  it('6. restaurar zera as regiões', async () => {
    await openVisualIdentity();
    fireEvent.click(
      screen.getByTestId('identidade-visual-preview-preset-alto-contraste'),
    );
    const hex = screen.getByTestId('region-input-banner-bg-hex') as HTMLInputElement;
    await waitFor(() => expect(hex.value).not.toBe(''));
    fireEvent.click(screen.getByTestId('identidade-visual-preview-reset'));
    await waitFor(() => {
      const after = screen.getByTestId('region-input-banner-bg-hex') as HTMLInputElement;
      expect(after.value).toBe('');
    });
  });

  it('7. presets do backend sobrescrevem fallback local', async () => {
    Styles.getRegionColorPresets.mockResolvedValue({
      presets: [
        {
          key: 'default-sharp',
          label: 'Backend Preset',
          description: 'do backend',
          colors: {
            banner: { bg: '#123456', text: '#FFFFFF', accent: '#FFC107' },
            sidenav: { bg: '#FFFFFF', text: '#000000', active: '#123456' },
            navbar: {},
            footer: {},
            comunicados: {},
            backdrop: {},
          },
        },
      ],
    });
    await openVisualIdentity();
    const chip = await screen.findByTestId(
      'identidade-visual-preview-preset-default-sharp',
    );
    await waitFor(() => expect(chip).toHaveTextContent('Backend Preset'));
  });

  it('8. editar field manual após preset não trava o preview', async () => {
    await openVisualIdentity();
    fireEvent.click(
      screen.getByTestId('identidade-visual-preview-preset-default-sharp'),
    );
    const hex = screen.getByTestId('region-input-banner-bg-hex') as HTMLInputElement;
    fireEvent.change(hex, { target: { value: '#ABCDEF' } });
    const banner = screen.getByTestId('identidade-visual-preview-canvas-banner');
    await waitFor(() => expect(banner.style.backgroundColor).toBe('rgb(171, 205, 239)'));
  });
});
