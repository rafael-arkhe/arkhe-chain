/**
 * Wave 1 inc2 — REGISTRO DE NÓ declarativo (o "nó = dado").
 *
 * Cert AO VIVO do GESTO do operador: os nós DECLARÁVEIS (wait/stop_error/aip_agent/
 * aip_memory) deixaram de ter componente React à mão — o inspetor é o
 * NodeFieldsRenderer genérico dirigido pelo NODE_REGISTRY (properties[] estilo n8n).
 * Prova: abrir o nó, editar os campos GERADOS do registro, salvar → a config
 * persiste no graph do servidor (o dado ida-e-volta pelo renderer genérico).
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function createBoard(page: Page, slug: string, graph: unknown) {
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: { slug, display_name: slug, graph },
  });
  expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
  return (await mk.json()) as { id: string };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

async function graphOf(page: Page, boardId: string) {
  const bd = await (await page.request.get(`/api/platform/v23/pipeline/${boardId}`)).json();
  return (bd.graph?.nodes ?? []) as Array<{ id: string; op: string; config?: Record<string, unknown> }>;
}

test.describe("Wave 1 inc2 — nó declarativo (NODE_REGISTRY + NodeFieldsRenderer)", () => {
  test("wait/stop_error: inspetor GERADO do registro edita e persiste a config", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 940 });
    const tag = `reg_${Date.now()}`;
    const board = await createBoard(page, `e2e-reg-${tag}`, {
      nodes: [
        { id: "w", op: "wait", config: { seconds: 5 }, position: { x: 120, y: 140 } },
        { id: "se", op: "stop_error", config: { message: "" }, position: { x: 420, y: 140 } },
      ],
      edges: [{ from: "w", to: "se" }],
    });
    await openBoard(page, board.id);

    // WAIT — o campo `seconds` é gerado pelo registro (properties[]), não à mão.
    await page.getByTestId("pb-node-w").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-wait")).toBeVisible(); // container preservado
    await page.getByTestId("pb-cfg-wait-seconds").fill("42");
    await page.keyboard.press("Escape");

    // STOP_ERROR — o campo `message` idem.
    await page.getByTestId("pb-node-se").dblclick();
    await expect(page.getByTestId("pb-cfg-stop-message")).toBeVisible();
    await page.getByTestId("pb-cfg-stop-message").fill("coleta vazia — abortar");
    await page.keyboard.press("Escape");

    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const nodes = await graphOf(page, board.id);
      const w = nodes.find((n) => n.id === "w");
      const se = nodes.find((n) => n.id === "se");
      return Number(w?.config?.seconds) === 42 && se?.config?.message === "coleta vazia — abortar";
    }, { timeout: 15000 }).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("merge: displayOptions AO VIVO — mode=combine revela left_on/right_on (field type column)", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1680, height: 940 });
    const tag = `regmerge_${Date.now()}`;
    const board = await createBoard(page, `e2e-reg-${tag}`, {
      nodes: [{ id: "m", op: "merge", config: { mode: "append" }, position: { x: 200, y: 160 } }],
      edges: [],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-m").dblclick();
    await expect(page.getByTestId("pb-cfg-merge-mode")).toBeVisible();
    // mode=append → left_on/right_on ESCONDIDOS (displayOptions show mode=combine).
    await expect(page.getByTestId("pb-cfg-merge-left")).toHaveCount(0);
    // muda p/ combine → os campos de coluna APARECEM (motor de visibilidade ao vivo).
    await page.getByTestId("pb-cfg-merge-mode").selectOption("combine");
    await expect(page.getByTestId("pb-cfg-merge-left")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-merge-right")).toBeVisible();
    // edita a coluna (sem schema → ColumnSelect cai em input livre) e persiste.
    await page.getByTestId("pb-cfg-merge-left").fill("cpf");
    await page.keyboard.press("Escape");
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const nodes = await graphOf(page, board.id);
      const m = nodes.find((n) => n.id === "m");
      return m?.config?.mode === "combine" && m?.config?.left_on === "cpf";
    }, { timeout: 15000 }).toBe(true);
  });

  test("transform declarativo (batch 2b): crypto do TRANSFORM_REGISTRY edita algo/output e persiste em config.args", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 940 });
    const tag = `regtx_${Date.now()}`;
    // transform vive sob op='transform' com c.op=innerOp e edita config.args.* (não
    // config direto) — o registro dirige o inspetor pelo NodeFieldsRenderer genérico.
    const board = await createBoard(page, `e2e-reg-${tag}`, {
      nodes: [
        { id: "src", op: "source", config: { dataset: "" }, position: { x: 80, y: 140 } },
        { id: "cx", op: "transform", config: { op: "crypto", args: { input: "cpf", algo: "sha256", output: "hash" } }, position: { x: 420, y: 140 } },
      ],
      edges: [{ from: "src", to: "cx" }],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-cx").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    // container do registro + campos GERADOS (não JSX à mão); o seletor de op fica.
    await expect(page.getByTestId("pb-cfg-op")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-crypto")).toBeVisible();
    // enum com default REAL (sha256) → SEM opção vazia '—': só os 3 algoritmos.
    const algoOpts = await page.getByTestId("pb-cfg-crypto-algo").locator("option").allTextContents();
    expect(algoOpts).toEqual(["SHA-256", "SHA-1", "MD5"]);
    await page.getByTestId("pb-cfg-crypto-algo").selectOption("md5");
    await page.getByTestId("pb-cfg-crypto-output").fill("cpf_hash");
    await page.keyboard.press("Escape");

    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const nodes = await graphOf(page, board.id);
      const cx = nodes.find((n) => n.id === "cx");
      const a = (cx?.config?.args ?? {}) as Record<string, unknown>;
      // o dado ida-e-volta pelo renderer genérico: args.algo/output persistem.
      return a.algo === "md5" && a.output === "cpf_hash";
    }, { timeout: 15000 }).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("aip_agent/aip_memory: cluster com inspetor gerado edita prompt/janela e persiste", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1680, height: 940 });
    const tag = `regaip_${Date.now()}`;
    const board = await createBoard(page, `e2e-reg-${tag}`, {
      nodes: [
        { id: "src", op: "source", config: { dataset: "" }, position: { x: 80, y: 120 } },
        { id: "ag", op: "aip_agent", config: { prompt: "", output: "aip_output", max_rows: 20 }, position: { x: 440, y: 120 } },
        { id: "mem", op: "aip_memory", config: { window: 10 }, position: { x: 440, y: 380 } },
      ],
      edges: [{ from: "src", to: "ag" }, { from: "mem", to: "ag", port: "ai_memory" }],
    });
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-ag").dblclick();
    await expect(page.getByTestId("pb-cfg-aip-agent")).toBeVisible();
    await page.getByTestId("pb-cfg-aip-prompt").fill("Quem é {nome}?");
    await page.getByTestId("pb-cfg-aip-cap").fill("7");
    await page.keyboard.press("Escape");

    await page.getByTestId("pb-node-mem").dblclick();
    await expect(page.getByTestId("pb-cfg-aip-mem-window")).toBeVisible();
    await page.getByTestId("pb-cfg-aip-mem-window").fill("15");
    await page.keyboard.press("Escape");

    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const nodes = await graphOf(page, board.id);
      const ag = nodes.find((n) => n.id === "ag");
      const mem = nodes.find((n) => n.id === "mem");
      return ag?.config?.prompt === "Quem é {nome}?" && Number(ag?.config?.max_rows) === 7 && Number(mem?.config?.window) === 15;
    }, { timeout: 15000 }).toBe(true);
  });
});
