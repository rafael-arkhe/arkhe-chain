import { test, expect } from '@playwright/test';

/**
 * T3-D — /briefings apresenta um Document (unificado com /relatorios). Modo A/B/C
 * com EFEITO REAL (filtra seções), Apresentar full-bleed, Transmitir via /m/{token}.
 */

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/briefings');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('briefings (admin): apresenta documento, Modo real, Apresentar e Transmitir', async ({ page }) => {
  await loginAdmin(page);
  const slug = `e2e-brief-${Date.now()}`;

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug,
      title: 'E2E Briefing',
      classification_level: 'confidencial',
      sections: [
        { id: 's1', heading: 'Sintese', kind: 'narrative', generated: { body: 'Resumo narrativo da IA.', citations: [] } },
        { id: 's2', heading: 'Notas', kind: 'markdown', body: 'Texto operacional manual.' },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  await page.goto('/briefings');
  await page.getByTestId(`briefings-item-${doc.id}`).click();
  await expect(page.getByTestId('briefings-doc')).toBeVisible();
  // modo default = operacional → narrativa + markdown
  await expect(page.getByText('Resumo narrativo da IA.')).toBeVisible();
  await expect(page.getByText('Texto operacional manual.')).toBeVisible();

  // Modo Resumo → só narrativa (efeito REAL: markdown sai do DOM)
  await page.getByTestId('briefings-modo-resumo').click();
  await expect(page.getByText('Resumo narrativo da IA.')).toBeVisible();
  await expect(page.getByText('Texto operacional manual.')).toHaveCount(0);

  // Apresentar full-bleed
  await page.getByTestId('briefings-present').click();
  await expect(page.getByTestId('briefings-presentation')).toBeVisible();
  await page.getByTestId('briefings-present-exit').click();
  await expect(page.getByTestId('briefings-presentation')).toHaveCount(0);

  // Transmitir (admin tem broadcast)
  await page.getByTestId('briefings-transmit').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await expect(page.locator('code')).toContainText('/m/guest_');
  await page.getByTestId('confirm-ok').click();

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
