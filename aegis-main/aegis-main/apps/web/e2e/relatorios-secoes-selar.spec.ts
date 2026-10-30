import { test, expect } from '@playwright/test';

/**
 * T3-C — /relatorios rico (compositor de seções).
 *
 * Fluxo do SUPERVISOR (ferreira: tem relatorios.close, não edit — separação de
 * funções): abre um documento de seções, vê o conteúdo read-only (fallback do
 * compositor) e SELA (assinatura digital). O fluxo de edição/geração do analyst
 * é coberto por jest (relatorios-page) + o endpoint generate provado ao vivo (T3-A).
 */

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('ferreira');
  await page.locator('#password').fill('CertPass-2026!');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('relatorios: seções read-only (supervisor) + selar documento', async ({ page }) => {
  await login(page);
  const slug = `e2e-relc-${Date.now()}`;

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug,
      title: 'E2E Relatorio C',
      classification_level: 'restrito',
      sections: [
        { id: 's1', heading: 'Resumo', kind: 'markdown', body: 'Conteudo do relatorio C.' },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();

  // supervisor (sem edit) vê as seções read-only (fallback do compositor)
  await expect(page.getByTestId('rel-sections-preview')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Conteudo do relatorio C.')).toBeVisible();

  // selar (ferreira tem security.relatorios.close)
  await page.getByTestId('rel-seal').click();
  await page.getByTestId('confirm-ok').click(); // confirmModal "Selar documento"
  await expect(page.getByTestId('rel-msg')).toContainText(/Selado/i, { timeout: 15000 });

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
