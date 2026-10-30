/**
 * E2E · Sprint 3 (hardening) — sem resultado errado silencioso.
 * Cert AO VIVO de dois gestos:
 *  (1) dedupe na config DEFAULT sobre fonte com coluna geometry (dict) roda OK
 *      e dedupa — antes explodia em "TypeError: unhashable type: 'dict'";
 *  (2) materializar com id_field nulo termina FAILED com "valor vazio na
 *      linha N" — antes colapsava N linhas em 1 objeto silenciosamente.
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

async function runAndPoll(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("pb-run").click();
  await expect
    .poll(async () => {
      const runs = await (await page.request.get(`/api/platform/v23/pipeline/${boardId}/runs`)).json();
      return Array.isArray(runs) && runs.length ? `${runs[0].status}|${runs[0].rows_out ?? ""}|${runs[0].error ?? ""}` : "";
    }, { timeout: 60000 })
    .not.toBe("");
  const runs = await (await page.request.get(`/api/platform/v23/pipeline/${boardId}/runs`)).json();
  return runs[0] as { status: string; rows_out: number | null; error: string | null };
}

test.describe("S3 — sem resultado errado silencioso (ao vivo)", () => {
  test("dedupe default sobre coluna geometry roda OK; id_field nulo falha claro", async ({ page }) => {
    test.setTimeout(240_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `s3_${Date.now()}`;
    const geo = { type: "Point", coordinates: [-48.0, -23.5] };

    // (1) fonte geo com linha DUPLICADA → dedupe default (sem 'by') → OK e dedupa.
    const dsGeo = `e2e_s3_geo_${tag}`;
    await seedDs(page, dsGeo, [
      { id: "1", geometry: geo },
      { id: "1", geometry: geo },
      { id: "2", geometry: { ...geo, coordinates: [-46.6, -23.5] } },
    ]);
    const mkA = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s3-dedupe-${tag}`, display_name: `E2E S3 dedupe ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: dsGeo }, position: { x: 40, y: 180 } },
            { id: "dd", op: "transform", config: { op: "dedupe", args: {} }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "src", to: "dd" }],
        },
      },
    });
    expect(mkA.ok(), `create board A → ${mkA.status()}`).toBeTruthy();
    const a = (await mkA.json()) as { id: string };
    const runA = await runAndPoll(page, a.id);
    expect(runA.status, `dedupe geo falhou: ${runA.error}`).toBe("OK");
    expect(runA.rows_out, "dedupe default dedupou a linha idêntica").toBe(2);

    // (2) id_field com valor nulo → FAILED com mensagem clara (nunca colapso N→1).
    const dsNulo = `e2e_s3_nulo_${tag}`;
    await seedDs(page, dsNulo, [{ id: "1", nome: "Ana" }, { id: null, nome: "Bruno" }]);
    const mkB = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s3-idnulo-${tag}`, display_name: `E2E S3 idnulo ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: dsNulo }, position: { x: 40, y: 180 } },
            { id: "o", op: "ontology_output", config: { target_node_type: `WidgetS3${tag}`, id_field: "id" }, position: { x: 320, y: 180 } },
          ],
          edges: [{ from: "src", to: "o" }],
        },
      },
    });
    expect(mkB.ok(), `create board B → ${mkB.status()}`).toBeTruthy();
    const b = (await mkB.json()) as { id: string };
    const runB = await runAndPoll(page, b.id);
    expect(runB.status, "id_field nulo tem que FALHAR").toBe("FAILED");
    expect(runB.error ?? "", "mensagem clara de valor vazio").toContain("valor vazio na linha 2");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
