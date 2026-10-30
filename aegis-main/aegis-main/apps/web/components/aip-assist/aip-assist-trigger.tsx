'use client';

/**
 * AIP Assist Trigger — botão global Wand2 fixo (bottom-right) que
 * abre o `<AipAssistSidebar>`. Sprint L4 (2026-05-23).
 *
 * Inicialmente scope=global; consumidores podem envolver com seu próprio
 * `<AipAssistScopeProvider scope=... resourceId=...>` para dar contexto
 * (Sprint L7 Slate completo ativará isso por widget/page).
 */
import * as React from 'react';
import { Wand2 } from 'lucide-react';

import { useAuth } from '@/lib/auth/useAuth';
import { useAssistantPref } from '@/lib/assistant/assistant-pref-provider';
import { AipAssistSidebar, type AssistScope } from './aip-assist-sidebar';

interface ScopeShape {
  scope: AssistScope;
  resourceId?: string;
}

const AssistScopeCtx = React.createContext<ScopeShape>({ scope: 'global' });

export function AipAssistScopeProvider({
  scope,
  resourceId,
  children,
}: {
  scope: AssistScope;
  resourceId?: string;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ scope, resourceId }), [scope, resourceId]);
  return (
    <AssistScopeCtx.Provider value={value}>{children}</AssistScopeCtx.Provider>
  );
}

export function AipAssistTrigger() {
  const { principal, loading } = useAuth();
  const { scope, resourceId } = React.useContext(AssistScopeCtx);
  // #9 (2026-05-24) — preferência da Conta liga/desliga o FAB. Default
  // false → assistente OCULTO até o operador ativar em /conta.
  const { showFab } = useAssistantPref();
  const [open, setOpen] = React.useState(false);

  if (loading || !principal) return null;
  if (!showFab) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir assistente AEGIS"
        data-testid="aip-assist-trigger"
        className="fixed bottom-4 right-4 z-30 h-11 w-11 inline-flex items-center justify-center bg-primary text-white shadow-lg hover:bg-primary/90 border border-primary"
      >
        <Wand2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
      {open && (
        <AipAssistSidebar
          scope={scope}
          resourceId={resourceId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
