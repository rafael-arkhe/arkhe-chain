/**
 * E2E · Fase 3a (overhaul DAG n8n) — nó Fonte CONECTOR/HTTP: Testar chamada →
 * schema visual campo-a-campo → Gerar dataset (o headline n8n).
 *
 * Prova o GESTO ao vivo (motor real `sync/preview` + SNAPSHOT real): adicionar
 * um nó Fonte → trocar p/ Conector/HTTP → colar uma amostra → "Testar chamada"
 * (infer_schema no backend) → árvore de campos selecionável → escolher campos →
 * "Gerar dataset" → o nó passa a apontar p/ o dataset gerado. Absorve no canvas o
 * "criar fonte/dataset/upload". Amostra COLADA = determinístico (sem rede/SSRF).
 * Régua: feedback_e2e_via_playwright_cli.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Fase 3a — nó Fonte conector: Testar chamada → schema → Gerar dataset", () => {
  test("colar amostra → Testar → árvore de campos → Gerar dataset → nó vinculado", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId("pb-new").click();
    await page.getByTestId("pb-create-name").fill(`f3a-${tag}`);
    await page.getByTestId("pb-create-confirm").click();
    // F7.3a — board NOVO aterrissa no empty-state n8n ("Add first step");
    // o canvas ReactFlow (pb-canvas) só nasce com o 1º nó.
    await expect(page.getByTestId("pb-empty-canvas")).toBeVisible({ timeout: 30000 });

    // adiciona um nó Fonte via NodesPanel (F8.1: empty-state abre o drawer)
    await page.getByTestId("pb-empty-add-node").click();
    await page.getByTestId("pb-add-source").click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("pb-cfg-source-kind")).toBeVisible();

    // Fonte polimórfica → Conector/HTTP + amostra colada (determinístico).
    await page.getByTestId("pb-cfg-source-kind").selectOption("http");
    await page.getByTestId("http-src-mode").selectOption("sample");
    await page.getByTestId("http-src-sample").fill(JSON.stringify([
      { id: 1, nome: "Alfa", uf: "SP" },
      { id: 2, nome: "Bravo", uf: "RJ" },
    ]));

    // "Testar chamada" → backend infere o schema → árvore de campos.
    await page.getByTestId("http-src-test").click();
    await expect(page.getByTestId("schema-tree")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("schema-field-id")).toBeVisible();
    await expect(page.getByTestId("schema-field-nome")).toBeVisible();
    await expect(page.getByTestId("schema-field-uf")).toBeVisible();

    // forma o schema final: desmarca "uf" (fica id + nome).
    await page.getByTestId("schema-field-uf").click();

    // "Gerar dataset" → SNAPSHOT real → o nó Fonte passa a apontar p/ ele.
    await page.getByTestId("http-src-dsname").fill(`f3a_ds_${tag}`);
    await page.getByTestId("http-src-generate").click();
    await expect(page.getByTestId("http-src-linked")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("http-src-msg")).toContainText(/gerado|generated/i);

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
