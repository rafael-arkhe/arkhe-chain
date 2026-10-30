import { test, expect } from '@playwright/test';

/**
 * T3-G3 — o documento TRANSMITIDO (/m/{token}, sem login) renderiza as seções de
 * WIDGET pela MESMA engine do operador: presentational (callout), object-set
 * (object_table_v2 via endpoint guest token-scoped) e mídia (figura via guest
 * media). Antes mostrava "(seção sem conteúdo)".
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('documento transmitido (/m): callout + tabela (object-set) + figura (mídia) renderizam sem login', async ({ page, browser }) => {
  await loginAdmin(page);
  const ts = Date.now();
  const nodeType = `e2e_guest_${ts}`;

  const bulk = await page.request.post('/api/ontology/nodes/bulk', {
    data: { kind: nodeType, items: [{ name: 'G1', cidade: 'SP' }, { name: 'G2', cidade: 'RJ' }] },
  });
  expect(bulk.ok()).toBeTruthy();

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: { slug: `e2e-guest-${ts}`, title: 'E2E Guest', classification_level: 'restrito', sections: [] },
  });
  const doc = await created.json();

  const up = await page.request.post(`/api/platform/v23/notepad/${doc.id}/uploads`, {
    data: { data_url: PNG_1X1, original_filename: 'g.png' },
  });
  const upd = await up.json();

  // doc com 3 seções de widget
  await page.request.put(`/api/platform/v23/notepad/${doc.id}`, {
    data: {
      sections: [
        { id: 'c', kind: 'widget', heading: 'Aviso', widget: 'callout', props: { tone: 'info', title: 'Aviso Guest', body: 'Texto guest' } },
        {
          id: 't', kind: 'widget', heading: 'Tabela', widget: 'object_table_v2', object_type: nodeType,
          props: { source: 'doc_data', columns: [{ field: 'cidade', label: 'Cidade' }] },
        },
        {
          id: 'f', kind: 'widget', heading: 'Figura', widget: 'figure',
          props: { url: `/api/platform/v23/notepad/${doc.id}/media?key=${encodeURIComponent(upd.object_key)}`, object_key: upd.object_key, caption: 'Imagem Guest' },
        },
      ],
    },
  });

  // Transmitir → token /m
  const tr = await page.request.post(`/api/platform/v23/notepad/${doc.id}/transmit`, {
    data: { link_base: 'http://localhost:3002', ttl_hours: 24 },
  });
  expect(tr.ok()).toBeTruthy();
  const { token } = await tr.json();
  expect(token).toBeTruthy();

  // VISITA GUEST — contexto NOVO, SEM cookies de operador
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(`/m/${token}`);

  // PROVA BACKEND (e aquece a rota guest): o endpoint token-scoped resolve as rows
  const gq = await guest.request.post(
    `/api/public/guest/${token}/document/object-sets/query`,
    { data: { object_type: nodeType } },
  );
  expect(gq.ok()).toBeTruthy();
  expect((await gq.json()).rows.length).toBe(2);

  await expect(guest.getByTestId('m-document')).toBeVisible({ timeout: 20000 });
  // presentational
  await expect(guest.getByText('Aviso Guest')).toBeVisible();
  await expect(guest.getByText('Texto guest')).toBeVisible();
  // object-set via endpoint GUEST (dado real, não "(seção sem conteúdo)")
  await expect(guest.getByText('SP', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(guest.getByText('RJ', { exact: true })).toBeVisible();
  // mídia via guest media (URL reescrita pro token)
  const figSrc = await guest.getByTestId('figure-widget').locator('img').getAttribute('src');
  expect(figSrc).toContain('/api/public/guest/');
  expect(figSrc).toContain('/media?key=');
  const served = await guest.request.get(figSrc as string);
  expect(served.ok()).toBeTruthy();

  await guestCtx.close();
  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
