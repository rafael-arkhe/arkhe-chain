import { test, expect } from '@playwright/test';

/**
 * #3 — Widget de Assinatura. Prova: o cofre por-usuário /me/signature (cadastra/
 * confere/serve); o widget no documento aplicando a assinatura salva E desenhada
 * no canvas (renderiza a imagem); e o PDF embarca a assinatura.
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

test('assinatura: cofre /me/signature + aplicar no documento (salva e desenho) + PDF', async ({ page }) => {
  await loginAdmin(page);

  // 1) COFRE por-usuário: cadastra (PUT) → confere (GET meta) → serve (image).
  const put = await page.request.put('/api/me/signature', { data: { data_url: PNG_1X1 } });
  expect(put.ok()).toBeTruthy();
  expect((await put.json()).has_signature).toBe(true);
  expect((await (await page.request.get('/api/me/signature')).json()).has_signature).toBe(true);
  expect((await page.request.get('/api/me/signature/image')).ok()).toBeTruthy();

  // 2) widget de assinatura num documento, via UI.
  const doc = await (
    await page.request.post('/api/platform/v23/notepad', {
      data: { slug: `e2e-sig-${Date.now()}`, title: 'E2E Assinatura', classification_level: 'restrito', sections: [] },
    })
  ).json();

  await page.goto(`/relatorios?doc=${doc.id}`);
  await page.getByTestId('rel-add-widget').click();
  await page.getByTestId('widget-palette-signature').click();
  await expect(page.getByTestId('signature-config')).toBeVisible({ timeout: 15000 });

  // 2a) USAR a assinatura salva → aplica + renderiza a imagem no widget.
  await page.getByTestId('signature-use-saved').click();
  await expect(page.getByTestId('signature-widget').locator('img')).toBeVisible({ timeout: 15000 });

  // 2b) DESENHAR à mão no canvas → aplicar.
  await page.getByTestId('signature-draw-toggle').click();
  const pad = page.getByTestId('signature-pad');
  await expect(pad).toBeVisible();
  const box = await pad.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2 - 20, { steps: 8 });
    await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 });
    await page.mouse.up();
  }
  await page.getByTestId('signature-apply-draw').click();
  await expect(page.getByTestId('signature-widget').locator('img')).toBeVisible({ timeout: 15000 });

  // 3) salva → PDF embarca a assinatura (válido).
  await page.getByTestId('rel-save').click();
  await expect(page.getByTestId('rel-msg')).toBeVisible({ timeout: 15000 });
  const pdf = await page.request.get(`/api/platform/v23/notepad/${doc.id}/pdf`);
  expect(pdf.ok()).toBeTruthy();
  expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  await page.request.delete(`/api/platform/v23/notepad/${doc.id}`);
  await page.request.delete('/api/me/signature');
});
