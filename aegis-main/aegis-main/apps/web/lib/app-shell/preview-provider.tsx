'use client';

/**
 * `<PreviewAppShellProvider>` — Wave E.1 (2026-05-23).
 *
 * Substitui o valor entregue por `useAppShellConfig()` por uma config
 * passada via prop. Usado no preview live da page
 * `/painel-de-controle/app-shell` (centro do 3-pane) para que o shell
 * renderizado dentro do iframe-less preview reaja ao que o operador
 * está editando ANTES de salvar.
 *
 * Estratégia "Provider approach" (vs iframe):
 *   - `useAppShellConfig()` consome o Context se presente, senão cai
 *     no `useAppShell().config` carregado do backend.
 *   - Operador edita o draft no inspector → page seta novo valor no
 *     Provider → todos os componentes shell consumidores reagem.
 *   - Salvar não desfaz preview — `useAppShell.save()` atualiza o
 *     cache global e o Provider de preview é desmontado quando o
 *     operador sai da page.
 *
 * Componentes que precisam observar a config sempre chamam
 * `useAppShellConfig()`, NUNCA `useAppShell()` diretamente — caso
 * contrário ignoram o preview no composer.
 */
import * as React from 'react';
import type { AppShellConfig } from '@/lib/api';
import { useAppShell } from './use-app-shell';
import { DEFAULT_APP_SHELL } from './defaults';

const PreviewContext = React.createContext<AppShellConfig | null>(null);

export function PreviewAppShellProvider({
  value,
  children,
}: {
  value: AppShellConfig;
  children: React.ReactNode;
}) {
  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}

/**
 * Hook único que todo componente shell deve consumir.
 *
 * Resolução:
 *   1. PreviewContext (composer) — se montado, ganha.
 *   2. Backend config via `useAppShell()` — comportamento padrão.
 *   3. DEFAULT_APP_SHELL — fallback hardcoded (shell renderiza atual).
 */
export function useAppShellConfig(): {
  config: AppShellConfig;
  isPreview: boolean;
  loading: boolean;
} {
  const previewValue = React.useContext(PreviewContext);
  const { config, loading } = useAppShell();
  if (previewValue) {
    return { config: previewValue, isPreview: true, loading: false };
  }
  if (loading) {
    return { config: DEFAULT_APP_SHELL, isPreview: false, loading: true };
  }
  return { config, isPreview: false, loading: false };
}
