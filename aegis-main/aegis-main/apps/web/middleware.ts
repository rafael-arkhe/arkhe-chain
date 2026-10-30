/**
 * Authentication gate.
 *
 * Defense-grade rule: o access cookie é httpOnly, então este middleware
 * NÃO consegue ler o valor (nem o JWT public key é enviado pro edge).
 * Apenas checa a PRESENÇA e redireciona não-autenticados pra /login.
 * A verificação real acontece no proxy (`app/api/[...path]/route.ts`)
 * e no backend.
 *
 * Allow-list: /login + os endpoints de auth + assets estáticos + qualquer
 * arquivo com extensão (svg/png/js/css/etc).
 *
 * Espelha politicians-app/middleware.ts.
 */
import { NextRequest, NextResponse } from 'next/server';

import { ACCESS_COOKIE } from '@/lib/auth/cookies';

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  // M2 (2026-05-24) — marca pública da tela /login. A /login (pré-auth)
  // precisa ler a marca do tenant antes do cookie de acesso existir.
  '/api/styles/brand/public',
  // Favicon/OG dinâmicos (logo light + accent da marca) — ANÔNIMOS: o browser
  // e os scrapers de rede social buscam sem cookie. Padrão em toda superfície.
  '/api/brand',
  // F1.2 (2026-08-02) — config de RUNTIME (tokens de mapa). Anônima porque as
  // superfícies de convidado (/m/<token>, /visitante) renderizam mapa sem
  // cookie de acesso. São tokens de CLIENTE, que o browser precisa ter em mãos
  // de qualquer forma; antes desta rota viajavam dentro do bundle público.
  '/api/config',
  // Onda 2 (2026-05-25) — superfície pública do morador (token de convidado).
  // /m/<token> é a página sem chrome; /api/public/* é o proxy anônimo pro backend.
  '/m',
  '/api/public',
  // Onda 1 — SPA do visitante (livetracker) servida same-origin como estático
  // em public/visitante/. Anônima: o guest token viaja no ?hash= (o backend
  // valida). Assets (/visitante/assets/*.js) já passam pela regra de extensão;
  // o index.html precisa deste prefixo.
  '/visitante',
  // Safe Tag Kiosk WebView (vitrine push sem cards) — pareado como EdgeNode
  // kind safetag_kiosk, mas a PÁGINA é pública (o pareamento é dentro dela);
  // o middleware só gateia a API; a página estática deve passar sem cookie.
  '/webview',
  '/kiosk',
  '/_next',
  '/favicon.ico',
  '/logo-white.svg',
  '/cesium',
  '/public',
  '/crypto-polyfill.js',
];

// Rotas do BACKEND que são públicas por design (2026-08-19): o primeiro
// pareamento do Desktop/FAB ainda não tem cookie nem edge_token — o próprio
// endpoint valida o código. Não usar prefix: `pairing-codes` (operador) tem
// que continuar atrás do gate. O proxy ([...path]/route.ts) espelha esta lista.
//
// 🔴 O pathname é o CRU, sem normalização: o Desktop posta `{base}/api/v1/edge/pair`
// com a base JÁ terminando em `/api` (config.rs normalizar_base) → o pathname
// real que chega aqui é `/api/api/v1/edge/pair` (duplo). O proxy vê o path SEM
// o primeiro `/api` (o Next o consome na rota [...path]) — por isso o proxy casa
// a forma simples e o middleware precisa da dupla. Manter AMBAS.
const PUBLIC_NO_AUTH_API = [
  '/api/api/v1/edge/pair',
  '/api/api/v1/connectors/pair',
  '/api/v1/edge/pair',
  '/api/v1/connectors/pair',
  // 🔴 PROBE de base do AEGIS Desktop (2026-08-20): o app descobre se a base
  // termina em /api perguntando GET {base}/health. Sem esta rota pública, o
  // middleware 401a /api/health e o Desktop cai na base SEM /api → TODAS as
  // chamadas edge (pair, heartbeat, dispositivos, stream) viram forma simples
  // e o proxy encaminha /v1/edge/* → 404 no backend ("Nunca conectou").
  '/api/health',
];

function isPublic(pathname: string): boolean {
  if (
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return true;
  }
  // Qualquer arquivo com extensão (assets estáticos) — deixa o Next servir.
  if (/\.(svg|png|jpg|jpeg|gif|ico|webp|css|js|map|woff2?|json)$/i.test(pathname)) {
    return true;
  }
  return false;
}

// As SPAs da Safe Tag (livemap/guestalerts em /portaria; livetracker/residentmap
// em /visitante,/morador) são estáticas com asset de nome ESTÁVEL (js/app.js sem
// hash). O Next serve public/ com `Cache-Control: max-age=14400` (4h) e o
// `headers()` do next.config NÃO cobre public/ → o browser servia a versão VELHA
// após re-deploy ("nada mudou no widget"). O middleware SIM alcança o estático:
// força revalidação nesses paths.
const SPA_ASSET_RE = /^\/(portaria|visitante|morador)\//;
function noCacheForSpa(res: NextResponse, pathname: string): NextResponse {
  if (SPA_ASSET_RE.test(pathname)) {
    res.headers.set('Cache-Control', 'no-cache, must-revalidate');
  }
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return noCacheForSpa(NextResponse.next(), pathname);
  const hasAccess = !!req.cookies.get(ACCESS_COOKIE)?.value;
  if (hasAccess) return noCacheForSpa(NextResponse.next(), pathname);
  // API → 401 JSON (client decide se redireciona). Navegação → /login.
  if (pathname.startsWith('/api/')) {
    // Preflight CORS do SPA desacoplado (2026-09-18, aplicado no G120 junto):
    // o browser nunca manda Authorization no OPTIONS, então o preflight morria
    // no gate com "Failed to fetch". Deixa chegar na rota — quem responde é o
    // export OPTIONS do proxy, com ACAO. O request real continua gateado
    // (Bearer validado no backend).
    if (req.method === 'OPTIONS') return NextResponse.next();
    // Pareamento edge/connector: rota pública do backend (valida o código).
    if (PUBLIC_NO_AUTH_API.includes(pathname)) return NextResponse.next();
    // Auth programático (AutoSync/OSDK/Desktop edge): sem cookie, um Bearer
    // conta como credencial PRESENTE — este gate só checa presença; quem valida
    // é o backend, via relay do proxy ([...path]/route.ts). Qualquer Bearer
    // passa desde 2026-08-18 (proxy relay edge_token, osdk_, etc) — o gate não
    // pode ser mais restrito que o proxy. Só vale para /api/*: navegação de
    // página continua exigindo sessão.
    const bearer = req.headers.get('authorization') ?? '';
    if (bearer.startsWith('Bearer ')) return NextResponse.next();
    return NextResponse.json({ detail: 'unauthenticated' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
