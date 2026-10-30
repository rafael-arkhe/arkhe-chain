/**
 * Proxy genérico de backend.
 *
 * Encaminha qualquer /api/<path> (exceto /api/auth/{login,refresh,logout}
 * que tem rotas dedicadas) pro ontology-module, injetando o access_token
 * do cookie httpOnly. Em 401 do backend, rotaciona refresh transparente
 * e tenta de novo uma vez. Se refresh tambem falha, limpa cookies pra
 * proxima navegacao cair no /login.
 */
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL, backendRefresh } from "@/lib/auth/backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOpts,
  clearCookieHeaders,
  refreshCookieOpts,
} from "@/lib/auth/cookies";

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  // 🔴 transfer-encoding NÃO pode viajar: o undici define o SEU quando há
  // body, e o valor herdado do request de entrada (chunked via HTTP/1.1 do
  // túnel) conflita → UND_ERR_INVALID_ARG "invalid transfer-encoding header"
  // → TODO POST pelo túnel virava 500 sem chegar ao backend (medido 24/08:
  // gatilho "ler agora" morria aqui; GETs passavam por não terem body).
  "transfer-encoding",
  "cookie",
  // 🔴 NÃO stripar "authorization" — o Desktop/FAB (edge) manda o SEU
  // Bearer <edge_token> (trilho de MÁQUINA), e o proxy não pode trocá-lo
  // pelo token do operador (trilho humano). Sem isto, o edge router do
  // backend recusa o token errado e o Desktop mostra "Not Found" nos
  // Dispositivos. A injeção do access_token do operador (linha abaixo)
  // SÓ vale quando NÃO há Authorization incoming (browser sem edge_token).
  // "authorization",
]);
const STRIP_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "connection",
  "content-encoding",
  "content-length",
]);

// Rotas PÚBLICAS do backend: o próprio endpoint valida o código/token sem
// nenhuma credencial (ex.: o Desktop troca o código por um edge_token no
// POST /edge/pair; o AutoSync resgata o token OSDK no /connectors/pair).
// Sem isto, o proxy devolvia 401 "unauthenticated" mesmo com código válido —
// o OuroVille mordeu isso em 2026-08-19 ("Could not pair" no AEGIS Desktop).
//
// 🔴 AMBAS as formas, e NUNCA só a dupla: o AEGIS Desktop escolhe a base por
// probe (GET {base}/health). No OuroVille o middleware 401a /api/health e o
// /health (sem /api) redireciona pro /login (200) → o app elege a base SEM
// /api e posta a forma SIMPLES v1/edge/pair. O middleware (middleware.ts)
// já deixa as duas passar; o proxy 401ava a simples até 2026-08-20
// ("Could not pair" no Desktop do OuroVille, 5º episódio do dia).
// targetPath aqui NÃO tem o primeiro /api (o Next o consome na rota
// [...path]) — a forma dupla aparece como "api/v1/edge/pair", a simples
// como "v1/edge/pair". Manter AMBAS em sincronia com o middleware.
const PUBLIC_NO_AUTH_PATHS = new Set([
  "api/v1/edge/pair",
  "api/v1/connectors/pair",
  "v1/edge/pair",
  "v1/connectors/pair",
  // 🔴 PROBE de base do AEGIS Desktop (2026-08-20): GET /api/health precisa
  // responder 200 sem cookie para o app escolher a base COM /api — senão ele
  // cai na base sem /api e todo o trilho edge (heartbeat/dispositivos/stream)
  // vira forma simples → 404 no backend ("Nunca conectou"). O backend serve
  // /health na raiz; targetPath aqui é "health" (o Next consome o primeiro
  // /api na rota [...path]).
  "health",
]);

// A forma SIMPLES (v1/edge/pair) chega sem o prefixo /api/v1 que o backend
// monta nos routers (edge: /api/v1/edge; connectors: /api/v1/connectors) —
// encaminhar como está daria 404 mudo ("código inválido"). Mapa exato só
// destas duas rotas; os demais paths (platform/v23, /me, etc) são montados
// SEM /api no backend e NÃO podem ganhar prefixo. (2026-08-20)
const PUBLIC_NO_AUTH_BACKEND_PATH: Record<string, string> = {
  "v1/edge/pair": "api/v1/edge/pair",
  "v1/connectors/pair": "api/v1/connectors/pair",
};

interface ProxyContext {
  pathSegments: string[];
}

