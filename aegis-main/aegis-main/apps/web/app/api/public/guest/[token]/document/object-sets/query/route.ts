/**
 * POST /api/public/guest/[token]/document/object-sets/query — T3-G3.
 *
 * Proxy PÚBLICO (anônimo) que resolve um object-set de uma seção de widget do
 * documento transmitido. Encaminha para o ontology-module — o token É a
 * autorização (sem cookie de operador); o backend impõe token-scope + ABAC.
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
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/document/object-sets/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
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
