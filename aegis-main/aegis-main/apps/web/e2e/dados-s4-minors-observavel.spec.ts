/**
 * E2E · S4 minors — o observável não mente.
 * Cert AO VIVO: Executar um board cuja FOLHA é um nó de fluxo (IF, sem nó de
 * Saída) materializa o derivado com TODAS as linhas (união das portas
 * true/false) — antes o NDV mostrava linhas mas o derivado saía VAZIO
 * (rows_out=0 no histórico, dado sumia silenciosamente).
 * (Os outros minors do bloco — done antes dos ouvintes, cancel/rollback no
 * disconnect e motores reais do nó reativo — são provados no backend:
 * test_pipeline_s4_minors.py + test_reactive_node_real_engines_db.py.)
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

test.describe("S4 minors — folha de fluxo materializa o que o NDV mostra (ao vivo)", () => {
  test("Executar board source→IF (sem Saída) → run OK com rows_out=3, nunca 0", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `s4m_${Date.now()}`;
    const ds = `e2e_s4m_${tag}`;
    await seedDs(page, ds, [
      { id: "1", v: "x" }, { id: "2", v: "x" }, { id: "3", v: "y" },
    ]);

    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s4m-${tag}`, display_name: `E2E S4m ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            { id: "cond", op: "if", config: { predicate: { path: "v", op: "eq", value: "x" } }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "src", to: "cond" }],
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

    // Contrato: o run entra OK e rows_out reflete a UNIÃO das portas da folha
    // (3 linhas) — pré-fix o run saía OK com rows_out=0 (derivado vazio).
    await expect
      .poll(async () => {
        const runs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
        return Array.isArray(runs) && runs.length ? `${runs[0].status}|${runs[0].rows_out}` : "";
      }, { timeout: 60000 })
      .toBe("OK|3");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
