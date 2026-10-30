/**
 * A4 onda 4a — cluster AIP (root Agente AIP + sub-nodes Modelo/Ferramentas por porta ai_*).
 *
 * Cert AO VIVO do GESTO do operador (não seed):
 *  1) UI: arrastar as saídas ai_* dos sub-nodes até as portas de baixo do Agente AIP
 *     persiste as arestas com port=ai_model/ai_tool no graph do servidor.
 *  2) Execução REAL: um board com Agente AIP + Modelo (groq) + Ferramentas roda ao vivo
 *     (LLM real) e produz a coluna de saída — status OK, linhas materializadas.
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedDataset(page: Page, ds: string, rows: Record<string, unknown>[]) {
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
    data: { kind: "SNAPSHOT", branch: "main" },
  });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(
    `/api/datasets/${ds}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows } } } },
  );
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();
}

async function createBoard(page: Page, slug: string, graph: unknown) {
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: { slug, display_name: slug, graph },
  });
  expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
  return (await mk.json()) as { id: string; slug: string };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

async function dragHandle(page: Page, from: ReturnType<Page["locator"]>, to: ReturnType<Page["locator"]>) {
  const hb = await from.boundingBox();
  const tb = await to.boundingBox();
  expect(hb && tb, "handles com boundingBox").toBeTruthy();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb!.x + tb!.width / 2, tb!.y + tb!.height / 2, { steps: 14 });
  await page.mouse.up();
}

test.describe("A4 onda 4a — cluster AIP", () => {
  test("gesto de UI: arrastar portas ai_* liga sub-nodes ao Agente AIP (port persiste)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 980 });
    const tag = `ui_${Date.now()}`;
    const ds = `e2e_aip_${tag}`;
    await seedDataset(page, ds, [{ id: "1", nome: "Ana" }]);
    // Posições CONTROLADAS (handles confiáveis): agente em cima, sub-nodes embaixo.
    const board = await createBoard(page, `e2e-aip-${tag}`, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 80, y: 120 } },
        { id: "ag", op: "aip_agent", config: { prompt: "Responda OK", output: "aip_output", max_rows: 1 }, position: { x: 460, y: 120 } },
        { id: "m", op: "aip_model", config: { provider: "groq" }, position: { x: 300, y: 400 } },
        { id: "t", op: "aip_tools", config: { tools: ["opensanctions_search"] }, position: { x: 640, y: 400 } },
      ],
      edges: [{ from: "src", to: "ag" }],
    });
    await openBoard(page, board.id);

    const modelTop = page.locator('[data-testid="pb-node-m"] .react-flow__handle[data-handleid="ai_model"]');
    const toolsTop = page.locator('[data-testid="pb-node-t"] .react-flow__handle[data-handleid="ai_tool"]');
    const agentModelPort = page.locator('[data-testid="pb-node-ag"] .react-flow__handle[data-handleid="ai_model"]');
    const agentToolPort = page.locator('[data-testid="pb-node-ag"] .react-flow__handle[data-handleid="ai_tool"]');
    await expect(modelTop).toBeVisible();
    await expect(agentModelPort).toBeVisible();

    await dragHandle(page, modelTop, agentModelPort);
    await dragHandle(page, toolsTop, agentToolPort);

    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const edges = (bd.graph?.edges ?? []) as Array<{ from: string; to: string; port?: string }>;
      const hasModel = edges.some((e) => e.from === "m" && e.to === "ag" && e.port === "ai_model");
      const hasTool = edges.some((e) => e.from === "t" && e.to === "ag" && e.port === "ai_tool");
      return hasModel && hasTool;
    }, { timeout: 15000 }).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("execução REAL: cluster completo (Modelo groq + Ferramentas + Memória + Base) roda ao vivo", async ({ page }) => {
    test.setTimeout(180000); // agente com LLM real, 2 linhas + memória
    await login(page);
    const tag = `run_${Date.now()}`;
    const ds = `e2e_aip_${tag}`;
    await seedDataset(page, ds, [{ id: "1", nome: "Ana" }, { id: "2", nome: "Bruno" }]);
    // Board COMPLETO com os 4 sub-nodes (sem nó de Saída → derivado = folhas = saída
    // do agente). Base vetorial sem coleção = no-op gracioso; memória entre as linhas.
    const board = await createBoard(page, `e2e-aip-${tag}`, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 80, y: 120 } },
        { id: "ag", op: "aip_agent", config: { prompt: "Responda apenas com a palavra OK.", output: "aip_output", max_rows: 2 }, position: { x: 460, y: 120 } },
        { id: "m", op: "aip_model", config: { provider: "groq" }, position: { x: 200, y: 400 } },
        { id: "t", op: "aip_tools", config: { tools: ["opensanctions_search"] }, position: { x: 420, y: 400 } },
        { id: "mem", op: "aip_memory", config: { window: 5 }, position: { x: 620, y: 400 } },
        { id: "vec", op: "aip_vector", config: { collection: "", top_k: 3 }, position: { x: 820, y: 400 } },
      ],
      edges: [
        { from: "src", to: "ag" },
        { from: "m", to: "ag", port: "ai_model" },
        { from: "t", to: "ag", port: "ai_tool" },
        { from: "mem", to: "ag", port: "ai_memory" },
        { from: "vec", to: "ag", port: "ai_vectorStore" },
      ],
    });
    await openBoard(page, board.id);
    await page.getByTestId("pb-run").click();

    // Run REAL do agente (groq): status OK + ≥1 linha materializada.
    const run = await expect.poll(async () => {
      const rs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
      const list = (Array.isArray(rs) ? rs : []) as Array<{ status: string; rows_out?: number }>;
      const ok = list.find((r) => r.status === "OK");
      return ok ? { status: ok.status, rows_out: ok.rows_out ?? 0 } : null;
    }, { timeout: 130000, intervals: [2000] }).not.toBeNull();
    // (poll devolve o objeto; validação explícita abaixo)
    const rs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
    const ok = (rs as Array<{ status: string; rows_out?: number; output_asset_id?: string }>).find((r) => r.status === "OK");
    expect(ok, "run OK do cluster AIP").toBeTruthy();
    expect(ok!.rows_out ?? 0).toBeGreaterThanOrEqual(2); // 2 linhas (memória entre elas)
    void run;
  });
});
