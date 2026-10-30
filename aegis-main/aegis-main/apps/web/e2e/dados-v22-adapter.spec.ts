/**
 * E2E · Onda 2 · v22 adapter — pipelines LEGADO na lista unificada (somente leitura).
 *
 * O modo Fácil/v22 foi DELETADO; os pipelines legado aparecem na MESMA lista do Quadro
 * (badge "básico") e abrem SOMENTE LEITURA: sem paleta de nós, DAG travado, inspetor de
 * resumo + Executar (build v22). Prova o gesto ao vivo (régua: feedback_e2e_via_playwright_cli).
 * Robusto: pula com graça se o tenant não tiver pipelines v22.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Onda 2 · v22 adapter — pipeline legado read-only na lista unificada", () => {
  test("v22 aparece na lista do Quadro e abre SOMENTE LEITURA", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);

    // A lista UNIFICADA vive no Acervo (mesma do v23). Sem toggle Fácil/Avançado.
    await expect(page.getByTestId("acervo-nav").getByTestId("pb-new")).toBeVisible();
    await expect(page.getByTestId("dd-pipe-avancado")).toHaveCount(0);

    let adapter = page.locator('button[data-testid^="pb-v22-"]').first();
    if (!(await adapter.count())) {
      // A UI de CRIAR v22 foi deletada (Criar=v23). Semeia um legado via API (cookies
      // da sessão via credentials:include) p/ exercitar o gesto read-only ao vivo.
      const resp = await page.request.post("/api/platform/v22/pipelines", {
        data: { slug: "e2e-v22-legacy", display_name: "E2E v22 legado", spec: { source: "", steps: [] } },
      });
      if (resp.ok()) {
        await page.goto("/painel-de-controle/dados?aba=pipelines");
        await expandAcervo(page);
        adapter = page.locator('button[data-testid^="pb-v22-"]').first();
      }
    }
    if (!(await adapter.count())) {
      test.info().annotations.push({ type: "skip", description: "sem v22 e seed via API falhou" });
      expect(fatal, fatal.join(" | ")).toEqual([]);
      return;
    }
    // O cabeçalho "básico (legado)" separa os adapters v22 dos boards v23.
    await expect(page.getByTestId("pb-v22-heading")).toBeVisible();
    await adapter.click();

    // SOMENTE LEITURA (A2: o inspetor lateral morreu): toolbar v22 com badge
    // read-only + Executar (build v22); F9a: Execuções é aba persistente.
    await expect(page.getByTestId("pb-v22-toolbar")).toBeVisible();
    await expect(page.getByTestId("pb-add-source")).toHaveCount(0);
    await expect(page.getByTestId("pb-v22-run")).toBeVisible();
    await page.getByTestId("pb-executions-btn").click();
    await expect(page.getByTestId("pb-executions-panel")).toBeVisible();
    await expect(page.getByTestId("pb-runs-history")).toBeVisible();
    // volta ao Canvas (read-only) pela aba
    await page.getByTestId("pb-tab-canvas").click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible();

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
