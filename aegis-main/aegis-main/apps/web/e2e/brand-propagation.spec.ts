import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Onda brand (2026-07-09) — Marca (nome/logo) configurada em
 * styles-configurator precisa realmente propagar pro chrome autenticado
 * (sidenav do Painel de Controle), pro título da aba, e pro tab "Login"
 * do App Shell + tela real /login. Antes desta onda nenhum desses
 * consumia `Styles.getBrand()`/`getPublicBrand()` — cobre a regressão.
 */

const COMPANY_NAME = 'Safe Core Verifica';
const PWA_NAME = 'SafeCoreQA';

// PNG 1x1 transparente — fixture mínima gerada em runtime (sem binário no repo).
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('brand fix: nome/logo propagam pro sidenav do painel, título da aba e Login', async ({
  page,
}) => {
  // A home / carrega um dashboard pesado (cctv/stream/workshop evaluate) e
  // as rotas do painel compilam a frio na primeira visita — orçamento maior
  // evita corrida com o timeout padrão de 60s (mesmo padrão do /dados).
  test.setTimeout(150_000);
  const logoPath = path.join(os.tmpdir(), `aegis-e2e-tiny-logo-${Date.now()}.png`);
  fs.writeFileSync(logoPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

  try {
    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page
      .locator('#password')
      .fill(process.env.AEGIS_E2E_ADMIN_PASSWORD || 'AGS-2026-bzYE5FUfpsF7emmHLOkk');
    await page.getByTestId('login-submit').click();
    await page.waitForURL('**/', { timeout: 15000 });

    await page.goto('/painel-de-controle/styles-configurator');
    await page.getByTestId('styles-tab-visual-identity').click();
    await page.getByTestId('brand-company-name').waitFor({ state: 'visible' });

    await page.getByTestId('brand-company-name').fill(COMPANY_NAME);
    await page.getByTestId('brand-pwa-name').fill(PWA_NAME);
    await page.getByTestId('brand-logo-upload').setInputFiles(logoPath);
    await expect(page.getByTestId('brand-logo-upload')).not.toBeDisabled({ timeout: 15000 });
    await page.getByTestId('brand-logo-preview').waitFor({ state: 'visible', timeout: 15000 });

    await page.getByTestId('brand-save').click();
    await expect(page.getByTestId('brand-save')).toHaveText(/Salvar marca/, { timeout: 15000 });
    await page.waitForTimeout(1500); // router.refresh() + brand refetch

    // Sidenav do Painel de Controle (o que o operador vê enquanto edita).
    await expect(page.getByTestId('cp-sidebar-brand-name')).toHaveText(COMPANY_NAME, {
      timeout: 15000,
    });

    // Logo REALMENTE carregou (URL alcançável) — antes caía no fallback
    // silencioso via onError (MinIO presigned URL com host interno).
    const logoNaturalWidth = await page
      .getByTestId('brand-logo-preview')
      .evaluate((img: HTMLImageElement) => img.naturalWidth);
    const logoSrc = await page.getByTestId('brand-logo-preview').getAttribute('src');
    expect(logoNaturalWidth).toBeGreaterThan(0);
    expect(logoSrc).not.toContain('aegis-logo.svg');
    expect(logoSrc).not.toContain('logo-white.svg');

    // Título da aba reflete company_name sem precisar de hard-refresh manual.
    await expect(page).toHaveTitle(new RegExp(COMPANY_NAME), { timeout: 15000 });

    // Composer App Shell → aba Login: preview deixou de mostrar "AEGIS" fixo.
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-login').click();
    await expect(page.getByTestId('login-preview-name')).toHaveText(PWA_NAME, {
      timeout: 15000,
    });

    // Tela real /login (deslogado) reflete a mesma Marca.
    await page.context().clearCookies();
    await page.goto('/login');
    await expect(page.getByTestId('login-brand-name')).toHaveText(PWA_NAME, { timeout: 15000 });
    await expect(page).toHaveTitle(new RegExp(COMPANY_NAME), { timeout: 15000 });
  } finally {
    fs.rmSync(logoPath, { force: true });
  }
});
