/**
 * E2E · Sprint 2 (hardening) — regex INVÁLIDA nunca mais é run VERDE.
 * Cert AO VIVO do gesto: Executar um board com filtro de regex inválida
 * termina FAILED com mensagem clara em pt-BR ("expressão regular inválida") —
 * antes o filtro zerava o dataset em silêncio e o operador achava que a
 * fonte tinha secado.
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

test.describe("S2 — regex inválida vira FAILED claro (ao vivo)", () => {
  test("Executar board com filtro de regex inválida falha com mensagem pt-BR, não verde", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `s2_${Date.now()}`;
    const ds = `e2e_s2_${tag}`;
    await seedDs(page, ds, [{ id: "1", t: "abc-123" }, { id: "2", t: "sem numero" }]);

    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s2-${tag}`, display_name: `E2E S2 ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            { id: "f", op: "transform", config: { op: "filter", args: { predicate: { path: "t", op: "regex", value: "[abc" } } }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "src", to: "f" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // O GESTO: Executar (run real, não Testar).
    await page.getByTestId("pb-run").click();

    // O contrato: run FAILED no histórico com a mensagem clara — nunca verde.
    await expect
      .poll(async () => {
        const runs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
        return Array.isArray(runs) && runs.length ? `${runs[0].status}|${runs[0].error ?? ""}` : "";
      }, { timeout: 60000 })
      .toMatch(/^FAILED\|.*inválida/);

    // e a UI conta ao operador (mensagem de status visível, não silêncio).
    await expect(page.getByTestId("pb-msg")).toBeVisible({ timeout: 15000 });
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
