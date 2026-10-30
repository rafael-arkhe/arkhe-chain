/**
 * E2E · Wave 1 inc3 — o FILTRO nível n8n (extração do executeFilterCondition).
 * Cert AO VIVO dos 2 bugs bloqueantes do operador:
 *   (1) "retorna NADA": o GESTO de escolher o tipo Número no NDV faz `30 == '30'`
 *       casar (coerção) — a linha certa aparece no OUTPUT.
 *   (2) "retorna TUDO": um filtro SEM condição não devolve tudo em silêncio — o
 *       run FALHA com erro CLARO (guard validate_predicate → PipelineCodeError).
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
    data: { slug: `e2e-inc3-${tag}`, display_name: `E2E inc3 ${tag}`, graph },
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

async function graphOf(page: Page, boardId: string) {
  const bd = await (await page.request.get(`/api/platform/v23/pipeline/${boardId}`)).json();
  return (bd.graph?.nodes ?? []) as Array<{ id: string; op: string; config?: Record<string, unknown> }>;
}

test.describe("inc3 — filtro nível n8n (coerção + guard) ao vivo", () => {
  test('bug "retorna NADA": GESTO tipo=Número faz 30 == "30" casar no OUTPUT', async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `num_${Date.now()}`;
    const ds = `e2e_inc3_${tag}`;
    // n é INT (JSON) — o front grava string; sem coerção `30 == '30'` dava 0 linhas.
    await seedDs(page, ds, [{ cidade: "SP", n: 30 }, { cidade: "RJ", n: 31 }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "f", op: "transform", config: { op: "filter", args: { predicate: { op: "eq", value: "" } } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "f" }],
    });
    await openBoard(page, board.id);

    // GESTO: abre o NDV do filtro, escolhe campo=n, tipo=Número, valor=30.
    await page.getByTestId("pb-node-f").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    // a Fonte tem schema (cidade/n) → pb-cfg-field é <select> estrito; espera a
    // coluna 'n' aparecer (transform_preview assíncrono) e seleciona.
    const field = page.getByTestId("pb-cfg-field");
    await expect(field.locator('option[value="n"]')).toHaveCount(1, { timeout: 20000 });
    await field.selectOption("n");
    await page.getByTestId("pb-cfg-value-type").selectOption("number");
    await page.getByTestId("pb-cfg-value").fill("30");
    await page.keyboard.press("Escape");
    await page.getByTestId("pb-save").click();
    // persistiu type=number no predicate?
    await expect.poll(async () => {
      const f = (await graphOf(page, board.id)).find((n) => n.id === "f");
      const p = ((f?.config?.args as Record<string, unknown>)?.predicate ?? {}) as Record<string, unknown>;
      return p.type === "number" && p.path === "n" && p.value === "30";
    }, { timeout: 15000 }).toBe(true);

    // RODA o filtro → OUTPUT tem SP (n=30 casa "30"), não RJ (n=31).
    await page.getByTestId("pb-node-f").dblclick();
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(json, "coerção número: a linha n=30 casa o filtro").toContain("SP");
    expect(json, "coerção número: n=31 NÃO casa").not.toContain("RJ");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("inc3 UI — multi-condição: + Condição monta {combinator:'or', conditions[]} e o OUTPUT casa OR ao vivo", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `multi_${Date.now()}`;
    const ds = `e2e_inc3_${tag}`;
    await seedDs(page, ds, [
      { cidade: "SP", n: 30 }, { cidade: "RJ", n: 31 }, { cidade: "BH", n: 45 },
    ]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "f", op: "transform", config: { op: "filter", args: { predicate: { op: "eq", value: "" } } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "f" }],
    });
    await openBoard(page, board.id);

    // GESTO: folha cidade=SP → + Condição → c1: n (Número) = 31 → combinar OU.
    await page.getByTestId("pb-node-f").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    const field = page.getByTestId("pb-cfg-field");
    await expect(field.locator('option[value="cidade"]')).toHaveCount(1, { timeout: 20000 });
    await field.selectOption("cidade");
    await page.getByTestId("pb-cfg-value").fill("SP");
    await page.getByTestId("pb-cfg-value-add-cond").click();
    // grupo montado: a folha virou a condição 1 (testids -c0) e a nova é -c1.
    const fieldC1 = page.getByTestId("pb-cfg-field-c1");
    await expect(fieldC1.locator('option[value="n"]')).toHaveCount(1, { timeout: 20000 });
    await fieldC1.selectOption("n");
    await page.getByTestId("pb-cfg-value-c1-type").selectOption("number");
    await page.getByTestId("pb-cfg-value-c1").fill("31");
    await page.getByTestId("pb-cfg-value-combinator").selectOption("or");
    await page.keyboard.press("Escape");
    await page.getByTestId("pb-save").click();
    // persistiu o grupo LIMPO (sem resíduo da folha no topo)?
    await expect.poll(async () => {
      const f = (await graphOf(page, board.id)).find((n) => n.id === "f");
      const p = ((f?.config?.args as Record<string, unknown>)?.predicate ?? {}) as Record<string, unknown>;
      const conds = (p.conditions ?? []) as Array<Record<string, unknown>>;
      return p.combinator === "or" && !("path" in p) && conds.length === 2
        && conds[0].path === "cidade" && conds[0].value === "SP"
        && conds[1].path === "n" && conds[1].type === "number" && conds[1].value === "31";
    }, { timeout: 15000 }).toBe(true);

    // RODA → OR casa SP (cidade) e RJ (n=31 com coerção); BH fica de fora.
    await page.getByTestId("pb-node-f").dblclick();
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(json, "OR: cidade=SP casa").toContain("SP");
    expect(json, "OR: n=31 casa (coerção número)").toContain("RJ");
    expect(json, "OR: BH não casa nenhuma condição").not.toContain("BH");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test('bug "retorna TUDO": filtro SEM condição FALHA com erro claro (não devolve tudo)', async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `empty_${Date.now()}`;
    const ds = `e2e_inc3_${tag}`;
    await seedDs(page, ds, [{ a: "1" }, { a: "2" }]);
    // filtro com args VAZIO (sem predicate, sem where) — antes: all([])=True = tudo.
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "f", op: "transform", config: { op: "filter", args: {} }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "f" }],
    });
    await openBoard(page, board.id);
    await page.getByTestId("pb-node-f").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.getByTestId("pb-panel-exec-step").click();
    // guard → run FAILED → OUTPUT mostra o ERRO (não pb-preview-result silencioso).
    await expect(page.getByTestId("pb-preview-error")).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId("pb-preview-error")).toContainText(/condi|filtro/i);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
