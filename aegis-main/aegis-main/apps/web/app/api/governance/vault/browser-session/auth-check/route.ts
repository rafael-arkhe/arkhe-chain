/**
 * auth-check pro chrome-proxy (Caddy forward_auth).
 *
 * Rota dedicada (NÃO usa o catch-all proxy /api/[...path]) pra Caddy
 * validar a sessão antes de proxiar pro KasmVNC. Faz fetch interno pra
 * ontology-api stripping os headers de upgrade — o catch-all genérico
 * trava quando a request original carrega Connection: Upgrade
 * (acontece em /websockify do KasmVNC).
 *
 * Retorna:
 *   - 200 + {ok:true}  — perm security.browser.manage validada no backend
 *   - 401              — sem cookie / token inválido
 *   - 403              — sem permissão
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ detail: "no session" }, { status: 401 });
  }

  const url = `${BACKEND_URL}/governance/vault/browser-session/auth-check`;
  let backendResp: Response;
  try {
    backendResp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    return NextResponse.json(
      { detail: "backend unreachable" },
      { status: 503 },
    );
  }

  if (backendResp.status === 200) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { detail: backendResp.statusText },
    { status: backendResp.status },
  );
}
