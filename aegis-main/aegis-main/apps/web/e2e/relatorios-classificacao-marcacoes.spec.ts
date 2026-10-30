import { test, expect } from '@playwright/test';

/**
 * #5 — Classificação e Marcações no editor de /relatorios usam o combobox de
 * BUSCA (SelectField/popover), não mais o <select> nativo / mural de chips.
 * Prova: classificação abre, tem busca, escolhe e PERSISTE; marcações abrem como
 * popover de busca.
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('classificação via SelectField + marcações via combobox de busca (persiste)', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: { slug: `e2e-cls-${ts}`, title: 'E2E Classificacao', classification_level: 'restrito', sections: [] },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  await page.goto(`/relatorios?doc=${doc.id}`);
  await expect(page.getByTestId('rel-editor')).toBeVisible({ timeout: 20000 });

  // Classificação = combobox sólido (sem <select> nativo): abre, tem busca, escolhe.
  await page.getByTestId('rel-level').click();
  await expect(page.getByTestId('rel-level-input')).toBeVisible();
  const opt = page.getByTestId('rel-level-opt-sigiloso');
  const label = ((await opt.textContent()) || '').trim();
  await opt.click();
  // o gatilho passa a mostrar o RÓTULO escolhido (não o value cru).
  await expect(page.getByTestId('rel-level')).toContainText(label);

  // Marcações = popover de BUSCA (não chips sempre-visíveis): abre + tem busca.
  await page.getByTestId('rel-markings').click();
  await expect(page.getByTestId('rel-markings-input')).toBeVisible();
  await page.keyboard.press('Escape');

  // Salva → a classificação escolhida PERSISTE no backend.
  await page.getByTestId('rel-save').click();
  await expect(page.getByTestId('rel-msg')).toBeVisible({ timeout: 15000 });
  const after = await (await page.request.get(`/api/platform/v23/notepad/${doc.id}`)).json();
  expect(after.classification_level).toBe('sigiloso');

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
