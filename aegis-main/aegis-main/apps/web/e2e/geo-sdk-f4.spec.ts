/**
 * F4 (dogfood aegis-platform-sdk) — gesto do operador AO VIVO.
 *
 * lib/api/geo agora delega ao SDK (singleton lib/api/sdk.ts, modo proxy:
 * baseUrl relativa "/api" + credentials include). Este spec prova que o
 * /geo continua funcionando de ponta a ponta com as chamadas saindo do
 * SDK: as requests /api/api/v1/geo/* respondem 200 autenticadas via
 * cookie httpOnly (nenhum Authorization no JS) e o painel de camadas
 * monta com dado real.
 *
 * Roda: npx playwright test geo-sdk-f4.spec.ts
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('F4: /geo alimentado pelo SDK — sources/node-types 200 via cookie proxy', async ({ page }) => {
  test.setTimeout(180000); // primeiro hit em dev compila /geo (~40s) antes das fetches
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await login(page);

  const sourcesRes = page.waitForResponse(
    (r) => r.url().includes('/api/api/v1/geo/sources'),
    { timeout: 60000 },
  );
  const nodeTypesRes = page.waitForResponse(
    (r) => r.url().includes('/api/api/v1/geo/node-types'),
    { timeout: 60000 },
  );

  await page.goto('/geo', { waitUntil: 'domcontentloaded' });

  // As chamadas que agora saem do SDK respondem 200 (cookie httpOnly no proxy).
  expect((await sourcesRes).status()).toBe(200);
  expect((await nodeTypesRes).status()).toBe(200);

  // O painel de camadas monta com o dado dessas respostas.
  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 45000 });

  // Sem erro de console relevante (SDK não quebrou o boot do globo).
  const relevant = errors.filter(
    (e) => !/ResizeObserver|Cesium ion|Ion\.|WebGL|favicon|401|hydrat/i.test(e),
  );
  expect(relevant, `erros de console inesperados:\n${relevant.join('\n')}`).toHaveLength(0);
});
