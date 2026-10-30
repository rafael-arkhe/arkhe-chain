import { test, expect } from '@playwright/test';

/**
 * T3 — clareza das 2 vistas do MESMO Document: /relatorios (redigir) ⇄
 * /briefings (apresentar). O atalho cruzado leva a MESMA seleção via ?doc=.
 */

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('cross-link: Apresentar (/relatorios) ⇄ Editar (/briefings) preserva a seleção', async ({ page }) => {
  await loginAdmin(page);
  const slug = `e2e-xlink-${Date.now()}`;

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug,
      title: 'E2E Crosslink',
      classification_level: 'restrito',
      sections: [{ id: 's1', heading: 'Resumo', kind: 'markdown', body: 'Conteudo crosslink.' }],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  // /relatorios → seleciona → Apresentar → cai em /briefings já com o doc
  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();
  await page.getByTestId('rel-present-link').click();
  await page.waitForURL(/\/briefings\?doc=/, { timeout: 15000 });
  await expect(page.getByTestId('briefings-doc')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Conteudo crosslink.')).toBeVisible();

  // volta: Editar em Relatórios → /relatorios já com o doc aberto
  await page.getByTestId('briefings-edit-link').click();
  await page.waitForURL(/\/relatorios\?doc=/, { timeout: 15000 });
  await expect(page.getByTestId('rel-editor')).toBeVisible({ timeout: 15000 });

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
