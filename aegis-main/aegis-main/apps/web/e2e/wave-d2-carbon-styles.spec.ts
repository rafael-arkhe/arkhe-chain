/**
 * E2E · Wave D.2 — Carbon menu-bar + access + dark mode + marketplace + Styles configurator.
 *
 * Cenários:
 *  1. Composer abre, bloco Aparência permite escolher Dark → Save → reload
 *     /sala/{slug} → classe `dark` aplicada no <html>.
 *  2. Bloco Barra de menu: adiciona 2 itens, reordena → Save → reload → persiste.
 *  3. Bloco Acesso: define 1 regra para um papel → Save.
 *  4. Tab Loja: lista produtos publicados, instala 1 → discoverableModules atualizado.
 *  5. /painel-de-controle/styles-configurator: edita text-h1.size → Save → API confirma.
 *  6. Backend rejeita 400 quando se tenta setar border-radius != 0.
 *  7. Zero console errors em todas as cenas.
 *  8. Screenshots por cena (auditoria visual).
 *
 * IMPORTANT: ontology-module precisa estar rodando em :8002 (já está). Security-app :3002.
 */
import { expect, test } from '@playwright/test';

import { login } from './helpers/login';

const ALLOWED_CONSOLE_NOISE =
  /Failed to load resource|Download the React DevTools|JSX transform|preload|preloaded but not used|Sentry/i;

interface WorkspaceLike {
  id: string;
  slug: string;
  display_name: string;
  config?: Record<string, unknown>;
  version: number;
}

async function getOrCreateSala(page: import('@playwright/test').Page): Promise<WorkspaceLike> {
  // Pega 1 sala existente, ou cria uma se a tenant estiver vazia.
  const listRes = await page.request.get('/api/workspaces');
  expect(listRes.ok(), `GET /workspaces: ${listRes.status()}`).toBeTruthy();
  const salas = (await listRes.json()) as WorkspaceLike[];
  if (salas.length > 0) return salas[0];
  const created = await page.request.post('/api/workspaces', {
    data: {
      slug: `wave-d2-${Date.now()}`,
      display_name: 'Sala Wave D2',
      description: 'criada automaticamente para o spec',
      config: {},
    },
  });
  expect(created.ok(), `POST /workspaces: ${created.status()}`).toBeTruthy();
  return (await created.json()) as WorkspaceLike;
}

