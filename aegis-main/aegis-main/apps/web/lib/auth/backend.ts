/**
 * Server-only helpers para falar com o ontology-module.
 * Nunca importado de Client Components — chamadas do browser passam
 * pelas rotas proxy /api/*.
 */
export const BACKEND_URL =
  process.env.AEGIS_BACKEND_URL ||
  process.env.NEXT_PUBLIC_ONTOLOGY_API_URL ||
  "http://localhost:8002";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  must_change_password: boolean;
};

export async function backendLogin(body: {
  username: string;
  password: string;
  totp_code?: string;
}): Promise<{ status: number; data: TokenPair | { detail: string } }> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as
    | TokenPair
    | { detail: string };
  return { status: res.status, data };
}

export async function backendRefresh(refreshToken: string): Promise<{
  status: number;
  data: TokenPair | { detail: string };
}> {
  const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as
    | TokenPair
    | { detail: string };
  return { status: res.status, data };
}

export async function backendLogout(
  accessToken: string,
  refreshToken: string | null,
): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
  } catch {
    // best-effort; cookies são limpos de qualquer jeito
  }
}
