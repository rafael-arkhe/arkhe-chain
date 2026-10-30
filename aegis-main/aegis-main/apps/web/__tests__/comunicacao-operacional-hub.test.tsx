/**
 * Hub "Comunicação operacional" (Backlog #6b).
 *
 * Comunicados (banners globais) + Rotas de alerta (roteamento de notificações)
 * eram dois itens-irmãos soltos no cluster Operacional; viram UM hub: um layout
 * compartilhado (route group `(comunicacao-operacional)`) que monta o CpHubSubnav
 * com as abas [Comunicados | Rotas de alerta], cada uma respeitando sua perm.
 *
 * Cobertura:
 *  - topologia das abas (rotas/perms preservadas);
 *  - layout monta a barra + renderiza os filhos;
 *  - perm-gating: cada aba some sem sua perm; admin curto-circuita;
 *  - navegação/active-state: a aba da rota vigente acende, a outra não.
 */
import { render, screen } from '@testing-library/react';
import { COMUNICACAO_OPERACIONAL_TABS } from '@/components/control-panel/hub-tabs';
import ComunicacaoOperacionalLayout from '@/app/painel-de-controle/(comunicacao-operacional)/layout';

let mockPath = '/painel-de-controle/comunicados';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));

let mockPrincipal: {
  roles: string[];
  permissions: string[];
  dev_mode?: { enabled: boolean };
} | null = null;
jest.mock('@/lib/auth/useAuth', () => ({ useAuth: () => ({ principal: mockPrincipal }) }));

const BOTH = ['app_shell.manage', 'alerts.routes.view'];

beforeEach(() => {
  mockPath = '/painel-de-controle/comunicados';
  mockPrincipal = { roles: [], permissions: [...BOTH], dev_mode: { enabled: false } };
});

describe('COMUNICACAO_OPERACIONAL_TABS · topologia (rotas/perms preservadas)', () => {
  it('tem exatamente as 2 abas, com rotas e perms divergentes', () => {
    expect(COMUNICACAO_OPERACIONAL_TABS).toHaveLength(2);
    expect(COMUNICACAO_OPERACIONAL_TABS).toEqual([
      expect.objectContaining({
        href: '/painel-de-controle/comunicados',
        match: '/painel-de-controle/comunicados',
        perm: 'app_shell.manage',
      }),
      expect.objectContaining({
        href: '/painel-de-controle/alertas',
        match: '/painel-de-controle/alertas',
        perm: 'alerts.routes.view',
      }),
    ]);
  });
});

describe('ComunicacaoOperacionalLayout · monta a barra + filhos', () => {
  it('renderiza o CpHubSubnav com as 2 abas (perms completas) e os filhos', () => {
    render(
      <ComunicacaoOperacionalLayout>
        <div data-testid="filho-da-page">conteúdo</div>
      </ComunicacaoOperacionalLayout>,
    );
    // barra do hub presente (group "Comunicação operacional").
    expect(
      screen.getByTestId('cp-hub-subnav-comunicação operacional'),
    ).toBeInTheDocument();
    // as 2 abas com seus destinos (rotas preservadas).
    expect(screen.getByTestId('cp-hub-tab-comunicados')).toHaveAttribute(
      'href',
      '/painel-de-controle/comunicados',
    );
    expect(screen.getByTestId('cp-hub-tab-alertas')).toHaveAttribute(
      'href',
      '/painel-de-controle/alertas',
    );
    // rótulos por intenção (pt-BR).
    expect(screen.getByTestId('cp-hub-tab-comunicados')).toHaveTextContent('Comunicados');
    expect(screen.getByTestId('cp-hub-tab-alertas')).toHaveTextContent('Rotas de alerta');
    // os filhos (page-alvo) continuam renderizando sob a barra.
    expect(screen.getByTestId('filho-da-page')).toBeInTheDocument();
  });
});

describe('ComunicacaoOperacionalLayout · perm-gating (cada aba respeita sua perm)', () => {
  it('admin (short-circuit) enxerga as 2 abas mesmo sem perms explícitas', () => {
    mockPrincipal = { roles: ['admin'], permissions: [], dev_mode: { enabled: false } };
    render(<ComunicacaoOperacionalLayout><div /></ComunicacaoOperacionalLayout>);
    expect(screen.getByTestId('cp-hub-tab-comunicados')).toBeInTheDocument();
    expect(screen.getByTestId('cp-hub-tab-alertas')).toBeInTheDocument();
  });

  it('só com app_shell.manage: aba "Rotas de alerta" some (barra colapsa em ≤1)', () => {
    mockPrincipal = { roles: [], permissions: ['app_shell.manage'], dev_mode: { enabled: false } };
    render(
      <ComunicacaoOperacionalLayout>
        <div data-testid="filho" />
      </ComunicacaoOperacionalLayout>,
    );
    // aba sem perm não aparece.
    expect(screen.queryByTestId('cp-hub-tab-alertas')).toBeNull();
    // com 1 aba visível a barra some (sem ruído) — mas a page continua.
    expect(screen.queryByTestId('cp-hub-subnav-comunicação operacional')).toBeNull();
    expect(screen.getByTestId('filho')).toBeInTheDocument();
  });

  it('só com alerts.routes.view: aba "Comunicados" some (barra colapsa em ≤1)', () => {
    mockPrincipal = { roles: [], permissions: ['alerts.routes.view'], dev_mode: { enabled: false } };
    render(<ComunicacaoOperacionalLayout><div /></ComunicacaoOperacionalLayout>);
    expect(screen.queryByTestId('cp-hub-tab-comunicados')).toBeNull();
    expect(screen.queryByTestId('cp-hub-subnav-comunicação operacional')).toBeNull();
  });

  it('sem nenhuma das perms: nenhuma aba (barra some)', () => {
    mockPrincipal = { roles: [], permissions: [], dev_mode: { enabled: false } };
    render(<ComunicacaoOperacionalLayout><div /></ComunicacaoOperacionalLayout>);
    expect(screen.queryByTestId('cp-hub-tab-comunicados')).toBeNull();
    expect(screen.queryByTestId('cp-hub-tab-alertas')).toBeNull();
    expect(screen.queryByTestId('cp-hub-subnav-comunicação operacional')).toBeNull();
  });
});

describe('ComunicacaoOperacionalLayout · navegação/active-state entre as abas', () => {
  it('em /comunicados só a aba Comunicados acende', () => {
    mockPath = '/painel-de-controle/comunicados';
    render(<ComunicacaoOperacionalLayout><div /></ComunicacaoOperacionalLayout>);
    expect(screen.getByTestId('cp-hub-tab-comunicados')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('cp-hub-tab-alertas')).not.toHaveAttribute('aria-current');
  });

  it('em /alertas só a aba Rotas de alerta acende', () => {
    mockPath = '/painel-de-controle/alertas';
    render(<ComunicacaoOperacionalLayout><div /></ComunicacaoOperacionalLayout>);
    expect(screen.getByTestId('cp-hub-tab-alertas')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('cp-hub-tab-comunicados')).not.toHaveAttribute('aria-current');
  });
});
