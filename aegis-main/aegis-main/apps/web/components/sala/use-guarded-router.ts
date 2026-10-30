'use client';

/**
 * Onda R.4 — `useGuardedRouter()`.
 *
 * Wrapper de `useRouter` (next/navigation) que aplica a policy de navegação
 * da Sala ANTES de empurrar/substituir a rota. Fecha a lacuna deixada por
 * L.4: o `NavigationGuard` interceptava cliques em `<a>`, mas navegação
 * PROGRAMÁTICA (`router.push` / `router.replace`) furava a policy.
 *
 * Reusa a decisão pura do guard (`decide()` → `decideNavigation` de
 * `@/lib/api`, sem duplicar lógica) e o MESMO toast inline (`notify()`),
 * de modo que push/click se comportem de forma idêntica:
 *
 *   - allow   → delega para o router real (push/replace).
 *   - new_tab → NÃO navega a Sala; abre o destino em nova aba + aviso
 *               (preserva a sessão quando `navigate_out_allowed=false`).
 *   - block   → NÃO navega; aviso inline (destino fora da whitelist).
 *
 * Fora de um `<NavigationGuard>` (sem contexto) degrada para o router puro
 * — assim o hook é seguro de usar em qualquer componente do viewer.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSalaNavGuard } from './navigation-guard';

type AppRouter = ReturnType<typeof useRouter>;
type NavOptions = Parameters<AppRouter['push']>[1];

export interface GuardedRouter extends AppRouter {
  /** push que respeita a policy de navegação da Sala. */
  push: (href: string, options?: NavOptions) => void;
  /** replace que respeita a policy de navegação da Sala. */
  replace: (href: string, options?: NavOptions) => void;
}

export function useGuardedRouter(): GuardedRouter {
  const router = useRouter();
  const guard = useSalaNavGuard();

  return React.useMemo<GuardedRouter>(() => {
    // Aplica a decisão da policy antes de delegar ao router real.
    // Retorna `true` quando a navegação foi consumida (block/new_tab) e
    // NÃO deve seguir para o router.
    const enforce = (href: string): boolean => {
      if (!guard) return false; // sem guard → comportamento padrão (segue)
      const decision = guard.decide(href);
      if (decision === 'allow') return false;
      if (decision === 'new_tab') {
        if (typeof window !== 'undefined') {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
        guard.notify({ href, reason: 'new_tab' });
        return true;
      }
      // block
      guard.notify({ href, reason: 'block' });
      return true;
    };

    return {
      ...router,
      push: (href: string, options?: NavOptions) => {
        if (enforce(href)) return;
        router.push(href, options);
      },
      replace: (href: string, options?: NavOptions) => {
        if (enforce(href)) return;
        router.replace(href, options);
      },
    };
  }, [router, guard]);
}
