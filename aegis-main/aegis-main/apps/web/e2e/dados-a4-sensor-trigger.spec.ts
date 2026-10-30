/**
 * E2E · A4 (zero-débito) — gatilho SENSOR (detection-as-trigger).
 * Cert AO VIVO do gesto do OPERADOR: no inspetor do nó gatilho, escolher
 * "Sensor (detecção)" revela o filtro de tipos (lpr/face/object); marcar
 * Placas (LPR) e Salvar persiste { trigger_kind: 'sensor',
 * detection_kinds: ['lpr'] } no graph — é este shape que o hook de ingestão
 * (write_detection → fire_sensor_boards) casa ao disparar o board
 * (motor provado em tests/unit/test_pipeline_sensor_trigger.py, 5/5).
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("A4 — gatilho sensor (detecção CCTV) ao vivo", () => {
  test("selecionar 'Sensor (detecção)' + marcar LPR persiste no graph", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `a4s_${Date.now()}`;
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-a4s-${tag}`, display_name: `E2E A4 sensor ${tag}`,
        graph: {
          nodes: [
            { id: "t", op: "trigger", config: { trigger_kind: "manual" }, position: { x: 60, y: 180 } },
            { id: "w", op: "wait", config: { seconds: 0 }, position: { x: 340, y: 180 } },
          ],
          edges: [{ from: "t", to: "w" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = (await mk.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // O GESTO: abrir o gatilho e trocar o tipo para Sensor.
    await page.getByTestId("pb-node-t").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    const kindSel = page.getByTestId("pb-cfg-trigger-kind");
    // a opção existe com rótulo humano (nunca valor cru)
    await expect(kindSel.locator("option", { hasText: "Sensor (detecção)" })).toHaveCount(1);
    await kindSel.selectOption("sensor");

    // O filtro de tipos aparece; marcar Placas (LPR).
    await expect(page.getByTestId("pb-cfg-trigger-sensor-kinds")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-trigger-sensor-hint")).toBeVisible();
    await page.getByTestId("pb-cfg-trigger-sensor-lpr").check();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pb-config-overlay")).toBeHidden();
    await page.getByTestId("pb-save").click();

    // Persistiu o shape EXATO que o hook de ingestão casa.
    await expect.poll(async () => {
      const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const trg = (bd.graph?.nodes ?? []).find((n: { id: string }) => n.id === "t") as
        { config?: { trigger_kind?: string; detection_kinds?: string[] } } | undefined;
      return `${trg?.config?.trigger_kind}:${(trg?.config?.detection_kinds ?? []).join(",")}`;
    }, { timeout: 15000 }).toBe("sensor:lpr");

    // Reabrir mostra o estado salvo (select em sensor + LPR marcado).
    await page.reload();
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
    await page.getByTestId("pb-node-t").dblclick();
    await expect(page.getByTestId("pb-cfg-trigger-kind")).toHaveValue("sensor");
    await expect(page.getByTestId("pb-cfg-trigger-sensor-lpr")).toBeChecked();

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
