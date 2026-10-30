import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readAegisSdkVersion() {
  const candidates = [
    path.resolve(__dirname, '../aegis-python-sdk/pyproject.toml'),
    path.resolve(__dirname, '../../aegis-python-sdk/pyproject.toml'),
  ];
  for (const file of candidates) {
    try {
      const toml = fs.readFileSync(file, 'utf8');
      const match = toml.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
      if (match) return match[1];
    } catch {}
  }
  return 'dev';
}

// Na imagem de produção o repo vizinho do SDK não existe no contexto de build,
// então o CI injeta a versão por env. Fora dela, lê do pyproject como sempre.
const AEGIS_SDK_VERSION = process.env.AEGIS_SDK_VERSION || readAegisSdkVersion();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  devIndicators: { buildActivity: false, appIsrStatus: false },
  env: {
    NEXT_PUBLIC_AEGIS_SDK_VERSION: AEGIS_SDK_VERSION,
  },
  // Sprint H1.3 → H1.5 (2026-05-22): URLs antigas redirecionam pras
  // novas. H1.3 migrou /configuracoes → painel/preferencias; H1.5
  // renomeou pra /conta, /browser, /notificacoes (sem prefixo
  // "preferencias", que duplicava categoria). Memory
  // feedback_no_deprecation_of_existing_code: ADD or DELETE.
  // Onda 3 Safe Tag hardening (2026-07-09): antes NÃO havia headers() → o shell
  // era embutível por QUALQUER origem (clickjacking). `frame-ancestors 'self'`
  // fecha isso e ainda permite o embed same-origin das SPAs de portaria
  // (experience_kind:'embed', Onda 3b). Ver docs/safetag-aegis/dev-onda3-portaria.md.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // H1.3 chain (kept para bookmarks pré-iter5)
      { source: '/configuracoes', destination: '/painel-de-controle/conta', permanent: true },
      { source: '/configuracoes/browser', destination: '/painel-de-controle/browser', permanent: true },
      // H1.5 — urls criadas em H1.3 redirecionam pras novas
      { source: '/painel-de-controle/preferencias', destination: '/painel-de-controle/conta', permanent: true },
      { source: '/painel-de-controle/preferencias/browser', destination: '/painel-de-controle/browser', permanent: true },
      { source: '/painel-de-controle/preferencias/notificacoes', destination: '/painel-de-controle/notificacoes', permanent: true },
    ];
  },
  webpack: (config, { isServer, webpack }) => {
    // @spz-loader/core (transitiva do @cesium/engine, GltfSpzLoader) inlina um
    // WASM Emscripten como TEMPLATE STRING que o minificador SWC quebra em
    // escape OCTAL inválido → ChunkLoadError no /geo. O mapa é de PONTOS, nunca
    // usa Gaussian Splats (SPZ), então apontamos pra um stub — some o WASM
    // quebrado do bundle. Client E server (o Cesium pode ser tocado nos dois).
    config.resolve.alias = {
      ...config.resolve.alias,
      '@spz-loader/core': path.resolve(__dirname, 'lib/stubs/spz-loader.js'),
    };
    if (!isServer) {
      config.plugins.push(
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify('/cesium'),
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        http: false,
        https: false,
        zlib: false,
        url: false,
        // PERF #5 (2026-06-28): `vega-canvas` (transitiva do `vega-embed` usado
        // pelo widget vega_chart) referencia o pacote nativo OPCIONAL `canvas`
        // (node-canvas), que só serve pra render server-side. No browser usamos
        // o <canvas> nativo, então não instalamos node-canvas. Sem este fallback
        // o webpack do CLIENTE falha com "Can't resolve 'canvas'". → módulo vazio.
        canvas: false,
      };
    } else {
      // PERF #5 (2026-06-28): no SERVER, `canvas` é dependência nativa OPCIONAL
      // do `vega-canvas` que NUNCA roda aqui (vega_chart é client-only via
      // next/dynamic ssr:false). Marca como external pra o webpack não tentar
      // empacotar/resolver `vega-canvas.node.js` → fim do "Can't resolve 'canvas'".
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, 'canvas']
        : config.externals
          ? [config.externals, 'canvas']
          : ['canvas'];
    }
    return config;
  },
};

export default nextConfig;
