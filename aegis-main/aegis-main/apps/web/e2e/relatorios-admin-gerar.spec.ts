import { test, expect } from '@playwright/test';

/**
 * T3-C — certificação do gesto do ANALYST (edit + geração-via-UI) com admin
 * (perms plenas). Abre o compositor, adiciona uma seção narrativa, escreve a
 * instrução e GERA com IA (LLM real, auditado) — corpo gerado aparece na tela.
 */

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('relatorios (admin): compositor + Gerar com IA renderiza o corpo gerado', async ({ page }) => {
  test.setTimeout(120000); // geração = LLM real (lento)
  await loginAdmin(page);
  const slug = `e2e-reladm-${Date.now()}`;

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug,
      title: 'E2E Relatorio Admin',
      classification_level: 'restrito',
      sections: [
        {
          id: 'ctx',
          heading: 'Contexto',
          kind: 'markdown',
          body: 'Investigado Joao da Silva: 3 ocorrencias por furto em SP; veiculo ABC1234.',
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();

  // admin tem relatorios.edit → vê o COMPOSITOR (não o fallback read-only)
  await expect(page.getByTestId('rel-composer')).toBeVisible({ timeout: 15000 });

  // adiciona uma seção narrativa (a 0 é a markdown de contexto)
  await page.getByTestId('rel-add-narrative').click();
  await page.getByTestId('rel-section-prompt-1').fill('Resuma o contexto do investigado em 1 frase.');
  await page.getByTestId('rel-section-generate-1').click();

  // corpo gerado (LLM real) aparece — a marca-d'água de IA é o sinal estável
  await expect(page.getByText(/auxílio de IA/i)).toBeVisible({ timeout: 90000 });

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
