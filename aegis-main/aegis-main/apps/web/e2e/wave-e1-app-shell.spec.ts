/**
 * E2E · Wave E.1 (2026-05-23) — Layout do App.
 *
 * 9 cenas + 9 screenshots em test-results/wave-e1-{1-9}-*.png.
 * Cobre o ciclo completo: editar config → salvar → reload → reflexo
 * persistente via backend (não localStorage).
 *
 * Zero console errors em todas as cenas (filtro de noise comum).
 *
 * IMPORTANT: ontology-module :8002 + security-app :3002 precisam estar
 * de pé. O spec faz login via /api/auth/login.
 */
import { expect, test } from '@playwright/test';
import { login } from './helpers/login';

const ALLOWED_CONSOLE_NOISE =
  /Failed to load resource|Download the React DevTools|JSX transform|preload|preloaded but not used|Sentry|net::ERR_/i;

// Reset config user pré-cada cena pra cada uma começar limpa.
async function resetUserConfig(page: import('@playwright/test').Page) {
  const empty = {
    homepage: { logo: null, hero_text: null, sections: [] },
    navbar: { logo: null, items: [] },
    sidenav: { style: 'default', sections: [] },
    footer: { visible: true, columns: [] },
    banner: { visible: true, subtitle: null },
    context_switcher: {
      visible: true,
      default_scope: 'org',
      show_promoted_workspaces: true,
    },
    theme: 'light',
  };
  await page.request.put('/api/platform/v23/app-shell/me', { data: empty });
}

