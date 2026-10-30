/**
 * HTTP client do security-app.
 *
 * Todas as chamadas passam pelas rotas /api/* do Next.js (proxy reverso
 * em `app/api/[...path]/route.ts`). O proxy injeta `Authorization:
 * Bearer <cookie>` server-side a partir do cookie httpOnly `aegis_access`
 * e faz refresh transparente em 401. O browser NUNCA enxerga o token
 * em JS (XSS-resistente).
 *
 * Por isso `API_BASE` aqui é relativo (`/api`) — sem CORS, sem token
 * provider no client. O cookie viaja sozinho com `credentials: include`.
 */
export const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * S7 — desembrulha o corpo de erro do FastAPI (`{"detail": ...}`) num texto
 * legível. `detail` string → a string; lista de validação (422) → os `.msg`
 * juntos (nunca "[object Object]"); corpo não-JSON → o texto cru. O chamador
 * mapeia/traduz por `status` (ex.: 409 → "já existe") antes de exibir.
 */
export function unwrapApiErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const parts = detail.map((d) =>
        d && typeof d === "object" && "msg" in d
          ? String((d as { msg: unknown }).msg)
          : String(d),
      );
      const joined = parts.join("; ").trim();
      if (joined) return joined;
    } else if (detail && typeof detail === "object") {
      const msg = (detail as { msg?: unknown }).msg;
      if (typeof msg === "string" && msg) return msg;
    }
  } catch {
    // corpo não-JSON → texto cru abaixo
  }
  return raw;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  const { headers: _, ...rest } = init ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...rest,
    headers,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, unwrapApiErrorBody(raw) || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiFetchOrFallback<T>(
  path: string,
  fallback: T,
  init?: RequestInit,
): Promise<{ data: T; live: boolean }> {
  try {
    const data = await apiFetch<T>(path, init);
    return { data, live: true };
  } catch {
    return { data: fallback, live: false };
  }
}
