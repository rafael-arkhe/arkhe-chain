/**
 * POST /api/public/guest/[token]/pages/[slug]/evaluate — Q2 (2026-05-29).
 *
 * Proxy PÚBLICO (anônimo) que resolve as variáveis da PÁGINA escopada pelo guest
 * token — a MESMA pipeline de evaluate do operador, escopada pelo token (Foundry:
 * inputs do module interface supridos pela superfície embutidora). Sem auth de
 * operador: o token É a autorização e o backend deriva o guest principal dele.
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string; slug: string }> },
) {
  const { token, slug } = await ctx.params;
  const body = await req.text();
  try {
    const res = await fetch(
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/pages/${encodeURIComponent(slug)}/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body || "{}",
        cache: "no-store",
      },
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
