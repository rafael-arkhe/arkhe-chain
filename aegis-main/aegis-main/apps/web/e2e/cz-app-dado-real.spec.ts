/**
 * ONDA 5 — app cliente-zero LIGADO A DADO REAL da ontologia.
 *
 * Loga como cz-supervisor (tenant cliente-zero), abre o app persistido
 * `cz-operacao-frota` e prova que os object_table_v2 renderizam DADO REAL
 * resolvido da ontologia (a frota que o cz-analyst cadastrou + as detecções
 * CFTV reais), não mock. Screenshot fica como evidência de venda.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

const APP_ID = '4905bbf7-6970-41e0-9e3b-3d8923c87ef0';
const CZ_TENANT = '3cb8b1da-bb80-4478-8678-f4f5bc2ff7cb';

test('app cliente-zero renderiza dado REAL (frota + detecções CFTV)', async ({ page }) => {
  test.setTimeout(150000);
  const me = await login(page, {
    username: 'cz-supervisor',
    password: process.env.CZ_PW || 'ClienteZero#2026',
  });
  expect(me, 'login cz-supervisor deve suceder').not.toBeNull();
  expect(me?.tenant?.id, 'principal deve estar no tenant cliente-zero').toBe(CZ_TENANT);

  // domcontentloaded: não espera 'load' (resolução de 1644 linhas mantém a rede ocupada)
  await page.goto(`/workshop/view/${APP_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  // eslint-disable-next-line no-console
  console.log('[cz-e2e] URL após goto:', page.url());
  await page.screenshot({ path: 'e2e/artifacts/cz-app-debug.png', fullPage: true });

  // DADO REAL #1 — placas da frota cadastradas pelo cz-analyst (nós `caminhao` da ontologia)
  await expect(page.getByText('MNR-1A01').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('MNR-12M2').first()).toBeVisible({ timeout: 15000 });
  // o TIPO do objeto vem da ontologia (node_type), não é mock
  await expect(page.getByText('caminhao').first()).toBeVisible({ timeout: 15000 });
  // DADO REAL #2 — detecção CFTV real (nó `Observation` da câmera)
  await expect(page.getByText(/car #1\d/i).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Observation').first()).toBeVisible({ timeout: 15000 });

  await page.screenshot({
    path: 'e2e/artifacts/cz-app-dado-real.png',
    fullPage: true,
  });
});
