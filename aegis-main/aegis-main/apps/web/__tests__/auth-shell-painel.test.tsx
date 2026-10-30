/**
 * AuthShell: na rota /painel-de-controle, a casca global some.
 * Garante o padrão Palantir-style (mesmo branch do /workshop/kiosk/*).
 */
import { render, screen } from '@testing-library/react';
import { AuthShell } from '@/components/shell/auth-shell';

let mockPath = '/';
let mockSearch = '';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// ControlPanelShell tem dependências complexas (next/image, ControlPanel
// API, etc.) — mock simplificado pro teste de wrap.
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  __esModule: true,
  ControlPanelShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cp-shell-wrapper">{children}</div>
  ),
}));

jest.mock('@/lib/auth/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    principal: {
      user_id: 'u',
      username: 'u',
      display_name: 'U',
      email: null,
      tenant: null,
      clearances: [],
      roles: ['admin'],
      permissions: [],
      must_change_password: false,
      totp_enabled: false,
    },
    loading: false,
    error: null,
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
  useCan: () => true,
  usePrincipal: () => null,
}));

jest.mock('@/components/shell/header', () => ({
  Header: () => <header data-testid="header">HEADER</header>,
}));
jest.mock('@/components/shell/sidenav', () => ({
  Sidenav: () => <nav data-testid="sidenav">SIDENAV</nav>,
}));
jest.mock('@/components/shell/footer', () => ({
  Footer: () => <footer data-testid="footer">FOOTER</footer>,
}));
jest.mock('@/components/shell/command-palette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}));

describe('AuthShell · /painel-de-controle é full-bleed', () => {
  it('em rota normal renderiza header/sidenav/footer', () => {
    mockPath = '/';
    render(<AuthShell><div data-testid="page">conteudo</div></AuthShell>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('em /painel-de-controle não renderiza header/sidenav/footer/command-palette', () => {
    mockPath = '/painel-de-controle';
    render(<AuthShell><div data-testid="page">conteudo</div></AuthShell>);
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('sidenav')).toBeNull();
    expect(screen.queryByTestId('footer')).toBeNull();
    expect(screen.queryByTestId('command-palette')).toBeNull();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('em /painel-de-controle/aprovacoes também é full-bleed (rota filha)', () => {
    mockPath = '/painel-de-controle/aprovacoes';
    mockSearch = '';
    render(<AuthShell><div data-testid="page">conteudo</div></AuthShell>);
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('sidenav')).toBeNull();
    expect(screen.queryByTestId('footer')).toBeNull();
  });
});

/**
 * Sprint H1.4 (2026-05-22): qualquer rota com ?cp=1 é envelopada no
 * ControlPanelShell, mantendo a sidebar do painel visível em destinos
 * externos (Workshop, IAM, etc.). Espelha o modelo Foundry: sidebar
 * persiste, content area troca.
 */
describe('AuthShell · ?cp=1 envelopa qualquer rota no ControlPanelShell', () => {
  it('rota /workshop?cp=1 vira fullscreen + envelopa no ControlPanelShell', () => {
    mockPath = '/workshop';
    mockSearch = 'cp=1';
    render(<AuthShell><div data-testid="page">workshop</div></AuthShell>);
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('sidenav')).toBeNull();
    expect(screen.queryByTestId('footer')).toBeNull();
    expect(screen.getByTestId('cp-shell-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('rota /workshop sem cp=1 renderiza com chrome global normal', () => {
    mockPath = '/workshop';
    mockSearch = '';
    render(<AuthShell><div data-testid="page">workshop</div></AuthShell>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.queryByTestId('cp-shell-wrapper')).toBeNull();
  });

  it('rota /painel-de-controle com cp=1 NÃO double-wrap (layout já wrappa)', () => {
    mockPath = '/painel-de-controle';
    mockSearch = 'cp=1';
    render(<AuthShell><div data-testid="page">painel</div></AuthShell>);
    // Sem chrome global e sem double-wrap (cp-shell-wrapper é só pra
    // rotas externas — internas usam o layout do painel).
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('cp-shell-wrapper')).toBeNull();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });
});

/**
 * Sprint H1.7 (2026-05-22): cp mode persiste via cookie pra que
 * navegação interna em Workshop/IAM/etc não perca o marker quando
 * Links internos descartam o querystring. Server-side hydrate via
 * prop initialCpMode (sem flash).
 */
describe('AuthShell · cp mode persistido via cookie (H1.7)', () => {
  beforeEach(() => {
    // Limpa cookie entre testes
    document.cookie = 'aegis_cp=; path=/; max-age=0';
  });

  it('/workshop/{id}/edit com cookie aegis_cp=1 (e sem ?cp=1) → cp mode', () => {
    document.cookie = 'aegis_cp=1; path=/';
    mockPath = '/workshop/app-123/edit';
    mockSearch = '';
    render(<AuthShell initialCpMode={true}><div data-testid="page">editor</div></AuthShell>);
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('sidenav')).toBeNull();
    expect(screen.getByTestId('cp-shell-wrapper')).toBeInTheDocument();
  });

  it('/iam/equipe com cookie → cp mode (sub-rota cp-linked)', () => {
    document.cookie = 'aegis_cp=1; path=/';
    mockPath = '/iam/equipe/u-123';
    mockSearch = '';
    render(<AuthShell initialCpMode={true}><div data-testid="page">user</div></AuthShell>);
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.getByTestId('cp-shell-wrapper')).toBeInTheDocument();
  });

  it('/buscar com cookie → chrome normal (rota não cp-linked) + limpa cookie', () => {
    document.cookie = 'aegis_cp=1; path=/';
    mockPath = '/buscar';
    mockSearch = '';
    render(<AuthShell initialCpMode={true}><div data-testid="page">buscar</div></AuthShell>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav')).toBeInTheDocument();
    expect(screen.queryByTestId('cp-shell-wrapper')).toBeNull();
  });

  it('/workshop SEM cookie e SEM ?cp=1 → chrome normal', () => {
    mockPath = '/workshop';
    mockSearch = '';
    render(<AuthShell initialCpMode={false}><div data-testid="page">workshop</div></AuthShell>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.queryByTestId('cp-shell-wrapper')).toBeNull();
  });
});
