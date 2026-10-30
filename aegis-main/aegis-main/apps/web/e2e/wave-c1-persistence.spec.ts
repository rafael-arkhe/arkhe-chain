/**
 * E2E · Wave C.1 — Persistência de Pilots / Autopilot / Scenarios
 * ─────────────────────────────────────────────────────────────────────
 *
 * Valida que o histórico das três features sobrevive a um reload da
 * página — antes do Wave C.1 cada uma mantinha o histórico apenas em
 * ``React.useState``.
 *
 * 1. Login admin via /api/auth/login.
 * 2. /pilots: dispara 1 pilot → reload → confirma que aparece no histórico.
 * 3. /autopilot: dispara 1 autopilot → reload → confirma histórico.
 * 4. /scenarios: aplica 1 merge → reload → confirma histórico.
 * 5. Zero console errors.
 * 6. Screenshots para auditoria visual.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

const ALLOWED_CONSOLE_NOISE =
  /Failed to load resource|Download the React DevTools|JSX transform|preload|preloaded but not used/i;

test.describe('Wave C.1 — persistência cross-reload', () => {
  test('Pilots: dispara → recarrega → histórico persiste', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);

    // Pega 1 action_id válido para o pilot.
    const listRes = await page.request.get('/api/platform/v23/action-types');
    expect(listRes.ok(), `list action-types failed: ${listRes.status()}`).toBeTruthy();
    const actions = (await listRes.json()) as {
      id: string;
      name: string;
      auto_approvable: boolean;
    }[];
    expect(actions.length, 'tenant tem ao menos 1 action').toBeGreaterThan(0);
    const candidate = actions[0];

    await page.goto('/painel-de-controle/pilots');
    await expect(page.getByTestId('pilots-page')).toBeVisible();

    // Roteiros abre no modo Conversa (default); alterna para o builder Avançado.
    await page.getByTestId('pilots-mode-advanced').click();

    // Preenche e dispara.
    const uniqueGoal = `Wave C.1 pilot — ${Date.now()}`;
    await page.getByTestId('pilots-goal').fill(uniqueGoal);
    await expect(async () => {
      const opts = await page
        .getByTestId('pilots-step-0-action')
        .locator('option')
        .count();
      expect(opts).toBeGreaterThan(1);
    }).toPass({ timeout: 5000 });
    await page
      .getByTestId('pilots-step-0-action')
      .selectOption({ value: candidate.id });
    await page.getByTestId('pilots-step-0-input').fill('{}');
    await page.getByTestId('pilots-step-0-note').fill('wave-c1-validation');
    await page.getByTestId('pilots-submit').click();

    // Espera o histórico aparecer.
    await expect(page.getByTestId('pilots-history-list')).toBeVisible({
      timeout: 15000,
    });
    const beforeReloadCount = await page
      .getByTestId('pilots-history-list')
      .locator('li')
      .count();
    expect(beforeReloadCount).toBeGreaterThanOrEqual(1);

    // CRÍTICO — recarrega a página. Pré-Wave C.1, isso zerava o histórico.
    await page.reload();
    await expect(page.getByTestId('pilots-page')).toBeVisible();
    // Após o reload o modo volta para Conversa — reabre o Avançado p/ ver o histórico.
    await page.getByTestId('pilots-mode-advanced').click();
    await expect(page.getByTestId('pilots-history-list')).toBeVisible({
      timeout: 15000,
    });

    // O pilot deve aparecer pelo texto do goal (único).
    await expect(page.getByText(uniqueGoal).first()).toBeVisible({
      timeout: 5000,
    });

    await page.screenshot({
      path: 'test-results/wave-c1-pilots-after-reload.png',
      fullPage: true,
    });

    expect(
      consoleErrors.filter((e) => !ALLOWED_CONSOLE_NOISE.test(e)),
      `console errors em /pilots: ${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });

  test('Autopilot: dispara → recarrega → histórico persiste', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);

    // Procura uma action auto-aprovável.
    const listRes = await page.request.get('/api/platform/v23/action-types');
    const actions = (await listRes.json()) as {
      id: string;
      auto_approvable: boolean;
    }[];
    const eligible = actions.find((a) => a.auto_approvable);

    await page.goto('/painel-de-controle/autopilot');
    await expect(page.getByTestId('autopilot-page')).toBeVisible();

    if (!eligible) {
      // Sem ação auto-aprovável: validação simplificada (só o block do
      // archive deve renderizar mesmo sem run).
      await expect(page.getByTestId('autopilot-archive')).toBeVisible({
        timeout: 5000,
      });
      await page.reload();
      await expect(page.getByTestId('autopilot-page')).toBeVisible();
      await expect(page.getByTestId('autopilot-archive')).toBeVisible();
      await page.screenshot({
        path: 'test-results/wave-c1-autopilot-no-eligible.png',
        fullPage: true,
      });
      return;
    }

    // O objetivo é derivado da ação — não há mais campo de objetivo.
    await page
      .getByTestId('autopilot-action')
      .selectOption({ value: eligible.id });
    // "até": "o resultado disser" + texto (inline, sem JSON).
    await page.getByTestId('autopilot-stop-contains').click();
    await page.getByTestId('autopilot-term-contains').fill('ok');
    await page.getByTestId('autopilot-run').click();

    await expect(page.getByTestId('autopilot-run-detail')).toBeVisible({
      timeout: 20000,
    });

    // Espera o archive aparecer.
    await expect(page.getByTestId('autopilot-archive')).toBeVisible();
    await expect(page.getByTestId('autopilot-archive-list')).toBeVisible({
      timeout: 5000,
    });

    // CRÍTICO — reload.
    await page.reload();
    await expect(page.getByTestId('autopilot-page')).toBeVisible();
    await expect(page.getByTestId('autopilot-archive-list')).toBeVisible({
      timeout: 10000,
    });
    // Persistência: ao menos uma rotina no histórico após o reload (o
    // objetivo é derivado da ação, então conferimos a presença do item).
    await expect(
      page
        .locator(
          '[data-testid^="autopilot-archive-"]:not([data-testid="autopilot-archive-list"]):not([data-testid="autopilot-archive-error"])',
        )
        .first(),
    ).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: 'test-results/wave-c1-autopilot-after-reload.png',
      fullPage: true,
    });

    expect(
      consoleErrors.filter((e) => !ALLOWED_CONSOLE_NOISE.test(e)),
      `console errors em /autopilot: ${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });

  test('Scenarios: merge → recarrega → histórico persiste', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);

    // Pega 1 node_id válido — usa /ontology/nodes (não /node-search que
    // tem bug pré-existente em property_markings.py).
    const nodesRes = await page.request.get('/api/ontology/nodes?limit=5');
    expect(
      nodesRes.ok(),
      `ontology/nodes failed: ${nodesRes.status()}`,
    ).toBeTruthy();
    const nodes = (await nodesRes.json()) as { id: string; name: string }[];

    await page.goto('/painel-de-controle/scenarios');
    await expect(page.getByTestId('scenarios-page')).toBeVisible();

    const uniqueName = `Wave C.1 scenario ${Date.now()}`;
    await page.getByTestId('scenarios-name').fill(uniqueName);
    await page
      .getByTestId('scenarios-description')
      .fill('wave-c1-validation');

    if (nodes.length === 0) {
      // Sem nós no tenant — não dá pra fazer merge. Confirma só que o
      // histórico vazio carrega.
      await expect(page.getByTestId('scenarios-summary')).toBeVisible();
      await page.reload();
      await expect(page.getByTestId('scenarios-page')).toBeVisible();
      await page.screenshot({
        path: 'test-results/wave-c1-scenarios-empty.png',
        fullPage: true,
      });
      return;
    }

    // Preenche node_id manualmente no primeiro patch.
    const idInputs = page.locator('[data-testid^="patch-node-id-"]');
    await idInputs.first().fill(nodes[0].id);

    // Preview → Merge
    await page.getByTestId('scenarios-preview-btn').click();
    await expect(page.getByTestId('scenarios-summary-text')).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId('scenarios-merge-btn').click();

    // Confirm dialog — testids vêm de components/dialog/confirm-dialog.tsx.
    // requireConfirmText='aplicar' bloqueia o botão OK até digitar o texto.
    await expect(page.getByTestId('confirm-dialog')).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId('confirm-text-input').fill('aplicar');
    await page.getByTestId('confirm-ok').click();

    // Espera o merge processar.
    await expect(page.getByTestId('scenarios-history')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(uniqueName).first()).toBeVisible({
      timeout: 5000,
    });

    // CRÍTICO — reload.
    await page.reload();
    await expect(page.getByTestId('scenarios-page')).toBeVisible();
    await expect(page.getByTestId('scenarios-history')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(uniqueName).first()).toBeVisible({
      timeout: 5000,
    });

    await page.screenshot({
      path: 'test-results/wave-c1-scenarios-after-reload.png',
      fullPage: true,
    });

    expect(
      consoleErrors.filter((e) => !ALLOWED_CONSOLE_NOISE.test(e)),
      `console errors em /scenarios: ${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });
});
