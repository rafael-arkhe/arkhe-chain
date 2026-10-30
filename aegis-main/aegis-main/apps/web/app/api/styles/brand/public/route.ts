/**
 * GET /api/styles/brand/public (M2 · 2026-05-24)
 *
 * Proxy PÚBLICO da marca da tela /login. Ao contrário do proxy genérico
 * `/api/[...path]` (que exige cookie de acesso e devolve 401 quando
 * ausente), esta rota é anônima por design: a /login precisa renderizar a
 * marca do tenant ANTES de qualquer autenticação.
 *
 * Encaminha para `GET /platform/v23/styles/brand/public` no ontology-module,
 * que devolve APENAS campos seguros (logo/slogan/cor/fundo/mensagem + flag
 * `login_use_default`). Repassa um eventual `?tenant=<slug>` para deploys
 * multi-marca atrás do mesmo host.
 *
 * Higienização: nenhum valor de SEED/dev pode vazar pra tela de login. Se o
 * backend devolver um asset apontando pra um host de exemplo inacessível
 * (`example.*`) ou um slogan vazio, esses campos caem para o default canônico
 * Safe Core (logo AEGIS + slogan oficial). É a mesma marca neutra que o
 * front aplica quando `login_use_default` é true.
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/auth/backend";
import { DEFAULT_LOGIN } from "@/lib/app-shell/defaults";

/** Hosts de placeholder/dev que nunca devem servir asset real em produção. */
function isUnreachableAssetUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.trim() === "") return true;
  // example.com / example.test / *.example.* (RFC 2606 — domínios reservados
  // para exemplos/documentação; jamais resolvem pra um asset real).
  return /(^|\/\/|\.)example\.[a-z]+(\/|$|:)/i.test(url);
}

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  const qs = tenant ? `?tenant=${encodeURIComponent(tenant)}` : "";
  try {
    const res = await fetch(
      `${BACKEND_URL}/platform/v23/styles/brand/public${qs}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => ({}));

    if (res.ok && data && typeof data === "object") {
      const brand = data as Record<string, unknown>;
      // Logo inacessível (placeholder/dev) → logo canônico AEGIS.
      if (isUnreachableAssetUrl(brand.logo_url)) {
        brand.logo_url = DEFAULT_LOGIN.logo_url;
      }
      // Slogan ausente → slogan oficial Safe Core. (O front já reaplica o
      // default quando `login_use_default` é true; isto cobre o caso de
      // marca de tenant com slogan vazio/em branco.)
      if (typeof brand.slogan !== "string" || brand.slogan.trim() === "") {
        brand.slogan = DEFAULT_LOGIN.slogan;
      }
    }

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { detail: "brand service unavailable" },
      { status: 502 },
    );
  }
}

// Preflight CORS p/ SPA desacoplado (outdoor mobile, 2026-09-18, aplicado no
// G120 junto): sem este export o Next devolve 204 mudo e o browser bloqueia
// o fetch da marca com "Failed to fetch". Rota anônima por design; o GET
// real segue igual.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "600",
    },
  });
}
