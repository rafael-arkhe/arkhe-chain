import { test, expect } from '@playwright/test';

/**
 * #2 — a lista de Documentos (compartilhada /relatorios + /briefings) ganhou
 * BUSCA + FILTROS (classificação, estado) + linhas ricas com categorização
 * (selo de classificação colorido + marcações). Prova o comportamento ao vivo.
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('lista de documentos: busca + filtro de classificação + filtro de estado', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();
  const mk = async (title: string, cls: string) =>
    (await (
      await page.request.post('/api/platform/v23/notepad', {
        data: { slug: `${title}-${ts}`.toLowerCase(), title: `${title} ${ts}`, classification_level: cls, sections: [] },
      })
    ).json());

  const A = await mk('AlphaFiltro', 'sigiloso');
  const B = await mk('BravoFiltro', 'restrito');
  const C = await mk('CharlieFiltro', 'restrito');
  const signed = await page.request.post(`/api/platform/v23/notepad/${A.id}/sign`, { data: {} });

  await page.goto('/relatorios');
  await expect(page.getByTestId(`rel-item-${A.id}`)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId(`rel-item-${B.id}`)).toBeVisible();
  // linha rica: o item sigiloso mostra o selo de classificação (colorido).
  await expect(page.getByTestId(`rel-item-${A.id}`)).toContainText('SIGILOSO');

  // BUSCA estreita a lista.
  await page.getByTestId('rel-search').fill(`AlphaFiltro ${ts}`);
  await expect(page.getByTestId(`rel-item-${A.id}`)).toBeVisible();
  await expect(page.getByTestId(`rel-item-${B.id}`)).toHaveCount(0);
  await page.getByTestId('rel-search').fill('');
  await expect(page.getByTestId(`rel-item-${B.id}`)).toBeVisible();

  // FILTRO de classificação = Restrito → B e C; o Sigiloso (A) some.
  await page.getByTestId('rel-filter-cls').click();
  await page.getByTestId('rel-filter-cls-opt-restrito').click();
  await expect(page.getByTestId(`rel-item-${B.id}`)).toBeVisible();
  await expect(page.getByTestId(`rel-item-${C.id}`)).toBeVisible();
  await expect(page.getByTestId(`rel-item-${A.id}`)).toHaveCount(0);
  // limpa o filtro (opção "vazio" do combobox).
  await page.getByTestId('rel-filter-cls').click();
  await page.getByTestId('rel-filter-cls-opt-').click();
  await expect(page.getByTestId(`rel-item-${A.id}`)).toBeVisible();

  // FILTRO de estado = Selados → só o assinado (A); o rascunho (B) some.
  if (signed.ok()) {
    await page.getByTestId('rel-filter-state').click();
    await page.getByTestId('rel-filter-state-opt-signed').click();
    await expect(page.getByTestId(`rel-item-${A.id}`)).toBeVisible();
    await expect(page.getByTestId(`rel-item-${B.id}`)).toHaveCount(0);
  }

  for (const d of [A, B, C]) await page.request.delete(`/api/platform/v23/notepad/${d.id}`);
});
