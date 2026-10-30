import { test, expect } from '@playwright/test';

/**
 * T3-E — a seção de documento agora oferece o CATÁLOGO PLENO de widgets
 * (não as 3 caixinhas). Prova: palette com presentational + data widgets,
 * e o widget escolhido renderiza ao vivo no documento.
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('seção de widget: palette PLENA do catálogo + render ao vivo', async ({ page }) => {
  await loginAdmin(page);
  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug: `e2e-widget-${Date.now()}`,
      title: 'E2E Widget Palette',
      classification_level: 'restrito',
      sections: [],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();

  // adiciona uma seção de WIDGET → a palette plena aparece
  await page.getByTestId('rel-add-widget').click();
  await expect(page.getByTestId('widget-palette')).toBeVisible({ timeout: 15000 });

  // catálogo pleno: blocos-base (T3-F/F2) + data widgets + viz — não as 3 caixinhas
  await expect(page.getByTestId('widget-palette-callout')).toBeVisible();
  await expect(page.getByTestId('widget-palette-checklist')).toBeVisible();
  await expect(page.getByTestId('widget-palette-code_block')).toBeVisible();
  await expect(page.getByTestId('widget-palette-figure')).toBeVisible();
  await expect(page.getByTestId('widget-palette-object_table_v2')).toBeVisible();
  await expect(page.getByTestId('widget-palette-chart_xy')).toBeVisible();

  // widgets INTERATIVOS não cabem num documento/apresentação — fora da palette
  await expect(page.getByTestId('widget-palette-filter_pills')).toHaveCount(0);
  await expect(page.getByTestId('widget-palette-button_group')).toHaveCount(0);
  await expect(page.getByTestId('widget-palette-search_input')).toHaveCount(0);
  await expect(page.getByTestId('widget-palette-form_builder')).toHaveCount(0);

  // escolhe um bloco presentational → renderiza ao vivo no documento
  await page.getByTestId('widget-palette-callout').click();
  await expect(page.getByTestId('callout-widget')).toBeVisible({ timeout: 15000 });

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
