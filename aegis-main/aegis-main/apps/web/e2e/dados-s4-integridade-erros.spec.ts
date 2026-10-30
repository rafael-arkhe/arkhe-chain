/**
 * E2E · Sprint 4 (hardening) — erros que não somem.
 * Cert AO VIVO do gesto: Executar um board cujo nó reativo (modo "uma vez")
 * falha no despacho (canal webhook sem configuração do tenant) termina como
 * run FAILED com mensagem clara no histórico — antes a exceção crua virava
 * 500 no endpoint SEM registrar run nenhum (o operador via um erro genérico
 * e o histórico ficava vazio).
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

test.describe("S4 — once que falha vira FAILED claro, nunca 500 sem histórico (ao vivo)", () => {
  test("reactive notify once sem config de canal → run FAILED com mensagem no histórico", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `s4_${Date.now()}`;
    const ds = `e2e_s4_${tag}`;
    await seedDs(page, ds, [{ id: "1", nome: "alfa" }]);

    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s4-${tag}`, display_name: `E2E S4 ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            // webhook sem Tenant.metadata_['messaging'] → o despacho falha DE VERDADE.
            { id: "nt", op: "reactive", config: { method: "notify", mode: "once", channel: "webhook", to: "ops", text: "S4 teste", output: "aviso" }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "src", to: "nt" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    await page.getByTestId("pb-run").click();

    // O contrato: o run ENTRA no histórico como FAILED com o motivo legível
    // (pré-fix: 500 cru → histórico vazio → este poll estouraria o timeout).
    await expect
      .poll(async () => {
        const runs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
        return Array.isArray(runs) && runs.length ? `${runs[0].status}|${runs[0].error ?? ""}` : "";
      }, { timeout: 60000 })
      .toMatch(/^FAILED\|.*(reativo|notify|messaging)/);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
