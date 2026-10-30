/**
 * ControlPanelShell · M3 (dev-mode + filtro de domínio).
 *
 * Cobre os 3 eixos cosméticos adicionados ao `canSee`:
 *   - item `dev` (devOnly): só aparece com `principal.dev_mode.enabled`;
 *   - filtro de domínio: itens com `domain` somem quando o tenant tem
 *     `allowed_domains` não-vazio e o domínio não está na lista;
 *   - override de nav: itens em `tenant.cp_nav_hidden` somem (exceto `dev`).
 *
 * A IA de 9 seções da M1.c continua intacta (os testes existentes em
 * control-panel-shell-layout.test.tsx asseveram isso).
 */
import { render, screen } from '@testing-library/react';
import type { WhoAmI } from '@/lib/auth/api';
import { ControlPanelShell } from '@/components/control-panel/control-panel-shell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/painel-de-controle',
  // #8b: o shell agora lê useSearchParams() para o active-state ciente de
  // query; sem este mock a chamada estoura neste suite.
  useSearchParams: () => new URLSearchParams(''),
}));

jest.mock('@/lib/api', () => ({
  MeContextApi: {
    get: jest.fn().mockResolvedValue({
      organization_name: 'AEGIS',
      space_name: null,
      project_name: null,
    }),
  },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, ...rest }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} {...rest} />
  ),
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
}));

function principal(overrides: Partial<WhoAmI> = {}): WhoAmI {
  return {
    user_id: 'u-1',
    username: 'someone',
    display_name: 'Someone',
    email: null,
    tenant: { id: 't-1', slug: 'ssp', display_name: 'SSP', features: [] },
    clearances: [],
    roles: ['admin'],
    permissions: [],
    must_change_password: false,
    totp_enabled: false,
    ...overrides,
  };
}

describe('ControlPanelShell · item Dev (devOnly)', () => {
  it('NÃO mostra o item Dev quando dev-mode está inativo', () => {
    mockPrincipal = principal({ dev_mode: null });
    render(
      <ControlPanelShell>
        <div />
      </ControlPanelShell>,
    );
    expect(screen.queryByTestId('cp-nav-dev')).toBeNull();
  });

  it('mostra o item "Plataforma" quando dev-mode ativo + perm vendor.dev_mode', () => {
    mockPrincipal = principal({
      roles: ['vendor'],
      permissions: ['vendor.dev_mode'],
      dev_mode: { enabled: true, until: '2999-01-01T00:00:00+00:00' },
    });
    render(
      <ControlPanelShell>
        <div />
      </ControlPanelShell>,
    );
    const dev = screen.getByTestId('cp-nav-dev');
    expect(dev).toBeInTheDocument();
    // #5-sidenav: o rótulo "Dev" virou "Plataforma" (sério, casa com a Conta).
    expect(dev).toHaveTextContent('Plataforma');
    expect(dev).not.toHaveTextContent('Dev');
    expect(dev.getAttribute('href')).toBe('/painel-de-controle/dev');
  });

  it('#5-sidenav: o item "Plataforma" exibe ponto verde de status (bg-success) com dev-mode ativo', () => {
    mockPrincipal = principal({
      roles: ['vendor'],
      permissions: ['vendor.dev_mode'],
      dev_mode: { enabled: true, until: '2999-01-01T00:00:00+00:00' },
    });
    render(
      <ControlPanelShell>
        <div />
      </ControlPanelShell>,
    );
    const badge = screen.getByTestId('cp-nav-dev-status');
    expect(badge).toBeInTheDocument();
    // Espelho do dot "conectado" do rodapé: quadrado 1.5 verde (bg-success).
    expect(badge.className).toContain('bg-success');
    // Sharp (sem rounded-*).
    expect(badge.className).not.toMatch(/rounded/);
  });

  it('admin com dev-mode ativo também vê Dev (short-circuit cobre a perm)', () => {
    mockPrincipal = principal({
      roles: ['admin'],
      permissions: [],
      dev_mode: { enabled: true, until: '2999-01-01T00:00:00+00:00' },
    });
    render(
      <ControlPanelShell>
        <div />
      </ControlPanelShell>,
    );
    // O gate de UI usa o short-circuit de admin para a perm; a barreira REAL
    // (endpoint vendor) continua server-side e nega admin.
    expect(screen.getByTestId('cp-nav-dev')).toBeInTheDocument();
  });
});

describe('ControlPanelShell · override de navegação (cp_nav_hidden)', () => {
  it('esconde um item listado em cp_nav_hidden', () => {
    mockPrincipal = principal({
      tenant: {
        id: 't-1',
        slug: 'ssp',
        display_name: 'SSP',
        features: [],
        cp_nav_hidden: ['organizacoes'],
      },
    });
    render(
      <ControlPanelShell>
        <div />
      </ControlPanelShell>,
    );
    expect(screen.queryByTestId('cp-nav-organizacoes')).toBeNull();
    // Outros itens da mesma seção continuam.
    expect(screen.getByTestId('cp-nav-espacos')).toBeInTheDocument();
  });

  it('não esconde itens fora da lista', () => {
    mockPrincipal = principal({
      tenant: {
        id: 't-1',
        slug: 'ssp',
        display_name: 'SSP',
        features: [],
        cp_nav_hidden: [],
      },
    });
    render(
      <ControlPanelShell>
        <div />
      </ControlPanelShell>,
    );
    expect(screen.getByTestId('cp-nav-organizacoes')).toBeInTheDocument();
  });
});
