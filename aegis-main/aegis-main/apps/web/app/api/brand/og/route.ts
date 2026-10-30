/**
 * Imagem de PREVIEW DE LINK (Open Graph) DINÂMICA e padronizada: segue a MARCA
 * configurada no AEGIS — logo light + cor de destaque + nome/slogan. Serve um SVG
 * 1200×630 (sem rasterizar/fontes embutidas; o título/descrição do metadata já
 * aparecem em qualquer rede). UM padrão pro security-app E pros SPAs (mesma
 * origem → `/api/brand/og`). Best-effort.
 */
import { BACKEND_URL } from '@/lib/auth/backend';

export const dynamic = 'force-dynamic';

const DEFAULT_ACCENT = '#2D77BE';
const DEFAULT_NAME = 'AEGIS';
const DEFAULT_SLOGAN = 'Clareza para decisões complexas.';
const HEX = /^#[0-9a-fA-F]{3,8}$/;

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string),
  );
}

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
  const name = esc(String(brand.company_name || brand.pwa_name || DEFAULT_NAME).slice(0, 40));
  const slogan = esc(
    String(
      brand.login_use_default === false && brand.slogan ? brand.slogan : DEFAULT_SLOGAN,
    ).slice(0, 80),
  );
  const logo = await logoDataUri(brand.brand_logo_url || brand.logo_url);
  const font = "'Segoe UI',Roboto,Arial,sans-serif";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="#ffffff"/>` +
    `<rect x="0" y="0" width="1200" height="14" fill="${accent}"/>` +
    (logo
      ? `<image href="${logo}" x="90" y="140" width="440" height="190" preserveAspectRatio="xMinYMid meet"/>`
      : '') +
    `<text x="92" y="440" font-family="${font}" font-size="76" font-weight="700" fill="#0A0E14">${name}</text>` +
    `<text x="94" y="500" font-family="${font}" font-size="34" fill="#5B6B7C">${slogan}</text>` +
    `<rect x="0" y="616" width="1200" height="14" fill="${accent}"/>` +
    `</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
    },
  });
}
