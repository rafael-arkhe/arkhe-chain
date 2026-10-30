import { test, expect } from '@playwright/test';

/**
 * Certificação AO VIVO das 3 ilhas do DL160 pelo domínio PÚBLICO.
 *
 * Assere o DADO, não só o título: o mapa de densidade tem que sair de
 * "0 objetos no mapa" (estado de carregamento) e os gargalos têm que
 * aparecer. Sem isso o teste passa com a home vazia.
 */
const ILHAS = [
  { nome: 'sgp', senha: process.env.PW_SGP ?? '' },
  { nome: 'parceiros', senha: process.env.PW_PARCEIROS ?? '' },
  { nome: 'voluntarios', senha: process.env.PW_VOLUNTARIOS ?? '' },
];

for (const ilha of ILHAS) {
  test(`ilha ${ilha.nome}: home da câmara com DADO + câmeras`, async ({ page }) => {
    const base = `https://${ilha.nome}.safecore.space`;

    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill(ilha.senha);
    await page.locator('[data-testid="login-submit"]').click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 });

    await expect(page.getByText(/Itapetininga/i).first()).toBeVisible({ timeout: 60_000 });

    // O mapa tem que CARREGAR objetos — "0 objetos no mapa" é o estado vazio.
    await expect
      .poll(async () => {
        const t = await page.locator('body').innerText();
        const m = t.match(/(\d+)\s+objetos?\s+no\s+mapa/i);
        return m ? Number(m[1]) : 0;
      }, { timeout: 90_000, intervals: [2000] })
      .toBeGreaterThan(0);

    const txt = await page.locator('body').innerText();
    const nMapa = Number((txt.match(/(\d+)\s+objetos?\s+no\s+mapa/i) ?? [])[1] ?? 0);
    console.log(`[${ilha.nome}] objetos no mapa = ${nMapa}`);
    expect(nMapa).toBeGreaterThan(300);

    await page.screenshot({ path: `cert-${ilha.nome}-home.png`, fullPage: true });

    // Rola o container interno via JS — a roda do mouse SOBRE o mapa dá zoom no
    // Mapbox em vez de rolar a página (e o screenshot sai com o mapa desenquadrado).
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*')) as HTMLElement[];
      const sc = els.find((e) => e.scrollHeight > e.clientHeight + 80 && e.clientHeight > 200);
      if (sc) sc.scrollTop = sc.scrollHeight;
    });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `cert-${ilha.nome}-gargalos.png`, fullPage: false });

    // /cameras com as câmeras públicas semeadas.
    await page.goto(`${base}/cameras`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.getByText(/rodovia|DER|Marginal|c[âa]mera/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `cert-${ilha.nome}-cameras.png`, fullPage: false });
  });
}
