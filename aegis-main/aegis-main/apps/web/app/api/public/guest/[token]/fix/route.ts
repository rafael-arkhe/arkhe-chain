/**
 * POST /api/public/guest/[token]/fix — M1/M2 (2026-05-25).
 *
 * Proxy PÚBLICO (anônimo) que encaminha um fix de posição (consentido pelo
 * dispositivo do visitante) para `POST /public/v1/guest/<token>/fix` no
 * ontology-module, que avalia a cerca/destino/rota e dirige o ciclo de vida
 * (chegada → finaliza; desvio → alerta). Sem auth de operador.
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.text();
  try {
    const res = await fetch(
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/fix`,
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
