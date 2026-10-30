import { test, expect } from '@playwright/test';

/**
 * T3-G3 (a) — FILTRO do object-set numa seção de widget. A seção guarda um
 * FilterPredicate (`filter`); a MESMA `fetchSet` o aplica no operador e no /m
 * transmitido. Prova que o filtro ESTREITA o conjunto (3 objetos → só os 2 de
 * SP) nas duas superfícies — sem login no guest.
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('object-set com filtro discreto estreita o conjunto no operador e no /m guest', async ({ page, browser }) => {
  await loginAdmin(page);
  const ts = Date.now();
  const nodeType = `e2e_filtro_${ts}`;

  // 3 objetos reais: 2 em SP, 1 no RJ → o filtro uf=SP deve trazer só os 2.
  const bulk = await page.request.post('/api/ontology/nodes/bulk', {
    data: {
      kind: nodeType,
      items: [
        { name: 'Alvo SP Um', cidade: 'SP' },
        { name: 'Alvo SP Dois', cidade: 'SP' },
        { name: 'Alvo RJ Unico', cidade: 'RJ' },
      ],
    },
  });
  expect(bulk.ok()).toBeTruthy();
  expect((await bulk.json()).created).toBe(3);

  // o campo tipado vive em properties.<chave> (top-level só id/name/node_type)
  const FILTER = { op: 'eq', field: 'properties.cidade', value: 'SP' };

  // doc com seção de widget JÁ bindada ao tipo + filtro persistido na seção.
  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug: `e2e-filtro-${ts}`,
      title: 'E2E Filtro',
      classification_level: 'restrito',
      sections: [
        {
          id: 's1',
          kind: 'widget',
          heading: 'Alvos SP',
          widget: 'object_table_v2',
          object_type: nodeType,
          filter: FILTER,
          filter_conditions: [FILTER],
          props: { source: 'doc_data', columns: [{ field: 'cidade', label: 'Cidade' }] },
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  // PROVA BACKEND (operador): sem filtro = 3; com o filtro da seção = só os 2 de SP.
  const all = await page.request.post(
    `/api/platform/v23/notepad/${doc.id}/object-sets/query`,
    { data: { object_type: nodeType } },
  );
  expect((await all.json()).rows.length).toBe(3);

  const filtered = await page.request.post(
    `/api/platform/v23/notepad/${doc.id}/object-sets/query`,
    { data: { object_type: nodeType, filter: FILTER } },
  );
  expect(filtered.ok()).toBeTruthy();
  const fd = await filtered.json();
  expect(fd.rows.length).toBe(2);
  expect(fd.rows.every((r: { properties: { cidade?: string } }) => r.properties?.cidade === 'SP')).toBe(true);

  // PROVA UI (operador): a tabela mostra SP e NÃO mostra o objeto do RJ.
  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();
  await expect(page.getByText('SP', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('RJ', { exact: true })).toHaveCount(0);

  // Transmitir → token /m
  const tr = await page.request.post(`/api/platform/v23/notepad/${doc.id}/transmit`, {
    data: { link_base: 'http://localhost:3002', ttl_hours: 24 },
  });
  expect(tr.ok()).toBeTruthy();
  const { token } = await tr.json();

  // PROVA GUEST — contexto NOVO, SEM cookies. O endpoint token-scoped honra o filtro.
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(`/m/${token}`);

  const gq = await guest.request.post(
    `/api/public/guest/${token}/document/object-sets/query`,
    { data: { object_type: nodeType, filter: FILTER } },
  );
  expect(gq.ok()).toBeTruthy();
  expect((await gq.json()).rows.length).toBe(2);

  // PROVA UI GUEST: o /m renderiza só os de SP (o filtro da seção viaja no transmitido).
  await expect(guest.getByTestId('m-document')).toBeVisible({ timeout: 20000 });
  await expect(guest.getByText('SP', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await expect(guest.getByText('RJ', { exact: true })).toHaveCount(0);

  await guestCtx.close();
  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