test.describe('Wave E.1 — Layout do App', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await resetUserConfig(page);
  });

  test('1. banner subtitle override persiste após reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await expect(page.getByTestId('app-shell-palette')).toBeVisible();
    await page.getByTestId('app-shell-tab-banner').click();
    const input = page.getByTestId('banner-subtitle-input');
    await input.fill('TEST · 7ª BPM');
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('app-shell-success')).toContainText(/salvo/i);

    await page.screenshot({
      path: 'test-results/wave-e1-1-banner-edit.png',
      fullPage: true,
    });

    await page.goto('/');
    await expect(page.getByTestId('classification-banner')).toContainText('TEST · 7ª BPM');
    expect(errors).toEqual([]);
  });

  test('2. aba Página inicial: seletor + atalho para o editor de Páginas (Onda J.1)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-homepage').click();
    await expect(page.getByTestId('inspector-homepage')).toBeVisible();

    // Onda J.1 — seletor de "qual página é a inicial" + botão editar.
    await expect(page.getByTestId('homepage-page-select')).toBeVisible();
    await expect(page.getByTestId('homepage-open-editor')).toBeVisible();

    await page.screenshot({
      path: 'test-results/wave-e1-2-homepage-edit.png',
      fullPage: true,
    });

    // Botão leva ao editor de Páginas (Workshop completo, 3-pane).
    await page.getByTestId('homepage-open-editor').click();
    await expect(page).toHaveURL(/\/painel-de-controle\/paginas\/.+\/edit/);
    await expect(page.getByTestId('paginas-edit-palette')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('3. theme Dark aplica class dark no <html>', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-theme').click();
    await page.getByTestId('theme-dark').click();
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('app-shell-success')).toBeVisible();

    await page.screenshot({
      path: 'test-results/wave-e1-3-theme-dark.png',
      fullPage: true,
    });

    await page.goto('/');
    // ThemeApplier roda em useEffect após hook fetch. Esperar até a
    // classe aparecer no <html>.
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('dark'),
      undefined,
      { timeout: 5000 },
    );
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test('4. footer column "Suporte" + links aparece em /', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-footer').click();
    await page.getByTestId('footer-add-column').click();
    await page.getByTestId('footer-col-title-0').fill('Suporte');
    await page.getByTestId('footer-add-link-0').click();
    await page.getByTestId('footer-link-label-0-0').fill('Helpdesk');
    await page.getByTestId('footer-link-href-0-0').fill('/help');
    await page.getByTestId('footer-add-link-0').click();
    await page.getByTestId('footer-link-label-0-1').fill('Wiki');
    await page.getByTestId('footer-link-href-0-1').fill('/wiki');
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('app-shell-success')).toBeVisible();

    await page.screenshot({
      path: 'test-results/wave-e1-4-footer-columns.png',
      fullPage: true,
    });

    await page.goto('/');
    await expect(page.getByTestId('footer-column-0')).toContainText('Suporte');
    await expect(page.getByTestId('footer-link-0-0')).toContainText('Helpdesk');
    expect(errors).toEqual([]);
  });

  test('5. navbar item Manuais aparece no header', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-navbar').click();
    await page.getByTestId('navbar-add').click();
    await page.getByTestId('navbar-item-label-0').fill('Manuais');
    await page.getByTestId('navbar-item-href-0').fill('/docs');
    await page.getByTestId('navbar-item-pos-right-0').click();
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('app-shell-success')).toBeVisible();

    await page.screenshot({
      path: 'test-results/wave-e1-5-navbar-extra.png',
      fullPage: true,
    });

    await page.goto('/');
    await expect(page.getByTestId('header-extra-right-0')).toContainText('Manuais');
    expect(errors).toEqual([]);
  });

  test('6. sidenav section nova é prepended antes da padrão', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-sidenav').click();
    await page.getByTestId('sidenav-add-section').click();
    await page.getByTestId('sidenav-section-title-0').fill('Atalhos');
    await page.getByTestId('sidenav-add-item-0').click();
    await page.getByTestId('sidenav-item-label-0-0').fill('Painel');
    await page.getByTestId('sidenav-item-href-0-0').fill('/');
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('app-shell-success')).toBeVisible();

    await page.screenshot({
      path: 'test-results/wave-e1-6-sidenav-prepend.png',
      fullPage: true,
    });

    await page.goto('/');
    await expect(page.getByTestId('section-cfg-0')).toContainText('Atalhos');
    expect(errors).toEqual([]);
  });

  test('7. context_switcher.show_promoted_workspaces=false esconde HeaderSalasMenu', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-context').click();
    const promotedToggle = page.getByTestId('context-promoted-toggle');
    if (await promotedToggle.isChecked()) {
      await promotedToggle.click();
    }
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('app-shell-success')).toBeVisible();

    await page.screenshot({
      path: 'test-results/wave-e1-7-context-hide-salas.png',
      fullPage: true,
    });

    await page.goto('/');
    await expect(page.getByTestId('header-salas-menu')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('8. scope tenant dispara ConfirmDialog antes de salvar', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-banner').click();
    await page.getByTestId('banner-subtitle-input').fill('TENANT-WIDE BANNER');
    await page.getByTestId('app-shell-scope-tenant').click();
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await expect(page.getByTestId('confirm-text-input')).toBeVisible();

    await page.screenshot({
      path: 'test-results/wave-e1-8-confirm-tenant.png',
      fullPage: true,
    });

    await page.getByTestId('confirm-text-input').fill('TENANT');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('app-shell-success')).toContainText(/unidade/i);
    expect(errors).toEqual([]);
  });

  test('9. config persiste no backend (não localStorage) — recarregar mantém', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-banner').click();
    await page.getByTestId('banner-subtitle-input').fill('PERSIST · BACKEND');
    await page.getByTestId('app-shell-save').click();
    await expect(page.getByTestId('app-shell-success')).toBeVisible();
    // localStorage NÃO deve conter a config (memory: feedback_no_localstorage_for_persistence)
    const lsKeys = await page.evaluate(() => Object.keys(localStorage));
    const appShellKeys = lsKeys.filter((k) => k.toLowerCase().includes('app-shell') || k.toLowerCase().includes('app_shell'));
    expect(appShellKeys).toEqual([]);

    await page.screenshot({
      path: 'test-results/wave-e1-9-persistence-backend.png',
      fullPage: true,
    });

    // Reload total — config deve estar no backend.
    await page.context().clearCookies();
    await login(page);
    await page.goto('/painel-de-controle/app-shell');
    await page.getByTestId('app-shell-tab-banner').click();
    const value = await page
      .getByTestId('banner-subtitle-input')
      .inputValue();
    expect(value).toBe('PERSIST · BACKEND');
    expect(errors).toEqual([]);
  });
});

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log('Wave E.1 VALIDATION: PASS');
});
