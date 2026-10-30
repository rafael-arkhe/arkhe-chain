'use client';

/**
 * Onda L.4 — NavigationGuard (enforcement runtime da policy de navegação
 * da Sala).
 *
 * A policy vive em `Workspace.config.navigation = { navigate_out_allowed,
 * allowed_applications }` (Fase Foundry-I, backend já pronto + auditado).
 * Até L.4 a config era NO-OP no viewer; este componente a aplica:
 *
 *  - Intercepta cliques em qualquer `<a>`/`<Link>` dentro da subtree.
 *  - Resolve o destino → aplicação conhecida (rotas reais via Pages.list).
 *  - `decideNavigation` decide: `allow` | `new_tab` | `block`.
 *      · allow   → deixa o evento seguir (navegação normal).
 *      · new_tab → preventDefault + abre em nova aba (preserva a sessão da
 *        Sala quando `navigate_out_allowed=false`).
 *      · block   → preventDefault + toast inline (destino fora da whitelist
 *        de aplicações permitidas).
 *
 * Captura na fase de captura (`capture: true`) para anteceder o handler do
 * Next.js `<Link>`. NÃO usa localStorage; nada persistido client-side.
 *
 * Onda R.4 — fechamento da lacuna residual deixada por L.4: cliques em
 * `<a>` eram interceptados, mas navegação PROGRAMÁTICA (`router.push` /
 * `router.replace`) furava a policy. Duas camadas (defesa em profundidade):
 *
 *  1. `useGuardedRouter()` (em `./use-guarded-router`) consulta `decide()`
 *     deste guard ANTES de empurrar a rota — block/new_tab/allow espelham
 *     exatamente a decisão dos cliques. A lógica pura (`decideNavigation`)
 *     é a mesma de `@/lib/api`; nada é duplicado.
 *  2. Guard de mudança de rota (rede de segurança): observa `usePathname()`
 *     e, se a rota-alvo violar a policy (sem ter passado pelo guarded
 *     router — ex: push em código de terceiro), reverte para a Sala +
 *     mostra o aviso de bloqueio.
 *
 * O mecanismo de aviso (toast inline) e a decisão+efeito são expostos via
 * `SalaNavGuardContext` para que o guarded router e o interceptor de
 * cliques compartilhem uma única fonte de verdade (um toast, uma decisão).
 */

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import {
  decideNavigation,
  type KnownApplication,
  type NavigationDecision,
  type WorkspaceNavigationPolicy,
} from '@/lib/api';

export type SalaNavigationPolicy = Pick<
  WorkspaceNavigationPolicy,
  'navigate_out_allowed' | 'allowed_applications'
>;

interface NavigationGuardProps {
  policy: SalaNavigationPolicy;
  knownApps: KnownApplication[];
  /** Slug da Sala atual — navegação para `/sala/{currentSlug}` é sempre liberada. */
  currentSlug?: string;
  children: React.ReactNode;
}

interface BlockedNotice {
  href: string;
  reason: 'block' | 'new_tab';
}

/**
 * Onda R.4 — contexto interno do guard. Compartilha com o guarded router:
 *  - `decide(href)`: decisão pura da policy atual (reusa `decideNavigation`,
 *    aplicando também a exceção da própria Sala).
 *  - `notify(notice)`: dispara o mesmo toast inline usado pelos cliques.
 */
interface SalaNavGuardCtx {
  decide: (href: string) => NavigationDecision;
  notify: (notice: BlockedNotice) => void;
}

const SalaNavGuardContext = React.createContext<SalaNavGuardCtx | null>(null);

/** Acesso tolerante ao contexto do guard (null fora do `<NavigationGuard>`). */
export function useSalaNavGuard(): SalaNavGuardCtx | null {
  return React.useContext(SalaNavGuardContext);
}

