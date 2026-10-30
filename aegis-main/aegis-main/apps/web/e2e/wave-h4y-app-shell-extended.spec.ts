/**
 * Wave H.4.Y (2026-05-23) — App Shell extended sections (banner /
 * footer / user-menu / sidenav / homepage editor).
 *
 * Cenário operacional:
 *   admin entra → /painel-de-controle/app-shell → preenche cada uma das
 *   5 abas Wave H.4.Y → salva → verifica que o shell reage (banner
 *   custom_text, footer status item, user menu link novo, sidenav
 *   grupo extra, homepage block).
 *
 * Validação focada: smoke + screenshots; cobertura unit já existe nos
 * arquivos `__tests__/app-shell-{banner,footer,user-menu,sidenav,
 * homepage}-tab.test.tsx`.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

const SCREENSHOTS_DIR = 'e2e/screenshots/wave-h4y';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('Wave H.4.Y · 1. Banner extended — custom_text + show_clock', async ({
  page,
}) => {
  await page.goto('/painel-de-controle/app-shell');
  await page.getByTestId('app-shell-tab-banner').click();
  await expect(page.getByTestId('inspector-banner')).toBeVisible();

  await page
    .getByTestId('banner-classification-select')
    .selectOption('confidencial');
  await page
    .getByTestId('banner-custom-text-input')
    .fill('Operação Alfa');
  await page.getByTestId('banner-show-clock-toggle').click();
  await expect(page.getByTestId('banner-preview')).toContainText(
    'Operação Alfa',
  );
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/01-banner-tab.png`,
    fullPage: true,
  });

  await page.getByTestId('app-shell-save').click();
  await expect(page.getByTestId('app-shell-success')).toBeVisible({
    timeout: 10_000,
  });
});

test('Wave H.4.Y · 2. Footer status bar editor', async ({ page }) => {
  await page.goto('/painel-de-controle/app-shell');
  await page.getByTestId('app-shell-tab-footer').click();
  await expect(page.getByTestId('inspector-footer')).toBeVisible();

  await page.getByTestId('footer-status-add-system').click();
  await page.getByTestId('footer-status-item-0-pos-left').click();
  await page.getByTestId('footer-status-add-custom').click();
  await page
    .getByTestId('footer-status-item-1-label')
    .fill('Operação ATIVA');
  await page.getByTestId('footer-status-item-1-pos-center').click();
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/02-footer-tab.png`,
    fullPage: true,
  });

  await page.getByTestId('app-shell-save').click();
  await expect(page.getByTestId('app-shell-success')).toBeVisible({
    timeout: 10_000,
  });
});

test('Wave H.4.Y · 3. User menu editor', async ({ page }) => {
  await page.goto('/painel-de-controle/app-shell');
  await page.getByTestId('app-shell-tab-user-menu').click();
  await expect(page.getByTestId('inspector-user-menu')).toBeVisible();

  await page.getByTestId('user-menu-add-link').click();
  // Após add, garante que pelo menos 1 item existe e edita o item 0
  // (que sempre será o link recém-criado quando lista estava vazia)
  // ou o último não-logout quando havia defaults.
  await expect(page.getByTestId(/^user-menu-item-\d+$/).first()).toBeVisible();
  const items = page.getByTestId(/^user-menu-item-\d+$/);
  const count = await items.count();
  // O novo item é inserido logo antes do logout (kind=logout no fim).
  // Se logout existir como último, edita count-2; senão edita count-1.
  const lastKind = await items.nth(count - 1).getAttribute('data-kind');
  const newLinkIdx = lastKind === 'logout' ? count - 2 : count - 1;
  await page
    .getByTestId(`user-menu-item-${newLinkIdx}-label`)
    .fill('Suporte');
  await page
    .getByTestId(`user-menu-item-${newLinkIdx}-href`)
    .fill('/docs');
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/03-user-menu-tab.png`,
    fullPage: true,
  });

  await page.getByTestId('app-shell-save').click();
  await expect(page.getByTestId('app-shell-success')).toBeVisible({
    timeout: 10_000,
  });
});

test('Wave H.4.Y · 4. Sidenav groups editor + width slider', async ({
  page,
}) => {
  await page.goto('/painel-de-controle/app-shell');
  await page.getByTestId('app-shell-tab-sidenav').click();
  await expect(page.getByTestId('inspector-sidenav')).toBeVisible();

  await page.getByTestId('sidenav-add-group').click();
  await page
    .getByTestId('sidenav-group-0-label')
    .fill('Operações Extras');
  await page.getByTestId('sidenav-group-0-add-item').click();
  await page
    .getByTestId('sidenav-group-0-item-0-label')
    .fill('Marcações');
  await page
    .getByTestId('sidenav-group-0-item-0-href')
    .fill('/marcacoes');
  await page.getByTestId('sidenav-dense-toggle').click();
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/04-sidenav-tab.png`,
    fullPage: true,
  });

  await page.getByTestId('app-shell-save').click();
  await expect(page.getByTestId('app-shell-success')).toBeVisible({
    timeout: 10_000,
  });
});

test('Onda J.1 · 5. Página inicial — seletor + atalho para editor de Páginas', async ({
  page,
}) => {
  await page.goto('/painel-de-controle/app-shell');
  await page.getByTestId('app-shell-tab-homepage').click();
  await expect(page.getByTestId('inspector-homepage')).toBeVisible();

  // Seletor "qual página é a inicial" + atalho (sem editor de 4 tipos).
  await expect(page.getByTestId('homepage-page-select')).toBeVisible();
  await expect(page.getByTestId('homepage-open-editor')).toBeVisible();
  // Editor de blocos de 4 tipos foi REMOVIDO (feedback_no_deprecation).
  await expect(page.getByTestId('homepage-add-heading')).toHaveCount(0);
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/05-homepage-tab.png`,
    fullPage: true,
  });

  // Atalho leva ao editor de Páginas (Workshop completo, 3-pane).
  await page.getByTestId('homepage-open-editor').click();
  await expect(page).toHaveURL(/\/painel-de-controle\/paginas\/.+\/edit/);
  await expect(page.getByTestId('paginas-edit-palette')).toBeVisible();
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/06-homepage-editor.png`,
    fullPage: true,
  });

  // `/` (root) renderiza via Workshop — HomepageMount não existe mais.
  await page.goto('/');
  await expect(page.getByTestId('homepage-mount')).toHaveCount(0);
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/06b-home-rendered.png`,
    fullPage: true,
  });
});

test('Wave H.4.Y · 6. Zero console errors em todas as abas', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/painel-de-controle/app-shell');
  for (const tab of [
    'banner',
    'footer',
    'user-menu',
    'sidenav',
    'homepage',
  ]) {
    await page.getByTestId(`app-shell-tab-${tab}`).click();
    await page.waitForTimeout(200);
  }
  await page.screenshot({
    path: `${SCREENSHOTS_DIR}/07-final.png`,
    fullPage: true,
  });
  // Esconde erros não-fatais (cesium/fontes externas) e exige zero
  // erros vindos do nosso código.
  const fatal = errors.filter(
    (e) =>
      !/cesium|fonts\.gstatic|aegis_refresh|browser-session/i.test(e),
  );
  expect(fatal, JSON.stringify(fatal, null, 2)).toEqual([]);
});
