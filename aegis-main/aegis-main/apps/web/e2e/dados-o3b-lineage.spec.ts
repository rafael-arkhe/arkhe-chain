/**
 * E2E · Onda 3 · O3b — linhagem "Produzido por/Usado em": foco por asset.
 *
 * GESTO ao vivo no /grafo: selecionar um asset → "Ver linhagem" foca a sub-DAG
 * (?asset= deep-link + backend filtra) e o atalho "L" alterna o foco. O micro-link
 * do canvas de pipeline (pb-link-lineage) depende de um run com output_asset_id e é
 * coberto pela lógica/unit. Régua: feedback_e2e_via_playwright_cli. Robusto: pula
 * com graça se o tenant não tiver assets no grafo.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

test.describe("Onda 3 · O3b — foco de linhagem por asset", () => {
  test("selecionar asset → Ver linhagem foca (?asset) e 'L' alterna", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.goto("/painel-de-controle/grafo");
    await expect(page.getByTestId("grafo-page")).toBeVisible();

    // Acha um asset na lista textual (robusto, independe do canvas).
    const assetNode = page.locator('[data-testid^="grafo-node-asset:"]').first();
    await expect(async () => expect(await assetNode.count()).toBeGreaterThan(0)).toPass({ timeout: 15000 }).catch(() => {});
    if (!(await assetNode.count())) {
      test.info().annotations.push({ type: "skip", description: "tenant sem assets no grafo" });
      expect(fatal, fatal.join(" | ")).toEqual([]);
      return;
    }
    await assetNode.click();

    // O detalhe oferece "Ver linhagem" (foco). Clicar → ?asset + botão pressionado.
    const focusBtn = page.getByTestId("grafo-focus-lineage");
    await expect(focusBtn).toBeVisible();
    await focusBtn.click();
    await expect(page).toHaveURL(/[?&]asset=/);
    await expect(page.getByTestId("grafo-focus-lineage")).toHaveAttribute("aria-pressed", "true");

    // Atalho "L" alterna o foco (desfoca) → ?asset some.
    await page.keyboard.press("l");
    await expect(page).toHaveURL((u) => !u.search.includes("asset="));

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
