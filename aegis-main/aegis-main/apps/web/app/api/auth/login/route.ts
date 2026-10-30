/**
 * POST /api/auth/login (Next.js route)
 *
 * Recebe credenciais do browser, faz login contra o ontology-module
 * (`/auth/login`) e grava access + refresh como cookies httpOnly. O
 * browser nunca ve o token em JS — XSS nao le.
 */
import { NextRequest, NextResponse } from "next/server";

import { backendLogin } from "@/lib/auth/backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOpts,
  refreshCookieOpts,
} from "@/lib/auth/cookies";

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 d — bate com backend
// Sessão alvo do operador: 1 dia (Feedback #4, 2026-05-24). O backend
// (AEGIS_ACCESS_TTL, default 86400s) é a fonte da verdade via `expires_in`;
// pisamos um piso de 1 dia no cookie pra manter consistência mesmo se um
// token antigo voltar com TTL menor.
const ACCESS_TTL_FLOOR_SECONDS = 60 * 60 * 24; // 1 d

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string; totp_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { detail: "invalid JSON body" },
      { status: 400 },
    );
  }
  if (!body.username || !body.password) {
    return NextResponse.json(
      { detail: "username and password required" },
      { status: 400 },
    );
  }
  const { status, data } = await backendLogin({
    username: body.username,
    password: body.password,
    totp_code: body.totp_code,
  });
  if (status !== 200 || !("access_token" in data)) {
    return NextResponse.json(
      { detail: "detail" in data ? data.detail : "login failed" },
      { status },
    );
  }
  const res = NextResponse.json({
    must_change_password: data.must_change_password,
    token_type: data.token_type,
    expires_in: data.expires_in,
  });
  res.cookies.set(
    ACCESS_COOKIE,
    data.access_token,
    accessCookieOpts(Math.max(data.expires_in, ACCESS_TTL_FLOOR_SECONDS)),
  );
  res.cookies.set(
    REFRESH_COOKIE,
    data.refresh_token,
    refreshCookieOpts(REFRESH_TTL_SECONDS),
  );
  return res;
}
