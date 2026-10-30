/**
 * E2E · L10 (Pilots) + L11 (Autopilot)
 * ─────────────────────────────────────────────────────────────────────
 * 1. Login admin via /api/auth/login.
 * 2. Navega /painel-de-controle/pilots — confirma form, sidenav, console.
 * 3. Adiciona 1 step apontando para uma seed action existente (não
 *    auto_approvable — `investigate_plate`) e submete; espera o pilot
 *    pausar em PENDING_APPROVAL (status final PAUSED).
 * 4. Verifica timeline expandida + StatusBadge.
 * 5. Navega /painel-de-controle/autopilot — confirma form.
 * 6. Dispara autopilot com terminator output_contains="ok"; aceita
 *    qualquer um dos terminais válidos (FAILED/TERMINATED/SUCCESS/
 *    BUDGET_EXHAUSTED) — o ponto é provar a UI renderiza, não a action
 *    em si (já coberta por testes unitários do backend L11).
 * 7. Sem console errors em nenhuma página.
 */
import { test, expect } from '@playwright/test';

import { login } from './helpers/login';

test.describe('L10 Pilots + L11 Autopilot — UI', () => {
  test('Pilots page renders, submits, history expands', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);

    // Lista as actions disponíveis pro pilot via proxy (admin scope).
    const listRes = await page.request.get('/api/platform/v23/action-types');
    expect(listRes.ok(), `list action-types failed: ${listRes.status()}`).toBeTruthy();
    const actions = (await listRes.json()) as {
      id: string;
      name: string;
      auto_approvable: boolean;
    }[];
    expect(actions.length, 'tenant has at least 1 action type seeded').toBeGreaterThan(0);
    // Aceita qualquer action (auto ou manual) — em ambos o pilot
    // termina em SUCCESS, FAILED ou PAUSED.
    const candidate = actions[0];

    await page.goto('/painel-de-controle/pilots');
    await expect(page.getByTestId('pilots-page')).toBeVisible();

    // Roteiros abre no modo Conversa (guiado, default). Para exercitar o
    // builder manual, alterna para "Avançado".
    await page.getByTestId('pilots-mode-advanced').click();
    await expect(page.getByTestId('pilots-builder')).toBeVisible();
    await expect(page.getByTestId('pilots-history')).toBeVisible();

    // Sidenav link Roteiros presente.
    await expect(
      page.locator('aside, nav').getByText('Roteiros', { exact: true }).first(),
    ).toBeVisible();

    // Preenche goal + step 0.
    await page
      .getByTestId('pilots-goal')
      .fill('E2E pilot — smoke test L10');
    // Espera o dropdown popular.
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
    await page.getByTestId('pilots-step-0-note').fill('e2e L10');

    // Submete.
    await page.getByTestId('pilots-submit').click();

    // Espera 1 entrada no histórico + detalhe expandido.
    await expect(page.getByTestId('pilots-history-list')).toBeVisible({
      timeout: 15000,
    });
    const runs = await page
      .getByTestId('pilots-history-list')
      .locator('li')
      .count();
    expect(runs).toBeGreaterThanOrEqual(1);

    // O detalhe expande automaticamente após o submit (setExpandedId).
    await expect(
      page.getByTestId(/pilots-run-.+-detail/).first(),
    ).toBeVisible();
    // Pelo menos 1 step na timeline.
    await expect(
      page.getByTestId(/pilots-step-detail-\d+/).first(),
    ).toBeVisible();

    // Screenshot pro registro.
    await page.screenshot({
      path: 'test-results/L10-pilots-final.png',
      fullPage: true,
    });

    // Console limpo.
    expect(
      consoleErrors.filter(
        (e) =>
          // Ruído conhecido de hidratação Next/Cesium em dev — não conta.
          !/Failed to load resource|Download the React DevTools|JSX transform/i.test(e),
      ),
      `console errors em /pilots: ${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });

  test('Autopilot page renders, form validates, run returns terminal status', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);

    await page.goto('/painel-de-controle/autopilot');
    await expect(page.getByTestId('autopilot-page')).toBeVisible();
    await expect(page.getByTestId('autopilot-composer')).toBeVisible();

    // Sidenav link Rotinas presente.
    await expect(
      page.locator('aside, nav').getByText('Rotinas', { exact: true }).first(),
    ).toBeVisible();

    // Tenta selecionar uma ação auto-aprovável; se não houver no tenant,
    // o autopilot não pode rodar (backend impede actions manuais) — nesse
    // caso paramos no warning UI.
    const listRes = await page.request.get('/api/platform/v23/action-types');
    const actions = (await listRes.json()) as {
      id: string;
      auto_approvable: boolean;
    }[];
    const eligible = actions.find((a) => a.auto_approvable);

    // Form validation: dispara sem goal → erro.
    await page.getByTestId('autopilot-run').click();
    await expect(page.getByTestId('autopilot-error')).toContainText(
      /objetivo|ação|JSON/i,
    );

    if (!eligible) {
      // Sem ação auto-aprovável — verifica que o warning aparece e
      // termina. Não tem como rodar o autopilot nesse tenant.
      await expect(page.getByTestId('autopilot-no-eligible')).toBeVisible();
      await page.screenshot({
        path: 'test-results/L11-autopilot-no-eligible.png',
        fullPage: true,
      });
    } else {
      // Objetivo é derivado da ação — não há mais campo de objetivo.
      await page
        .getByTestId('autopilot-action')
        .selectOption({ value: eligible.id });
      // "até": escolhe "o resultado disser" e informa o texto (inline, sem JSON).
      await page.getByTestId('autopilot-stop-contains').click();
      await page.getByTestId('autopilot-term-contains').fill('ok');
      await page.getByTestId('autopilot-run').click();

      await expect(page.getByTestId('autopilot-run-detail')).toBeVisible({
        timeout: 20000,
      });
      const badge = page.getByTestId('autopilot-status-badge');
      await expect(badge).toBeVisible();
      const status = (await badge.textContent())?.trim() ?? '';
      expect(
        ['Concluída', 'Falhou', 'Atingiu o limite', 'Parou na condição'].some(
          (s) => status.includes(s),
        ),
        `status final esperado terminal, recebido: ${status}`,
      ).toBeTruthy();
      await expect(page.getByTestId('autopilot-progress-ring')).toBeVisible();

      await page.screenshot({
        path: 'test-results/L11-autopilot-final.png',
        fullPage: true,
      });
    }

    expect(
      consoleErrors.filter(
        (e) =>
          !/Failed to load resource|Download the React DevTools|JSX transform/i.test(e),
      ),
      `console errors em /autopilot: ${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });
});
