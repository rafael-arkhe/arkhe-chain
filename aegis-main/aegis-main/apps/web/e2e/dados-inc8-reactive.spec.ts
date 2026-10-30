/**
 * E2E · Wave 2 · sub-onda 2 — nó REATIVO (REAGIR). Cert AO VIVO:
 *
 *  (1) RUN-TO-OUTPUT — method=emit_alert, per_row: cada linha cria um Alert GOVERNADO
 *      (store.emit_alert → OntologyNode + Merkle + lineage) e o alert_id fica na coluna.
 *      Motor REAL de /alertas reusado como nó (é wiring, não reescrever).
 *  (2) displayOptions AO VIVO — o método é um seletor; cerca→alerta→notificar revelam
 *      campos DIFERENTES (paridade n8n operation+displayOptions) e persistem.
 *
 * Nó DECLARATIVO (NODE_REGISTRY.reactive): inspetor gerado, zero JSX à mão. O walker
 * passa o PRINCIPAL real → notify exige messaging.send; alerta é auditado.
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
    data: { slug: `e2e-inc8-${tag}`, display_name: `E2E inc8 ${tag}`, graph },
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

test.describe("inc8 — nó REATIVO (REAGIR) ao vivo", () => {
  test("emit_alert por linha: cria o Alert governado e grava o alert_id na coluna", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `emit_${Date.now()}`;
    const ds = `e2e_inc8_${tag}`;
    await seedDs(page, ds, [{ ttl: "Intrusao A" }, { ttl: "Ruido B" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        // emit_alert: store.emit_alert real (commit=False, na txn do walker). Motor de /alertas.
        { id: "rct", op: "reactive", config: { method: "emit_alert", alert_kind: "dag_test", severity: "high", title: "{{ $json.ttl }}", mode: "per_row", output: "alerta" }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "rct" }],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-rct").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-method")).toHaveValue("emit_alert");
    // campos de emit_alert aparecem; os de cerca (lat) NÃO (displayOptions).
    await expect(page.getByTestId("pb-cfg-reactive-severity")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-lat")).toHaveCount(0);

    // RODA → store.emit_alert por linha → OUTPUT tem a coluna 'alerta' + alert_id + título resolvido.
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(json, "o alerta gravou a saída na coluna 'alerta'").toContain("alerta");
    expect(json, "criou um Alert real (alert_id)").toContain("alert_id");
    expect(json, "título {{ $json.ttl }} resolvido por linha").toContain("Intrusao A");
    expect(json, "2ª linha também emitiu").toContain("Ruido B");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("cerca→alerta→notificar: o método revela campos diferentes (displayOptions) e persiste", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `disp_${Date.now()}`;
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: "" }, position: { x: 60, y: 160 } },
        { id: "rct", op: "reactive", config: { method: "geofence_eval", lat_field: "{{ $json.lat }}", lng_field: "{{ $json.lng }}", mode: "per_row", output: "reactive_output" }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "rct" }],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-rct").dblclick();
    await expect(page.getByTestId("pb-cfg-reactive-method")).toBeVisible();
    // CERCA (default): lat/lng visíveis; severidade (alerta) e canal (notify) ESCONDIDOS.
    await expect(page.getByTestId("pb-cfg-reactive-lat")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-severity")).toHaveCount(0);
    await expect(page.getByTestId("pb-cfg-reactive-channel")).toHaveCount(0);
    // → EMITIR ALERTA: severidade/título aparecem; lat some.
    await page.getByTestId("pb-cfg-reactive-method").selectOption("emit_alert");
    await expect(page.getByTestId("pb-cfg-reactive-severity")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-title")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-lat")).toHaveCount(0);
    // → NOTIFICAR: canal/destinatário aparecem.
    await page.getByTestId("pb-cfg-reactive-method").selectOption("notify");
    await expect(page.getByTestId("pb-cfg-reactive-channel")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-to")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-severity")).toHaveCount(0);
    // edita o canal e persiste.
    await page.getByTestId("pb-cfg-reactive-channel").selectOption("webhook");
    await page.getByTestId("pb-cfg-reactive-to").fill("plantao");
    await page.keyboard.press("Escape");

    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const nodes = await graphOf(page, board.id);
      const c = nodes.find((n) => n.id === "rct");
      return c?.config?.method === "notify" && c?.config?.channel === "webhook" && c?.config?.to === "plantao";
    }, { timeout: 15000 }).toBe(true);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
