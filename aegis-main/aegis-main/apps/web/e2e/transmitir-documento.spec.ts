import { test, expect } from '@playwright/test';

/**
 * T3-B — Transmitir: um Document vira link público read-only /m/{token}
 * (guest-token), aposentando o broadcast-stub morto. Prova o resolver público
 * + o render do documento no /m, num browser real.
 */

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('ferreira');
  await page.locator('#password').fill('CertPass-2026!');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('Transmitir: documento → link público /m/{token} read-only', async ({ page }) => {
  await login(page);
  const slug = `e2e-transmit-${Date.now()}`;

  // cria o doc (create não tem perm gate; ferreira pode) com uma seção
  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug,
      title: 'E2E Transmitir Doc',
      classification_level: 'publico',
      sections: [
        { id: 's1', heading: 'Resumo', kind: 'markdown', body: 'Conteudo publico compartilhavel.' },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  // transmite (ferreira tem security.briefings.broadcast)
  const tr = await page.request.post(`/api/platform/v23/notepad/${doc.id}/transmit`, {
    data: { ttl_hours: 24 },
  });
  expect(tr.ok()).toBeTruthy();
  const { token } = await tr.json();
  expect(String(token)).toContain('guest_');

  // abre o /m público (sem login) e confirma o render read-only do documento
  await page.goto(`/m/${token}`);
  await expect(page.getByTestId('m-document')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('E2E Transmitir Doc')).toBeVisible();
  await expect(page.getByText('Conteudo publico compartilhavel.')).toBeVisible();
  await expect(page.getByText('PÚBLICO', { exact: false })).toBeVisible(); // banner de classificação

  // cleanup
  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
