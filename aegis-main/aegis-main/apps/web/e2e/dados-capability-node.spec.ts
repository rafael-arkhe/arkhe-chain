/**
 * Wave 1 inc1 — nó de CAPACIDADE (skill/tool): a ponte entre os 2 motores.
 *
 * Cert AO VIVO do GESTO do operador (não seed):
 *  A) UI: abrir a palette → categoria "Capacidades" → escolher uma skill cria um nó
 *     op:'skill' no fluxo, já com o skill_key pré-selecionado (palette data-driven do
 *     registry: as 18 skills nativas + ~145 tools mcp:* viram nó, sem código por skill).
 *  B) Execução REAL: um board Fonte → Capacidade (smoke.echo, por-linha) roda ao vivo
 *     — o walker do DAG despacha registry.get(skill_key).run(ctx) e ENRIQUECE cada
 *     linha com a saída da skill (status OK; a coluna de saída carrega o resultado).
 *     smoke.echo é uma skill REAL do registry (execução determinística, sem rede).
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

test.describe("Wave 1 inc1 — nó de CAPACIDADE (skill/tool)", () => {
  test("gesto de UI: palette → Capacidades → escolher skill cria o nó op:skill", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 980 });
    const tag = `ui_${Date.now()}`;
    const ds = `e2e_cap_${tag}`;
    await seedDataset(page, ds, [{ id: "1", message: "alfa" }]);
    const board = await createBoard(page, `e2e-cap-${tag}`, {
      nodes: [{ id: "src", op: "source", config: { dataset: ds }, position: { x: 80, y: 140 } }],
      edges: [],
    });
    await openBoard(page, board.id);

    // Abre a palette e busca a capacidade REAL (smoke.echo) — a busca varre o
    // catálogo estático E as capacidades dinâmicas (registry).
    await page.getByTestId("pb-add-node-btn").click();
    await expect(page.getByTestId("pb-nodes-panel")).toBeVisible();
    await page.getByTestId("pb-nodes-search").fill("smoke echo");
    const skillEntry = page.getByTestId("pb-add-skill-smoke.echo");
    await expect(skillEntry).toBeVisible({ timeout: 15000 });
    await skillEntry.click();

    // Persiste e confirma no graph do servidor: existe um nó op:'skill' com o
    // skill_key pré-selecionado pela palette.
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const nodes = (bd.graph?.nodes ?? []) as Array<{ op: string; config?: { skill_key?: string } }>;
      return nodes.some((n) => n.op === "skill" && n.config?.skill_key === "smoke.echo");
    }, { timeout: 15000 }).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("execução REAL: Fonte → Capacidade (smoke.echo, por-linha) enriquece cada linha", async ({ page }) => {
    test.setTimeout(120000);
    await login(page);
    const tag = `run_${Date.now()}`;
    const ds = `e2e_cap_${tag}`;
    await seedDataset(page, ds, [
      { id: "1", message: "alfa" },
      { id: "2", message: "bravo" },
      { id: "3", message: "charlie" },
    ]);
    // Fonte → Capacidade (sem nó de Saída → o derivado = folha = saída da skill).
    // Param 'message' ligado à coluna via {{ $json.message }} — resolve POR LINHA.
    const board = await createBoard(page, `e2e-cap-${tag}`, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 80, y: 140 } },
        { id: "sk", op: "skill", config: {
          skill_key: "smoke.echo",
          params: { message: "{{ $json.message }}" },
          mode: "per_row", output: "cap", max_rows: 20,
        }, position: { x: 460, y: 140 } },
      ],
      edges: [{ from: "src", to: "sk" }],
    });
    await openBoard(page, board.id);

    // Gesto do operador: botão Executar → run OK com 3 linhas.
    await page.getByTestId("pb-run").click();
    await expect.poll(async () => {
      const rs = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs`)).json();
      const list = (Array.isArray(rs) ? rs : []) as Array<{ status: string; rows_out?: number }>;
      const ok = list.find((r) => r.status === "OK");
      return ok ? (ok.rows_out ?? 0) : -1;
    }, { timeout: 60000, intervals: [1500] }).toBe(3);

    // Prova do ENRIQUECIMENTO: rodar até o nó de capacidade devolve a amostra do
    // OUTPUT (A10) — cada linha ganhou a coluna 'cap' com a saída REAL da skill.
    const stop = await page.request.post(`/api/platform/v23/pipeline/${board.id}/run`, {
      data: { stop_at_node: "sk" },
    });
    expect(stop.ok(), `run stop_at_node → ${stop.status()}`).toBeTruthy();
    const body = await stop.json();
    expect(body.status).toBe("OK");
    const sample = (body.sample_rows ?? []) as Array<Record<string, unknown>>;
    expect(sample.length).toBe(3);
    const byMsg: Record<string, Record<string, unknown>> = {};
    for (const r of sample) byMsg[String(r.message)] = r;
    // A skill REAL rodou por linha: a coluna 'cap' carrega o echo da mensagem da linha.
    for (const msg of ["alfa", "bravo", "charlie"]) {
      const cap = byMsg[msg]?.cap as { echoed_message?: string } | undefined;
      expect(cap, `linha ${msg} sem coluna cap`).toBeTruthy();
      expect(cap?.echoed_message).toBe(msg);
    }
  });
});
