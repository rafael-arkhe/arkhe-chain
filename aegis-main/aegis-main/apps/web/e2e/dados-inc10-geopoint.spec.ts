/**
 * E2E · Wave 2 · sub-onda 4 (/geo referência → DAG) — transform geometry→geopoint.
 * Cert AO VIVO + DETERMINÍSTICO (sem rede): uma fonte com coluna GeoJSON `geometry`
 * → o passo geopoint LEVANTA a geometria pro {lat,lng} de topo (nó posicionado p/ o
 * /geo). Fecha o caminho "connector.http (serializer geojson) → geometry→geopoint →
 * materializar" — sem conector duplicado (connector.http já busca GeoJSON governado).
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
    data: { slug: `e2e-inc10-${tag}`, display_name: `E2E inc10 ${tag}`, graph },
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

test.describe("inc10 — transform geometry→geopoint (/geo → DAG) ao vivo", () => {
  test("levanta a geometria GeoJSON de uma coluna para geopoint {lat,lng}", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `gp_${Date.now()}`;
    const ds = `e2e_inc10_${tag}`;
    // fonte com a coluna GeoJSON `geometry` (o que o serializer geojson do connector produz).
    await seedDs(page, ds, [
      { nome: "Foco A", geometry: { type: "Point", coordinates: [-46.63, -23.55] } },
      { nome: "Foco B", geometry: { type: "Point", coordinates: [-43.2, -22.9] } },
    ]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "gp", op: "transform", config: { op: "geopoint", args: { input: "geometry", output: "geopoint" } }, position: { x: 420, y: 160 } },
      ],
      edges: [{ from: "src", to: "gp" }],
    });
    await openBoard(page, board.id);

    // GESTO: abre o NDV do passo → inspetor DECLARATIVO (TRANSFORM_REGISTRY) renderiza.
    await page.getByTestId("pb-node-gp").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-op")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-geopoint")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-geopoint-output")).toHaveValue("geopoint");

    // RODA → geometry→geopoint → OUTPUT tem geopoint {lat,lng} (GeoJSON [lon,lat] invertido).
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(json, "gravou a coluna geopoint").toContain("geopoint");
    expect(json, "lat da 1ª linha (coordinates[1])").toContain("-23.55");
    expect(json, "lng da 1ª linha (coordinates[0])").toContain("-46.63");
    expect(json, "2ª linha também posicionada").toContain("-22.9");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
