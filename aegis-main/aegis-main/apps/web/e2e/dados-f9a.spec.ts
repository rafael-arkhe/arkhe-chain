/**
 * E2E · F9a — Execuções como ABA persistente + Repetir (retry).
 *
 * Fecha o ciclo do DAG p/ produção (Wave 4). A lista de runs deixou de ser um
 * MODAL e virou uma aba persistente (Canvas | Execuções), e cada run FALHO ganha
 * o botão Repetir — paridade n8n 'retry with currently saved workflow': re-roda
 * o board com o grafo ATUAL. Gesto certificado AO VIVO:
 *   1. board `source → stop_error` FALHA de propósito (determinístico, sem rede);
 *   2. a aba Execuções lista o run FALHO + o botão Repetir (só em FALHOS);
 *   3. o operador CORRIGE o fluxo (remove o stop_error) — retry roda o atual;
 *   4. Repetir → NOVO run OK (o original FALHO é preservado).
 *
 * Régua: estado provado no SERVIDOR (expect.poll sobre /runs — pb-msg não é
 * sinal confiável); feedback_e2e_via_playwright_cli.
 */
import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedDataset(page: Page, ds: string) {
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
    data: { kind: "SNAPSHOT", branch: "main" },
  });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(
    `/api/datasets/${ds}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows: [{ g: "G1", a: "1" }] } } } },
  );
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();
}

async function seedFailingBoard(page: Page, tag: string) {
  const ds = `e2e_f9a_${tag}`;
  await seedDataset(page, ds);
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-f9a-${tag}`, display_name: `E2E F9a ${tag}`,
      graph: {
        nodes: [
          { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
          { id: "err", op: "stop_error", config: { message: "falha proposital" }, position: { x: 360, y: 160 } },
        ],
        edges: [{ from: "src", to: "err" }],
      },
    },
  });
  expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
  return { ds, board: await mk.json() as { id: string } };
}

// O operador CORRIGE o fluxo: troca o stop_error por um filtro válido. Retry
// re-roda o grafo ATUAL do servidor (n8n 'retry with current workflow').
async function fixBoard(page: Page, boardId: string, ds: string) {
  const put = await page.request.put(`/api/platform/v23/pipeline/${boardId}`, {
    data: {
      graph: {
        nodes: [
          { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
          { id: "flt", op: "filter", config: { op: "filter", args: { where: { g: "G1" } } }, position: { x: 360, y: 160 } },
        ],
        edges: [{ from: "src", to: "flt" }],
      },
    },
  });
  expect(put.ok(), `fix board → ${put.status()}`).toBeTruthy();
}

async function runsOf(page: Page, boardId: string) {
  return (await (await page.request.get(`/api/platform/v23/pipeline/${boardId}/runs`)).json()) as
    Array<{ id: string; status: string }>;
}

test.describe("F9a — Execuções aba + Repetir", () => {
  test("run FALHO → aba lista + Repetir re-roda o fluxo corrigido (OK)", async ({ page }) => {
    // Cold compile da rota /dados + 2 runs (falha + retry) + polls → orçamento largo.
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const { ds, board } = await seedFailingBoard(page, tag);

    // Abre o board e RODA → falha (stop_error).
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
    await page.getByTestId("pb-run").click();

    // Servidor é autoritativo: aparece 1 run FALHO.
    let failedId = "";
    await expect
      .poll(async () => {
        const runs = await runsOf(page, board.id);
        const r = runs.find((x) => x.status === "FAILED");
        if (r) failedId = r.id;
        return runs.length;
      }, { timeout: 30000 })
      .toBeGreaterThanOrEqual(1);
    expect(failedId, "run FALHO registrado").not.toBe("");

    // Aba Execuções persistente: o run FALHO + o botão Repetir (só em FALHOS).
    await page.getByTestId("pb-tab-runs").click();
    await expect(page.getByTestId("pb-executions-panel")).toBeVisible();
    await expect(page.getByTestId(`pb-runrow-${failedId}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`pb-run-retry-${failedId}`)).toBeVisible();

    // Operador corrige o fluxo → Repetir roda o grafo ATUAL → NOVO run OK.
    await fixBoard(page, board.id, ds);
    await page.getByTestId(`pb-run-retry-${failedId}`).click();

    await expect
      .poll(async () => {
        const runs = await runsOf(page, board.id);
        // >= 2 runs (FALHO preservado + novo); o mais recente (desc) é OK.
        return runs.length >= 2 ? runs[0].status : "aguardando";
      }, { timeout: 30000 })
      .toBe("OK");
    // O run FALHO original segue preservado.
    const finalRuns = await runsOf(page, board.id);
    expect(finalRuns.some((r) => r.id === failedId && r.status === "FAILED")).toBeTruthy();

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