export function NavigationGuard({
  policy,
  knownApps,
  currentSlug,
  children,
}: NavigationGuardProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [notice, setNotice] = React.useState<BlockedNotice | null>(null);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Refs estáveis para a policy/apps — o listener é montado uma vez e lê
  // sempre o valor mais recente sem re-anexar.
  const policyRef = React.useRef(policy);
  const appsRef = React.useRef(knownApps);
  const slugRef = React.useRef(currentSlug);
  React.useEffect(() => {
    policyRef.current = policy;
  }, [policy]);
  React.useEffect(() => {
    appsRef.current = knownApps;
  }, [knownApps]);
  React.useEffect(() => {
    slugRef.current = currentSlug;
  }, [currentSlug]);

  const showNotice = React.useCallback((n: BlockedNotice) => {
    setNotice(n);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  // Onda R.4 — decisão pura para um destino, aplicando a exceção da própria
  // Sala (sempre permitida) ANTES de delegar para `decideNavigation`. Lida
  // tanto pelo interceptor de cliques quanto pelo guarded router.
  const decide = React.useCallback((href: string): NavigationDecision => {
    const slug = slugRef.current;
    // Navegação para a própria Sala é sempre permitida (inclusive a raiz
    // exata e querystring/hash da própria rota).
    if (slug) {
      const self = `/sala/${slug}`;
      if (href === self || href.startsWith(`${self}?`) || href.startsWith(`${self}#`)) {
        return 'allow';
      }
    }
    return decideNavigation(href, policyRef.current, appsRef.current);
  }, []);

  // Exposto a `useGuardedRouter` — estável (ambos os callbacks têm deps []).
  const ctxValue = React.useMemo<SalaNavGuardCtx>(
    () => ({ decide, notify: showNotice }),
    [decide, showNotice],
  );

  // ─── Camada 1 (cliques em link) — comportamento de L.4, intacto ───
  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const onClick = (ev: MouseEvent) => {
      // Respeita modificadores do usuário (ctrl/cmd/shift/middle-click):
      // o operador pediu explicitamente nova aba/janela.
      if (
        ev.defaultPrevented ||
        ev.button !== 0 ||
        ev.metaKey ||
        ev.ctrlKey ||
        ev.shiftKey ||
        ev.altKey
      ) {
        return;
      }
      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      const rawHref = anchor.getAttribute('href');
      if (!rawHref) return;

      // Âncoras internas / esquemas não-navegáveis: ignora.
      if (
        rawHref.startsWith('#') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:')
      ) {
        return;
      }
      // `target=_blank` já é nova aba por intenção do autor.
      if (anchor.getAttribute('target') === '_blank') return;

      const decision = decide(rawHref);
      if (decision === 'allow') return;

      ev.preventDefault();
      ev.stopPropagation();

      if (decision === 'new_tab') {
        window.open(rawHref, '_blank', 'noopener,noreferrer');
        showNotice({ href: rawHref, reason: 'new_tab' });
        return;
      }
      // block
      showNotice({ href: rawHref, reason: 'block' });
    };

    node.addEventListener('click', onClick, { capture: true });
    return () => {
      node.removeEventListener('click', onClick, { capture: true });
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [decide, showNotice]);

  // ─── Camada 2 (rede de segurança) — guard de mudança de rota ───
  // Se algum push/replace fugir do guarded router e a rota-alvo violar a
  // policy, reverte para a Sala + avisa. Cobre navegação programática de
  // terceiros (defesa em profundidade). Não interfere quando a decisão é
  // `allow` (navegação interna legítima).
  const initialPathRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Ignora o primeiro render (rota inicial = a própria Sala).
    if (initialPathRef.current === null) {
      initialPathRef.current = pathname ?? '';
      return;
    }
    if (!pathname) return;
    const slug = slugRef.current;
    const selfPath = slug ? `/sala/${slug}` : null;
    // Já está na própria Sala (ou voltou pra ela): nada a fazer.
    if (selfPath && pathname === selfPath) return;

    const decision = decide(pathname);
    if (decision === 'allow') return;

    // Violação detectada que escapou da camada 1 → reverte para a Sala.
    if (selfPath) {
      router.replace(selfPath);
    } else {
      router.back();
    }
    showNotice({
      href: pathname,
      reason: decision === 'new_tab' ? 'new_tab' : 'block',
    });
  }, [pathname, decide, router, showNotice]);

  return (
    <SalaNavGuardContext.Provider value={ctxValue}>
      <div ref={containerRef} data-testid="sala-nav-guard" className="contents">
        {children}
        {notice && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="sala-nav-blocked"
            data-reason={notice.reason}
            className="fixed bottom-4 right-4 z-50 max-w-[360px] bg-white dark:bg-panel-dark border border-danger shadow-lg p-3 flex items-start gap-2"
          >
            <ShieldAlert
              className="w-4 h-4 text-danger shrink-0 mt-0.5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-text-on-light dark:text-text-on-dark">
                {notice.reason === 'block'
                  ? 'Navegação restrita nesta Sala'
                  : 'Aberto em nova aba'}
              </p>
              <p className="text-[11px] text-muted-on-light leading-relaxed">
                {notice.reason === 'block'
                  ? 'O destino está fora das aplicações permitidas para esta Sala.'
                  : 'A saída para fora foi mantida em nova aba para preservar a sessão da Sala.'}
              </p>
              <p className="text-[10px] font-mono text-muted-on-light truncate mt-0.5">
                {notice.href}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Fechar aviso de navegação"
              className="h-6 w-6 inline-flex items-center justify-center bg-white dark:bg-raised-dark border border-border-light dark:border-border-dark hover:border-primary text-[12px] leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </SalaNavGuardContext.Provider>
  );
}
