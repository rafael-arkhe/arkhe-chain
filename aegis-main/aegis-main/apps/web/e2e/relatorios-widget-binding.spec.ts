import { test, expect } from '@playwright/test';

/**
 * T3-E2 — binding de dado AO VIVO: uma seção de widget object_table_v2 bindada a
 * um tipo de objeto resolve o conjunto pelo endpoint GOVERNADO do documento
 * (/notepad/{id}/object-sets/query → _query_object_set) e renderiza dado REAL da
 * ontologia (não vazio, não mock).
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('object_table_v2 bindado a um tipo renderiza dado REAL da ontologia', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();
  const nodeType = `e2e_alvo_${ts}`;

  // 2 objetos reais do tipo (node_type = kind), via o handler canônico bulk.
  const bulk = await page.request.post('/api/ontology/nodes/bulk', {
    data: {
      kind: nodeType,
      items: [
        { name: 'Alvo Um E2E', cidade: 'SP' },
        { name: 'Alvo Dois E2E', cidade: 'RJ' },
      ],
    },
  });
  expect(bulk.ok()).toBeTruthy();
  const bulkOut = await bulk.json();
  expect(bulkOut.created).toBe(2);

  // doc com uma seção de widget JÁ bindada ao tipo (coluna = propriedade 'cidade'
  // → asserção determinística do dado real).
  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug: `e2e-bind-${ts}`,
      title: 'E2E Binding',
      classification_level: 'restrito',
      sections: [
        {
          id: 's1',
          kind: 'widget',
          heading: 'Alvos',
          widget: 'object_table_v2',
          object_type: nodeType,
          props: { source: 'doc_data', columns: [{ field: 'cidade', label: 'Cidade' }] },
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  // PROVA BACKEND: o endpoint governado resolve o conjunto no formato dos widgets
  const q = await page.request.post(
    `/api/platform/v23/notepad/${doc.id}/object-sets/query`,
    { data: { object_type: nodeType } },
  );
  expect(q.ok()).toBeTruthy();
  const qd = await q.json();
  expect(qd.rows.length).toBe(2);
  for (const r of qd.rows) {
    expect(r).toHaveProperty('id');
    expect(r).toHaveProperty('node_type');
    expect(r).toHaveProperty('properties');
  }
  const cidades = qd.rows.map((r: { properties: { cidade?: string } }) => r.properties?.cidade).sort();
  expect(cidades).toEqual(['RJ', 'SP']);

  // PROVA UI: object_table_v2 renderiza o DADO REAL (coluna cidade) no documento
  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();
  await expect(page.getByText('SP', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('RJ', { exact: true })).toBeVisible();

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
