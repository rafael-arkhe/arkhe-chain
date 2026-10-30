import { render, screen, act } from '@testing-library/react';
import { ClassificationBanner } from '@/components/shell/classification-banner';
import { useClassification } from '@/lib/store';

// Wave E.1: stub do provider de Layout do App pra evitar fetch real no
// hook useAppShell durante o jsdom render.
//
// Onda M1.b (#11): o mock agora aceita overrides de banner via uma variável
// mutável, pra exercitar `config.banner.truncate` (enabled / max_chars /
// responsive) sem precisar de backend.
let mockBannerOverride: Record<string, unknown> = {};

jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({
    config: {
      banner: {
        visible: true,
        enabled: true,
        subtitle: null,
        custom_text: null,
        classification_default: null,
        bg: null,
        text: null,
        position: 'top',
        show_clock: false,
        show_timezone: false,
        dismissible: false,
        ...mockBannerOverride,
      },
    },
    isPreview: false,
    loading: false,
  }),
}));

describe('ClassificationBanner', () => {
  beforeEach(() => {
    mockBannerOverride = {};
    useClassification.setState({ level: 'restrito', label: '' });
  });

  it('renderiza o nível atual em pt-BR maiúsculas', () => {
    render(<ClassificationBanner />);
    expect(screen.getByTestId('classification-banner')).toHaveTextContent('RESTRITO');
  });

  it('reflete mudança de classificação via store', () => {
    render(<ClassificationBanner />);
    act(() => {
      useClassification.getState().setContext('sigiloso', 'OPERAÇÃO AURORA');
    });
    const banner = screen.getByTestId('classification-banner');
    expect(banner).toHaveTextContent('SIGILOSO');
    expect(banner).toHaveTextContent('OPERAÇÃO AURORA');
  });

  it('aplica classe de cor correspondente ao nível', () => {
    render(<ClassificationBanner />);
    act(() => {
      useClassification.getState().setContext('sigiloso', '');
    });
    expect(screen.getByTestId('classification-banner').className).toContain('bg-cls-sigiloso');
  });

  it('aplica texto escuro apenas em restrito (fundo amarelo)', () => {
    render(<ClassificationBanner />);
    act(() => {
      useClassification.getState().setContext('restrito', '');
    });
    expect(screen.getByTestId('classification-banner').className).toContain('text-black');
  });

  // ── Onda M1.b (#11) — truncamento por slot ────────────────────────────

  it('por padrão (config sem truncate) aplica truncate defensivo no banner', () => {
    render(<ClassificationBanner />);
    const banner = screen.getByTestId('classification-banner');
    // Fallback defensivo: truncate.enabled = true → container não usa nowrap,
    // ganha overflow-hidden e marca data-truncate.
    expect(banner.getAttribute('data-truncate')).toBe('true');
    expect(banner.className).toContain('overflow-hidden');
    expect(banner.className).not.toContain('whitespace-nowrap');
  });

  it('trunca o slot de classificação com max-width em ch + tooltip', () => {
    mockBannerOverride = {
      truncate: { enabled: true, max_chars_per_slot: 12, responsive: true },
    };
    render(<ClassificationBanner />);
    const level = screen.getByTestId('classification-banner-level');
    expect(level.className).toContain('truncate');
    expect(level.style.maxWidth).toBe('12ch');
    // Tooltip carrega o texto completo (label da classificação).
    expect(level.getAttribute('title')).toBe('RESTRITO');
  });

  it('trunca o texto livre (custom_text) por slot com tooltip', () => {
    mockBannerOverride = {
      custom_text: 'TEXTO MUITO LONGO QUE DEVE SER TRUNCADO NO SLOT',
      truncate: { enabled: true, max_chars_per_slot: 18, responsive: false },
    };
    render(<ClassificationBanner />);
    const text = screen.getByTestId('classification-banner-text');
    expect(text.className).toContain('truncate');
    expect(text.style.maxWidth).toBe('18ch');
    expect(text.getAttribute('title')).toBe(
      'TEXTO MUITO LONGO QUE DEVE SER TRUNCADO NO SLOT',
    );
  });

  it('com truncate.enabled=false preserva o layout legado (nowrap, sem max-width)', () => {
    mockBannerOverride = {
      custom_text: 'QUALQUER',
      truncate: { enabled: false, max_chars_per_slot: 24, responsive: true },
    };
    render(<ClassificationBanner />);
    const banner = screen.getByTestId('classification-banner');
    expect(banner.getAttribute('data-truncate')).toBe('false');
    expect(banner.className).toContain('whitespace-nowrap');
    const text = screen.getByTestId('classification-banner-text');
    expect(text.className).not.toContain('truncate');
    expect(text.style.maxWidth).toBe('');
  });

  it('com responsive=true esconde texto livre em telas estreitas (hidden md:)', () => {
    mockBannerOverride = {
      custom_text: 'CONTEXTO',
      truncate: { enabled: true, max_chars_per_slot: 24, responsive: true },
    };
    render(<ClassificationBanner />);
    const text = screen.getByTestId('classification-banner-text');
    // Slot menos crítico some antes da classificação em telas estreitas.
    expect(text.className).toContain('hidden');
    expect(text.className).toContain('md:inline-block');
    // A classificação (mais crítica) nunca recebe a classe de ocultar.
    const level = screen.getByTestId('classification-banner-level');
    expect(level.className).not.toContain('hidden');
  });

  it('o relógio fica ancorado à direita e shrink-0 (nunca empurrado pra fora)', () => {
    mockBannerOverride = {
      show_clock: true,
      truncate: { enabled: true, max_chars_per_slot: 24, responsive: true },
    };
    render(<ClassificationBanner />);
    const clock = screen.getByTestId('classification-banner-clock');
    expect(clock.className).toContain('ml-auto');
    expect(clock.className).toContain('shrink-0');
  });

  it('sanitiza max_chars_per_slot inválido caindo no default 24ch', () => {
    mockBannerOverride = {
      truncate: { enabled: true, max_chars_per_slot: 0, responsive: true },
    };
    render(<ClassificationBanner />);
    const level = screen.getByTestId('classification-banner-level');
    expect(level.style.maxWidth).toBe('24ch');
  });
});
