/**
 * E2E · OP3 (débito CRÍTICO do operador) — TESTAR o pipeline INTEIRO no DAG.
 * Cert AO VIVO do gesto: Testar roda o RASCUNHO sem efeito de produção
 * (nenhum run no histórico, nenhum alerta real — o emit_alert é SIMULADO),
 * pinta o canvas e abre o NDV com o dado que FLUIU nó-a-nó (paridade n8n
 * "Test workflow").
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedDs(page: Page, name: string, rows: Record<string, unknown>[]) {
  const begin = await page.request.post(`/api/datasets/${name}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
  expect(begin.ok(), `begin ${name} → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(`/api/datasets/${name}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows } } } });
  expect(commit.ok(), `commit ${name} → ${commit.status()}`).toBeTruthy();
}

test.describe("OP3 — test-run do rascunho (sem efeito de produção) ao vivo", () => {
  test("Testar roda o board inteiro, mostra o dado nó-a-nó e NÃO grava histórico/alerta", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `op3_${Date.now()}`;
    const ds = `e2e_op3_${tag}`;
    await seedDs(page, ds, [{ id: "1", nome: "alfa" }, { id: "2", nome: "bravo" }]);
    // source → set(carimbo) → reactive emit_alert (efeito de produção que o
    // teste DEVE simular, nunca emitir).
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-op3-${tag}`, display_name: `E2E OP3 ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            { id: "st", op: "transform", config: { op: "set", args: { fields: [{ key: "carimbo", value: "fluiu", type: "text" }] } }, position: { x: 320, y: 180 } },
            { id: "al", op: "reactive", config: { method: "emit_alert", alert_kind: "op3", severity: "high", title: "OP3 {{ $json.nome }}", mode: "per_row", output: "alerta" }, position: { x: 600, y: 180 } },
          ],
          edges: [{ from: "src", to: "st" }, { from: "st", to: "al" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // O GESTO: Testar (não Executar).
    await page.getByTestId("pb-test-run").click();
    await expect(page.getByTestId("pb-test-banner")).toBeVisible({ timeout: 60000 });

    // NDV do nó set: o OUTPUT abre com a amostra que FLUIU (carimbo presente).
    await page.getByTestId("pb-node-st").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.getByTestId("pb-panel-out-json").click();
    const outSt = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(outSt, "amostra do teste fluiu no nó set").toContain("fluiu");
    await page.keyboard.press("Escape");

    // NDV do nó reactive: o alerta veio SIMULADO (nunca emitido de verdade).
    await page.getByTestId("pb-node-al").dblclick();
    await page.getByTestId("pb-panel-out-json").click();
    const outAl = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(outAl, "efeito irreversível simulado no teste").toContain("simulated");
    await page.keyboard.press("Escape");

    // ESTERILIDADE: nada no histórico de execuções do board.
    const runs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
    expect(Array.isArray(runs) ? runs.length : -1, "test-run não grava histórico").toBe(0);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
