/**
 * Onda R.4 (2026-05-23) — `useGuardedRouter` (unidade).
 *
 * Fecha a lacuna residual de L.4: navegação PROGRAMÁTICA (`router.push` /
 * `router.replace`) furava a policy de navegação da Sala. Este hook aplica
 * a MESMA decisão dos cliques (`decideNavigation` de @/lib/api, via o
 * contexto do `<NavigationGuard>`) antes de delegar ao router real.
 *
 * Exercita os 3 ramos em isolamento, dentro de um `<NavigationGuard>` real:
 *   - allow   → delega `router.push/replace`.
 *   - new_tab → window.open + aviso; NÃO navega a Sala.
 *   - block   → aviso; NÃO navega.
 * E o fallback sem contexto (degrada para router puro).
 *
 * Reusa as funções PURAS reais de @/lib/api (só stuba a derivação async +
 * clients de rede que o módulo real referencia internamente).
 */
import * as React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
// Router ESTÁVEL (singleton), como o Next.js real — evita reentrada dos
// effects/useMemo (deps `router`) que causaria loop de re-render.
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(),
};
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/sala/aurora',
}));

import { NavigationGuard } from '@/components/sala/navigation-guard';
import { useGuardedRouter } from '@/components/sala/use-guarded-router';
import { type KnownApplication } from '@/lib/api';

const KNOWN: KnownApplication[] = [
  { slug: 'inicio', label: 'Início', route: '/' },
  { slug: 'buscar', label: 'Buscar', route: '/buscar' },
  { slug: 'mapa', label: 'Mapa', route: '/mapa' },
  { slug: 'painel', label: 'Painel de Controle', route: '/painel-de-controle' },
];

/** Botão de teste que dispara `useGuardedRouter().push(href)`. */
function Pusher({ href, method = 'push' }: { href: string; method?: 'push' | 'replace' }) {
  const router = useGuardedRouter();
  return (
    <button type="button" data-testid="pusher" onClick={() => router[method](href)}>
      go
    </button>
  );
}

function renderGuarded(
  policy: { navigate_out_allowed: boolean; allowed_applications: string[] },
  href: string,
  method: 'push' | 'replace' = 'push',
) {
  return render(
    <NavigationGuard policy={policy} knownApps={KNOWN} currentSlug="aurora">
      <Pusher href={href} method={method} />
    </NavigationGuard>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (window as unknown as { open: jest.Mock }).open = jest.fn();
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
});

describe('useGuardedRouter — enforcement de push/replace', () => {
  it('allow (app permitida) ⇒ delega router.push', () => {
    renderGuarded(
      { navigate_out_allowed: true, allowed_applications: ['mapa'] },
      '/mapa',
    );
    fireEvent.click(screen.getByTestId('pusher'));
    expect(mockPush).toHaveBeenCalledWith('/mapa', undefined);
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
  });

  it('block (app conhecida fora da whitelist) ⇒ NÃO navega + aviso block', () => {
    renderGuarded(
      { navigate_out_allowed: true, allowed_applications: ['mapa'] },
      '/buscar',
    );
    fireEvent.click(screen.getByTestId('pusher'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('sala-nav-blocked')).toHaveAttribute(
      'data-reason',
      'block',
    );
  });

  it('new_tab (externo + saída desabilitada) ⇒ window.open + NÃO navega', () => {
    renderGuarded(
      { navigate_out_allowed: false, allowed_applications: [] },
      '/rota-fora-do-catalogo',
    );
    fireEvent.click(screen.getByTestId('pusher'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith(
      '/rota-fora-do-catalogo',
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.getByTestId('sala-nav-blocked')).toHaveAttribute(
      'data-reason',
      'new_tab',
    );
  });

  it('push para a própria Sala é sempre permitido (allow)', () => {
    renderGuarded(
      { navigate_out_allowed: false, allowed_applications: ['mapa'] },
      '/sala/aurora',
    );
    fireEvent.click(screen.getByTestId('pusher'));
    expect(mockPush).toHaveBeenCalledWith('/sala/aurora', undefined);
    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
  });

  it('replace respeita a policy igual ao push (block)', () => {
    renderGuarded(
      { navigate_out_allowed: true, allowed_applications: ['mapa'] },
      '/buscar',
      'replace',
    );
    fireEvent.click(screen.getByTestId('pusher'));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('sala-nav-blocked')).toHaveAttribute(
      'data-reason',
      'block',
    );
  });

  it('replace permitido delega router.replace', () => {
    renderGuarded(
      { navigate_out_allowed: true, allowed_applications: ['mapa'] },
      '/mapa',
      'replace',
    );
    fireEvent.click(screen.getByTestId('pusher'));
    expect(mockReplace).toHaveBeenCalledWith('/mapa', undefined);
  });

  it('whitelist vazia + saída liberada ⇒ tudo passa (allow)', () => {
    renderGuarded(
      { navigate_out_allowed: true, allowed_applications: [] },
      '/qualquer-rota',
    );
    fireEvent.click(screen.getByTestId('pusher'));
    expect(mockPush).toHaveBeenCalledWith('/qualquer-rota', undefined);
    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
  });
});

describe('useGuardedRouter — fora do NavigationGuard (fallback)', () => {
  it('sem contexto degrada para router puro (push direto)', () => {
    render(<Pusher href="/buscar" />);
    fireEvent.click(screen.getByTestId('pusher'));
    // Sem guard: nenhuma policy aplicada, push segue direto.
    expect(mockPush).toHaveBeenCalledWith('/buscar', undefined);
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sala-nav-blocked')).not.toBeInTheDocument();
  });
});
