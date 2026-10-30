/**
 * Browser-side auth client. Fala com as rotas proxy Next.js — nunca
 * com o backend direto — pra que tokens fiquem em cookies httpOnly.
 *
 * Espelha politicians-app/lib/auth/api.ts.
 */
/** M3 — vendor dev-mode session state. `null` quando inativo/expirado. */
export interface DevMode {
  enabled: boolean;
  until: string | null;
}

export interface WhoAmI {
  user_id: string;
  username: string;
  display_name: string;
  email: string | null;
  tenant: {
    id: string;
    slug: string;
    display_name: string;
    features: string[];
    // M3 — domínios licenciados (vazio = sem restrição). Filtro cosmético.
    allowed_domains?: string[];
    // M3 — ids de itens do Painel escondidos pelo vendor (cosmético).
    cp_nav_hidden?: string[];
  } | null;
  clearances: string[];
  roles: string[];
  permissions: string[];
  must_change_password: boolean;
  totp_enabled: boolean;
  // M3 — sessão dev-mode do vendor Safe-Core (validada server-side por TTL).
  dev_mode?: DevMode | null;
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AuthError(res.status, body || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export async function loginRequest(body: {
  username: string;
  password: string;
  totp_code?: string;
}) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<{ must_change_password: boolean; expires_in: number }>(
    res,
  );
}

export async function logoutRequest(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function fetchMe(): Promise<WhoAmI> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  return jsonOrThrow<WhoAmI>(res);
}
