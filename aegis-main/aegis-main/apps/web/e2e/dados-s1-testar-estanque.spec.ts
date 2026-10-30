/**
 * E2E · Sprint 1 (hardening p/ lançamento) — "Testar" ESTANQUE através de SUBFLUXO.
 * Cert AO VIVO do blocker 1.1: Testar um board-PAI cujo FILHO (subworkflow) tem
 * efeito de produção (emit_alert) NÃO gera efeito real — o efeito do filho vem
 * SIMULADO no NDV do nó subworkflow, e nem o pai nem o FILHO gravam histórico.
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

test.describe("S1 — Testar não vaza efeito real via subworkflow (ao vivo)", () => {
  test("Testar o pai simula o emit_alert do filho e não grava histórico em nenhum dos dois", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `s1_${Date.now()}`;
    const ds = `e2e_s1_${tag}`;
    await seedDs(page, ds, [{ id: "1", nome: "alfa" }, { id: "2", nome: "bravo" }]);

    // FILHO: gatilho subworkflow → emit_alert (o efeito que o Testar DEVE simular).
    const mkChild = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s1-filho-${tag}`, display_name: `E2E S1 filho ${tag}`,
        graph: {
          nodes: [
            { id: "t", op: "trigger", config: { trigger_kind: "subworkflow" }, position: { x: 40, y: 180 } },
            { id: "al", op: "reactive", config: { method: "emit_alert", alert_kind: "s1", severity: "high", title: "S1 {{ $json.nome }}", mode: "per_row", output: "alerta" }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "t", to: "al" }],
        },
      },
    });
    expect(mkChild.ok(), `create child → ${mkChild.status()}`).toBeTruthy();
    const child = (await mkChild.json()) as { id: string };

    // PAI: fonte → subworkflow(filho).
    const mkParent = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s1-pai-${tag}`, display_name: `E2E S1 pai ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            { id: "sw", op: "transform", config: { op: "subworkflow", args: { board_id: child.id } }, position: { x: 320, y: 180 } },
            // reactive no PAI força o modo DAG (walker) — é ele que captura as
            // amostras por nó que o NDV do Testar exibe.
            { id: "alp", op: "reactive", config: { method: "emit_alert", alert_kind: "s1p", severity: "low", title: "S1 pai {{ $json.nome }}", mode: "per_row", output: "alerta_pai" }, position: { x: 600, y: 180 } },
          ],
          edges: [{ from: "src", to: "sw" }, { from: "sw", to: "alp" }],
        },
      },
    });
    expect(mkParent.ok(), `create parent → ${mkParent.status()}`).toBeTruthy();
    const parent = (await mkParent.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${parent.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // O GESTO: Testar (não Executar).
    await page.getByTestId("pb-test-run").click();
    await expect(page.getByTestId("pb-test-banner")).toBeVisible({ timeout: 60000 });

    // NDV do nó subworkflow: o efeito do FILHO veio SIMULADO (nunca emitido).
    await page.getByTestId("pb-node-sw").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.getByTestId("pb-panel-out-json").click();
    const outSw = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(outSw, "efeito do filho simulado no Testar do pai").toContain("simulated");
    await page.keyboard.press("Escape");

    // ESTERILIDADE: zero histórico no PAI e — o blocker — zero no FILHO.
    const parentRuns = await (await page.request.get(`/api/platform/v23/pipeline/${parent.id}/runs`)).json();
    expect(Array.isArray(parentRuns) ? parentRuns.length : -1, "pai sem histórico").toBe(0);
    const childRuns = await (await page.request.get(`/api/platform/v23/pipeline/${child.id}/runs`)).json();
    expect(Array.isArray(childRuns) ? childRuns.length : -1, "FILHO sem histórico (test_mode propagado)").toBe(0);
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
