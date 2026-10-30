/**
 * GET /api/public/brand-asset/[tenant]/[name]
 *
 * Proxy PÚBLICO (anônimo) que serve o logo/favicon do tenant em stream binário,
 * buscando do ontology-module — que lê do MinIO INTERNO (sem URL pré-assinada
 * exposta ao browser). É a fonte same-origin de `logo_url`/`logo_dark_url`/
 * `favicon_url` da Marca.
 *
 * Por que same-origin e não a URL pré-assinada do MinIO: o browser precisaria
 * alcançar o MinIO diretamente — impossível no edge (atrás do túnel Cloudflare,
 * onde só o frontend é público) e quebrado no dev (MinIO não é publicado no
 * host). Servindo pelo frontend → backend → MinIO interno, funciona no dev
 * (localhost), no edge e no celular.
 *
 * Anônima por design — a /login mostra o logo do tenant ANTES de qualquer auth
 * (mesmo padrão de `/api/public/guest/[token]/media` e `/api/styles/brand/public`).
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ tenant: string; name: string }> },
) {
  const { tenant, name } = await ctx.params;
  try {
    const res = await fetch(
      `${BACKEND_URL}/platform/v23/styles/asset/logo/${encodeURIComponent(
        tenant,
      )}/${encodeURIComponent(name)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json(
        { detail: "asset not found" },
        { status: res.status },
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          res.headers.get("Content-Type") || "application/octet-stream",
        // Estável (o nome do arquivo é o sha do conteúdo) → cacheável de forma
        // agressiva; re-upload gera outro sha, outra URL.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "brand asset service unavailable" },
      { status: 502 },
    );
  }
}
