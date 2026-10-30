/**
 * Pós-1.0 do aegis-platform-sdk — gesto do operador AO VIVO na Loja.
 *
 * lib/api/solucoes-marketplace agora delega ao SDK (modo proxy). O spec
 * prova que a Loja carrega de ponta a ponta com a chamada de listings
 * saindo do SDK: GET /api/solutions/marketplace/listings responde 200
 * autenticado via cookie httpOnly e a página monta sem erro de console.
 *
 * Roda: npx playwright test loja-sdk-pos10.spec.ts
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('pós-1.0: Loja alimentada pelo SDK — listings 200 via cookie proxy', async ({ page }) => {
  test.setTimeout(180000); // 1º hit em dev compila a rota antes das fetches

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await login(page);

  const listingsRes = page.waitForResponse(
    (r) => r.url().includes('/api/solutions/marketplace/listings'),
    { timeout: 120000 },
  );

  await page.goto('/painel-de-controle/loja', { waitUntil: 'domcontentloaded' });

  expect((await listingsRes).status()).toBe(200);

  const relevant = errors.filter(
    (e) => !/ResizeObserver|favicon|401|hydrat/i.test(e),
  );
  expect(relevant, `erros de console inesperados:\n${relevant.join('\n')}`).toHaveLength(0);
});
