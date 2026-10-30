/**
 * /api/public/v1/guest/[...path] — passthrough ANÔNIMO da superfície pública do
 * guest token (o que o AEGIS SDK `client.publicGuest.*` consome: ~9 rotas
 * `/public/v1/guest/*` — menu, fix, invoke, position, document, …).
 *
 * Espelha a rota anônima de Onda 2 (`/api/public/guest/[token]`), mas GENÉRICA:
 * o `livetracker` (SPA do visitante, servida same-origin em `/visitante/`) usa o
 * SDK com base `/api`, então bate em `/api/public/v1/guest/…` na MESMA origem —
 * o Vite fazia esse proxy em dev; aqui a security-app faz em prod. Diferente do
 * catch-all `/api/[...path]` (que injeta o cookie de operador e 401 sem ele),
 * este NÃO exige auth: o token no path é a credencial e o backend a valida.
 * Escopo restrito a `/public/v1/guest/*` (não abre o resto do backend).
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

async function proxy(req: NextRequest, path: string[]) {
  const suffix = path.map(encodeURIComponent).join("/");
  const qs = req.nextUrl.search || "";
  const url = `${BACKEND_URL}/public/v1/guest/${suffix}${qs}`;
  const init: RequestInit = { method: req.method, cache: "no-store" };
  const ct = req.headers.get("content-type");
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
    if (ct) init.headers = { "content-type": ct };
  }
  try {
    const res = await fetch(url, init);
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json({ detail: "guest service unavailable" }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await ctx.params).path);
}
