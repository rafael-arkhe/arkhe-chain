import { render, screen } from '@testing-library/react';
import { Sidenav } from '@/components/shell/sidenav';
import { I18nProvider } from '@/lib/i18n/provider';
import type { WhoAmI } from '@/lib/auth/api';

jest.mock('next/navigation', () => ({
  usePathname: () => '/buscar',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/use-nav-tree', () => ({
  useNavTree: () => ({
    tree: require('@/lib/api/fallback').FALLBACK_NAV,
    live: false,
    loading: false,
  }),
  // Passthrough — o badge REAL é coberto em sidenav-badge-real.test.tsx.
  overrideAlertBadge: (sections: unknown) => sections,
}));

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

const ADMIN_PRINCIPAL: WhoAmI = {
  user_id: 'u-admin',
  username: 'admin',
  display_name: 'Admin (demo)',
  email: null,
  tenant: null,
  clearances: [],
  roles: ['admin'],
  permissions: [],
  must_change_password: false,
  totp_enabled: false,
};

const VIEWER_PRINCIPAL: WhoAmI = {
  user_id: 'u-viewer',
  username: 'viewer',
  display_name: 'Auditor',
  email: null,
  tenant: null,
  clearances: [],
  roles: ['viewer'],
  permissions: [],
  must_change_password: false,
  totp_enabled: false,
};

beforeEach(() => {
  mockPrincipal = ADMIN_PRINCIPAL;
});

describe('Sidenav', () => {
  it('renderiza as 3 seções do app operacional', () => {
    // Governança migrou para o Painel de Controle (full-bleed); o sidenav
    // global do app operacional cobre Operação / Análise / Conteúdo.
    render(<Sidenav />);
    expect(screen.getByTestId('section-operacao')).toBeInTheDocument();
    expect(screen.getByTestId('section-analise')).toBeInTheDocument();
    expect(screen.getByTestId('section-conteudo')).toBeInTheDocument();
  });

  it('expõe itens da sidenav por id (Painel, Buscar, Geo, Rede, Alertas...)', () => {
    render(<Sidenav />);
    expect(screen.getByTestId('nav-painel')).toBeInTheDocument();
    expect(screen.getByTestId('nav-buscar')).toBeInTheDocument();
    expect(screen.getByTestId('nav-geo')).toBeInTheDocument();
    expect(screen.getByTestId('nav-rede')).toBeInTheDocument();
    expect(screen.getByTestId('nav-alertas')).toBeInTheDocument();
  });

  it('não inclui Canais', () => {
    render(<Sidenav />);
    expect(screen.queryByText('Canais')).toBeNull();
  });

  it('marca item ativo conforme pathname', () => {
    render(<Sidenav />);
    const ativo = screen.getByTestId('nav-buscar');
    expect(ativo.getAttribute('aria-current')).toBe('page');
  });

  it('itens sem permissão ficam desabilitados', () => {
    mockPrincipal = VIEWER_PRINCIPAL;
    render(<Sidenav />);
    const buscar = screen.getByTestId('nav-buscar');
    expect(buscar.getAttribute('aria-disabled')).toBe('true');
  });

  // W8 (2026-06-28): "Agentes" SAIU do FALLBACK_NAV estático — agora vem da
  // seção dinâmica "Aplicações" (useNavTree → Pages.list → /paginas/agentes/view),
  // ao lado de Conversas e Soluções. Como este suíte mocka useNavTree para
  // devolver SÓ o FALLBACK_NAV, o item dinâmico não aparece aqui; sua cobertura
  // (presença + perm-gating + survive #2) vive em w8-paginas-modulares.test.tsx.
});

/**
 * Onda R.5 — i18n das labels do sidenav global. Sem provider o useT()
 * cai no default pt-BR (idêntico ao FALLBACK_NAV literal, testes acima).
 * Dentro de <I18nProvider initialLocale="en-US"> as labels do tree
 * default traduzem por id estável (`nav.section.<id>` / `nav.<id>`).
 */
describe('Sidenav · i18n (LocalePicker → en-US)', () => {
  beforeEach(() => {
    mockPrincipal = ADMIN_PRINCIPAL;
    // Provider sincroniza locale via fetch('/api/me/context') no mount;
    // mockamos para NÃO sobrescrever o initialLocale en-US.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch;
  });

  it('seções e itens do tree default traduzem para en-US', () => {
    render(
      <I18nProvider initialLocale="en-US">
        <Sidenav />
      </I18nProvider>,
    );
    // Seções: Operação → Operations, Análise → Analysis, Conteúdo → Content
    expect(screen.getByTestId('section-operacao')).toHaveTextContent('Operations');
    expect(screen.getByTestId('section-analise')).toHaveTextContent('Analysis');
    expect(screen.getByTestId('section-conteudo')).toHaveTextContent('Content');
    // Itens: Mapa → Map, Câmeras → Cameras, Rede → Network
    expect(screen.getByTestId('nav-geo')).toHaveTextContent('Map');
    expect(screen.getByTestId('nav-cameras')).toHaveTextContent('Cameras');
    expect(screen.getByTestId('nav-rede')).toHaveTextContent('Network');
    // Logout chrome
    expect(screen.getByTestId('logout')).toHaveTextContent('Sign out');
  });

  it('default (sem provider) mantém pt-BR idêntico ao histórico', () => {
    render(<Sidenav />);
    expect(screen.getByTestId('section-operacao')).toHaveTextContent('Operação');
    expect(screen.getByTestId('nav-geo')).toHaveTextContent('Mapa');
    expect(screen.getByTestId('logout')).toHaveTextContent('Sair');
  });
});
