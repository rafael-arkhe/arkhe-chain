/**
 * E2E · Wave 1 inc4 — o NDV data-table nível n8n. Cert AO VIVO do bug do operador
 * ("tabela/esquema QUEBRA com muitos resultados"):
 *   (1) a tabela do NDV mostra TODAS as colunas (sem o cap de 8) com scroll-x;
 *   (2) a PRÉVIA deixa de dar 422 nos verbos novos (crypto/html/…): reusa
 *       _VALID_STEP_OPS_SET no backend (transform_preview).
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
    data: { slug: `e2e-inc4-${tag}`, display_name: `E2E inc4 ${tag}`, graph },
  });
  expect(mk.ok(), `create board ${tag} → ${mk.status()}`).toBeTruthy();
  return (await mk.json()) as { id: string };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

test.describe("inc4 — NDV data-table (sem cap de 8) + prévia dos verbos novos", () => {
  test("tabela do NDV mostra TODAS as 12 colunas (antes: capado em 8)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `wide_${Date.now()}`;
    const ds = `e2e_inc4_${tag}`;
    const cols = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const rows = Array.from({ length: 12 }, (_, r) =>
      Object.fromEntries(cols.map((c) => [c, `${c}_r${r}`])));
    await seedDs(page, ds, rows);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "t", op: "transform", config: { op: "select", args: {} }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "t" }],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-t").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    // INPUT em modo Tabela → a data-table renderiza as colunas do schema a montante.
    await page.getByTestId("pb-panel-in-table").click();
    const table = page.getByTestId("pb-ndv-in-table");
    await expect(table).toBeVisible({ timeout: 20000 });
    // a 12ª coluna (c11) aparece — antes o cap de 8 (c0..c7) a escondia.
    await expect(table.locator("thead th", { hasText: /^c11$/ })).toHaveCount(1);
    await expect(table.locator("thead th", { hasText: /^c8$/ })).toHaveCount(1);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("prévia de crypto NÃO dá 422 (reusa _VALID_STEP_OPS_SET no backend)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `prev_${Date.now()}`;
    const ds = `e2e_inc4_${tag}`;
    await seedDs(page, ds, [{ cpf: "12345678900" }, { cpf: "98765432100" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "cx", op: "transform", config: { op: "crypto", args: { input: "cpf", algo: "sha256", output: "hash" } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "cx" }],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-cx").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    // clica Prévia (transform_preview) — antes crypto caía em 422 (op desconhecida).
    await page.getByTestId("pb-panel-preview").click();
    // sem erro; o resultado da prévia aparece com a coluna 'hash' (crypto aplicado).
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("pb-preview-error")).toHaveCount(0);
    await expect(page.getByTestId("pb-preview-result")).toContainText("hash");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("resizer dos 3 painéis: arrastar a divisória alarga o painel INPUT (espelho n8n)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `rz_${Date.now()}`;
    const ds = `e2e_inc4_${tag}`;
    await seedDs(page, ds, [{ a: "1" }, { a: "2" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "t", op: "transform", config: { op: "select", args: {} }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "t" }],
    });
    await openBoard(page, board.id);
    await page.getByTestId("pb-node-t").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();

    const before = (await page.getByTestId("pb-panel-input").boundingBox())!.width;
    const hb = (await page.getByTestId("pb-resize-in").boundingBox())!;
    // arrasta a divisória INPUT|CONFIG ~140px p/ a direita.
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 140, hb.y + hb.height / 2, { steps: 10 });
    await page.mouse.up();
    const after = (await page.getByTestId("pb-panel-input").boundingBox())!.width;
    expect(after, "INPUT alargou ao arrastar a divisória").toBeGreaterThan(before + 80);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
