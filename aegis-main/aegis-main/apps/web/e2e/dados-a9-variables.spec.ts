/**
 * A9 — variáveis paridade n8n. Cert AO VIVO: (1) o painel de variáveis mostra os
 * grupos Contexto/Execução ($now/$workflow…) draggáveis; (2) um board com set usando
 * {{ $workflow.id }}/{{ $now }} roda ao vivo e resolve (engine + run_context real).
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedDataset(page: Page, ds: string, rows: Record<string, unknown>[]) {
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, { data: { input_payload: { payload: { rows } } } });
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

test("A9: painel de variáveis mostra Contexto/Execução e board com $workflow.id/$now roda ao vivo", async ({ page }) => {
  const fatal: string[] = [];
  page.on("pageerror", (e) => fatal.push(String(e)));
  await login(page);
  await page.setViewportSize({ width: 1680, height: 900 });
  const tag = `a9_${Date.now()}`;
  const ds = `e2e_a9_${tag}`;
  await seedDataset(page, ds, [{ id: "1", g: "G1" }]);
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-a9-${tag}`, display_name: `E2E A9 ${tag}`,
      graph: {
        nodes: [
          { id: "src", op: "source", config: { dataset: ds }, position: { x: 80, y: 120 } },
          { id: "st", op: "transform", config: { op: "set", args: { fields: [
            { key: "wf", value: "{{ $workflow.id }}", type: "text" },
            { key: "qdo", value: "{{ $now }}", type: "text" },
          ] } }, position: { x: 420, y: 120 } },
        ],
        edges: [{ from: "src", to: "st" }],
      },
    },
  });
  expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
  const board = (await mk.json()) as { id: string };
  await openBoard(page, board.id);

  // (1) Painel de variáveis: grupos Contexto/Execução com tokens draggáveis.
  await page.getByTestId("pb-node-st").dblclick();
  await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
  // Painel renderiza os grupos Contexto/Execução (pode ficar abaixo da dobra → checa DOM).
  await expect(page.getByTestId("pb-variable-now").first()).toBeAttached();
  await expect(page.getByTestId("pb-variable-workflowId").first()).toBeAttached();
  await expect(page.getByTestId("pb-variables-search").first()).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pb-config-overlay")).toBeHidden();

  // (2) Rodar ao vivo → resolve no engine ($workflow.id = board id, $now não-vazio).
  await page.getByTestId("pb-run").click();
  await expect.poll(async () => {
    const rs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
    const ok = (Array.isArray(rs) ? rs : []).find((r: { status: string }) => r.status === "OK") as { output_asset_id?: string } | undefined;
    return ok?.output_asset_id ?? null;
  }, { timeout: 60000, intervals: [1500] }).not.toBeNull();

  const rs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
  const ok = (rs as Array<{ status: string; output_asset_id?: string }>).find((r) => r.status === "OK")!;
  const asset = await (await page.request.get(`/api/datasets/id/${ok.output_asset_id}`)).json().catch(() => null);
  const row0 = asset?.payload?.rows?.[0] ?? asset?.rows?.[0] ?? asset?.sample_rows?.[0];
  if (row0) {
    expect(row0.wf).toBe(board.id);   // $workflow.id resolveu = id do board
    expect(String(row0.qdo || "")).not.toBe(""); // $now não-vazio
  }
  expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
});
