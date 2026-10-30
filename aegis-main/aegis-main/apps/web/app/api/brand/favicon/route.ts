/**
 * Favicon DINÂMICO padronizado: sempre a LOGO LIGHT + a COR DE DESTAQUE
 * configuradas no AEGIS (painel → Marca). Serve um SVG (crisp em qualquer
 * tamanho, sem rasterizar — a logo costuma ser SVG). Usado pelo security-app E
 * pelos SPAs de portaria/visitante (mesma origem → `/api/brand/favicon`), pra
 * ter UM padrão de ícone em tudo. Best-effort: sem marca cai no ícone neutro.
 */
import { BACKEND_URL } from '@/lib/auth/backend';

export const dynamic = 'force-dynamic';

const DEFAULT_ACCENT = '#2D77BE';
const HEX = /^#[0-9a-fA-F]{3,8}$/;

async function fetchBrand(): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${BACKEND_URL}/platform/v23/styles/brand/public`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (r.ok) return (await r.json()) as Record<string, unknown>;
  } catch {
    /* best-effort */
  }
  return {};
}

/** Baixa a logo do BACKEND (direto, não pelo self-relay — que falha em loop
 *  pelo túnel) e devolve um data: URI pra embutir no SVG. Traduz o caminho do
 *  relay (/api/public/brand-asset/{t}/{n}) pro endpoint do backend. */
async function logoDataUri(path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !path) return null;
  const m = path.match(/^\/api\/public\/brand-asset\/(.+)$/);
  const target = m
    ? `${BACKEND_URL}/platform/v23/styles/asset/logo/${m[1]}`
    : path.startsWith('http')
      ? path
      : null;
  if (!target) return null;
  try {
    const r = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/svg+xml';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) return null;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET() {
  const brand = await fetchBrand();
  const rawAccent = String(brand.brand_primary_color || brand.primary_color || '');
  const accent = HEX.test(rawAccent) ? rawAccent : DEFAULT_ACCENT;
  const logo = await logoDataUri(brand.brand_logo_url || brand.logo_url);

  // Padrão do DS: cantos retos, superfície clara, ACENTO único. Logo light
  // centrada com respiro; barra da cor de destaque embaixo (assinatura da marca).
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<rect width="256" height="256" fill="#ffffff"/>` +
    (logo
      ? `<image href="${logo}" x="30" y="30" width="196" height="164" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="88" y="72" width="80" height="80" fill="${accent}"/>`) +
    `<rect x="0" y="214" width="256" height="42" fill="${accent}"/>` +
    `</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
    },
  });
}
