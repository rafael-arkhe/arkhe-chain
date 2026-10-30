/**
 * E2E · Onda 1 (Clareza nº1) — smoke ao vivo da Tela de Dados.
 *
 * Prova que o código novo (SF2 dropdowns + SF3 row-builder + SF4 grade + SF5
 * badges/canvas i18n) RENDERIZA no browser real sem crash — o que o jest com
 * mocks não cobre (reactflow, hidratação, useI18n, fiação do hub). Régua:
 * feedback_e2e_via_playwright_cli.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

test.describe("Onda 1 · Tela de Dados (smoke ao vivo)", () => {
  test("hub /dados + datasets + pipelines (avançado) renderizam sem erro fatal", async ({ page }) => {
    const fatal: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /TypeError|ReferenceError|is not a function|Cannot read|Unhandled|Minified React error/.test(m.text())) {
        fatal.push(m.text());
      }
    });
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.goto("/painel-de-controle/dados");
    await expect(page.getByRole("heading", { name: "Dados" })).toBeVisible();

    // SF3/SF4 + I3 — a seção Datasets decompõe o inspetor de dado: a LISTA (busca +
    // criar) passa a viver no 2º nível do ACERVO (LEFT). Se houver datasets,
    // selecionar o 1º prova a grade no CENTER + Classificação&Marcações no RIGHT.
    await page.getByTestId("acervo-item-datasets").click();
    await expect(page.getByTestId("acervo-contextual")).toBeVisible();
    await expect(page.getByTestId("acervo-nav").getByTestId("ds-search")).toBeVisible();
    const firstDs = page.locator('[data-testid^="ds-item-"]').first();
    if (await firstDs.count()) {
      await firstDs.click();
      await expect(page.getByTestId("ds-detail")).toBeVisible();
      await expect(page.getByTestId("ds-inspector")).toBeVisible();
    }

    // SF2/SF5 + I2 + v22 — a seção Pipelines é o Quadro decomposto (sem toggle Fácil/
    // Avançado): a lista UNIFICADA (boards v23 + adapters v22 read-only, pb-new) vive no
    // 2º nível do ACERVO (LEFT), não num 2º rail. O canvas ocupa o CENTER.
    await page.getByTestId("acervo-item-pipelines").click();
    await expect(page.getByTestId("acervo-contextual")).toBeVisible();
    await expect(page.getByTestId("acervo-nav").getByTestId("pb-new")).toBeVisible();

    expect(fatal, `erros fatais de console/página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
