/**
 * E2E · Fase 3a-2 (overhaul DAG n8n) — VER O DADO entre nós.
 *
 * Fecha o "não consigo visualizar meus dados": (A) clicar o nó FONTE → "Pré-
 * visualizar" mostra as LINHAS reais da fonte (antes só transform tinha preview);
 * (B) após Executar, cada aresta ganha o rótulo "N itens" (o dado entre nós, n8n).
 * Régua: feedback_e2e_via_playwright_cli.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Fase 3a-2 — ver o dado: preview na Fonte + N itens na aresta", () => {
  test("preview da Fonte (linhas reais) + rótulo de itens na aresta após Executar", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();
    const ds = `e2e_f3b_${tag}`;

    // seed dataset (3 linhas) + board source→filter via API
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
    expect(begin.ok(), `begin → ${begin.status()}`).toBeTruthy();
    const tx = await begin.json();
    const commit = await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [{ g: "G1", a: "1" }, { g: "G2", a: "2" }, { g: "G1", a: "3" }] } } },
    });
    expect(commit.ok(), `commit → ${commit.status()}`).toBeTruthy();
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-f3b-${tag}`, display_name: `E2E F3b ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 80, y: 160 } },
            { id: "flt", op: "filter", config: { op: "filter", args: { where: { g: "G1" } } }, position: { x: 380, y: 160 } },
          ],
          edges: [{ from: "src", to: "flt" }],
        },
      },
    });
    expect(mk.ok(), `board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json();

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible();

    // (A) VER O DADO NA FONTE: abrir o NDV do nó Fonte → "Pré-visualizar" →
    // linhas reais no OUTPUT. (A2: o inspetor lateral morreu — o gesto é o overlay.)
    await page.getByTestId("pb-node-src").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.getByTestId("pb-panel-preview").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("pb-preview-result")).toContainText("3"); // 3 linhas da fonte
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pb-config-overlay")).toHaveCount(0);

    // (B) EXECUTAR → rótulo "N itens" na aresta (o dado entre nós).
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-flt")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("pb-canvas").getByText(/\d+ itens/)).toBeVisible({ timeout: 15000 });

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
