import { render, screen, fireEvent } from '@testing-library/react';
import { UserMenu } from '@/components/shell/user-menu';
import type { WhoAmI } from '@/lib/auth/api';

let mockPrincipal: WhoAmI | null = null;

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: mockPrincipal,
    loading: false,
    error: null,
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
  useCan: (key: string) => {
    if (!mockPrincipal) return false;
    if (mockPrincipal.roles.includes('admin')) return true;
    return mockPrincipal.permissions.includes(key);
  },
  usePrincipal: () => mockPrincipal,
}));

jest.mock('@/components/iam/TotpDialog', () => ({
  TotpDialog: () => null,
}));

const ADMIN: WhoAmI = {
  user_id: 'u-admin',
  username: 'admin',
  display_name: 'Admin',
  email: null,
  tenant: null,
  clearances: [],
  roles: ['admin'],
  permissions: [],
  must_change_password: false,
  totp_enabled: false,
};

const SEM_PAINEL: WhoAmI = {
  user_id: 'u-viewer',
  username: 'viewer',
  display_name: 'Auditor',
  email: null,
  tenant: null,
  clearances: [],
  roles: ['viewer'],
  permissions: ['security.painel.view'],
  must_change_password: false,
  totp_enabled: false,
};

const COM_PAINEL: WhoAmI = {
  ...SEM_PAINEL,
  permissions: ['security.painel.view', 'painel.home.view'],
};

/**
 * Sprint H1.3 (2026-05-22): item "Painel de Controle" foi renomeado pra
 * "Configurações" e o item standalone "Configurações" (→ /configuracoes)
 * foi removido. Único acesso a settings é via este menu, ícone Cog,
 * gated por painel.home.view, abrindo /painel-de-controle.
 */
describe('UserMenu · Configurações (ex-Painel de Controle)', () => {
  beforeEach(() => {
    mockPrincipal = ADMIN;
  });

  it('admin enxerga "Configurações" apontando para /painel-de-controle', () => {
    render(<UserMenu />);
    fireEvent.click(screen.getByTestId('header-user-menu'));
    const link = screen.getByTestId('header-user-configuracoes');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/painel-de-controle');
    expect(link).toHaveTextContent('Configurações');
  });

  it('o item usa ícone Cog (engrenagem)', () => {
    render(<UserMenu />);
    fireEvent.click(screen.getByTestId('header-user-menu'));
    const link = screen.getByTestId('header-user-configuracoes');
    const svg = link.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').toMatch(/lucide-cog/);
    expect(svg?.getAttribute('class') ?? '').not.toMatch(/lucide-gauge/);
  });

  it('usuário com perm painel.home.view enxerga "Configurações"', () => {
    mockPrincipal = COM_PAINEL;
    render(<UserMenu />);
    fireEvent.click(screen.getByTestId('header-user-menu'));
    expect(screen.getByTestId('header-user-configuracoes')).toBeInTheDocument();
  });

  it('usuário sem perm painel.home.view NÃO enxerga "Configurações"', () => {
    mockPrincipal = SEM_PAINEL;
    render(<UserMenu />);
    fireEvent.click(screen.getByTestId('header-user-menu'));
    expect(screen.queryByTestId('header-user-configuracoes')).toBeNull();
  });

  it('NÃO existe mais um item "Painel de Controle" separado no dropdown', () => {
    render(<UserMenu />);
    fireEvent.click(screen.getByTestId('header-user-menu'));
    expect(screen.queryByTestId('header-user-painel')).toBeNull();
  });

  it('NÃO existe mais link para /configuracoes (link standalone removido)', () => {
    render(<UserMenu />);
    fireEvent.click(screen.getByTestId('header-user-menu'));
    const dropdown = screen.getByTestId('header-user-dropdown');
    const links = Array.from(dropdown.querySelectorAll('a[href]'));
    expect(
      links.find((el) => el.getAttribute('href') === '/configuracoes'),
    ).toBeUndefined();
  });
});
