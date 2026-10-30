/**
 * Onda L.4 (2026-05-23) — Enforcement de navegação no Sala viewer.
 *
 * Até L.4 a policy de navegação da Sala (`config.navigation =
 * { navigate_out_allowed, allowed_applications }`, Fase Foundry-I) era
 * NO-OP no viewer `app/sala/[slug]/page.tsx`: toggle decorativo. Esta
 * suíte certifica que o viewer LÊ e APLICA a policy em runtime:
 *
 *  A. Funções puras de decisão (resolveApplicationForHref, decideNavigation)
 *     — derivadas das rotas reais, não de const estática.
 *  B. Viewer filtra atalhos por aplicação permitida + mostra indicador.
 *  C. Interceptor de navegação (NavigationGuard) bloqueia / abre nova aba
 *     conforme a policy.
 */
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

// Mantém as funções PURAS reais de @/lib/api (resolveApplicationForHref,
// decideNavigation) — só stuba os clients de rede + a derivação assíncrona
// (que internamente fala com Pages.list dentro do closure do módulo real).
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    Workspaces: { getBySlug: jest.fn() },
    WorkspacePromotions: { listForOrganization: jest.fn() },
    Projects: { list: jest.fn() },
    Pages: { list: jest.fn() },
    deriveKnownApplications: jest.fn(),
  };
});

// Onda R.4 — o NavigationGuard agora usa useRouter + usePathname (camada 2,
// guard de mudança de rota). Mocks controláveis: `mockPush`/`mockReplace`
// capturam navegação programática; `setMockPathname` simula uma troca de rota.
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockPathname = '/sala/aurora';
const setMockPathname = (p: string) => {
  mockPathname = p;
};
// IMPORTANTE: o objeto do router é ESTÁVEL (singleton), como o Next.js real.
// Um objeto novo a cada render reentraria os effects (deps `router`) e
// causaria loop infinito de re-render no guard de mudança de rota.
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: mockBack,
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(),
};
jest.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'aurora' }),
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SalaViewerPage from '@/app/sala/[slug]/page';
import { type KnownApplication } from '@/lib/api';

const { Workspaces, WorkspacePromotions, Projects, Pages, deriveKnownApplications } =
  jest.requireMock('@/lib/api') as {
    Workspaces: { getBySlug: jest.Mock };
    WorkspacePromotions: { listForOrganization: jest.Mock };
    Projects: { list: jest.Mock };
    Pages: { list: jest.Mock };
    deriveKnownApplications: jest.Mock;
  };

// Catálogo de apps conhecidas usado pelo viewer (deriveKnownApplications
// é mockado para retornar isto — ver beforeEach). Inclui `painel` para
// cobrir os atalhos de /painel-de-controle/*.
const KNOWN: KnownApplication[] = [
  { slug: 'inicio', label: 'Início', route: '/' },
  { slug: 'buscar', label: 'Buscar', route: '/buscar' },
  { slug: 'mapa', label: 'Mapa', route: '/mapa' },
  { slug: 'painel', label: 'Painel de Controle', route: '/painel-de-controle' },
];

function makeSala(navigation?: Record<string, unknown>) {
  return {
    id: 'ws-aurora',
    tenant_id: 't1',
    slug: 'aurora',
    display_name: 'Sala Aurora',
    description: 'Sala de teste',
    project_id: 'p1',
    config: navigation ? { navigation } : {},
    active: true,
    created_at: '2026-05-23T00:00:00Z',
    signed_hash: 'abc',
    version: 3,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Onda R.4 — restaura a rota inicial (a própria Sala) entre testes.
  setMockPathname('/sala/aurora');
  WorkspacePromotions.listForOrganization.mockResolvedValue([]);
  Projects.list.mockResolvedValue([
    { id: 'p1', display_name: 'Operação Aurora' },
  ]);
  Pages.list.mockResolvedValue([]);
  deriveKnownApplications.mockResolvedValue(KNOWN);
  // jsdom não implementa window.open por padrão.
  (window as unknown as { open: jest.Mock }).open = jest.fn();
});

