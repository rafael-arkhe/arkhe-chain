/**
 * CpHubSubnav — barra de abas genérica dos hubs do Painel de Controle (Fase 4).
 * Generaliza o OntologiaTabs: Link + highlight por usePathname + filtro perm/devOnly.
 */
import { render, screen } from '@testing-library/react';
import { CpHubSubnav, type CpHubTab } from '@/components/control-panel/cp-hub-subnav';

let mockPath = '/painel-de-controle/marcacoes';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));

let mockPrincipal: {
  roles: string[];
  permissions: string[];
  dev_mode?: { enabled: boolean };
} | null = { roles: [], permissions: ['markings.read', 'security.browser.manage'], dev_mode: { enabled: false } };
jest.mock('@/lib/auth/useAuth', () => ({ useAuth: () => ({ principal: mockPrincipal }) }));

const TABS: CpHubTab[] = [
  { label: 'Vocabulário', href: '/painel-de-controle/marcacoes', match: '/painel-de-controle/marcacoes', perm: 'markings.read' },
  { label: 'Por propriedade', href: '/painel-de-controle/marcacoes-propriedade', match: '/painel-de-controle/marcacoes-propriedade', perm: 'markings.read' },
];

describe('CpHubSubnav (Fase 4 IA — hub genérico)', () => {
  beforeEach(() => {
    mockPrincipal = { roles: [], permissions: ['markings.read', 'security.browser.manage'], dev_mode: { enabled: false } };
  });

  it('renderiza as abas visíveis com o rótulo do grupo', () => {
    mockPath = '/painel-de-controle/marcacoes';
    render(<CpHubSubnav group="Marcações" tabs={TABS} />);
    expect(screen.getByTestId('cp-hub-subnav-marcações')).toBeInTheDocument();
    expect(screen.getByTestId('cp-hub-tab-marcacoes')).toHaveAttribute('href', '/painel-de-controle/marcacoes');
    expect(screen.getByTestId('cp-hub-tab-marcacoes-propriedade')).toHaveAttribute('href', '/painel-de-controle/marcacoes-propriedade');
  });

  it('match exato-ou-mais-profundo: /marcacoes não acende a aba de /marcacoes-propriedade', () => {
    mockPath = '/painel-de-controle/marcacoes';
    render(<CpHubSubnav group="Marcações" tabs={TABS} />);
    expect(screen.getByTestId('cp-hub-tab-marcacoes')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('cp-hub-tab-marcacoes-propriedade')).not.toHaveAttribute('aria-current');
  });

  it('na rota de Por propriedade, só ela acende', () => {
    mockPath = '/painel-de-controle/marcacoes-propriedade';
    render(<CpHubSubnav group="Marcações" tabs={TABS} />);
    expect(screen.getByTestId('cp-hub-tab-marcacoes-propriedade')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('cp-hub-tab-marcacoes')).not.toHaveAttribute('aria-current');
  });

  it('esconde abas sem permissão (espelha o canSee do shell)', () => {
    mockPath = '/painel-de-controle/atividade';
    const heteroTabs: CpHubTab[] = [
      { label: 'Atividade', href: '/painel-de-controle/atividade', match: '/painel-de-controle/atividade' },
      { label: 'Browser', href: '/painel-de-controle/browser', match: '/painel-de-controle/browser', perm: 'security.browser.manage' },
      { label: 'Plataforma', href: '/painel-de-controle/dev', match: '/painel-de-controle/dev', perm: 'vendor.dev_mode', devOnly: true },
    ];
    render(<CpHubSubnav group="Sistema" tabs={heteroTabs} />);
    expect(screen.getByTestId('cp-hub-tab-atividade')).toBeInTheDocument();
    expect(screen.getByTestId('cp-hub-tab-browser')).toBeInTheDocument();
    // sem dev-mode → aba Plataforma some
    expect(screen.queryByTestId('cp-hub-tab-dev')).toBeNull();
  });

  it('admin enxerga todas as abas perm-gated (short-circuit)', () => {
    mockPrincipal = { roles: ['admin'], permissions: [], dev_mode: { enabled: true } };
    mockPath = '/painel-de-controle/atividade';
    const heteroTabs: CpHubTab[] = [
      { label: 'Atividade', href: '/painel-de-controle/atividade', match: '/painel-de-controle/atividade' },
      { label: 'Browser', href: '/painel-de-controle/browser', match: '/painel-de-controle/browser', perm: 'security.browser.manage' },
      { label: 'Plataforma', href: '/painel-de-controle/dev', match: '/painel-de-controle/dev', perm: 'vendor.dev_mode', devOnly: true },
    ];
    render(<CpHubSubnav group="Sistema" tabs={heteroTabs} />);
    expect(screen.getByTestId('cp-hub-tab-dev')).toBeInTheDocument();
  });

  it('some quando só sobra 1 aba (perms filtraram o resto) — sem ruído', () => {
    mockPrincipal = { roles: [], permissions: [], dev_mode: { enabled: false } };
    mockPath = '/painel-de-controle/atividade';
    const tabs: CpHubTab[] = [
      { label: 'Atividade', href: '/painel-de-controle/atividade', match: '/painel-de-controle/atividade' },
      { label: 'Browser', href: '/painel-de-controle/browser', match: '/painel-de-controle/browser', perm: 'security.browser.manage' },
    ];
    const { container } = render(<CpHubSubnav group="Sistema" tabs={tabs} />);
    expect(container.querySelector('[data-testid="cp-hub-subnav-sistema"]')).toBeNull();
  });
});
