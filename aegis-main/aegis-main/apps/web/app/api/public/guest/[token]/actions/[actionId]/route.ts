/**
 * POST /api/public/guest/[token]/actions/[actionId] — Onda 2 (2026-05-25).
 *
 * Proxy PÚBLICO (anônimo) que invoca uma Ação autorizada pelo token do morador.
 * Encaminha para `POST /public/v1/guest/<token>/actions/<id>` no ontology-module,
 * que faz o duplo-gate (token válido + Ação na allowlist do token), o throttle e
 * o dispatch real (a Ação de serviço ainda honra a allowlist de SSRF da Onda 1).
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string; actionId: string }> },
) {
  const { token, actionId } = await ctx.params;
  const body = await req.text();
  try {
    const res = await fetch(
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/actions/${encodeURIComponent(actionId)}`,
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
