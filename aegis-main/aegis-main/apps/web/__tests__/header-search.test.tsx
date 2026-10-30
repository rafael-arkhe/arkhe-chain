/**
 * Onda M1.b (2026-05-23, Feedback #4) — barra de busca personalizável.
 *
 * Cobre o consumo defensivo de `config.navbar.search`:
 *   - placeholder default quando o config não traz o campo (M1.a em paralelo)
 *   - placeholder customizado refletido no botão + aria-label
 *   - modo compacto (só ícone, largura fixa, sem texto/atalho)
 *   - clique sempre abre o CommandPalette (comportamento preservado)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/shell/header';

const mockSetOpen = jest.fn();

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/shell/classification-banner', () => ({
  ClassificationBanner: () => <div data-testid="classification-banner" />,
}));
jest.mock('@/components/shell/header-salas-menu', () => ({
  HeaderSalasMenu: () => <div data-testid="header-salas-menu" />,
}));
jest.mock('@/components/shell/user-menu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

jest.mock('@/lib/store', () => ({
  useCommandPalette: (selector: (s: { setOpen: typeof mockSetOpen }) => unknown) =>
    selector({ setOpen: mockSetOpen }),
  useSidenav: (selector: (s: { collapsed: boolean }) => unknown) =>
    selector({ collapsed: false }),
}));

// navbar override mutável → exercita search.placeholder / search.compact.
let mockNavbarOverride: Record<string, unknown> = {};
jest.mock('@/lib/app-shell/preview-provider', () => ({
  useAppShellConfig: () => ({
    config: {
      navbar: { logo: null, items: [], ...mockNavbarOverride },
    },
    isPreview: false,
    loading: false,
  }),
}));

const DEFAULT_PLACEHOLDER = 'Buscar pessoa, veículo, BO, mandado, endereço…';

describe('Header · busca personalizável (#4)', () => {
  beforeEach(() => {
    mockNavbarOverride = {};
    mockSetOpen.mockClear();
  });

  it('sem config.navbar.search usa o placeholder default (fallback defensivo)', () => {
    render(<Header />);
    const btn = screen.getByTestId('header-search');
    expect(btn).toHaveTextContent(DEFAULT_PLACEHOLDER);
    expect(btn.getAttribute('data-compact')).toBe('false');
    expect(btn).toHaveAttribute('aria-label', DEFAULT_PLACEHOLDER);
    // Atalho ⌘K visível no modo normal.
    expect(btn).toHaveTextContent('⌘K');
  });

  it('reflete o placeholder customizado vindo do config', () => {
    mockNavbarOverride = {
      search: { placeholder: 'Pesquisar incidentes e alvos', compact: false },
    };
    render(<Header />);
    const btn = screen.getByTestId('header-search');
    expect(btn).toHaveTextContent('Pesquisar incidentes e alvos');
    expect(btn).toHaveAttribute('aria-label', 'Pesquisar incidentes e alvos');
  });

  it('placeholder vazio cai no default (sanitização)', () => {
    mockNavbarOverride = { search: { placeholder: '   ', compact: false } };
    render(<Header />);
    expect(screen.getByTestId('header-search')).toHaveTextContent(
      DEFAULT_PLACEHOLDER,
    );
  });

  it('modo compacto: só ícone, largura fixa, sem texto longo nem atalho', () => {
    mockNavbarOverride = {
      search: { placeholder: 'Buscar tudo', compact: true },
    };
    render(<Header />);
    const btn = screen.getByTestId('header-search');
    expect(btn.getAttribute('data-compact')).toBe('true');
    expect(btn.className).toContain('w-9');
    expect(btn.className).not.toContain('flex-1');
    // O texto longo e o atalho NÃO são renderizados em modo compacto.
    expect(btn).not.toHaveTextContent('Buscar tudo');
    expect(btn).not.toHaveTextContent('⌘K');
    // aria-label + title preservam a intenção de busca pra leitores de tela.
    expect(btn).toHaveAttribute('aria-label', 'Buscar tudo');
    expect(btn).toHaveAttribute('title', 'Buscar tudo');
  });

  it('clicar na busca abre o CommandPalette (comportamento preservado)', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-search'));
    expect(mockSetOpen).toHaveBeenCalledWith(true);
  });

  it('clicar na busca compacta também abre o CommandPalette', () => {
    mockNavbarOverride = { search: { placeholder: 'X', compact: true } };
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-search'));
    expect(mockSetOpen).toHaveBeenCalledWith(true);
  });
});
