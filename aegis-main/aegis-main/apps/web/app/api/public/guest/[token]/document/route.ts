/**
 * GET /api/public/guest/[token]/document — T3-B (Transmitir).
 *
 * Proxy PÚBLICO (anônimo) do documento read-only escopado pelo token. Encaminha
 * para `GET /public/v1/guest/<token>/document` no ontology-module — o token É a
 * autorização (sem cookie de operador). Mesmo padrão do proxy do menu.
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
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/document`,
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
