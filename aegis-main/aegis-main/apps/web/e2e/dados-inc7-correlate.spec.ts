/**
 * E2E · Wave 2 · sub-onda 1 — nó de CORRELAÇÃO (VINCULAR). Cert AO VIVO:
 *
 *  (1) RUN-TO-OUTPUT determinístico — method=resolve_entity, per_row: cada linha
 *      resolve uma entidade (EntityService.upsert, canonicaliza) e a saída fica na
 *      coluna escolhida. Motor REAL do AEGIS reusado como nó (é wiring, não reescrever).
 *  (2) displayOptions AO VIVO — o método é um seletor; trocar p/ espaço-temporal
 *      revela os campos EDITÁVEIS de raio/janela (o pedido do operador) e persiste.
 *
 * O nó é DECLARATIVO (NODE_REGISTRY): inspetor gerado pelo NodeFieldsRenderer, zero
 * JSX à mão. O walker passa o PRINCIPAL real do run → correlação auditada.
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
    data: { slug: `e2e-inc7-${tag}`, display_name: `E2E inc7 ${tag}`, graph },
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

async function graphOf(page: Page, boardId: string) {
  const bd = await (await page.request.get(`/api/platform/v23/pipeline/${boardId}`)).json();
  return (bd.graph?.nodes ?? []) as Array<{ id: string; op: string; config?: Record<string, unknown> }>;
}

test.describe("inc7 — nó de CORRELAÇÃO (VINCULAR) ao vivo", () => {
  test("resolve_entity por linha: resolve a entidade e grava a saída na coluna", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `res_${Date.now()}`;
    const ds = `e2e_inc7_${tag}`;
    await seedDs(page, ds, [{ valor: "12345678909" }, { valor: "98765432100" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        // resolve_entity: canoniza (kind,valor) → Entity idempotente. Motor REAL, determinístico.
        { id: "corr", op: "correlate", config: { method: "resolve_entity", entity_kind: "pessoa", entity_value: "{{ $json.valor }}", mode: "per_row", output: "vinculo" }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "corr" }],
    });
    await openBoard(page, board.id);

    // GESTO: abre o NDV do nó → inspetor DECLARATIVO renderiza (método selecionado).
    await page.getByTestId("pb-node-corr").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-correlate")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-correlate-method")).toHaveValue("resolve_entity");
    // campos de resolve_entity aparecem; os de chain (seed) NÃO (displayOptions).
    await expect(page.getByTestId("pb-cfg-correlate-entity-kind")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-correlate-seed-value")).toHaveCount(0);

    // RODA → EntityService.upsert por linha → OUTPUT tem a coluna 'vinculo' + entity_id + canonical.
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(json, "a correlação gravou a saída na coluna 'vinculo'").toContain("vinculo");
    expect(json, "resolveu uma entidade real (entity_id)").toContain("entity_id");
    expect(json, "canonizou o valor da 1ª linha").toContain("12345678909");
    expect(json, "2ª linha também resolvida").toContain("98765432100");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("espaço-temporal: método revela raio/janela EDITÁVEIS (displayOptions) e persiste", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `st_${Date.now()}`;
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: "" }, position: { x: 60, y: 160 } },
        { id: "corr", op: "correlate", config: { method: "chain", seed_value: "{{ $json.value }}", max_depth: 2, budget_nodes: 40, mode: "per_row", output: "correlate_output" }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "corr" }],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-corr").dblclick();
    await expect(page.getByTestId("pb-cfg-correlate-method")).toBeVisible();
    // método CHAIN (default): seed_value visível; raio ESCONDIDO (displayOptions).
    await expect(page.getByTestId("pb-cfg-correlate-seed-value")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-correlate-radius")).toHaveCount(0);
    // troca p/ ESPAÇO-TEMPORAL → raio/janela/limite APARECEM (motor de visibilidade ao vivo).
    await page.getByTestId("pb-cfg-correlate-method").selectOption("spatiotemporal");
    await expect(page.getByTestId("pb-cfg-correlate-radius")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-correlate-window")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-correlate-seed-value")).toHaveCount(0);
    // edita o RAIO (o pedido do operador: raio/janela editáveis) e persiste.
    await page.getByTestId("pb-cfg-correlate-radius").fill("500");
    await page.getByTestId("pb-cfg-correlate-window").fill("900");
    await page.keyboard.press("Escape");

    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const nodes = await graphOf(page, board.id);
      const c = nodes.find((n) => n.id === "corr");
      return c?.config?.method === "spatiotemporal" && Number(c?.config?.radius_m) === 500 && Number(c?.config?.window_s) === 900;
    }, { timeout: 15000 }).toBe(true);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
