"use client";

/**
 * AuthProvider + useAuth hook.
 *
 * No mount, faz GET /api/auth/me uma vez. O proxy resolve refresh-on-401
 * transparente — ou volta com principal válido, ou volta 401 (cookies
 * limpos) → o caller redireciona pra /login.
 *
 * O principal vive em React state (não em zustand). `useCan(perm)`
 * espelha o backend `Principal.has_permission` — admin short-circuita.
 *
 * Espelha politicians-app/lib/auth/useAuth.tsx.
 */
import * as React from "react";
import { useRouter } from "next/navigation";

import { fetchMe, logoutRequest, type WhoAmI } from "@/lib/auth/api";

interface AuthContextValue {
  principal: WhoAmI | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [principal, setPrincipal] = React.useState<WhoAmI | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await fetchMe();
      setPrincipal(me);
    } catch (e) {
      setPrincipal(null);
      setError(e instanceof Error ? e.message : "auth failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = React.useCallback(async () => {
    await logoutRequest();
    setPrincipal(null);
    router.replace("/login");
  }, [router]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ principal, loading, error, refresh, logout }),
    [principal, loading, error, refresh, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

/**
 * Capability check que espelha o backend `Principal.has_permission`.
 * Role `admin` short-circuita qualquer chave.
 *
 * Retorna `false` enquanto principal ainda carrega — callers devem
 * renderizar skeleton ou delegar pro <RequirePerm> upstream.
 */
export function useCan(key: string): boolean {
  const { principal } = useAuth();
  if (!principal) return false;
  if (principal.roles.includes("admin")) return true;
  return principal.permissions.includes(key);
}

/** Acesso direto ao WhoAmI atual (ou null). Substitui o antigo usePrincipal. */
export function usePrincipal(): WhoAmI | null {
  return useAuth().principal;
}
