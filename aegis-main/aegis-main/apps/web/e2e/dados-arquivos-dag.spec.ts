/**
 * E2E · Arquivos⇄DAG (pedido literal do operador 2026-07-06): "SE EU ESTOU
 * COLOCANDO UMA NOVA CAMADA VIA DAG COMO EU NÃO TENHO OPÇÃO DE ENVIAR O
 * ARQUIVO VIA DAG (ENVIA PARA /painel-de-controle/dados?aba=arquivos)".
 *
 * O gesto: no nó "Ler arquivo" (extract_file), escolher o conjunto, clicar
 * ENVIAR ARQUIVO (o upload cai no acervo da aba Arquivos, mesmo MinIO) — o nó
 * já aponta pro item; Executar etapa lê as LINHAS reais do CSV enviado.
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Arquivos⇄DAG — enviar arquivo pelo nó e ler as linhas", () => {
  test("upload no nó extract_file → item no acervo → Executar etapa lê o CSV", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `arqdag_${Date.now()}`;
    const mkSet = await page.request.post(`/api/platform/v23/media/sets`, {
      data: { slug: `e2e-${tag}`, display_name: `E2E ArqDAG ${tag}`, media_type: "document" },
    });
    expect(mkSet.ok(), `create set → ${mkSet.status()}`).toBeTruthy();

    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-${tag}`, display_name: `E2E ArqDAG ${tag}`,
        graph: {
          nodes: [
            { id: "t", op: "trigger", config: { trigger_kind: "manual" }, position: { x: 60, y: 180 } },
            { id: "xf", op: "transform", config: { op: "extract_file", args: { media_set: `e2e-${tag}`, format: "csv" } }, position: { x: 340, y: 180 } },
          ],
          edges: [{ from: "t", to: "xf" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // abre o nó e ENVIA o arquivo pelo próprio nó
    await page.getByTestId("pb-node-xf").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-extract-file-upload")).toBeVisible();
    const csv = `cidade,uf\nBrasilia,DF\nGoiania,GO\n`;
    await page.getByTestId("pb-cfg-extract-file-input").setInputFiles({
      name: `camada-${tag}.csv`, mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });
    // o picker aponta pro arquivo enviado
    await expect(page.getByTestId("pb-cfg-extract-file-item")).toHaveValue(`camada-${tag}.csv`, { timeout: 30000 });

    // salva o board (exec-step de IO-op roda o grafo SALVO — padrão a7) e reabre
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pb-config-overlay")).toBeHidden();
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const xf = (bd.graph?.nodes ?? []).find((n: { id: string }) => n.id === "xf") as { config?: { args?: { item?: string } } } | undefined;
      return xf?.config?.args?.item;
    }, { timeout: 15000 }).toBe(`camada-${tag}.csv`);
    await page.getByTestId("pb-node-xf").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();

    // Executar etapa lê as LINHAS do CSV enviado
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 60000 });
    await page.getByTestId("pb-panel-out-json").click();
    const out = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(out).toContain("Brasilia");
    expect(out).toContain("Goiania");

    // e o arquivo EXISTE no acervo (aba Arquivos) — mesma fonte da verdade
    const sets = await (await page.request.get(`/api/platform/v23/media/sets`)).json() as Array<{ id: string; slug: string; item_count: number }>;
    const hit = sets.find((s) => s.slug === `e2e-${tag}`);
    expect(hit?.item_count, "o upload do nó cai no acervo da aba Arquivos").toBe(1);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
