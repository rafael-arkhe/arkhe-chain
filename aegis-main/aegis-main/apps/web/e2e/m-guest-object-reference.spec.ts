import { test, expect } from '@playwright/test';

/**
 * T3-G3 (c) — objeto ÚNICO (ObjectReference) numa seção de widget resolve no
 * documento TRANSMITIDO (/m, sem login). Antes `getNode` era operador-only e o
 * widget caía na pré-visualização; agora resolve via endpoint guest token-scoped,
 * ESCOPADO ao documento (só node_ids referenciados pelo doc) + ABAC.
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

test('ObjectReference resolve no /m guest — token-scoped e escopado ao documento', async ({ page, browser }) => {
  await loginAdmin(page);
  const ts = Date.now();
  const nodeType = `e2e_ref_${ts}`;

  // 2 objetos: o referenciado pelo doc + um "de fora" (prova de escopo).
  const bulk = await page.request.post('/api/ontology/nodes/bulk', {
    data: {
      kind: nodeType,
      items: [
        { name: 'Alvo Guest Unico ABC', cidade: 'SP' },
        { name: 'Fora do Documento', cidade: 'RJ' },
      ],
    },
  });
  expect(bulk.ok()).toBeTruthy();
  const ids = (await bulk.json()).object_ids as string[];
  expect(ids.length).toBe(2);
  const [insideId, outsideId] = ids;

  // doc com uma seção property_list bindada ao objeto único (node_id).
  const created = await page.request.post('/api/platform/v23/notepad', {
    data: {
      slug: `e2e-ref-${ts}`,
      title: 'E2E ObjectReference',
      classification_level: 'restrito',
      sections: [
        {
          id: 'r',
          kind: 'widget',
          heading: 'Ficha',
          widget: 'property_list',
          node_id: insideId,
          props: { source: 'doc_data', title: 'Ficha do Alvo', keys: ['name'] },
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  const tr = await page.request.post(`/api/platform/v23/notepad/${doc.id}/transmit`, {
    data: { link_base: 'http://localhost:3002', ttl_hours: 24 },
  });
  expect(tr.ok()).toBeTruthy();
  const { token } = await tr.json();

  // VISITA GUEST — contexto NOVO, SEM cookies de operador.
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(`/m/${token}`);

  // PROVA BACKEND: o nó REFERENCIADO resolve (dado real, token-scoped + ABAC).
  const gn = await guest.request.get(`/api/public/guest/${token}/document/node?node_id=${insideId}`);
  expect(gn.ok()).toBeTruthy();
  expect((await gn.json()).name).toBe('Alvo Guest Unico ABC');

  // PROVA ESCOPO: nó NÃO referenciado pelo doc → 404. O token autoriza ESTE
  // documento, não a ontologia inteira (sem enumeração por id).
  const gOut = await guest.request.get(`/api/public/guest/${token}/document/node?node_id=${outsideId}`);
  expect(gOut.status()).toBe(404);

  // PROVA UI GUEST: a ficha mostra o nome REAL (não a pré-visualização/"Sem dados").
  await expect(guest.getByTestId('m-document')).toBeVisible({ timeout: 20000 });
  await expect(guest.getByText('Alvo Guest Unico ABC')).toBeVisible({ timeout: 20000 });

  await guestCtx.close();
  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
