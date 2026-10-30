import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

test('repro: modal Registrar câmera no painel-de-controle', async ({ page }) => {
  test.setTimeout(180000);
  await login(page); // admin (aegis) — tem perm de câmera
  await page.goto('/', { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.goto('/painel-de-controle/dados?aba=cameras', { waitUntil: 'commit', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const reg = page.getByTestId('cameras-registry-register');
  if ((await reg.count()) === 0) {
    await page.getByText(/^\s*Câmeras\s*$/i).first().click().catch(() => {});
    await page.waitForTimeout(4000);
  }
  await reg.first().waitFor({ timeout: 90000 });
  await reg.first().click();
  await page.getByTestId('register-camera-modal').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/artifacts/repro-camera-modal.png', fullPage: false });
});
