/**
 * E2E · Aditivo 1 — Loop com canvas ANINHADO (drill-in estilo n8n).
 *
 * O gesto do operador SEM sair do fluxo: no nó Loop, "Criar Quadro-corpo"
 * (nasce com gatilho e já vinculado) → "Abrir corpo no canvas" (o canvas
 * TROCA pro corpo, com "← voltar" no toolbar) → voltar ao pai. O body_ref
 * é salvo no pai automaticamente ao abrir o corpo (save-on-navigate).
 * O motor não muda (inc5 já certificou o container) — isto é a UX inline.
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

test.describe("Aditivo 1 — Loop canvas aninhado inline", () => {
  test("criar Quadro-corpo no nó Loop → abre no canvas → voltar ao pai (body_ref salvo)", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `a1_${Date.now()}`;
    const ds = `e2e_a1_${tag}`;
    await seedDs(page, ds, [{ id: "1" }, { id: "2" }]);
    const parentName = `E2E A1 pai ${tag}`;
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-a1-${tag}`, display_name: parentName,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            { id: "lp", op: "transform", config: { op: "loop", args: { batch_size: 1 } }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "src", to: "lp" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // ── NDV do Loop: corpo = Quadro → Criar Quadro-corpo ────────────────
    await page.getByTestId("pb-node-lp").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("pb-cfg-loop-body-mode").selectOption("board");
    await page.getByTestId("pb-cfg-loop-create-body").click();
    // corpo criado e VINCULADO: o botão vira "Abrir corpo no canvas"
    const openBody = page.getByTestId("pb-cfg-loop-open-body");
    await expect(openBody).toBeVisible({ timeout: 20000 });

    // ── drill-in: o canvas TROCA pro corpo (breadcrumb ← pai no toolbar) ─
    await openBody.click();
    const back = page.getByTestId("pb-board-back");
    await expect(back).toBeVisible({ timeout: 20000 });
    await expect(back).toContainText(parentName);
    // o corpo nasce com o gatilho (o nó está no canvas)
    await expect(page.getByTestId("pb-node-trg")).toBeVisible({ timeout: 10000 });

    // ── voltar ao pai: o loop está lá e o back some ─────────────────────
    await back.click();
    await expect(page.getByTestId("pb-node-lp")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("pb-board-back")).toHaveCount(0);

    // ── persistência: o body_ref foi salvo no PAI (save-on-navigate) ────
    const full = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json() as {
      graph: { nodes: Array<{ id: string; config?: { args?: { body_ref?: string } } }> };
    };
    const lp = full.graph.nodes.find((n) => n.id === "lp");
    expect(lp?.config?.args?.body_ref, "body_ref não persistiu no pai").toBeTruthy();

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
