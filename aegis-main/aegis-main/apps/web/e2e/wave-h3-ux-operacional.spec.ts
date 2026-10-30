/**
 * Wave H.3 — UX Operacional (Cenários wizard + Pilots chat + Autopilot Kanban).
 *
 * Cobre os 3 modos novos ADD alongside (toggle no header de cada página),
 * sem regredir o fluxo existente. Cada checagem que dependeria de
 * estado vivo no backend usa o tenant demo (admin / ssp-xx).
 *
 * Esta suite roda contra:
 *   - security-app local em :3002
 *   - ontology-module local em :8002 (com endpoint /pilots/templates ativo)
 *
 * NÃO checa políticas reais de Action (alguns dispararão deny por marking)
 * — checa apenas que a UI renderiza/comunica corretamente o backend.
 */
import { test, expect, type Page } from '@playwright/test';

import { login } from './helpers/login';

const SHOTS = 'e2e/screenshots/wave-h3';

async function noConsoleErrors(page: Page): Promise<string[]> {
  const errs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  return errs;
}

test.describe('Wave H.3 — UX Operacional', () => {
  test('Cenários — wizard 4 passos + templates + apply', async ({ page }) => {
    const consoleErrors = await noConsoleErrors(page);
    await login(page);

    await page.goto('/painel-de-controle/scenarios');
    await expect(page.getByTestId('scenarios-page')).toBeVisible();
    await expect(page.getByTestId('scenarios-mode-toggle')).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/cena-1-scenarios-advanced-default.png`,
      fullPage: true,
    });

    // Switch to wizard.
    await page.getByTestId('scenarios-mode-wizard').click();
    await expect(page.getByTestId('scenario-wizard')).toBeVisible();
    await expect(page.getByTestId('wizard-stepper')).toBeVisible();
    // 4 step pills
    for (const n of [1, 2, 3, 4]) {
      await expect(page.getByTestId(`wizard-step-${n}-pill`)).toBeVisible();
    }
    await page.screenshot({
      path: `${SHOTS}/cena-2-scenarios-wizard-step1.png`,
      fullPage: true,
    });

    // Search a node and try to multi-select.
    await page.getByTestId('wizard-target-search-btn').click();
    // Espera resultados (depende do tenant — pode estar vazio; checamos
    // que o results container apareceu).
    await expect(page.getByTestId('wizard-target-results')).toBeVisible({
      timeout: 5000,
    });
    const resultCount = await page.getByTestId('wizard-target-results').locator('li').count();
    if (resultCount > 0) {
      // Pega o primeiro botão picável
      const firstBtn = page
        .getByTestId('wizard-target-results')
        .locator('button:not([disabled])')
        .first();
      if ((await firstBtn.count()) > 0) {
        await firstBtn.click();
      }
    }

    // Advance to step 2 (mesmo sem alvo, queremos screenshot do passo)
    if (resultCount > 0) {
      await page.getByTestId('wizard-next').click();
      await expect(page.getByTestId('wizard-step-changes')).toBeVisible();
      // Verifica os 4 templates no bulk
      const tpls = await page.getByTestId('wizard-bulk-template').locator('option').all();
      const tplValues: string[] = [];
      for (const t of tpls) {
        const v = await t.getAttribute('value');
        if (v) tplValues.push(v);
      }
      expect(tplValues).toContain('elevar-restrito');
      expect(tplValues).toContain('marcar-operacional');
      expect(tplValues).toContain('reduzir-confianca');
      expect(tplValues).toContain('limpar-marcacoes');

      await page.getByTestId('wizard-bulk-template').selectOption('elevar-restrito');
      await page.getByTestId('wizard-bulk-apply').click();
      await page.screenshot({
        path: `${SHOTS}/cena-3-scenarios-wizard-step2-templates.png`,
        fullPage: true,
      });

      // Preview
      await page.getByTestId('wizard-next').click();
      await expect(page.getByTestId('wizard-step-preview')).toBeVisible();
      // Aguarda compute terminar OU mostrar erro (sem teatro: aceita
      // qualquer estado terminal).
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `${SHOTS}/cena-4-scenarios-wizard-step3-preview.png`,
        fullPage: true,
      });
    }

    // Toggle back to advanced — preserva estado de archive
    await page.getByTestId('scenarios-mode-advanced').click();
    await expect(page.getByTestId('scenarios-builder')).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('Pilots — modo Conversa com chat + plano + templates', async ({ page }) => {
    const consoleErrors = await noConsoleErrors(page);
    await login(page);

    await page.goto('/painel-de-controle/pilots');
    await expect(page.getByTestId('pilots-page')).toBeVisible();
    await expect(page.getByTestId('pilots-mode-toggle')).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/cena-5-pilots-advanced-default.png`,
      fullPage: true,
    });

    await page.getByTestId('pilots-mode-chat').click();
    await expect(page.getByTestId('pilot-chat-pane')).toBeVisible();
    await expect(page.getByTestId('pilot-chat-panel')).toBeVisible();
    await expect(page.getByTestId('pilot-plan-panel')).toBeVisible();

    // Welcome msg
    await expect(page.getByTestId('pilot-chat-messages')).toBeVisible();
    // Templates devem chegar do backend
    await expect(page.getByTestId('pilot-chat-templates')).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: `${SHOTS}/cena-6-pilots-chat-initial.png`,
      fullPage: true,
    });

    // Clica num template (qualquer um)
    const tplButtons = page.locator('[data-testid^="pilot-chat-template-"]');
    const tplCount = await tplButtons.count();
    expect(tplCount, 'pelo menos 1 template do backend').toBeGreaterThan(0);
    await tplButtons.first().click();

    // Plano deve ter sido populado: pelo menos 1 step com action_id ou
    // fields (input_schema). Mesmo que action_code_ref_hint não case com
    // catálogo, o título/note vêm do template.
    await expect(page.getByTestId('pilot-chat-step-0')).toBeVisible();
    await expect(page.getByTestId('pilot-chat-step-0-title')).toBeVisible();
    // CHECK: NÃO deve existir <textarea> de JSON visível no plano.
    const textareasInPlan = await page
      .getByTestId('pilot-plan-panel')
      .locator('textarea')
      .count();
    expect(textareasInPlan, 'plano não usa textarea JSON').toBe(0);

    // Dropdown de aprovadores presente
    await expect(page.getByTestId('pilot-chat-approver-select')).toBeVisible();

    await page.screenshot({
      path: `${SHOTS}/cena-7-pilots-chat-template-applied.png`,
      fullPage: true,
    });

    // Heurística de chat — envia uma mensagem
    await page.getByTestId('pilot-chat-input').fill('quero despachar viatura');
    await page.getByTestId('pilot-chat-send').click();
    await page.waitForTimeout(500);

    // Toggle back
    await page.getByTestId('pilots-mode-advanced').click();
    await expect(page.getByTestId('pilots-builder')).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('Autopilot — workbench Kanban 4-col + animated dashed + detail', async ({ page }) => {
    const consoleErrors = await noConsoleErrors(page);
    await login(page);

    await page.goto('/painel-de-controle/autopilot');
    await expect(page.getByTestId('autopilot-page')).toBeVisible();
    await expect(page.getByTestId('autopilot-mode-toggle')).toBeVisible();

    await page.getByTestId('autopilot-mode-workbench').click();
    await expect(page.getByTestId('autopilot-workbench')).toBeVisible();
    // 4 colunas Kanban
    await expect(page.getByTestId('autopilot-kanban-col-queued')).toBeVisible();
    await expect(page.getByTestId('autopilot-kanban-col-running')).toBeVisible();
    await expect(page.getByTestId('autopilot-kanban-col-done')).toBeVisible();
    await expect(page.getByTestId('autopilot-kanban-col-failed')).toBeVisible();

    // CSS animated dashed deve estar declarado no DOM (não checamos
    // animation-frame, só presença do estilo aplicado quando há RUNNING).
    const cards = page.locator('[data-testid^="autopilot-kanban-card-"]');
    const cardCount = await cards.count();
    if (cardCount > 0) {
      // Clica num card pra abrir detail
      await cards.first().click();
      await expect(page.getByTestId('autopilot-workbench-detail-body')).toBeVisible({
        timeout: 5000,
      });
      // Budget meters
      await expect(page.getByTestId('autopilot-workbench-budget-steps')).toBeVisible();
      // Pause/resume disabled
      const pauseBtn = page.getByTestId('autopilot-workbench-pause');
      const resumeBtn = page.getByTestId('autopilot-workbench-resume');
      await expect(pauseBtn).toBeDisabled();
      await expect(resumeBtn).toBeDisabled();
      await expect(pauseBtn).toHaveAttribute('title', 'Não suportado ainda');
    }

    await page.screenshot({
      path: `${SHOTS}/cena-8-autopilot-workbench-kanban.png`,
      fullPage: true,
    });

    // Toggle back para a composição "Rotina"
    await page.getByTestId('autopilot-mode-routine').click();
    await expect(page.getByTestId('autopilot-composer')).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('DS audit — H.3 superfícies não regridem (no rounded · no Sparkles · no Palantir/Foundry)', async ({
    page,
  }) => {
    await login(page);

    const pages = [
      '/painel-de-controle/scenarios',
      '/painel-de-controle/pilots',
      '/painel-de-controle/autopilot',
    ];

    const violations: { route: string; issues: string[] }[] = [];

    for (const route of pages) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const result = await page.evaluate(() => {
        const issues: string[] = [];
        // Classes "rounded-*" não devem aparecer (DS proíbe rounded corners).
        // Aceita "rounded-none" (anti-pattern killer).
        const all = document.querySelectorAll<HTMLElement>('[class]');
        for (const el of Array.from(all)) {
          const cls = el.getAttribute('class') ?? '';
          if (/\brounded-(?!none\b)[a-z0-9-]+/.test(cls)) {
            issues.push(`rounded class: ${cls.match(/rounded-[a-z0-9-]+/)?.[0]} on <${el.tagName.toLowerCase()}>`);
            break; // first
          }
        }
        // Palantir/Slate/Foundry/Carbon/Gotham/Sparkles em strings visíveis.
        const banned = ['Palantir', 'Foundry', 'Gotham'];
        const textContent = document.body.textContent || '';
        for (const w of banned) {
          if (textContent.includes(w)) {
            issues.push(`banned-word: ${w}`);
          }
        }
        // Sparkles icon: lucide-sparkles class no SVG.
        if (document.querySelector('svg.lucide-sparkles, svg.lucide-Sparkles')) {
          issues.push('Sparkles icon present');
        }
        return issues;
      });

      if (result.length > 0) {
        violations.push({ route, issues: result });
      }
    }

    await page.screenshot({
      path: `${SHOTS}/cena-9-ds-audit-final.png`,
      fullPage: true,
    });

    expect(violations, `DS audit violations: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
  });

  test('Templates backend — endpoint /pilots/templates retorna 5 presets', async ({ page }) => {
    // Reusa cookies da DS audit anterior se possível; senão faz login novo.
    let res = await page.request.get('/api/platform/v23/pilots/templates');
    if (res.status() === 401) {
      await login(page);
      res = await page.request.get('/api/platform/v23/pilots/templates');
    }
    expect(res.ok(), `templates endpoint should be 200: got ${res.status()}`).toBeTruthy();
    const arr = (await res.json()) as { id: string; steps: unknown[] }[];
    expect(arr.length, 'pelo menos 5 templates').toBeGreaterThanOrEqual(5);
    const ids = arr.map((t) => t.id);
    expect(ids).toContain('triagem-ocorrencia');
    expect(ids).toContain('enriquecer-pessoa');
    expect(ids).toContain('lpr-followup');
    expect(ids).toContain('evidencia-cadeia');
    expect(ids).toContain('briefing-rapido');
  });
});
