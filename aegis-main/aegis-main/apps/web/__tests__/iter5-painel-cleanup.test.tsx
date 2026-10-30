/**
 * Sprint H1.5 (2026-05-22) — cleanup + coerência.
 *
 * Operador pediu:
 *   1) DELETE FAVORITAS — feature não útil, remover do shell + page header.
 *   2) Items nomeiam o CONTEÚDO, não a categoria (ex-"Preferências/...").
 *   3) Fix contraste branco-no-branco: ControlPanelShell root tem
 *      text-text-on-light explícito (sem herdar text-text-on-dark do body).
 *   4) Fix input search "black" no CpCommandPalette (mesmo bug).
 *
 * Onda M1.c (2026-05-23) reorganizou o sidenav em seções claras, e
 * Browser/Notificações passaram a viver na seção "Sistema".
 *
 * #19 (2026-05-24): a página /painel-de-controle/conta tinha ficado órfã
 * (sem entrada no menu); a entrada "Conta" voltou ao sidenav (em Sistema).
 * As asserções abaixo refletem a IA atual.
 */
import { render, screen } from '@testing-library/react';
import type { WhoAmI } from '@/lib/auth/api';
import { ControlPanelShell } from '@/components/control-panel/control-panel-shell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/painel-de-controle',
  // #8b: o shell lê useSearchParams() para o active-state ciente de query.
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

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: ADMIN_PRINCIPAL,
    loading: false,
    error: null,
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, ...rest }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} {...rest} />
  ),
}));

describe('Sprint H1.5 · FAVORITAS removido do ControlPanelShell', () => {
  it('sidebar NÃO contém o header "FAVORITAS"', () => {
    render(<ControlPanelShell><div /></ControlPanelShell>);
    expect(screen.queryByText('FAVORITAS')).toBeNull();
  });

  it('CpPageHeader NÃO importa nem renderiza Star', () => {
    // CpPageHeader é exportado de control-panel-shell.tsx — verifica que
    // ele não tem prop settingKey nem botão star.
    const mod = jest.requireActual('@/components/control-panel/control-panel-shell');
    expect(mod.CpPageHeader).toBeDefined();
    // smoke: renderizar sem settingKey + sem actions → não crash
    const { container } = render(<mod.CpPageHeader title="X" />);
    // Não deve haver botão com label "favorito" / aria-label de star
    expect(container.querySelector('[aria-label*="favorito" i]')).toBeNull();
  });
});

describe('Sprint H1.5 / M1.c · Browser e Notificações na seção Sistema', () => {
  it('#19 — item "Conta" tem entrada no sidenav, linkando /conta', () => {
    // O ex-item flat "Conta" saiu na M1.c, mas a página /conta ficou órfã
    // (operador não chegava nela). #19 re-adiciona a entrada (em Sistema).
    render(<ControlPanelShell><div /></ControlPanelShell>);
    const conta = screen.getByTestId('cp-nav-conta');
    expect(conta).toBeInTheDocument();
    expect(conta).toHaveAttribute('href', '/painel-de-controle/conta');
    expect(conta).toHaveTextContent('Conta');
  });

  it('item "Browser" aparece com href /painel-de-controle/browser', () => {
    render(<ControlPanelShell><div /></ControlPanelShell>);
    const browser = screen.getByTestId('cp-nav-browser');
    expect(browser).toBeInTheDocument();
    expect(browser).toHaveAttribute('href', '/painel-de-controle/browser');
    expect(browser).toHaveTextContent('Browser');
  });

  it('hub "Comunicação" aparece em /comunicacoes (Notificações virou aba — Fase 4)', () => {
    // Fase 4 IA: "Notificações" deixou de ser item de sidenav e virou aba do
    // hub "Comunicação" [Comunicações | Notificações] (CpHubSubnav). A rota
    // /notificacoes segue viva (deep-link), só não é mais item direto.
    render(<ControlPanelShell><div /></ControlPanelShell>);
    const com = screen.getByTestId('cp-nav-comunicacao');
    expect(com).toBeInTheDocument();
    expect(com).toHaveAttribute('href', '/painel-de-controle/comunicacoes');
    expect(com).toHaveTextContent('Comunicação');
    // O item direto "notificacoes" não existe mais no sidenav.
    expect(screen.queryByTestId('cp-nav-notificacoes')).toBeNull();
  });

  it('items antigos "preferencias" não existem mais no sidebar', () => {
    render(<ControlPanelShell><div /></ControlPanelShell>);
    expect(screen.queryByTestId('cp-nav-preferencias')).toBeNull();
    expect(screen.queryByTestId('cp-nav-preferencias-browser')).toBeNull();
    expect(screen.queryByTestId('cp-nav-preferencias-notificacoes')).toBeNull();
  });
});

describe('Sprint H1.5 · contraste branco-no-branco fixado', () => {
  it('root do ControlPanelShell tem text-text-on-light explícito', () => {
    const { container } = render(<ControlPanelShell><div /></ControlPanelShell>);
    const root = container.firstChild as HTMLElement;
    // Bug: sem essa classe, herdava text-text-on-dark do body global
    expect(root.className).toContain('text-text-on-light');
  });
});
