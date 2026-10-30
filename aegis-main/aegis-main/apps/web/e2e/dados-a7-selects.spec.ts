/**
 * A7 — selects/comboboxes dinâmicos (nunca input cru de domínio dinâmico).
 * Cert AO VIVO do GESTO: o valor do filtro é um combobox que SUGERE os valores
 * REAIS da coluna e persiste a escolha do operador.
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedDataset(page: Page, ds: string, rows: Record<string, unknown>[]) {
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, { data: { input_payload: { payload: { rows } } } });
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

test("A7: valor do filtro é combobox com valores reais da coluna e persiste", async ({ page }) => {
  const fatal: string[] = [];
  page.on("pageerror", (e) => fatal.push(String(e)));
  await login(page);
  await page.setViewportSize({ width: 1680, height: 900 });
  const tag = `a7_${Date.now()}`;
  const ds = `e2e_a7_${tag}`;
  await seedDataset(page, ds, [{ id: "1", g: "G1" }, { id: "2", g: "G2" }, { id: "3", g: "G1" }]);
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-a7-${tag}`, display_name: `E2E A7 ${tag}`,
      graph: {
        nodes: [
          { id: "src", op: "source", config: { dataset: ds }, position: { x: 80, y: 120 } },
          { id: "flt", op: "transform", config: { op: "filter", args: { predicate: {} } }, position: { x: 420, y: 120 } },
        ],
        edges: [{ from: "src", to: "flt" }],
      },
    },
  });
  expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
  const board = (await mk.json()) as { id: string };
  await openBoard(page, board.id);

  await page.getByTestId("pb-node-flt").dblclick();
  await expect(page.getByTestId("pb-config-overlay")).toBeVisible();

  // Campo = dropdown do schema a montante; escolher 'g' habilita as sugestões de valor.
  const field = page.getByTestId("pb-cfg-field");
  await expect(field).toBeVisible();
  await expect.poll(async () => (await field.locator("option").allTextContents()).includes("g"), { timeout: 20000 }).toBe(true);
  await field.selectOption("g");

  // A8 — o operador do filtro mostra rótulo TRADUZIDO (pt-BR), não "eq" cru.
  const opSel = page.getByTestId("pb-cfg-op2");
  await expect(opSel.locator("option", { hasText: "igual a" })).toHaveCount(1);
  await expect(opSel.locator('option', { hasText: /^eq$/ })).toHaveCount(0);

  // Valor = COMBOBOX (input + datalist com os valores REAIS da coluna g).
  const value = page.getByTestId("pb-cfg-value");
  await expect(value).toBeVisible();
  const listId = await value.getAttribute("list");
  expect(listId, "pb-cfg-value é combobox (tem datalist)").toBeTruthy();
  await expect.poll(async () => page.locator(`#${listId} option`).evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value)), { timeout: 15000 })
    .toEqual(expect.arrayContaining(["G1", "G2"]));

  // Escolher um valor real persiste no graph (fechar o overlay antes do Salvar do toolbar).
  await value.fill("G1");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pb-config-overlay")).toBeHidden();
  await page.getByTestId("pb-save").click();
  await expect.poll(async () => {
    const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
    const flt = (bd.graph?.nodes ?? []).find((n: { id: string }) => n.id === "flt") as { config?: { args?: { predicate?: { value?: string } } } } | undefined;
    return flt?.config?.args?.predicate?.value;
  }, { timeout: 15000 }).toBe("G1");

  expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
});
