/**
 * §B MAPA — onda 3 (B4 marcadores mil-spec + B5.1 escala por viewport), AO VIVO.
 *
 * B4: os pins deixaram de ser PointGraphics e viraram billboards "moldura
 *     mil-spec" (forma=categoria ◇□○, glifo=tipo, borda aço #2D77BE, SEM glow).
 *     O desenho WebGL não é asserido em headless (convenção /geo, ver
 *     geo-reference-layers.spec) — o LOOK é certificado no preview standalone
 *     (variante B) + jest geo-markers; aqui asserimos que as camadas plotam sem
 *     quebrar o globo.
 * B5.1: o /geo passou a carregar por VIEWPORT — dar zoom dispara um fetch de
 *     /geo/nodes com bbox + limit=2000 (antes: corte cego de 500/tipo, bbox
 *     nunca usado). Certificado pela REQUISIÇÃO real que o gesto do operador faz.
 *
 * Pré: 3 OntologyNode (Event/Vehicle/Camera) com geopoint semeados perto de SP
 * no tenant do admin (o harness de shell semeia/limpa).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

test('B4+B5.1: camadas plotam (billboards) + zoom carrega por viewport (bbox+limit=2000)', async ({ page }) => {
  const geoReqs: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/geo/nodes')) geoReqs.push(r.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));

  await login(page);
  await page.goto('/geo', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('painel-camadas')).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('cesium-globe')).toBeVisible();

  // Liga camadas de 3 categorias distintas (event ◇ / asset □ / sensor ○) — os
  // billboards plotam. Se o SVG data-URI não carregasse, o toggle ainda vira
  // "ativo", mas o pageerror pegaria uma quebra no add do billboard.
  for (const nt of ['Event', 'Vehicle', 'Camera']) {
    const tgl = page.getByTestId(`layer-toggle-${nt}`);
    await expect(tgl).toBeVisible({ timeout: 15000 });
    await tgl.click();
    await expect(tgl).toHaveAttribute('aria-label', 'Ocultar camada', { timeout: 10000 });
  }
  await page.waitForTimeout(1500);

  // Zoom in sobre o globo → moveEnd → setViewportBbox → reload por bbox.
  const box = await page.getByTestId('cesium-globe').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -320);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2500);

  // B5.1: ALGUM fetch de /geo/nodes veio por VIEWPORT (bbox + limit=2000).
  const bboxReq = geoReqs.find((u) => u.includes('bbox=') && u.includes('limit=2000'));
  expect(bboxReq, `nenhum /geo/nodes com bbox+limit=2000. reqs:\n${geoReqs.join('\n')}`).toBeTruthy();

  // B4: os billboards não quebraram o globo.
  expect(errors, errors.join('\n')).toHaveLength(0);
});
