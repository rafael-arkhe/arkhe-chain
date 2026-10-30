/**
 * GET /api/public/guest/[token] — Onda 2 (2026-05-25).
 *
 * Proxy PÚBLICO (anônimo) da superfície do morador. Diferente do proxy genérico
 * `/api/[...path]` (que injeta o cookie de operador e devolve 401 sem ele), esta
 * rota não exige autenticação: o morador abre `/m/<token>` antes de qualquer
 * login. Encaminha para `GET /public/v1/guest/<token>` no ontology-module, que
 * valida o token e devolve só o "menu" de Ações permitidas.
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  try {
    const res = await fetch(
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { detail: "guest service unavailable" },
      { status: 502 },
    );
  }
}
