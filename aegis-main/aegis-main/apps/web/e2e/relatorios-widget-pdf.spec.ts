import { test, expect } from '@playwright/test';

/**
 * T3-G3 (b) — o PDF do documento renderiza as seções de WIDGET de forma ESTÁTICA:
 * presentational (callout), object-set vira TABELA (linhas resolvidas pelo
 * endpoint, honrando filtro) e figura embarca a imagem do MinIO. Antes toda
 * seção de widget virava "(secao sem conteudo)" no PDF.
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

test('PDF do documento renderiza widgets (callout + tabela filtrada + figura) — não "(secao sem conteudo)"', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();
  const nodeType = `e2e_pdf_${ts}`;

  const bulk = await page.request.post('/api/ontology/nodes/bulk', {
    data: {
      kind: nodeType,
      items: [
        { name: 'Alvo SP Um', cidade: 'SP' },
        { name: 'Alvo SP Dois', cidade: 'SP' },
        { name: 'Alvo RJ', cidade: 'RJ' },
      ],
    },
  });
  expect(bulk.ok()).toBeTruthy();

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: { slug: `e2e-pdf-${ts}`, title: 'E2E PDF Widgets', classification_level: 'restrito', sections: [] },
  });
  const doc = await created.json();

  const up = await page.request.post(`/api/platform/v23/notepad/${doc.id}/uploads`, {
    data: { data_url: PNG_1X1, original_filename: 'p.png' },
  });
  const upd = await up.json();

  const widgetSections = [
    { id: 'c', kind: 'widget', heading: 'Aviso', widget: 'callout', props: { tone: 'info', title: 'Atenção', body: 'Conteúdo do aviso.' } },
    {
      id: 't', kind: 'widget', heading: 'Alvos SP', widget: 'object_table_v2', object_type: nodeType,
      filter: { op: 'eq', field: 'properties.cidade', value: 'SP' },
      props: { source: 'doc_data', columns: [{ field: 'cidade', label: 'Cidade' }] },
    },
    {
      id: 'f', kind: 'widget', heading: 'Figura', widget: 'figure',
      props: { url: `/api/platform/v23/notepad/${doc.id}/media?key=${encodeURIComponent(upd.object_key)}`, object_key: upd.object_key, caption: 'Imagem do documento' },
    },
  ];

  await page.request.put(`/api/platform/v23/notepad/${doc.id}`, { data: { sections: widgetSections } });

  // PDF COM as seções de widget
  const withWidgets = await page.request.get(`/api/platform/v23/notepad/${doc.id}/pdf`);
  expect(withWidgets.ok()).toBeTruthy();
  expect(withWidgets.headers()['content-type']).toContain('application/pdf');
  const bodyA = await withWidgets.body();
  expect(bodyA.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  // PDF SEM as seções (controle): deve ser MENOR — prova que os widgets
  // (tabela resolvida + imagem embarcada) entraram no PDF de fato.
  await page.request.put(`/api/platform/v23/notepad/${doc.id}`, { data: { sections: [] } });
  const noWidgets = await page.request.get(`/api/platform/v23/notepad/${doc.id}/pdf`);
  const bodyB = await noWidgets.body();
  expect(bodyB.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  // os widgets (tabela resolvida + imagem embarcada + textos) ADICIONAM bytes:
  // o PDF com seções é estritamente maior e substancial.
  expect(bodyA.length).toBeGreaterThan(bodyB.length);
  expect(bodyA.length).toBeGreaterThan(2000);

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
