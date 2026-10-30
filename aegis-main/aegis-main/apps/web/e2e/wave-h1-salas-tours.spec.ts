/**
 * E2E · Wave H.1 (2026-05-23) — UX operacional de Salas + Tours.
 *
 * Operador disse "UX está pessimo, não está claro o uso" — esse spec
 * valida o refazimento:
 *
 *   1. Card de Sala mostra botão dedicado "Iniciar Apresentação"
 *   2. Click no botão Apresentação abre dialog com 4 tabs
 *   3. Tab URL de kiosk exibe link + QR + 3 botões de ação
 *   4. Tab Sessões ativas renderiza (vazia ou com lista)
 *   5. Card de Tour mostra status badge + view counts + "Pré-visualizar"
 *   6. Click "Pré-visualizar" abre overlay simulando o tour real
 *   7. Editor abre wizard de 3 passos
 *   8. Audience filter dropdown funciona
 *   9. Zero console errors
 *   10. Screenshots × 5 cenários
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

const SCREENSHOTS = "e2e/screenshots/wave-h1";

test.describe("Wave H.1 · Salas KioskDialog", () => {
  test("card mostra Iniciar Apresentação + dialog tem 4 tabs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await login(page);
    await page.goto("/painel-de-controle/salas");
    await expect(page.getByTestId("salas-list").or(page.getByText(/Nenhuma Sala/i))).toBeVisible();

    // Se não houver Sala, criamos uma rápida via API para o resto do spec.
    const hasList = await page.getByTestId("salas-list").isVisible();
    if (!hasList) {
      // Tentar criar via UI.
      await page.getByTestId("salas-toggle-create").click();
      await page.getByTestId("salas-slug").fill("aurora-h1");
      await page.getByTestId("salas-name").fill("Sala Aurora H1");
      // Operação obrigatória — pega primeira disponível.
      const projSelect = page.getByTestId("salas-project");
      const options = projSelect.locator("option").nth(1);
      const val = await options.getAttribute("value");
      if (val) {
        await projSelect.selectOption(val);
        await page.getByTestId("salas-submit").click();
        await page.waitForURL(/\/sala\/aurora-h1/);
        await page.goto("/painel-de-controle/salas");
      }
    }

    await page.waitForSelector('[data-testid="salas-list"]', { timeout: 8000 });
    const firstSala = page.getByTestId("salas-list").locator("li").first();
    const slug = await firstSala.getAttribute("data-testid");
    expect(slug).toBeTruthy();
    const salaSlug = (slug ?? "").replace(/^sala-/, "");

    // 1. Botão dedicado Iniciar Apresentação visível.
    const startBtn = page.getByTestId(`sala-start-presentation-${salaSlug}`);
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toContainText(/Iniciar Apresentação/i);
    await page.screenshot({
      path: `${SCREENSHOTS}/01-salas-card-with-start-button.png`,
      fullPage: true,
    });

    // 2. Click Apresentação abre dialog com 4 tabs.
    await page.getByTestId(`sala-kiosk-${salaSlug}`).click();
    await expect(page.getByTestId("sala-kiosk-tab-url")).toBeVisible();
    await expect(page.getByTestId("sala-kiosk-tab-sessions")).toBeVisible();
    await expect(page.getByTestId("sala-kiosk-tab-config")).toBeVisible();
    await expect(page.getByTestId("sala-kiosk-tab-history")).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOTS}/02-kiosk-dialog-4-tabs.png`,
      fullPage: true,
    });

    // 3. URL tab: link + QR + 3 botões.
    await expect(page.getByTestId("sala-kiosk-url-tab")).toBeVisible();
    await expect(page.getByTestId("sala-kiosk-url-value")).toContainText("/sala/");
    await expect(page.getByTestId("sala-kiosk-url-qr")).toBeVisible();
    await expect(page.getByTestId("sala-kiosk-url-copy")).toBeVisible();
    await expect(page.getByTestId("sala-kiosk-open-window")).toBeVisible();
    await expect(page.getByTestId("sala-kiosk-open-fullscreen")).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOTS}/03-kiosk-url-tab.png`,
      fullPage: true,
    });

    // 4. Sessões ativas tab — lista renderiza (vazia ou com itens).
    await page.getByTestId("sala-kiosk-tab-sessions").click();
    await expect(page.getByTestId("sala-kiosk-sessions-tab")).toBeVisible();
    // empty ou lista — qualquer um é válido para este smoke.
    await expect(
      page.getByTestId("sala-kiosk-sessions").or(page.getByTestId("sala-kiosk-no-active")),
    ).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOTS}/04-kiosk-sessions-tab.png`,
      fullPage: true,
    });

    // Zero console errors.
    expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("Wave H.1 · Tours page UX operacional", () => {
  test("card mostra status + view counts + Pré-visualizar + wizard 3 passos", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await login(page);
    await page.goto("/painel-de-controle/tours");

    // Sala selector deve existir mesmo sem Salas.
    await expect(page.getByTestId("tours-sala")).toBeVisible();
    // Espera as options carregarem (Workspaces.list async).
    await expect
      .poll(
        async () => page.getByTestId("tours-sala").locator("option").count(),
        { timeout: 8000 },
      )
      .toBeGreaterThan(1);

    const optsCount = await page.getByTestId("tours-sala").locator("option").count();
    if (optsCount <= 1) {
      // Sem Salas — skip resto do spec.
      test.skip(true, "Nenhuma Sala disponível pra testar Tours UX");
      return;
    }

    // Garante uma sala selecionada (pega index 1, pois 0 é placeholder).
    const firstOptVal = await page
      .getByTestId("tours-sala")
      .locator("option")
      .nth(1)
      .getAttribute("value");
    if (firstOptVal) await page.getByTestId("tours-sala").selectOption(firstOptVal);

    await page.waitForTimeout(500);
    // Se houver tours, esperamos primeiro card; senão, create um rápido.
    const list = page.getByTestId("tours-list");
    const empty = page.getByTestId("tours-empty");
    await expect(list.or(empty)).toBeVisible();

    if (await empty.isVisible()) {
      // Cria um tour mínimo via UI.
      await page.getByTestId("tours-create").click();
      await expect(page.getByTestId("tour-editor")).toBeVisible();
      await page.getByTestId("tour-title").fill("Tour H.1 e2e");
      await page.getByTestId("tour-page-0-title").fill("Página 1");
      await page.getByTestId("tour-save").click();
      await page.waitForTimeout(800);
    }

    // 5. Card de Tour mostra status + view counts + Pré-visualizar.
    const firstTour = page.getByTestId("tours-list").locator("li").first();
    const dataTestId = await firstTour.getAttribute("data-testid");
    const tourId = (dataTestId ?? "").replace(/^tour-/, "");

    await expect(page.getByTestId(`tour-status-${tourId}`)).toBeVisible();
    await expect(page.getByTestId(`tour-view-counts-${tourId}`)).toBeVisible();
    await expect(page.getByTestId(`tour-preview-${tourId}`)).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOTS}/05-tours-card-status-counts.png`,
      fullPage: true,
    });

    // 6. Click "Pré-visualizar" abre overlay.
    await page.getByTestId(`tour-preview-${tourId}`).click();
    await expect(page.getByTestId("tour-preview")).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOTS}/06-tour-preview-overlay.png`,
      fullPage: true,
    });
    // Sair do preview.
    await page.getByTestId("tour-preview-exit").click();

    // 7. Wizard 3 passos.
    await page.getByTestId(`tour-edit-${tourId}`).click();
    await expect(page.getByTestId("tour-wizard-steps")).toBeVisible();
    await expect(page.getByTestId("tour-wizard-step-pages")).toBeVisible();
    await expect(page.getByTestId("tour-wizard-step-content")).toBeVisible();
    await expect(page.getByTestId("tour-wizard-step-trigger")).toBeVisible();
    await page.getByTestId("tour-wizard-step-trigger").click();
    await expect(page.getByTestId("tour-wizard-trigger-panel")).toBeVisible();

    // 8. Audience filter dropdown.
    await expect(page.getByTestId("tour-audience-mode")).toBeVisible();
    await page.getByTestId("tour-audience-mode").selectOption("filtered");
    await expect(page.getByTestId("tour-audience-roles")).toBeVisible();
    await expect(page.getByTestId("tour-audience-groups")).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOTS}/07-tour-wizard-audience.png`,
      fullPage: true,
    });

    // Zero console errors.
    expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("Wave H.1 · DS audit (sharp + no banned names + no emoji)", () => {
  test("Salas + Tours não regridem DS (no rounded · no Sparkles · no Palantir)", async ({
    page,
  }) => {
    await login(page);

    const pages = [
      "/painel-de-controle/salas",
      "/painel-de-controle/tours",
    ];

    const violations: { route: string; issues: string[] }[] = [];

    for (const route of pages) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const result = await page.evaluate(() => {
        const issues: string[] = [];
        // 1. Zero "rounded-*" (aceita rounded-none).
        const all = document.querySelectorAll("[class]");
        for (const el of Array.from(all)) {
          const cls = el.getAttribute("class") ?? "";
          if (/\brounded-(?!none\b)[a-z0-9-]+/.test(cls)) {
            issues.push(
              `rounded class: ${cls.match(/rounded-[a-z0-9-]+/)?.[0]} on <${el.tagName.toLowerCase()}>`,
            );
            break;
          }
        }
        // 2. Nomes proibidos em strings visíveis.
        const banned = ["Palantir", "Foundry", "Gotham", "Carbon Composer"];
        const text = document.body.innerText || "";
        for (const term of banned) {
          if (text.toLowerCase().includes(term.toLowerCase())) {
            issues.push(`Banned term visible: ${term}`);
          }
        }
        // 3. Zero emoji em conteúdo visível.
        if (
          /[\u{1F300}-\u{1FAFF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]/u.test(
            text,
          )
        ) {
          issues.push("Emoji detected in visible text");
        }
        return issues;
      });

      if (result.length > 0) {
        violations.push({ route, issues: result });
      }
    }

    expect(
      violations,
      `DS audit violations: ${JSON.stringify(violations, null, 2)}`,
    ).toHaveLength(0);
  });
});
