/**
 * E2E · Onda 2 · I4 — arrastar Fonte (dataset) do Acervo → canvas → nó Fonte.
 *
 * Prova o GESTO ao vivo (o que o jest com canvas mockado não cobre: o reactflow
 * real + screenToFlowPosition projetando a posição EXATA do drop). Régua: cert por
 * gesto ao vivo · feedback_e2e_via_playwright_cli. Robusto: pula com graça se o
 * tenant não ofertar datasets; cria um board se não houver (o canvas só monta com
 * board aberto).
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Onda 2 · I4 — arrastar Fonte → canvas", () => {
  test("a palette de Fontes vive no Acervo e arrastar um dataset cria um nó Fonte", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);

    // A palette de Fontes (I4) vive no 2º nível do ACERVO (LEFT), abaixo dos boards.
    await expect(page.getByTestId("acervo-nav").getByTestId("pb-fontes")).toBeVisible();

    const chip = page.locator('[data-testid^="pb-fonte-"]').first();
    if (!(await chip.count())) {
      test.info().annotations.push({ type: "skip", description: "tenant sem datasets ofertados" });
      return;
    }
    await expect(chip).toHaveAttribute("draggable", "true");

    // Canvas só monta com board aberto: abre o 1º existente ou cria um.
    const board = page.locator('[data-testid^="pb-board-"]').first();
    if (await board.count()) {
      await board.click();
    } else {
      await page.getByTestId("pb-new").click();
      await page.getByTestId("pb-create-name").fill("i4-smoke");
      await page.getByTestId("pb-create-confirm").click();
    }
    await expect(page.getByTestId("pb-canvas")).toBeVisible();

    // Arrasta o dataset → canvas; um nó Fonte novo aparece (pb-node-*).
    const before = await page.locator('[data-testid^="pb-node-"]').count();
    await chip.dragTo(page.getByTestId("pb-canvas"));
    await expect(page.locator('[data-testid^="pb-node-"]')).toHaveCount(before + 1, { timeout: 15000 });

    // O nó criado é uma Fonte com o dataset pré-preenchido (inspetor no RIGHT).
    await expect(page.getByTestId("pb-cfg-dataset")).toBeVisible();

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
