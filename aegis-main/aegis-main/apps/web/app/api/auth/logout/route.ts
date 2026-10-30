/**
 * POST /api/auth/logout (Next.js route)
 *
 * Chama o backend pra revogar o refresh e limpa os 2 cookies na volta.
 * Idempotente.
 */
import { NextRequest, NextResponse } from "next/server";

import { backendLogout } from "@/lib/auth/backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearCookieHeaders,
} from "@/lib/auth/cookies";

export async function POST(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value || null;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value || null;
  if (access) {
    await backendLogout(access, refresh);
  }
  const res = new NextResponse(null, { status: 204 });
  clearCookieHeaders().forEach((c) => res.headers.append("Set-Cookie", c));
  return res;
}
