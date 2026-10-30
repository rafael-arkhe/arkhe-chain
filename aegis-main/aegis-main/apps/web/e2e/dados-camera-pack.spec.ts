/**
 * E2E · VENDA 100% — pipelines default do domínio CÂMERA (Parte 4 da
 * auditoria audit-espinha-dag-cameras-ux-bugs.md) como boards de fábrica:
 *
 *   1. Câmeras → detecções → ontologia (gatilho de SENSOR, todos os tipos)
 *   2. Leitura de placa → lista de vigilância → alerta (sensor kinds=lpr)
 *   4. Fila-morta → reprocessar (nó de AÇÃO aegis.events.dlq_retry)
 *   5. Gravação → evidência (nó de AÇÃO aegis.cctv.export_clip)
 *   (3. detecção→geo-âncora é INERENTE ao motor — write_detection aplica a
 *    homografia calibrada; não há board.)
 *
 * GESTO VIVO determinístico: o board da fila-morta RODA de ponta a ponta
 * (Executar → action once → bus DLQ → run OK) sem GPU e sem rede externa.
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

const CAMERA_BOARDS = [
  "essencial-cctv-sensor-ontologia",
  "essencial-lpr-hotlist-alerta",
  "essencial-dlq-reprocessar",
  "essencial-dvr-evidencia",
];

async function boardsBySlug(page: Page) {
  const res = await page.request.get("/api/platform/v23/pipeline");
  expect(res.ok(), `list boards → ${res.status()}`).toBeTruthy();
  const list = (await res.json()) as Array<{ id: string; slug: string; tags?: string[] }>;
  const by: Record<string, { id: string; tags?: string[] }> = {};
  for (const b of list) by[b.slug] = { id: b.id, tags: b.tags };
  return by;
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

test.describe("VENDA 100% — pacote do domínio câmera de fábrica", () => {
  test("os 4 boards do domínio câmera nascem semeados com a tag essencial", async ({ page }) => {
    await login(page);
    const by = await boardsBySlug(page);
    for (const slug of CAMERA_BOARDS) {
      expect(by[slug], `board do domínio câmera ausente: ${slug}`).toBeTruthy();
      expect(by[slug].tags || [], `${slug} sem tag 'essencial'`).toContain("essencial");
    }
  });

  test("GESTO VIVO: fila-morta→reprocessar RODA ponta a ponta (action once, DLQ real)", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const by = await boardsBySlug(page);
    const board = by["essencial-dlq-reprocessar"];
    await openBoard(page, board.id);

    // a espinha de fábrica: gatilho manual → nó de AÇÃO com a ação governada
    await expect(page.getByTestId("pb-node-trg")).toBeVisible();
    await expect(page.getByTestId("pb-node-retry")).toBeVisible();
    await page.getByTestId("pb-node-retry").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-action")).toBeVisible();
    await page.keyboard.press("Escape");

    // Executar: o run completa OK (bus DLQ real; fila vazia = retried 0 — honesto)
    await page.getByTestId("pb-run").click();
    await expect.poll(async () => {
      const rs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
      const list = (Array.isArray(rs) ? rs : []) as Array<{ status: string }>;
      return list.some((r) => r.status === "OK");
    }, { timeout: 60000, intervals: [1500] }).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("sensor-trigger nos boards de detecção + ação de evidência montadas no canvas", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const by = await boardsBySlug(page);

    // LPR→hotlist→alerta: gatilho de SENSOR filtrado em lpr + watchlist + alerta
    await openBoard(page, by["essencial-lpr-hotlist-alerta"].id);
    await page.getByTestId("pb-node-trg").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-trigger-sensor-lpr")).toBeChecked();
    await page.keyboard.press("Escape");
    await page.getByTestId("pb-node-lista").dblclick();
    await expect(page.getByTestId("pb-cfg-correlate-method")).toHaveValue("watchlist");
    await page.keyboard.press("Escape");

    // CCTV→ontologia: sensor SEM filtro (todos os tipos) → saída na ontologia
    await openBoard(page, by["essencial-cctv-sensor-ontologia"].id);
    await expect(page.getByTestId("pb-node-trg")).toBeVisible();
    await expect(page.getByTestId("pb-node-out")).toBeVisible();

    // DVR→evidência: nó de AÇÃO export_clip por linha
    await openBoard(page, by["essencial-dvr-evidencia"].id);
    await page.getByTestId("pb-node-clip").dblclick();
    await expect(page.getByTestId("pb-cfg-action")).toBeVisible();
  });
});
