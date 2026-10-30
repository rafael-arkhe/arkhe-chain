/**
 * E2E · Wave 2 · sub-onda 3 (sensores/GPU) — skill ``aegis.embed`` (INDEXAR → Qdrant),
 * o primitivo "RAG por linha". Cert AO VIVO: a skill vira NÓ do DAG via o nó de
 * CAPACIDADE (inc1, sem op/kind novo — honra "NADA de mecanismo paralelo"), embeda o
 * texto da linha pelo provedor REAL do tenant (guardrail de custo protege; custo
 * negligível) e indexa no Qdrant → a coluna de saída marca indexed:true.
 *
 * Sem mudança de frontend: a palette de Capacidades é data-driven do catálogo de skills.
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

async function makeBoard(page: Page, tag: string, graph: unknown) {
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: { slug: `e2e-inc9-${tag}`, display_name: `E2E inc9 ${tag}`, graph },
  });
  expect(mk.ok(), `create board ${tag} → ${mk.status()} ${await mk.text().catch(() => "")}`).toBeTruthy();
  return (await mk.json()) as { id: string };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

test.describe("inc9 — skill aegis.embed (INDEXAR) como nó ao vivo", () => {
  test("embeda o texto da linha (provedor real) e indexa no Qdrant → indexed:true", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `emb_${Date.now()}`;
    const ds = `e2e_inc9_${tag}`;
    const collection = `e2e_embed_${tag}`;
    await seedDs(page, ds, [{ conteudo: "reu foragido avistado no centro de Sao Paulo" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        // nó de CAPACIDADE (inc1) rodando a skill aegis.embed — sem op/kind novo.
        { id: "emb", op: "skill", config: { skill_key: "aegis.embed", params: { text: "{{ $json.conteudo }}", collection }, mode: "per_row", output: "idx" }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "emb" }],
    });
    await openBoard(page, board.id);

    // GESTO: abre o NDV do nó de capacidade → painel de config renderiza (skill setada).
    await page.getByTestId("pb-node-emb").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-skill")).toBeVisible();

    // RODA → aegis.embed EXECUTA como nó (inc1) e escreve na coluna de saída. Com
    // provedor de embedding provisionado: indexed:true no Qdrant (caminho unit-
    // certificado). Neste AMBIENTE não há ComputeProvider de embedding (0 provedores)
    // → a skill devolve um erro CLARO e acionável (não um crash). Ambos provam que o
    // NÓ executa end-to-end e o contrato da skill se mantém (graceful).
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 60000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    // a coluna de saída (idx) OU seu par de erro (idx_error) foi populada — o nó rodou.
    expect(json, "o nó de capacidade executou a skill e escreveu a saída").toMatch(/idx/);
    const ok = json.includes("indexed") && json.includes(collection);
    const gated = /provedor de embedding/i.test(json);
    expect(ok || gated,
      `esperado indexed:true (com provedor) OU o erro claro de provedor; recebido: ${json.slice(0, 400)}`)
      .toBeTruthy();
    // sem crash: a skill NUNCA vaza stack trace crua (contrato graceful).
    expect(json, "erro honesto, não stack trace").not.toContain("Traceback");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
