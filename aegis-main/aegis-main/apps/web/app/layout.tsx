import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { AuthShell } from '@/components/shell/auth-shell';
import { BACKEND_URL } from '@/lib/auth/backend';
import type { PublicBrandOut } from '@/lib/api';

// Slogan oficial Safe Core — fallback canônico do título da aba e da
// descrição. Espelha DEFAULT_LOGIN.slogan / login.subtitle.
const DEFAULT_TITLE_NAME = 'AEGIS';
const DEFAULT_SLOGAN = 'Clareza para decisões complexas.';
// Placeholder que o form da Marca pré-carrega (DEFAULT_MARCA.favicon_url).
// É persistido mesmo quando o operador NÃO escolheu um favicon próprio —
// tratá-lo como custom sobrescreveria o `app/icon.svg` (o ícone bonito que
// o Next injeta por convenção de arquivo) por um .ico inferior. Só um
// favicon GENUINAMENTE custom (≠ este placeholder) deve sobrepor o ícone.
const DEFAULT_FAVICON = '/favicon.ico';

/**
 * Onda M3 (2026-05-24) — título dinâmico da aba do navegador a partir da
 * marca do operador: `{nome da empresa} · {slogan}` (ex.: "Safe Core ·
 * Clareza para decisões complexas."). Lê a marca PÚBLICA do mesmo endpoint
 * que a /login usa (server-side, anônimo). Fallback para a marca AEGIS
 * canônica quando o backend não responde ou o tenant não personalizou.
 */
export async function generateMetadata(): Promise<Metadata> {
  let name = DEFAULT_TITLE_NAME;
  let slogan = DEFAULT_SLOGAN;
  let faviconUrl: string | null = null;
  try {
    // PERF/robustez: a marca é best-effort (tem fallback). NUNCA pode bloquear o render —
    // sem timeout, um backend lento/indisponível pendurava generateMetadata (que roda em
    // TODA página) por ~180s, deixando /login e /solutions inacessíveis. Timeout curto →
    // cai no fallback em ~2,5s.
    const res = await fetch(`${BACKEND_URL}/platform/v23/styles/brand/public`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const brand = (await res.json()) as Partial<PublicBrandOut>;
      if (typeof brand.company_name === 'string' && brand.company_name.trim()) {
        name = brand.company_name.trim();
      }
      // Slogan do tenant só quando ele personalizou a marca de login; caso
      // contrário mantém o slogan oficial Safe Core (o endpoint devolve o
      // subtítulo neutro da /login quando usa a marca padrão).
      if (
        brand.login_use_default === false &&
        typeof brand.slogan === 'string' &&
        brand.slogan.trim()
      ) {
        slogan = brand.slogan.trim();
      }
      if (
        typeof brand.favicon_url === 'string' &&
        brand.favicon_url.trim() &&
        brand.favicon_url.trim() !== DEFAULT_FAVICON
      ) {
        faviconUrl = brand.favicon_url.trim();
      }
    }
  } catch {
    // Best-effort: sem rede, usa a marca AEGIS canônica.
  }
  void faviconUrl; // legado — o favicon agora é SEMPRE o dinâmico (logo+accent).
  const title = `${name} · ${slogan}`;

  // metadataBase (origem pública) — necessário p/ os scrapers de rede social
  // resolverem o og:image relativo em URL absoluta. Deriva do host da request.
  let base: URL | undefined;
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host) base = new URL(`${proto}://${host}`);
  } catch {
    /* sem host → metadataBase indefinido (og:image cai no relativo) */
  }

  return {
    ...(base ? { metadataBase: base } : {}),
    title,
    description: slogan,
    applicationName: name,
    // FAVICON PADRÃO: sempre a logo LIGHT + a cor de destaque configuradas
    // (rota dinâmica /api/brand/favicon). Mesmo padrão em toda superfície.
    icons: { icon: '/api/brand/favicon' },
    // Preview de link (OG) também segue a MARCA: imagem dinâmica /api/brand/og
    // (logo+accent+nome) + nome/slogan resolvidos. summary_large_image = card grande.
    openGraph: {
      title, description: slogan, siteName: name, type: 'website',
      images: [{ url: '/api/brand/og', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image', title, description: slogan,
      images: ['/api/brand/og'],
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Sprint H1.7 (2026-05-22): lê cookie aegis_cp server-side pra
  // hidratar AuthShell com cp mode sem flash. Cookie é escrito pelo
  // próprio AuthShell quando detecta ?cp=1 na URL.
  const cookieStore = await cookies();
  const initialCpMode = cookieStore.get('aegis_cp')?.value === '1';

  return (
    <html lang="pt-BR">
      <head>
        {/* Polyfill p/ crypto.randomUUID — Web Crypto API só expõe
            randomUUID em "secure contexts" (HTTPS ou localhost).
            Acesso via IP da LAN (ex: http://192.168.1.65:3002) faz
            Next 15 / React 19 quebrarem com "crypto.randomUUID is
            not a function". Carregado como <script src> síncrono pra
            garantir execução antes de qualquer chunk do Next — o React
            19 trata <script dangerouslySetInnerHTML> como resource e
            pode deferir. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/crypto-polyfill.js" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="h-screen overflow-hidden">
        <AuthShell initialCpMode={initialCpMode}>{children}</AuthShell>
      </body>
    </html>
  );
}
