/**
 * GET /api/public/guest/[token]/media?key= — T3-G3.
 *
 * Proxy PÚBLICO (anônimo) que serve um arquivo do documento transmitido (stream
 * binário do MinIO). Encaminha para o ontology-module — o token É a autorização;
 * o backend exige que a chave pertença ao documento do token. Relaia o
 * Content-Type do backend para imagens/vídeos/pdf renderizarem corretamente.
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const key = req.nextUrl.searchParams.get("key") || "";
  try {
    const res = await fetch(
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/media?key=${encodeURIComponent(key)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json({ detail: "not found" }, { status: res.status });
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "guest service unavailable" },
      { status: 502 },
    );
  }
}
