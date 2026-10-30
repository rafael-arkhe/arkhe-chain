/**
 * POST /api/auth/refresh (Next.js route)
 *
 * Le o refresh cookie httpOnly, pede rotacao ao backend e grava os novos
 * cookies. Em qualquer erro, limpa cookies pra mandar o operador pro
 * /login na proxima request.
 */
import { NextRequest, NextResponse } from "next/server";

import { backendRefresh } from "@/lib/auth/backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOpts,
  clearCookieHeaders,
  refreshCookieOpts,
} from "@/lib/auth/cookies";

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    const r = NextResponse.json(
      { detail: "no refresh cookie" },
      { status: 401 },
    );
    clearCookieHeaders().forEach((c) => r.headers.append("Set-Cookie", c));
    return r;
  }
  const { status, data } = await backendRefresh(refresh);
  if (status !== 200 || !("access_token" in data)) {
    const r = NextResponse.json(
      { detail: "detail" in data ? data.detail : "refresh failed" },
      { status },
    );
    clearCookieHeaders().forEach((c) => r.headers.append("Set-Cookie", c));
    return r;
  }
  const res = NextResponse.json({
    must_change_password: data.must_change_password,
    token_type: data.token_type,
    expires_in: data.expires_in,
  });
  res.cookies.set(
    ACCESS_COOKIE,
    data.access_token,
    accessCookieOpts(data.expires_in),
  );
  res.cookies.set(
    REFRESH_COOKIE,
    data.refresh_token,
    refreshCookieOpts(REFRESH_TTL_SECONDS),
  );
  return res;
}
