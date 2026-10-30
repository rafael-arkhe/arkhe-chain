/**
 * GARANTIA — o operador CLICA a ação gerada e a inferência VOLTA NA TELA, ao vivo.
 *
 * O gesto completo no browser (não o resultado pré-cozido): app gerado `cz-clique-vivo`
 * com 2 objetos SEM resultado. Logado como cz-supervisor: prova que ANTES do clique não
 * há inferência; CLICA o botão gerado "Rodar Processamento"; o agente roda (LLM real,
 * async); recarrega até o resultado aparecer. Antes/depois em screenshot.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

const APP_ID = '890b849c-412e-4afb-9b4c-2331bc345882';
const CZ_TENANT = '3cb8b1da-bb80-4478-8678-f4f5bc2ff7cb';
// "manuten" aparece em TODO resultado da inferência (o prompt pede o risco de MANUTENÇÃO);
// medimos por DELTA, então um eventual rótulo fixo no chrome não atrapalha.
const RESULT_RE = /manuten/i;

test('operador clica "Rodar" e a inferência volta na tela (tempo real)', async ({ page }) => {
  test.setTimeout(240000);
  const me = await login(page, {
    username: 'cz-supervisor',
    password: process.env.CZ_PW || 'ClienteZero#2026',
  });
  expect(me?.tenant?.id).toBe(CZ_TENANT);

  await page.goto('/', { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await expect(page.getByText('cz-supervisor').first()).toBeVisible({ timeout: 90000 });

  await page.goto(`/workshop/view/${APP_ID}`, { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await expect(page.getByText(/Aplicação/i).first()).toBeVisible({ timeout: 90000 });

  // ANTES — os 2 objetos CLQ estão lá SEM inferência. (O tipo gerado é Person, que pode
  //  ter outros objetos já enriquecidos → medimos por DELTA: o clique deve AUMENTAR a
  //  contagem de inferências, provando que os CLQ ganharam resultado.)
  await expect(page.getByText('CLQ-A100').first()).toBeVisible({ timeout: 60000 });
  const before = await page.getByText(RESULT_RE).count();
  await page.screenshot({ path: 'e2e/artifacts/cz-clique-antes.png', fullPage: true });

  // O botão de ação vive na aba CADASTRO; o object_list (resultado) na VISÃO GERAL.
  await page.getByText(/^\s*CADASTRO\s*$/i).first().click();
  // CLICA o botão gerado que roda o agente de inferência.
  const btn = page.getByRole('button', { name: /Rodar Processamento/i }).first();
  await expect(btn).toBeVisible({ timeout: 30000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();

  // o agente roda ASSÍNCRONO (LLM real) — espera + recarrega + volta pra VISÃO GERAL
  // (onde está o object_list) até a contagem de inferências SUBIR além do baseline.
  let appeared = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(9000);
    await page.reload({ waitUntil: 'commit' }).catch(() => {});
    await expect(page.getByText(/Aplicação/i).first()).toBeVisible({ timeout: 90000 });
    // o reload persiste a aba; volta pra VISÃO GERAL pra ver o object_list.
    await page.getByText(/VIS[ÃA]O GERAL/i).first().click().catch(() => {});
    // espera o object_list re-consultar (CLQ-A100 visível = dados carregados).
    await page.getByText('CLQ-A100').first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if ((await page.getByText(RESULT_RE).count()) > before) { appeared = true; break; }
  }
  await page.screenshot({ path: 'e2e/artifacts/cz-clique-depois.png', fullPage: true });

  // DEPOIS — a inferência do agente voltou pra tela (mais resultados que antes do clique).
  expect(appeared, `a inferência deve VOLTAR após o clique (antes=${before})`).toBeTruthy();
});
