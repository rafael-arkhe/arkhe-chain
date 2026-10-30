/**
 * GET /api/public/guest/[token]/pages/[slug] — Q2 (2026-05-29).
 *
 * Proxy PÚBLICO (anônimo) do descritor da PÁGINA escopada por um guest token:
 * layout + defs de variáveis, para o /m montar o MESMO WorkshopApp e renderizar
 * pelo MESMO WorkshopV2Renderer. Sem auth de operador (o token É a autorização).
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string; slug: string }> },
) {
  const { token, slug } = await ctx.params;
  try {
    const res = await fetch(
      `${BACKEND_URL}/public/v1/guest/${encodeURIComponent(token)}/pages/${encodeURIComponent(slug)}`,
      { method: "GET", cache: "no-store" },
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
