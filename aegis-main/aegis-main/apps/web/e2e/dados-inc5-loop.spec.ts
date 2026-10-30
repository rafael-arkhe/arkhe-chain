/**
 * E2E · Wave 1 inc5 — Loop como ESCOPO de sub-grafo (container, espelho n8n).
 * Cert AO VIVO de que o CORPO do laço aceita nós ARBITRÁRIOS (não só verbos puros):
 * o Quadro-corpo tem um WAIT (nó de fluxo) + um SET, roda 1×/lote e a saída é
 * ACUMULADA. Prova o gesto do operador (seletor Corpo=Quadro + picker) + o motor.
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

async function makeBoard(page: Page, tag: string, graph: unknown) {
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: { slug: `e2e-inc5-${tag}`, display_name: `E2E inc5 ${tag}`, graph },
  });
  expect(mk.ok(), `create board ${tag} → ${mk.status()} ${await mk.text().catch(() => "")}`).toBeTruthy();
  return (await mk.json()) as { id: string };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

test.describe("inc5 — Loop container (corpo = Quadro com nós arbitrários) ao vivo", () => {
  test("o corpo do laço roda um WAIT+SET por lote e ACUMULA (fim do 'só verbos puros')", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `loop_${Date.now()}`;

    // Quadro-CORPO: gatilho subfluxo (recebe o lote) → WAIT (nó de fluxo, ARBITRÁRIO —
    // um sub_steps puro NÃO poderia contê-lo) → SET marca body_touched=Y.
    const child = await makeBoard(page, `body_${tag}`, {
      nodes: [
        { id: "trg", op: "trigger", config: { trigger_kind: "subworkflow" }, position: { x: 60, y: 120 } },
        { id: "w", op: "wait", config: { seconds: 0 }, position: { x: 340, y: 120 } },
        { id: "s", op: "transform", config: { op: "set", args: { fields: [{ key: "body_touched", value: "Y", type: "text" }] } }, position: { x: 620, y: 120 } },
      ],
      edges: [{ from: "trg", to: "w" }, { from: "w", to: "s" }],
    });

    // Quadro PAI: fonte (4 linhas) → LOOP container (body_ref = filho, lote 2).
    const ds = `e2e_inc5_${tag}`;
    await seedDs(page, ds, [{ n: "a" }, { n: "b" }, { n: "c" }, { n: "d" }]);
    const parent = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "lp", op: "transform", config: { op: "loop", args: { body_ref: child.id, batch_size: 2 } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "lp" }],
    });
    await openBoard(page, parent.id);

    // GESTO: abre o NDV do loop → corpo=Quadro (body_ref setado) → picker mostra o filho.
    await page.getByTestId("pb-node-lp").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-loop-body-mode")).toHaveValue("board");
    await expect(page.getByTestId("pb-cfg-loop-board")).toHaveValue(child.id);

    // RODA o loop → o corpo (WAIT+SET) roda por lote; OUTPUT acumula as 4 linhas c/ body_touched.
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 60000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    // body_touched presente = o corpo (com WAIT arbitrário) rodou; as 4 linhas acumuladas.
    expect(json, "o corpo do laço marcou as linhas (nó arbitrário WAIT rodou)").toContain("body_touched");
    for (const n of ["a", "b", "c", "d"]) expect(json, `lote acumulado tem "${n}"`).toContain(`"${n}"`);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