async function buildBackendInit(
  req: NextRequest,
  accessToken: string | null,
): Promise<RequestInit> {
  const headers = new Headers();
  // 🔴 O Desktop/FAB manda o SEU Bearer <edge_token> (trilho de MÁQUINA).
  // Se passar a requisição pro backend com o token do OPERADOR (cookie),
  // o edge router recusa → "Not Found" nos Dispositivos. Só injeta o
  // access_token do operador quando NÃO há Authorization incoming.
  const incomingAuth = req.headers.get("authorization");
  req.headers.forEach((v, k) => {
    if (!STRIP_REQUEST_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else if (incomingAuth) {
    headers.set("Authorization", incomingAuth);
  }
  // accessToken nulo e sem Authorization incoming = rota pública: NÃO
  // inventa header de auth — o backend decide sozinho.
  const method = req.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    // @ts-expect-error — duplex obrigatorio pro undici quando streama body
    duplex: "half",
  };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = await req.arrayBuffer();
  }
  return init;
}

const _NO_BODY_STATUSES = new Set([204, 205, 304]);

function relayResponse(backendRes: Response, body: ArrayBuffer): NextResponse {
  const payload = _NO_BODY_STATUSES.has(backendRes.status) ? null : body;
  const out = new NextResponse(payload, { status: backendRes.status });
  backendRes.headers.forEach((v, k) => {
    if (STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) return;
    out.headers.set(k, v);
  });
  return out;
}

function isSSE(res: Response): boolean {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("text/event-stream");
}

function relayStream(backendRes: Response): NextResponse {
  if (!backendRes.body) {
    return relayResponse(backendRes, new ArrayBuffer(0));
  }
  const out = new NextResponse(backendRes.body, { status: backendRes.status });
  backendRes.headers.forEach((v, k) => {
    if (STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) return;
    out.headers.set(k, v);
  });
  out.headers.set("Cache-Control", "no-cache, no-transform");
  out.headers.set("X-Accel-Buffering", "no");
  return out;
}

async function tryRefreshAndRetry(
  req: NextRequest,
  targetUrl: string,
  refreshCookie: string,
): Promise<NextResponse> {
  const r = await backendRefresh(refreshCookie);
  if (r.status !== 200 || !("access_token" in r.data)) {
    const failed = NextResponse.json(
      { detail: "session expired" },
      { status: 401 },
    );
    clearCookieHeaders().forEach((c) => failed.headers.append("Set-Cookie", c));
    return failed;
  }
  const init = await buildBackendInit(req, r.data.access_token);
  const retry = await fetch(targetUrl, init);
  const body = await retry.arrayBuffer();
  const out = relayResponse(retry, body);
  out.cookies.set(
    ACCESS_COOKIE,
    r.data.access_token,
    accessCookieOpts(r.data.expires_in),
  );
  out.cookies.set(
    REFRESH_COOKIE,
    r.data.refresh_token,
    refreshCookieOpts(REFRESH_TTL_SECONDS),
  );
  return out;
}

// Auth programático (AutoSync/OSDK): o túnel do site aponta pro frontend, então
// um serviço com token `osdk_…` chega AQUI sem cookie de sessão. Só esse prefixo
// é repassado — a validação/escopo do token é 100% do backend (vira Principal).
// Com sessão presente, o bearer de entrada segue descartado (cookie manda).
const OSDK_BEARER_PREFIX = "Bearer osdk_";

async function relayOsdk(
  req: NextRequest,
  targetUrl: string,
  bearer: string,
): Promise<NextResponse> {
  const init = await buildBackendInit(req, bearer.slice("Bearer ".length));
  const res = await fetch(targetUrl, init);
  if (isSSE(res)) return relayStream(res);
  return relayResponse(res, await res.arrayBuffer());
}

async function proxy(
  req: NextRequest,
  ctx: ProxyContext,
): Promise<NextResponse> {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const targetPath = ctx.pathSegments.join("/");
  // A forma simples das rotas públicas de pareamento chega sem o /api/v1 do
  // backend — remapeia ANTES de montar a URL (ver PUBLIC_NO_AUTH_BACKEND_PATH).
  //
  // 🔴 REGRA GERAL (2026-09-11): TODO router de produto (edge, connectors,
  // cctv, contagem-treino, contagem-aquecimento) é montado no backend com o
  // prefixo `/api/v1`; o catch-all consome o PRIMEIRO `/api`, então um
  // request público `/api/v1/...` chega aqui como `v1/...` e o encaminhar
  // cru dava 404 mudo (a UI de /cameras e /treinamentos mordia isso). O
  // remap explícito de edge/connectors (pairing) era só o caso conhecido;
  // agora a regra cobre qualquer `v1/*`. A forma dupla (`/api/api/v1/...`)
  // continua funcionando: vira `api/v1/...` → `/api/v1/...` no backend.
  const backendPath = PUBLIC_NO_AUTH_BACKEND_PATH[targetPath]
    ?? (targetPath === "v1" || targetPath.startsWith("v1/")
      ? `api/${targetPath}`
      : targetPath);
  const targetUrl = `${BACKEND_URL}/${backendPath}${req.nextUrl.search}`;
  if (!access) {
    const bearer = req.headers.get("authorization") ?? "";
    // 🔴 Qualquer Bearer token passa pro backend (edge_token do Desktop,
    // osdk_ do AutoSync, etc). O backend valida — não o proxy. Antes só
    // osdk_ passava, e o edge_token do Desktop era rejeitado → "Not Found"
    // nos Dispositivos. (2026-08-18)
    if (bearer.startsWith("Bearer ")) {
      return relayOsdk(req, targetUrl, bearer);
    }
    // Rotas públicas (sem cookie e sem Bearer): encaminha como está — o
    // backend valida o código/token. (2026-08-19)
    if (PUBLIC_NO_AUTH_PATHS.has(targetPath)) {
      const init = await buildBackendInit(req, null);
      const first = await fetch(targetUrl, init);
      if (isSSE(first)) return relayStream(first);
      return relayResponse(first, await first.arrayBuffer());
    }
    return NextResponse.json(
      { detail: "unauthenticated" },
      { status: 401 },
    );
  }

  const init = await buildBackendInit(req, access);
  const first = await fetch(targetUrl, init);
  if (first.status !== 401 || !refresh) {
    if (isSSE(first)) return relayStream(first);
    const body = await first.arrayBuffer();
    return relayResponse(first, body);
  }
  return tryRefreshAndRetry(req, targetUrl, refresh);
}

async function handler(
  req: NextRequest,
  ctxIn: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctxIn.params;
  return proxy(req, { pathSegments: path });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

// CORS preflight p/ SPA desacoplado (outdoor mobile, 2026-09-18, aplicado no
// G120 junto). O browser exige ACAO no OPTIONS antes do POST cross-origin;
// sem export OPTIONS o Next devolve 204 mudo e o pareamento morre com
// "Failed to fetch" no celular.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "600",
    },
  });
}
