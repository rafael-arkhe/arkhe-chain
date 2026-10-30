/**
 * E2E · Onda 3 · O3d — teto de custo do nó AIP (campo na UI).
 *
 * O nó IA ganha um campo "Teto de custo (R$)". O ENFORCEMENT server-side (estima
 * antes de rodar e ABORTA sem chamar o LLM se ultrapassa) é certificado por
 * unit (test_pipeline_llm_cost_ceiling: 0 chamadas → não queima crédito, régua
 * gotcha_eval_suite_burns_openrouter_credit). Aqui provamos o GESTO da UI ao vivo.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Onda 3 · O3d — teto de custo do nó AIP", () => {
  test("o nó IA expõe o campo de teto de custo e ele é editável", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);

    await page.getByTestId("pb-new").click();
    await page.getByTestId("pb-create-name").fill(`o3d-${Date.now()}`);
    await page.getByTestId("pb-create-confirm").click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible();

    // Adiciona o nó IA (pré-setado llm) → inspetor mostra o teto de custo.
    await page.getByTestId("pb-add-llm").click();
    const cost = page.getByTestId("pb-cfg-llm-cost");
    await expect(cost).toBeVisible();
    // Editável: define um teto baixo (o enforcement real é unit-testado).
    await cost.fill("0.01");
    await expect(cost).toHaveValue("0.01");

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
