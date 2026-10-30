/**
 * E2E · Sprint 5 (hardening) — durabilidade no DL160.
 * Cert AO VIVO de dois gestos:
 *  1) Re-pull idempotente: dois SNAPSHOTs com o MESMO conteúdo não criam versão
 *     nova (o commit devolve o MESMO resulting_asset_id) — antes cada tick de
 *     conector inflava versão+disco com a fonte parada.
 *  2) Loop sem histórico por lote: Executar um pai com loop(body_ref, lote 1)
 *     sobre 5 linhas grava 1 run do PAI e ZERO run do FILHO — antes eram 5
 *     runs + 5 versões do derivado do filho por execução.
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function snapshot(page: Page, name: string, rows: Record<string, unknown>[]) {
  const begin = await page.request.post(`/api/datasets/${name}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
  expect(begin.ok(), `begin ${name} → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(`/api/datasets/${name}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows } } } });
  expect(commit.ok(), `commit ${name} → ${commit.status()}`).toBeTruthy();
  return (await commit.json()) as { resulting_asset_id: string | null };
}

test.describe("S5 — durabilidade: re-pull idempotente + loop sem run por lote (ao vivo)", () => {
  test("snapshot idêntico não versiona; loop grava 1 run do pai e zero do filho", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `s5_${Date.now()}`;

    // ── Gesto 1: re-pull idempotente (dedupe por content_hash) ──────────────
    const ds = `e2e_s5_${tag}`;
    const rows = [
      { id: "1", nome: "alfa" }, { id: "2", nome: "beta" },
      { id: "3", nome: "gama" }, { id: "4", nome: "delta" },
    ];
    const c1 = await snapshot(page, ds, rows);
    const c2 = await snapshot(page, ds, rows); // MESMO conteúdo
    expect(c1.resulting_asset_id).toBeTruthy();
    expect(c2.resulting_asset_id, "snapshot idêntico criou versão nova").toBe(c1.resulting_asset_id);
    const c3 = await snapshot(page, ds, [...rows, { id: "5", nome: "epsilon" }]);
    expect(c3.resulting_asset_id, "conteúdo novo deixou de versionar").not.toBe(c1.resulting_asset_id);

    // ── Gesto 2: loop com corpo — 1 run do PAI, zero do FILHO ───────────────
    const mkChild = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s5-corpo-${tag}`, display_name: `E2E S5 corpo ${tag}`,
        graph: {
          nodes: [
            { id: "t", op: "trigger", config: { trigger_kind: "subworkflow" }, position: { x: 40, y: 180 } },
            { id: "st", op: "transform", config: { op: "set", args: { fields: [{ key: "flag", value: "ok", type: "text" }] } }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "t", to: "st" }],
        },
      },
    });
    expect(mkChild.ok(), `create corpo → ${mkChild.status()}`).toBeTruthy();
    const child = (await mkChild.json()) as { id: string };

    const mkParent = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s5-pai-${tag}`, display_name: `E2E S5 pai ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 40, y: 180 } },
            { id: "lp", op: "transform", config: { op: "loop", args: { body_ref: child.id, batch_size: 1 } }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "src", to: "lp" }],
        },
      },
    });
    expect(mkParent.ok(), `create pai → ${mkParent.status()}`).toBeTruthy();
    const parent = (await mkParent.json()) as { id: string };

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId(`pb-board-${parent.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    await page.getByTestId("pb-run").click();

    // O PAI termina OK com 1 run no histórico…
    await expect
      .poll(async () => {
        const runs = await (await page.request.get(`/api/platform/v23/pipeline/${parent.id}/runs`)).json();
        return Array.isArray(runs) && runs.length ? `${runs.length}|${runs[0].status}` : "";
      }, { timeout: 90000 })
      .toBe("1|OK");

    // …e o FILHO não ganhou NENHUM run por lote (pré-fix: 5 linhas → 5 runs).
    const childRuns = await (await page.request.get(`/api/platform/v23/pipeline/${child.id}/runs`)).json();
    expect(Array.isArray(childRuns) ? childRuns.length : -1, "loop gravou run do FILHO por lote").toBe(0);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
