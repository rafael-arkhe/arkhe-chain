/**
 * /painel-de-controle/dev (M3 · vendor-only).
 *
 *  1. RequirePerm nega sem a perm vendor.dev_mode.
 *  2. Com a perm, renderiza os 2 cards (domínios + navegação).
 *  3. Domínios: carrega catálogo (GET /domains) + seleção atual.
 *  4. Toggle + salvar chama VendorApi.setTenantDomains com os slugs.
 *  5. Nav: carrega overrides + salvar chama setNavOverrides.
 *  6. Domínios vêm de lista fechada (checkbox), nunca input de texto livre.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DevPage from '@/app/painel-de-controle/dev/page';

jest.mock('@/lib/api', () => ({
  VendorApi: {
    listDomains: jest.fn(),
    getTenantDomains: jest.fn(),
    setTenantDomains: jest.fn(),
    getNavOverrides: jest.fn(),
    setNavOverrides: jest.fn(),
  },
}));

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
}));

jest.mock('@/lib/auth/useAuth', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  return {
    __refresh: refresh,
    __setCanSee: (v: boolean) => {
      (globalThis as Record<string, unknown>).__devCanSee = v;
    },
    __setDevActive: (v: boolean) => {
      (globalThis as Record<string, unknown>).__devActive = v;
    },
    useAuth: () => ({
      // dev-mode ativo por default; um teste desliga p/ provar o painel inerte.
      principal: {
        roles: ['vendor'],
        permissions: ['vendor.dev_mode'],
        dev_mode:
          (globalThis as Record<string, unknown>).__devActive === false
            ? null
            : { enabled: true, until: '2099-01-01T00:00:00Z' },
      },
      loading: false,
      refresh,
    }),
    useCan: () => (globalThis as Record<string, unknown>).__devCanSee !== false,
  };
});

const authMock = jest.requireMock('@/lib/auth/useAuth') as {
  __refresh: jest.Mock;
  __setCanSee: (v: boolean) => void;
  __setDevActive: (v: boolean) => void;
};
const refresh = authMock.__refresh;
function setCanSee(v: boolean) {
  authMock.__setCanSee(v);
}
function setDevActive(v: boolean) {
  authMock.__setDevActive(v);
}

const { VendorApi } = jest.requireMock('@/lib/api') as {
  VendorApi: {
    listDomains: jest.Mock;
    getTenantDomains: jest.Mock;
    setTenantDomains: jest.Mock;
    getNavOverrides: jest.Mock;
    setNavOverrides: jest.Mock;
  };
};
const listDomains = VendorApi.listDomains;
const getTenantDomains = VendorApi.getTenantDomains;
const setTenantDomains = VendorApi.setTenantDomains;
const getNavOverrides = VendorApi.getNavOverrides;
const setNavOverrides = VendorApi.setNavOverrides;

beforeEach(() => {
  setCanSee(true);
  setDevActive(true);
  refresh.mockClear();
  listDomains.mockReset().mockResolvedValue([
    { slug: 'seguranca-publica', label: 'Segurança Pública' },
    { slug: 'inteligencia', label: 'Inteligência' },
    { slug: 'defesa', label: 'Defesa' },
  ]);
  getTenantDomains.mockReset().mockResolvedValue({
    tenant_id: 't-1',
    allowed_domains: ['seguranca-publica'],
    catalog: ['seguranca-publica', 'inteligencia', 'defesa'],
  });
  setTenantDomains.mockReset().mockResolvedValue({
    tenant_id: 't-1',
    allowed_domains: ['seguranca-publica', 'inteligencia'],
    catalog: [],
  });
  getNavOverrides.mockReset().mockResolvedValue({ hidden: ['browser'] });
  setNavOverrides.mockReset().mockResolvedValue({ hidden: ['browser'] });
});

describe('/painel-de-controle/dev', () => {
  it('sem dev-mode ativo: painel inerte, sem cards nem fetch /vendor', () => {
    // Gap-fix M2/M3: admin passa o RequirePerm cosmético mas SEM dev-mode ativo
    // não deve disparar /vendor/* (que 403am) — mostra painel inerte → Conta.
    setDevActive(false);
    render(<DevPage />);
    expect(screen.getByTestId('dev-inactive')).toBeInTheDocument();
    expect(screen.getByTestId('dev-goto-conta')).toBeInTheDocument();
    expect(screen.queryByTestId('dev-domains')).toBeNull();
    expect(screen.queryByTestId('dev-nav')).toBeNull();
    // Não chamou os endpoints vendor (que 403avam e poluíam o console).
    expect(getTenantDomains).not.toHaveBeenCalled();
    expect(getNavOverrides).not.toHaveBeenCalled();
  });

  it('RequirePerm nega quando falta a perm vendor.dev_mode', () => {
    setCanSee(false);
    render(<DevPage />);
    expect(screen.queryByTestId('dev-domains')).toBeNull();
    expect(screen.queryByTestId('dev-nav')).toBeNull();
  });

  it('renderiza os dois cards (domínios + navegação) com a perm', async () => {
    render(<DevPage />);
    await waitFor(() => expect(listDomains).toHaveBeenCalled());
    expect(screen.getByTestId('dev-domains')).toBeInTheDocument();
    expect(screen.getByTestId('dev-nav')).toBeInTheDocument();
  });

  it('carrega catálogo + seleção atual de domínios', async () => {
    render(<DevPage />);
    await waitFor(() =>
      expect(screen.getByTestId('dev-domain-seguranca-publica')).toBeInTheDocument(),
    );
    // checkbox da seleção atual está marcado.
    expect(
      screen.getByTestId('dev-domain-seguranca-publica').getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByTestId('dev-domain-inteligencia').getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('toggle + salvar envia os slugs selecionados (lista fechada)', async () => {
    render(<DevPage />);
    await waitFor(() =>
      expect(screen.getByTestId('dev-domain-inteligencia')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('dev-domain-inteligencia'));
    fireEvent.click(screen.getByTestId('dev-domains-save'));
    await waitFor(() =>
      expect(setTenantDomains).toHaveBeenCalledWith([
        'seguranca-publica',
        'inteligencia',
      ]),
    );
  });

  it('domínios são checkboxes — não há input de texto livre', async () => {
    const { container } = render(<DevPage />);
    await waitFor(() => expect(listDomains).toHaveBeenCalled());
    const domainsCard = screen.getByTestId('dev-domains');
    // nenhum <input type=text> no card de domínios.
    expect(domainsCard.querySelectorAll('input[type="text"]').length).toBe(0);
    expect(domainsCard.querySelectorAll('[role="checkbox"]').length).toBeGreaterThan(0);
    void container;
  });

  it('nav: carrega overrides e salvar chama setNavOverrides', async () => {
    render(<DevPage />);
    await waitFor(() => expect(getNavOverrides).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('dev-nav-save'));
    await waitFor(() => expect(setNavOverrides).toHaveBeenCalled());
  });

  it('nav não oferece o próprio item "dev" para esconder (anti-lockout)', async () => {
    render(<DevPage />);
    await waitFor(() => expect(getNavOverrides).toHaveBeenCalled());
    expect(screen.queryByTestId('dev-nav-dev')).toBeNull();
  });

  // LOTE2 (#1) — as 3 Páginas modulares do shell do OPERADOR (Conversas/
  // Agentes/Soluções) também são alternáveis pelo vendor. Os ids batem com
  // use-nav-tree (`app-route-${slug}`) → ocultar aqui some do sidenav do operador.
  it('nav lista as 3 Páginas modulares (Conversas/Agentes/Soluções)', async () => {
    render(<DevPage />);
    await waitFor(() => expect(getNavOverrides).toHaveBeenCalled());
    expect(screen.getByTestId('dev-nav-app-route-aip-threads')).toBeInTheDocument();
    expect(screen.getByTestId('dev-nav-app-route-agentes')).toBeInTheDocument();
    expect(screen.getByTestId('dev-nav-app-route-solutions')).toBeInTheDocument();
  });

  it('alternar uma modular + salvar persiste seu id em cp_nav_hidden', async () => {
    render(<DevPage />);
    await waitFor(() => expect(getNavOverrides).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('dev-nav-app-route-solutions'));
    fireEvent.click(screen.getByTestId('dev-nav-save'));
    await waitFor(() =>
      expect(setNavOverrides).toHaveBeenCalledWith(
        expect.arrayContaining(['app-route-solutions']),
      ),
    );
  });
});
