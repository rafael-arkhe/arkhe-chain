/**
 * M2 (2026-05-24) — /login respeita a marca do tenant.
 *
 * Cobertura:
 *  1. Sem marca (default AEGIS) → slogan padrão + logo AEGIS + data-brand-default=true.
 *  2. login_use_default=true ignora campos do tenant → marca neutra.
 *  3. login_use_default=false aplica logo/slogan/cor/mensagem do tenant.
 *  4. Falha de rede no getPublicBrand → cai no default AEGIS (sem crash).
 *  5. Submit chama /api/auth/login (form continua funcional).
 *  6. data-testids estáveis preservados (login-submit, secure-badge, sdk-version).
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoginPage from '@/app/login/page';
import type { PublicBrandOut } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ refresh: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock('@/lib/api', () => ({
  Styles: { getPublicBrand: jest.fn() },
}));

const { Styles } = jest.requireMock('@/lib/api') as {
  Styles: { getPublicBrand: jest.Mock };
};

// Slogan oficial Safe Core — default exibido quando a marca neutra está em
// uso (login_use_default) ou quando o slogan do tenant está vazio.
const DEFAULT_SLOGAN = 'Clareza para decisões complexas.';

const DEFAULT_BRAND: PublicBrandOut = {
  login_use_default: true,
  logo_url: '/aegis-logo.svg',
  slogan: DEFAULT_SLOGAN,
  primary_color: '#2D77BE',
  login_background: null,
  login_message: null,
  pwa_name: 'AEGIS',
  company_name: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  }) as unknown as typeof fetch;
});

describe('M2 · /login respeita a marca do tenant', () => {
  it('1. sem marca → default AEGIS (slogan + brand-default=true)', async () => {
    Styles.getPublicBrand.mockResolvedValue(DEFAULT_BRAND);
    render(<LoginPage />);
    await waitFor(() => expect(Styles.getPublicBrand).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('login-root')).toHaveAttribute(
        'data-brand-default',
        'true',
      ),
    );
    expect(screen.getByTestId('login-slogan')).toHaveTextContent(
      DEFAULT_SLOGAN,
    );
    expect(screen.getByTestId('login-logo')).toHaveAttribute(
      'src',
      '/aegis-logo.svg',
    );
  });

  it('2. login_use_default=true ignora campos do tenant', async () => {
    // Backend já neutraliza, mas garantimos que o front respeita a flag.
    Styles.getPublicBrand.mockResolvedValue({
      ...DEFAULT_BRAND,
      login_use_default: true,
    });
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByTestId('login-root')).toHaveAttribute(
        'data-brand-default',
        'true',
      ),
    );
    expect(screen.queryByTestId('login-message')).not.toBeInTheDocument();
  });

  it('3. login_use_default=false aplica marca do tenant', async () => {
    Styles.getPublicBrand.mockResolvedValue({
      login_use_default: false,
      logo_url: 'https://cdn.tenant-brand.io/marca.svg',
      slogan: 'Marca do Tenant',
      primary_color: '#C8341F',
      login_background: null,
      login_message: 'Acesso restrito.',
      pwa_name: 'AEGIS',
      company_name: null,
    } satisfies PublicBrandOut);
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByTestId('login-root')).toHaveAttribute(
        'data-brand-default',
        'false',
      ),
    );
    expect(screen.getByTestId('login-slogan')).toHaveTextContent('Marca do Tenant');
    expect(screen.getByTestId('login-logo')).toHaveAttribute(
      'src',
      'https://cdn.tenant-brand.io/marca.svg',
    );
    expect(screen.getByTestId('login-message')).toHaveTextContent(
      'Acesso restrito.',
    );
    // Cor custom aplicada ao botão Entrar.
    expect(screen.getByTestId('login-submit')).toHaveStyle({
      backgroundColor: '#C8341F',
    });
  });

  it('4. falha de rede no getPublicBrand cai no default sem crash', async () => {
    Styles.getPublicBrand.mockRejectedValue(new Error('network'));
    render(<LoginPage />);
    await waitFor(() => expect(Styles.getPublicBrand).toHaveBeenCalled());
    // Default AEGIS permanece renderizado.
    expect(screen.getByTestId('login-slogan')).toHaveTextContent(
      DEFAULT_SLOGAN,
    );
    expect(screen.getByTestId('login-root')).toHaveAttribute(
      'data-brand-default',
      'true',
    );
  });

  it('5. submit chama /api/auth/login', async () => {
    Styles.getPublicBrand.mockResolvedValue(DEFAULT_BRAND);
    render(<LoginPage />);
    await waitFor(() => screen.getByTestId('login-submit'));
    fireEvent.change(screen.getByLabelText('Credencial'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByTestId('login-submit'));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('6. testids estáveis preservados', async () => {
    Styles.getPublicBrand.mockResolvedValue(DEFAULT_BRAND);
    render(<LoginPage />);
    await waitFor(() => screen.getByTestId('login-submit'));
    expect(screen.getByTestId('login-secure-badge')).toBeInTheDocument();
    expect(screen.getByTestId('login-sdk-version')).toBeInTheDocument();
  });
});
