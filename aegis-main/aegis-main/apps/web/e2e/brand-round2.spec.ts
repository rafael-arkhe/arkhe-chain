import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Onda brand2 (2026-07-09) — segunda rodada de correções da Marca:
 *  - cores de região (sidenav bg) aplicam ao CHROME REAL (não só ao preview);
 *  - logo por superfície: logo escuro aparece no cabeçalho (fundo escuro);
 *  - /login cai pro logo da Marca; favicon default não sobrepõe o app/icon.svg.
 */

const COMPANY_NAME = 'Prefeitura Verifica';
const SIDENAV_BG = '#3311bb'; // cor bem distinta pra provar via computed style
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const PW = process.env.AEGIS_E2E_ADMIN_PASSWORD || 'AGS-2026-bzYE5FUfpsF7emmHLOkk';

test('brand2: cores de região + logo por superfície aplicam ao chrome real', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const logoPath = path.join(os.tmpdir(), `aegis-e2e-logo-${Date.now()}.png`);
  fs.writeFileSync(logoPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

  try {
    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill(PW);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
      timeout: 30000,
      waitUntil: 'commit',
    });

    await page.goto('/painel-de-controle/styles-configurator');
    await page.getByTestId('styles-tab-visual-identity').click();
    await page.getByTestId('brand-company-name').waitFor({ state: 'visible' });

    // ── Marca: nome + logo primário (claro) + logo escuro ──────────────
    await page.getByTestId('brand-company-name').fill(COMPANY_NAME);
    await page.getByTestId('brand-logo-upload').setInputFiles(logoPath);
    await expect(page.getByTestId('brand-logo-upload')).not.toBeDisabled({ timeout: 15000 });
    await page.getByTestId('brand-logo-dark-upload').setInputFiles(logoPath);
    await expect(page.getByTestId('brand-logo-dark-upload')).not.toBeDisabled({ timeout: 15000 });
    await page.getByTestId('brand-logo-dark-preview').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('brand-save').click();
    await expect(page.getByTestId('brand-save')).toHaveText(/Salvar marca/, { timeout: 15000 });

    // ── Cores: sidenav bg ──────────────────────────────────────────────
    // O input hex da região sidenav.bg (data-testid do editor).
    const sidenavHex = page.getByTestId('region-input-sidenav-bg-hex');
    await sidenavHex.fill(SIDENAV_BG);
    await page.getByTestId('region-colors-save').click();
    await expect(page.getByTestId('region-colors-save')).toHaveText(/Salvar cores/, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // ── Navega pro chrome REAL (rota fora do painel) ───────────────────
    await page.goto('/buscar');
    const sidenav = page.getByTestId('sidenav');
    await sidenav.waitFor({ state: 'visible', timeout: 30000 });

    // (1) sidenav bg real reflete a cor escolhida. RegionColorsMount injeta
    // o <style> de forma assíncrona (fetch pós-mount), então poll até aplicar.
    // #3311bb → rgb(51, 17, 187)
    await expect
      .poll(
        () => sidenav.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 15000 },
      )
      .toBe('rgb(51, 17, 187)');

    // (2) header (fundo escuro) usa o logo ESCURO uploadado (tenant-assets URL).
    const headerLogo = page.getByTestId('brand-link').locator('img');
    const headerLogoSrc = await headerLogo.getAttribute('src');
    expect(headerLogoSrc).toContain('tenant-assets');

    // (3) título da aba reflete company_name.
    await expect(page).toHaveTitle(new RegExp(COMPANY_NAME), { timeout: 15000 });
  } finally {
    fs.rmSync(logoPath, { force: true });
  }
});
