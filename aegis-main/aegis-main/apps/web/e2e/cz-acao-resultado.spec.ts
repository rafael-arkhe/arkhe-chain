/**
 * GARANTIA — a AÇÃO gerada roda e o RESULTADO volta pro operador, ao vivo.
 *
 * O app `cz-acao-frota` (gerado pelo Arquiteto) tem 3 objetos e uma ação
 * `aegis.agent.run`. A ação foi INVOCADA (o caminho REAL do botão: invoke_action →
 * SyncRun succeeded → agente com LLM real escreveu `risco_manutencao` em cada nó).
 * Aqui, logado como cz-supervisor, abrimos o app e provamos que o object_list mostra
 * os objetos COM o resultado da inferência (secondary_field = output_property) — o
 * operador VÊ o resultado voltar, não só um botão morto.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

const APP_ID = 'a15b18d6-dd96-43a0-80a1-87b234bbec5c';
const CZ_TENANT = '3cb8b1da-bb80-4478-8678-f4f5bc2ff7cb';

test('resultado da ação gerada (inferência) aparece no app', async ({ page }) => {
  test.setTimeout(150000);
  const me = await login(page, {
    username: 'cz-supervisor',
    password: process.env.CZ_PW || 'ClienteZero#2026',
  });
  expect(me?.tenant?.id).toBe(CZ_TENANT);

  await page.goto('/', { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await expect(page.getByText('cz-supervisor').first()).toBeVisible({ timeout: 90000 });

  await page.goto(`/workshop/view/${APP_ID}`, { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await expect(page.getByText('OPERAÇÃO').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/Aplicação/i).first()).toBeVisible({ timeout: 90000 });

  // o objeto (instância real) aparece na lista...
  await expect(page.getByText('MNR-1A01').first()).toBeVisible({ timeout: 60000 });
  // ...E o RESULTADO da inferência do agente está visível (texto de manutenção).
  await expect(
    page.getByText(/manuten|inspeç|lubrific|rolamento/i).first(),
  ).toBeVisible({ timeout: 30000 });

  await page.screenshot({ path: 'e2e/artifacts/cz-acao-resultado.png', fullPage: true });
});
