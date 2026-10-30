/**
 * E2E · Fase 2 (overhaul DAG n8n) — CANVAS VIVO: progresso por nó (cascata real).
 *
 * Prova o GESTO ao vivo: o operador clica "Executar" → o SSE de progresso por nó
 * (`/run/stream`) acende CADA nó (Fonte E Transformação), com cor de borda de
 * estado + contagem real. Antes da Fase 2, SÓ o nó de Saída recebia badge (estado
 * agregado) — aqui a vida é POR NÓ, dirigida por eventos REAIS (nunca falsos).
 *
 * Seed via API (cookies da sessão; mesmo tenant do admin): dataset (SNAPSHOT) +
 * board source→filter (sem Saída → roda sem precisar de Object Type). Régua:
 * feedback_e2e_via_playwright_cli.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Fase 2 — canvas vivo (progresso por nó)", () => {
  test("Executar → cada nó acende (cascata), não só a Saída", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();
    const ds = `e2e_f2_${tag}`;

    // 1) Seed do dataset via API (SNAPSHOT = input_payload.payload.rows).
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
      data: { kind: "SNAPSHOT", branch: "main" },
    });
    expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
    const tx = await begin.json();
    const commit = await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [
        { g: "G1", a: "1" }, { g: "G2", a: "2" }, { g: "G1", a: "3" },
      ] } } },
    });
    expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();

    // 2) Seed do board source→filter (sem Saída → materializa derivado, sem upsert).
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-f2-${tag}`, display_name: `E2E F2 ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "flt", op: "filter", config: { op: "filter", args: { where: { g: "G1" } } }, position: { x: 360, y: 160 } },
          ],
          edges: [{ from: "src", to: "flt" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json();

    // 3) Abre o board no Quadro e EXECUTA (gesto do operador).
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible();
    await page.getByTestId("pb-run").click();

    // 4) CASCATA por nó: a Fonte E a Transformação ganham estado AO VIVO. Esta é a
    //    diferença da Fase 2 — antes, só o nó de Saída recebia badge.
    await expect(page.getByTestId("pb-node-state-src")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("pb-node-state-flt")).toBeVisible({ timeout: 20000 });
    // estado final concluído (i18n pt-BR "Concluído") + mensagem do fluxo.
    await expect(page.getByTestId("pb-node-state-flt")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });
    await expect(page.getByTestId("pb-node-state-detail-flt")).toContainText(/Conclu/i, { timeout: 20000 });
    await expect(page.getByTestId("pb-msg")).toBeVisible();

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
