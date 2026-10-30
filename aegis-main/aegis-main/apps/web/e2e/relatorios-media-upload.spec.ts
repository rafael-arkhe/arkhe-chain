import { test, expect } from '@playwright/test';

/**
 * T3-G2 — arquivos/imagens via MinIO: upload escopado ao documento + serve
 * ESTÁVEL (sem expiração, gateado). Diferente do upload do Workshop (URL
 * presignada 5 min que expira), o documento referencia o object_key e serve por
 * GET /notepad/{id}/media?key=.
 */
async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login?next=/relatorios');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y');
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
}

// 1x1 PNG transparente
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('upload de imagem → MinIO escopado ao doc → serve estável + figura renderiza', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();

  const created = await page.request.post('/api/platform/v23/notepad', {
    data: { slug: `e2e-media-${ts}`, title: 'E2E Media', classification_level: 'restrito', sections: [] },
  });
  expect(created.ok()).toBeTruthy();
  const doc = await created.json();

  // upload escopado ao doc
  const up = await page.request.post(`/api/platform/v23/notepad/${doc.id}/uploads`, {
    data: { data_url: PNG_1X1, original_filename: 'pixel.png' },
  });
  expect(up.ok()).toBeTruthy();
  const upd = await up.json();
  expect(upd.object_key).toContain(`notepad/${doc.id}/`);
  expect(upd.content_type).toBe('image/png');
  expect(upd.bytes).toBeGreaterThan(0);

  // serve ESTÁVEL (gateado): a chave do doc serve a imagem
  const mediaUrl = `/api/platform/v23/notepad/${doc.id}/media?key=${encodeURIComponent(upd.object_key)}`;
  const served = await page.request.get(mediaUrl);
  expect(served.ok()).toBeTruthy();
  expect(served.headers()['content-type']).toContain('image/png');
  expect((await served.body()).length).toBe(upd.bytes);

  // chave de OUTRO doc não serve (escopo) → 400
  const bad = await page.request.get(
    `/api/platform/v23/notepad/${doc.id}/media?key=${encodeURIComponent('notepad/outro/x.png')}`,
  );
  expect(bad.status()).toBe(400);

  // grava a figura com a URL de serve e confirma o render no documento
  await page.request.put(`/api/platform/v23/notepad/${doc.id}`, {
    data: {
      sections: [
        {
          id: 's1',
          kind: 'widget',
          heading: 'Imagem',
          widget: 'figure',
          props: { url: mediaUrl, caption: 'Imagem E2E', object_key: upd.object_key },
        },
      ],
    },
  });
  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();
  await expect(page.getByTestId('figure-widget')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Imagem E2E')).toBeVisible();
  const src = await page.getByTestId('figure-widget').locator('img').getAttribute('src');
  expect(src).toContain('/media?key=');

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});

test('gesto do operador: Widget → Figura → Enviar arquivo → renderiza a mídia', async ({ page }) => {
  await loginAdmin(page);
  const ts = Date.now();
  const created = await page.request.post('/api/platform/v23/notepad', {
    data: { slug: `e2e-media-ui-${ts}`, title: 'E2E Media UI', classification_level: 'restrito', sections: [] },
  });
  const doc = await created.json();

  await page.goto('/relatorios');
  await page.getByTestId(`rel-item-${doc.id}`).click();
  await page.getByTestId('rel-add-widget').click();
  await page.getByTestId('widget-palette-figure').click();

  // o controle de upload de mídia aparece (não input de URL manual)
  await expect(page.getByTestId('widget-section-upload')).toBeVisible({ timeout: 15000 });
  // seleciona o arquivo direto no input (escondido) → dispara o upload
  await page.getByTestId('media-upload-input').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_1X1.split(',')[1], 'base64'),
  });

  // a figura passa a apontar pra mídia servida do MinIO (escopo do doc)
  await expect(page.getByTestId('figure-widget').locator('img')).toHaveAttribute(
    'src',
    /\/media\?key=/,
    { timeout: 20000 },
  );

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
});
