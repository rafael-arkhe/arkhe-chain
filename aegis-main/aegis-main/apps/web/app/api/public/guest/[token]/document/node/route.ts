/**
 * GET /api/public/guest/[token]/document/node?node_id= — T3-G3 (c).
 *
 * Proxy PÚBLICO (anônimo) que resolve UM objeto único (ObjectReference) de uma
 * seção de widget do documento transmitido. Encaminha para o ontology-module — o
 * token É a autorização; o backend exige que o node_id seja referenciado pelo
 * documento do token e aplica ABAC (clearances=() mascara/derruba o classificado).
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const nodeId = req.nextUrl.searchParams.get("node_id") || "";
  try {
    const res = await fetch(
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/document/node?node_id=${encodeURIComponent(nodeId)}`,
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
