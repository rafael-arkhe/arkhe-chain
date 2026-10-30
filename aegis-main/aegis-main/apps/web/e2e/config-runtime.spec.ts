import { expect, test } from '@playwright/test';

/**
 * F1.2 — a config de mapa é servida em RUNTIME, não assada no bundle.
 *
 * Este spec roda contra um servidor iniciado SEM `NEXT_PUBLIC_*_TOKEN` e COM
 * `MAPBOX_TOKEN`/`CESIUM_ION_TOKEN` no ambiente do processo — exatamente a
 * forma do container de produção. É o gesto que prova a imagem única: o mesmo
 * artefato serve outro cliente trocando só a env.
 *
 * Como subir o servidor (host, não container):
 *   cd security-app
 *   NEXT_PUBLIC_MAPBOX_TOKEN= NEXT_PUBLIC_CESIUM_ION_TOKEN= \
 *   MAPBOX_TOKEN=mb-e2e-runtime CESIUM_ION_TOKEN=ion-e2e-runtime \
 *   npx next dev -p 3002
 *   npx playwright test e2e/config-runtime.spec.ts
 *
 * Os valores esperados vêm por env para o spec não fixar segredo nenhum.
 */
const MAPBOX_ESPERADO = process.env.E2E_MAPBOX_ESPERADO || 'mb-e2e-runtime';
const CESIUM_ESPERADO = process.env.E2E_CESIUM_ESPERADO || 'ion-e2e-runtime';

test('GET /api/config entrega os tokens da env do PROCESSO', async ({ request }) => {
  const res = await request.get('/api/config');

  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({
    mapboxToken: MAPBOX_ESPERADO,
    cesiumIonToken: CESIUM_ESPERADO,
  });
});

test('a config é ANÔNIMA — as superfícies de convidado renderizam mapa sem cookie', async ({
  request,
}) => {
  // Sem storageState, sem cookie de sessão: é o /m/<token> e a SPA /visitante.
  const res = await request.get('/api/config');

  expect(res.status()).toBe(200);
  expect(res.status()).not.toBe(401);
});

test('a config não é cacheável — trocar o token vale no próximo reload', async ({ request }) => {
  const res = await request.get('/api/config');

  expect(res.headers()['cache-control']).toMatch(/no-store/);
});

test('a rota não ecoa a env do servidor — só os dois campos declarados', async ({ request }) => {
  const corpo = await (await request.get('/api/config')).json();

  expect(Object.keys(corpo).sort()).toEqual(['cesiumIonToken', 'mapboxToken']);
});

test('o gate de auth continua de pé: outra rota de /api sem cookie dá 401', async ({ request }) => {
  // Guarda: liberar /api/config no middleware não pode ter aberto /api inteiro.
  const res = await request.get('/api/ontology/objects');

  expect(res.status()).toBe(401);
});

test('o token NÃO está inlinado no bundle servido ao browser', async ({ page }) => {
  // O coração da entrega. Antes, o token literal viajava dentro do .js público;
  // se voltar a viajar, a imagem volta a ser uma-por-cliente.
  const scripts: string[] = [];
  page.on('response', async (res) => {
    if (!res.url().includes('/_next/static/')) return;
    if (!res.url().endsWith('.js')) return;
    try {
      scripts.push(await res.text());
    } catch {
      /* resposta já descartada — ignora */
    }
  });

  await page.goto('/login', { waitUntil: 'networkidle' });

  expect(scripts.length).toBeGreaterThan(0);
  for (const js of scripts) {
    expect(js).not.toContain(MAPBOX_ESPERADO);
    expect(js).not.toContain(CESIUM_ESPERADO);
  }
});