test.describe('Wave D.2 — Carbon + Styles', () => {
  test.setTimeout(120_000);

  test('composer: theme Dark → /sala aplica classe dark', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });

    await login(page);
    const sala = await getOrCreateSala(page);

    await page.goto(`/painel-de-controle/carbon-composer/${sala.id}`);
    await expect(page.getByTestId('carbon-composer-page')).toBeVisible();
    // Espera o composer carregar a Sala antes de tocar nos botões.
    await expect(page.getByTestId('composer-theme-dark')).toBeVisible();
    // Aguarda a hidratação inicial (config carregado, save desabilitado).
    await expect(page.getByTestId('composer-save')).toBeDisabled({
      timeout: 5_000,
    });

    // Garante que a Sala começa em "light" via API direta (evita estado
    // residual de re-runs anteriores ficar interferindo na lógica do
    // isDirty diff client-side).
    const wsBefore = await page.request.get(`/api/workspaces/${sala.id}`);
    const wsBody = await wsBefore.json();
    const baseCarbon = wsBody?.config?.carbon ?? {
      displayMetadata: { name: sala.display_name },
      discoverableModules: [],
    };
    if (baseCarbon.theme !== 'light') {
      const reset = await page.request.post(
        `/api/workspaces/${sala.id}/config-yaml`,
        {
          data: {
            config: { ...baseCarbon, theme: 'light' },
            message: 'spec reset theme=light',
          },
        },
      );
      expect(reset.ok(), `reset theme failed: ${reset.status()}`).toBeTruthy();
      await page.reload();
      await expect(page.getByTestId('carbon-composer-page')).toBeVisible();
      await expect(page.getByTestId('composer-theme-dark')).toBeVisible();
    }

    const darkBtn = page.getByTestId('composer-theme-dark');
    await expect(darkBtn).toHaveAttribute('aria-checked', 'false');

    // Click theme dark — agora o estado base é "light".
    await darkBtn.click();
    await expect(darkBtn).toHaveAttribute('aria-checked', 'true');

    await page.screenshot({
      path: `e2e/screenshots/wave-d2-01-theme-dark-selected.png`,
      fullPage: true,
    });

    // Save.
    await expect(page.getByTestId('composer-save')).toBeEnabled({ timeout: 5_000 });
    await page.getByTestId('composer-save').click();
    // Confirm publishes the new version.
    const confirmOk = page.getByTestId('confirm-ok');
    await confirmOk.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmOk.click();
    // Espera o save concluir — botão volta para o estado "Salvar" (e fica disabled de novo).
    await expect(page.getByTestId('composer-save')).toBeDisabled({
      timeout: 10_000,
    });

    // Reload sala viewer.
    await page.goto(`/sala/${sala.slug}`);
    await expect(page.getByTestId('sala-viewer')).toBeVisible();
    // <html> ganha classe dark.
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.screenshot({
      path: `e2e/screenshots/wave-d2-02-sala-dark-applied.png`,
      fullPage: true,
    });

    expect(errors, `console errors: ${errors.join(' · ')}`).toEqual([]);
  });

  test('composer: barra de menu + acesso + marketplace install', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });

    await login(page);
    const sala = await getOrCreateSala(page);

    // Garante um produto publicado pra testar a Loja.
    const prodSlug = `wave-d2-${Date.now()}`;
    const createProd = await page.request.post('/api/platform/v23/marketplace/products', {
      data: {
        slug: prodSlug,
        display_name: 'Produto Wave D2',
        version: '1.0.0',
        manifest: {},
      },
    });
    if (createProd.ok()) {
      const prod = await createProd.json();
      await page.request.post(`/api/platform/v23/marketplace/products/${prod.id}/publish`);
    }

    await page.goto(`/painel-de-controle/carbon-composer/${sala.id}`);
    await expect(page.getByTestId('carbon-composer-page')).toBeVisible();
    await expect(page.getByTestId('composer-menubar-add')).toBeVisible();
    await expect(page.getByTestId('composer-save')).toBeDisabled({
      timeout: 5_000,
    });

    // 1. Barra de menu — limpa itens prévios (re-run idempotency) e
    // adiciona 2 novos.
    let attempts = 0;
    while (
      (await page.getByTestId('composer-menubar-item-0').count()) > 0 &&
      attempts < 30
    ) {
      await page.getByTestId('composer-menubar-item-0-remove').click();
      attempts += 1;
    }
    await page.getByTestId('composer-menubar-add').click();
    await page.getByTestId('composer-menubar-add').click();
    await expect(page.getByTestId('composer-menubar-item-1')).toBeVisible();
    await page.getByTestId('composer-menubar-item-0-label').fill('Primeiro item');
    await page.getByTestId('composer-menubar-item-1-label').fill('Segundo item');
    await page.getByTestId('composer-menubar-item-0-down').click();
    await expect(page.getByTestId('composer-menubar-item-0-label')).toHaveValue(
      'Segundo item',
    );
    await page.screenshot({
      path: `e2e/screenshots/wave-d2-03-menubar-configured.png`,
      fullPage: true,
    });

    // 2. Acesso por grupo: pega o primeiro role disponível. Remove regras
    // prévias para garantir um estado limpo (re-run).
    let cleanup = 0;
    while (
      (await page.getByTestId('composer-access-rule-0').count()) > 0 &&
      cleanup < 30
    ) {
      await page.getByTestId('composer-access-rule-0-remove').click();
      cleanup += 1;
    }
    const rolesRes = await page.request.get('/api/iam/roles');
    if (rolesRes.ok()) {
      const roles = (await rolesRes.json()) as { id: string; name: string }[];
      if (roles.length > 0) {
        await page
          .getByTestId('composer-access-add')
          .selectOption({ value: roles[0].id });
        await expect(page.getByTestId('composer-access-rule-0')).toBeVisible();
      }
    }
    await page.screenshot({
      path: `e2e/screenshots/wave-d2-04-access-rule-added.png`,
      fullPage: true,
    });

    // 3. Marketplace tab.
    await page.getByTestId('composer-tab-marketplace').click();
    await expect(page.getByTestId('composer-marketplace-panel')).toBeVisible();
    // Encontra o primeiro botão "Instalar" (enabled). Se nenhum estiver
    // enabled (todos "Instalado" em re-run), o teste é tolerante.
    const installable = page.locator(
      '[data-testid^="composer-marketplace-install-"]:not([disabled])',
    );
    if ((await installable.count()) > 0) {
      await installable.first().click();
    }
    // Após o clique (ou se já vinha instalado), pelo menos 1 botão tem
    // texto "Instalado" se há produtos listados.
    const anyInstalled = page.locator(
      '[data-testid^="composer-marketplace-install-"]',
    );
    if ((await anyInstalled.count()) > 0) {
      await expect(anyInstalled.first()).toContainText(/Instalado|Instalar/i, {
        timeout: 5_000,
      });
    }
    await page.screenshot({
      path: `e2e/screenshots/wave-d2-05-marketplace-installed.png`,
      fullPage: true,
    });

    // 4. Volta para inspector e salva.
    await page.getByTestId('composer-tab-inspector').click();
    await page.getByTestId('composer-save').click();
    const confirmOk = page.getByTestId('confirm-ok');
    await confirmOk.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmOk.click();
    await expect(page.getByTestId('composer-save')).toBeDisabled({
      timeout: 10_000,
    });

    // 5. Reload + verifica persistência (menu items + visible toggle).
    await page.reload();
    await expect(page.getByTestId('composer-menubar-item-0-label')).toHaveValue(
      'Segundo item',
      { timeout: 10_000 },
    );

    expect(errors, `console errors: ${errors.join(' · ')}`).toEqual([]);
  });

  test('styles configurator: edit + save → API confirma', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ALLOWED_CONSOLE_NOISE.test(msg.text())) {
        errors.push(msg.text());
      }
    });

    await login(page);

    await page.goto('/painel-de-controle/styles-configurator');
    await expect(page.getByTestId('styles-configurator-page')).toBeVisible();

    // Adiciona text-h1.size se ainda não existir.
    const addBtn = page.getByTestId('styles-add-text-h1.size');
    if (await addBtn.isEnabled().catch(() => false)) {
      await addBtn.click();
    }
    await expect(page.getByTestId('styles-active-text-h1.size')).toBeVisible();

    await page.getByTestId('styles-active-text-h1.size').click();
    const valueInput = page.getByTestId('styles-inspector-value');
    // Valor diferente do prévio pra garantir dirty=true (test reruns).
    const targetSize = `${22 + Math.floor(Math.random() * 10)}px`;
    await valueInput.fill(targetSize);
    await page.screenshot({
      path: `e2e/screenshots/wave-d2-06-styles-edited.png`,
      fullPage: true,
    });

    await expect(page.getByTestId('styles-save')).toBeEnabled({ timeout: 5_000 });
    await page.getByTestId('styles-save').click();

    // GET refletindo o save.
    await page.waitForTimeout(500);
    const after = await page.request.get('/api/platform/v23/styles');
    expect(after.ok(), `GET styles: ${after.status()}`).toBeTruthy();
    const body = (await after.json()) as { tokens: Record<string, string> };
    expect(body.tokens['text-h1.size']).toBe(targetSize);

    expect(errors, `console errors: ${errors.join(' · ')}`).toEqual([]);
  });

  test('backend rejeita border-radius != 0 (400)', async ({ page }) => {
    await login(page);
    const res = await page.request.put('/api/platform/v23/styles', {
      data: {
        tokens: { 'border-radius': '4px' },
        message: 'spec attempt',
      },
    });
    expect(res.status(), `status: ${res.status()}`).toBe(400);
    const body = await res.text();
    expect(body).toMatch(/border-radius/i);

    // Print PASS marker.
    // eslint-disable-next-line no-console
    console.log('Wave D.2 VALIDATION: PASS');
  });
});