// Onda R.4 — cleanup explícito: o NavigationGuard agenda um setTimeout de 5s
// para dispensar o toast. Sem unmount + limpeza o timer dispara depois do
// teste e polui os workers (leak observado em L.4). `cleanup()` desmonta
// (dispara o cleanup do effect, que faz clearTimeout) e limpamos qualquer
// timer residual por garantia.
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
});

// ───────────────────────────────────────────────────────────────────────────
// B. Viewer aplica a policy: filtra atalhos + indicador
// ───────────────────────────────────────────────────────────────────────────

describe('Sala viewer — leitura + indicador da policy', () => {
  it('sem policy (defaults) NÃO mostra indicador de navegação restrita', async () => {
    Workspaces.getBySlug.mockResolvedValue(makeSala());
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    expect(
      screen.queryByTestId('sala-nav-restricted-badge'),
    ).not.toBeInTheDocument();
    // Atalhos do painel aparecem (sem restrição).
    expect(
      await screen.findByText('Marcações'),
    ).toBeInTheDocument();
  });

  it('whitelist ativa mostra indicador "Navegação restrita"', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    expect(
      await screen.findByTestId('sala-nav-restricted-badge'),
    ).toBeInTheDocument();
  });

  it('whitelist sem `painel` esconde os atalhos do painel de controle', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    // Aguarda apps carregarem.
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Marcações')).not.toBeInTheDocument(),
    );
    // Mensagem de atalhos indisponíveis aparece.
    expect(
      screen.getByTestId('sala-shortcuts-restricted'),
    ).toBeInTheDocument();
  });

  it('saída desabilitada (whitelist vazia) também mostra indicador', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: false, allowed_applications: [] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    expect(
      await screen.findByTestId('sala-nav-restricted-badge'),
    ).toBeInTheDocument();
    // Mas atalhos internos do painel continuam (saída externa ≠ interna).
    expect(await screen.findByText('Marcações')).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// C. Interceptor de navegação em runtime
// ───────────────────────────────────────────────────────────────────────────

describe('Sala viewer — interceptor de navegação (NavigationGuard)', () => {
  it('bloqueia clique em link de app fora da whitelist e mostra aviso', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    // Injeta um link para /buscar (app conhecida, FORA da whitelist).
    const guard = screen.getByTestId('sala-nav-guard');
    const a = document.createElement('a');
    a.setAttribute('href', '/buscar');
    a.textContent = 'ir para busca';
    guard.appendChild(a);

    fireEvent.click(a);

    const blocked = await screen.findByTestId('sala-nav-blocked');
    expect(blocked).toHaveAttribute('data-reason', 'block');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('abre em nova aba quando saída desabilitada e destino é externo', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: false, allowed_applications: [] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    const guard = screen.getByTestId('sala-nav-guard');
    const a = document.createElement('a');
    a.setAttribute('href', '/rota-fora-do-catalogo');
    a.textContent = 'sair';
    guard.appendChild(a);

    fireEvent.click(a);

    const blocked = await screen.findByTestId('sala-nav-blocked');
    expect(blocked).toHaveAttribute('data-reason', 'new_tab');
    expect(window.open).toHaveBeenCalledWith(
      '/rota-fora-do-catalogo',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('NÃO intercepta navegação para app permitida', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    const guard = screen.getByTestId('sala-nav-guard');
    const a = document.createElement('a');
    a.setAttribute('href', '/mapa');
    a.textContent = 'mapa';
    guard.appendChild(a);

    fireEvent.click(a);

    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('respeita ctrl/cmd-click (intenção explícita de nova aba) sem interferir', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    const guard = screen.getByTestId('sala-nav-guard');
    const a = document.createElement('a');
    a.setAttribute('href', '/buscar');
    guard.appendChild(a);

    fireEvent.click(a, { metaKey: true });

    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// D. Onda R.4 — navegação PROGRAMÁTICA (router.push) via guarded router
// ───────────────────────────────────────────────────────────────────────────
//
// A lacuna que R.4 fecha: cliques em <a> eram interceptados (camada 1), mas
// push programático furava a policy. O botão "Editar" do viewer empurra
// `/painel-de-controle/salas?edit=…` via `useGuardedRouter()`. Aqui provamos
// que esse push é submetido à mesma decisão (block/new_tab/allow).

describe('Sala viewer — navegação programática (guarded router)', () => {
  it('push para app permitida (painel) NAVEGA de fato', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      // whitelist inclui `painel` → push pro painel é permitido.
      makeSala({ navigate_out_allowed: true, allowed_applications: ['painel'] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('sala-edit'));

    // O guarded router encaminha o 2º arg (options) — aqui `undefined`.
    expect(mockPush).toHaveBeenCalledWith(
      '/painel-de-controle/salas?edit=ws-aurora',
      undefined,
    );
    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('push para app FORA da whitelist é BLOQUEADO (não navega) + aviso', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      // whitelist só com `mapa` → push pro painel é navegação interna
      // restrita ⇒ block. router.push NÃO deve ser chamado.
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('sala-edit'));

    expect(mockPush).not.toHaveBeenCalled();
    const blocked = await screen.findByTestId('sala-nav-blocked');
    expect(blocked).toHaveAttribute('data-reason', 'block');
    expect(window.open).not.toHaveBeenCalled();
  });

  // O ramo new_tab via push programático é exercitado de forma isolada em
  // `sala-viewer-navigation-guarded-router.test.tsx` (unidade do hook
  // useGuardedRouter, todos os 3 ramos: allow / new_tab / block).
});

// ───────────────────────────────────────────────────────────────────────────
// E. Onda R.4 — rede de segurança: guard de mudança de rota (camada 2)
// ───────────────────────────────────────────────────────────────────────────
//
// Se um push programático escapar do guarded router (código de terceiro), o
// watcher de `usePathname()` detecta a rota-alvo violando a policy e reverte
// para a Sala + avisa. Defesa em profundidade.

describe('Sala viewer — guard de mudança de rota (rede de segurança)', () => {
  it('rota muda para app fora da whitelist ⇒ reverte para a Sala + bloqueia', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    const { rerender } = render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    // Simula uma navegação programática que FUROU o guarded router: o
    // pathname agora aponta pra /buscar (app conhecida fora da whitelist).
    act(() => {
      setMockPathname('/buscar');
    });
    rerender(<SalaViewerPage />);

    // Reverte para a própria Sala.
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/sala/aurora'),
    );
    const blocked = await screen.findByTestId('sala-nav-blocked');
    expect(blocked).toHaveAttribute('data-reason', 'block');
  });

  it('rota muda para destino externo com saída desabilitada ⇒ reverte + aviso new_tab', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: false, allowed_applications: [] }),
    );
    const { rerender } = render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    act(() => {
      setMockPathname('/rota-fora-do-catalogo');
    });
    rerender(<SalaViewerPage />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/sala/aurora'),
    );
    const blocked = await screen.findByTestId('sala-nav-blocked');
    expect(blocked).toHaveAttribute('data-reason', 'new_tab');
  });

  it('rota muda para app PERMITIDA ⇒ NÃO reverte (navegação interna legítima)', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    const { rerender } = render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    act(() => {
      setMockPathname('/mapa');
    });
    rerender(<SalaViewerPage />);

    // Aguarda um ciclo de efeitos; nenhuma reversão deve ocorrer.
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
  });

  it('voltar para a própria Sala ⇒ não dispara reversão', async () => {
    Workspaces.getBySlug.mockResolvedValue(
      makeSala({ navigate_out_allowed: true, allowed_applications: ['mapa'] }),
    );
    const { rerender } = render(<SalaViewerPage />);
    await screen.findByTestId('sala-viewer');
    await waitFor(() => expect(deriveKnownApplications).toHaveBeenCalled());

    // Sai e volta.
    act(() => setMockPathname('/buscar'));
    rerender(<SalaViewerPage />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/sala/aurora'),
    );
    mockReplace.mockClear();

    act(() => setMockPathname('/sala/aurora'));
    rerender(<SalaViewerPage />);
    // De volta na Sala: nenhuma nova reversão.
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
