'use client';

/**
 * AssistantPrefProvider + useAssistantPref() — #9 (2026-05-24).
 *
 * Provider reativo que liga/desliga o FAB "Assistente AEGIS", espelhando
 * exatamente o padrão do `I18nProvider` (lib/i18n/provider.tsx):
 *   - ao montar, faz GET /api/me/context e lê `show_assistant_fab`
 *     (default false → assistente OCULTO);
 *   - `setShowFab(next)` faz update otimista + persiste via
 *     PUT /api/me/context { show_assistant_fab: next };
 *   - Conta (toggle) + FAB compartilham este estado, então virar o toggle
 *     aparece/some o FAB imediatamente, e recarregar a página mantém.
 *
 * Persistência: server-side (User.metadata_.context.show_assistant_fab).
 * ZERO localStorage para a preferência de domínio (memória
 * feedback_no_localstorage_for_persistence) — idêntico ao locale.
 *
 * Fallback sem provider: { showFab: false } → o FAB permanece oculto e os
 * testes que renderizam consumidores fora do provider não quebram.
 */
import * as React from 'react';
import { useMeContext } from '@/lib/data/me-context-store';

interface AssistantPrefValue {
  /** true = mostrar o FAB do assistente. Default false (oculto). */
  showFab: boolean;
  /** Atualiza otimista + persiste via PUT /api/me/context. */
  setShowFab: (next: boolean) => Promise<void>;
  /** true após a primeira sincronização com o server (evita flash). */
  ready: boolean;
}

const AssistantPrefContext = React.createContext<AssistantPrefValue | null>(
  null,
);

export function AssistantPrefProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showFab, setShowFabState] = React.useState(false);

  // Sincroniza com server-side via store COMPARTILHADO de /me/context (#12) —
  // dedupado com i18n/AIP/layout. `ready` = o GET assentou (sucesso OU falha),
  // mesma semântica do antigo `.finally`. Semeia o FAB uma vez; o toggle local
  // (setShowFab) prevalece — `touched` evita que o GET (que pode resolver DEPOIS
  // de um clique) sobrescreva a escolha otimista do operador.
  const { data: ctx, ready } = useMeContext();
  const seeded = React.useRef(false);
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || touched.current || !ctx) return;
    if (typeof ctx.show_assistant_fab === 'boolean') {
      setShowFabState(ctx.show_assistant_fab);
    }
    seeded.current = true;
  }, [ctx]);

  const setShowFab = React.useCallback(async (next: boolean) => {
    // Optimistic update + persist server-side.
    touched.current = true;
    setShowFabState(next);
    try {
      await fetch('/api/me/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_assistant_fab: next }),
      });
    } catch {
      // Falha de rede: estado local permanece, server fica defasado.
    }
  }, []);

  const value = React.useMemo(
    () => ({ showFab, setShowFab, ready }),
    [showFab, setShowFab, ready],
  );

  return (
    <AssistantPrefContext.Provider value={value}>
      {children}
    </AssistantPrefContext.Provider>
  );
}

/**
 * Hook principal. Uso:
 *
 *   const { showFab, setShowFab } = useAssistantPref();
 *
 * Fallback sem provider: { showFab:false, setShowFab:noop, ready:false } —
 * o FAB fica oculto e nada quebra fora do provider (rotas de auth/login,
 * testes isolados).
 */
export function useAssistantPref(): AssistantPrefValue {
  const ctx = React.useContext(AssistantPrefContext);
  if (!ctx) {
    return { showFab: false, setShowFab: async () => {}, ready: false };
  }
  return ctx;
}
