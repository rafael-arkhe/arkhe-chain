/**
 * E2E · Onda 3 · O3a — DAG visual rico (honesto): paleta categorizada, nó IA
 * pré-setado, drawer de nós e navegação por teclado.
 *
 * Prova o GESTO ao vivo (reactflow real). O realce de aresta + ícones são cobertos
 * pelos helpers puros (pipeline-canvas-summary). Régua: feedback_e2e_via_playwright_cli.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Onda 3 · O3a — nós ricos do Quadro", () => {
  test("drawer de nós + nó IA pré-setado + teclado", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);

    // Cria um board FRESCO (nome único) → canvas começa vazio e determinístico
    // (independe da ordem de execução / estado de boards pré-existentes).
    await page.getByTestId("pb-new").click();
    await page.getByTestId("pb-create-name").fill(`o3a-${Date.now()}`);
    await page.getByTestId("pb-create-confirm").click();
    await expect(page.getByTestId("pb-empty-canvas")).toBeVisible();

    // F8.1 — NodesPanel (drawer 385px n8n) substitui a paleta: canvas vazio →
    // empty-state abre o painel com TRIGGERS-FIRST + Fonte.
    await page.getByTestId("pb-empty-add-node").click();
    await expect(page.getByTestId("pb-nodes-panel")).toBeVisible();
    await expect(page.getByTestId("pb-add-trigger")).toBeVisible();
    await expect(page.getByTestId("pb-add-source")).toBeVisible();

    // View-stack: categoria Transformações concentra as ops n8n; ← volta.
    await page.getByTestId("pb-nodes-cat-transformacoes").click();
    for (const id of ["pb-add-transform", "pb-add-set", "pb-add-datetime", "pb-add-loop",
      "pb-add-limit", "pb-add-dedupe", "pb-add-splitout", "pb-add-sort", "pb-add-rename"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await page.getByTestId("pb-nodes-back").click();

    // Busca fuzzy achata o catálogo: "ia" acha o nó IA (label + descrição);
    // escolher cria o transform JÁ pré-setado op='llm' (inspetor reflete).
    await page.getByTestId("pb-nodes-search").fill("ia");
    await expect(page.getByTestId("pb-add-llm")).toContainText("IA");
    await page.getByTestId("pb-add-llm").click();
    await expect(page.getByTestId("pb-nodes-panel")).toHaveCount(0); // escolher fecha
    await expect(page.getByTestId("pb-canvas")).toBeVisible();
    await expect(page.getByTestId("pb-inspector")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-op")).toHaveValue("llm");

    // Densidade segue como view-pref LOCAL do canvas (na barra do Quadro).
    await expect(page.getByTestId("pb-density")).toBeVisible();

    // Navegação por TECLADO: desseleciona (clique no fundo), foca o nó, Enter
    // → o inspetor volta a mostrar a config (seleção por teclado).
    await page.getByTestId("pb-canvas").click({ position: { x: 6, y: 6 } });
    const node = page.locator('.react-flow__node [data-testid^="pb-node-"]').first();
    await node.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("pb-cfg-op")).toBeVisible();

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
