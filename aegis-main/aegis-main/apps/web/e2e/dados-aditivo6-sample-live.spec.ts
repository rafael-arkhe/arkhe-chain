/**
 * E2E · Aditivo 6 — SSE do Testar com amostra POR EVENTO.
 *
 * A PROVA AO VIVO: um nó `wait` de 8s segura o teste no meio; o NDV do nó
 * `set` (que já concluiu) mostra o dado carimbado ANTES de o teste terminar.
 * Antes do aditivo, as amostras só chegavam no `done` — o NDV ficaria vazio
 * durante toda a janela do wait.
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

test.describe("Aditivo 6 — amostra por evento no SSE do Testar", () => {
  test("NDV mostra o dado do nó DURANTE o teste (wait segura o stream)", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `a6_${Date.now()}`;
    const ds = `e2e_a6_${tag}`;
    await seedDs(page, ds, [{ id: "1", nome: "alfa" }, { id: "2", nome: "bravo" }]);
    // source → set(carimbo) → WAIT 8s → set2: o wait segura o teste no meio.
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-a6-${tag}`, display_name: `E2E A6 ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            { id: "st", op: "transform", config: { op: "set", args: { fields: [{ key: "carimbo", value: "aovivo", type: "text" }] } }, position: { x: 320, y: 180 } },
            { id: "w", op: "wait", config: { seconds: 8 }, position: { x: 600, y: 180 } },
            { id: "st2", op: "transform", config: { op: "set", args: { fields: [{ key: "fim", value: "sim", type: "text" }] } }, position: { x: 880, y: 180 } },
          ],
          edges: [{ from: "src", to: "st" }, { from: "st", to: "w" }, { from: "w", to: "st2" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // O GESTO: Testar e, DURANTE a janela do wait, abrir o NDV do set.
    const t0 = Date.now();
    await page.getByTestId("pb-test-run").click();
    await page.getByTestId("pb-node-st").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("pb-panel-out-json").click();
    // amostra POR EVENTO: o dado aparece com o teste AINDA rodando (< 8s).
    await expect(page.getByTestId("pb-panel-output")).toContainText("aovivo", { timeout: 6000 });
    const elapsed = Date.now() - t0;
    expect(elapsed, `amostra só chegou depois do wait (${elapsed}ms)`).toBeLessThan(8000);
    await page.keyboard.press("Escape");

    // higiene: espera o teste terminar (banner do modo teste).
    await expect(page.getByTestId("pb-test-banner")).toBeVisible({ timeout: 60000 });

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
