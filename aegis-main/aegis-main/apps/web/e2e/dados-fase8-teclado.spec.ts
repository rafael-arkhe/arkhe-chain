/**
 * E2E · F8.5 — teclado completo do canvas (plano V3.1 §4-F8 item 5, na risca n8n):
 *   1. F2 = rename INLINE no card (commit Enter → config.label persistido)
 *   2. Undo/redo local (Ctrl+Z / Ctrl+Shift+Z) sobre o graph da sessão
 *   3. Multi-seleção: drag-box no fundo + Ctrl+A · copiar/colar Ctrl+C/V
 *      (paste importa JSON com ids novos + arestas remapeadas)
 *   4. Ctrl+Enter SEM seleção = executar o board (run SSE real)
 *   5. Zoom por teclado: + / − / 0 (reset) / 1 (fit)
 *   6. Guard: NDV aberto pausa o teclado do canvas (D não desativa por trás)
 *
 * Seeds via API com cookies da sessão (padrão fase7). GOTCHA herdado: pb-msg
 * não é sinal confiável do PUT → persistência provada com expect.poll do graph
 * salvo no servidor. Régua: feedback_e2e_via_playwright_cli.
 */
import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

/** Seed de dataset SNAPSHOT + board source→filter (mesmo shape da fase7). */
async function seedBoard(page: Page, tag: string) {
  const ds = `e2e_f85_${tag}`;
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
    data: { kind: "SNAPSHOT", branch: "main" },
  });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(
    `/api/datasets/${ds}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows: [
      { g: "G1", a: "1" }, { g: "G2", a: "2" }, { g: "G1", a: "3" },
    ] } } } },
  );
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();

  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-f85-${tag}`, display_name: `E2E F85 ${tag}`,
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
  return { ds, board: await mk.json() as { id: string } };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

/** graph salvo no SERVIDOR (a única prova de persistência que vale). */
async function serverGraph(page: Page, boardId: string) {
  const bd = await (await page.request.get(`/api/platform/v23/pipeline/${boardId}`)).json();
  return (bd.graph ?? { nodes: [], edges: [] }) as {
    nodes: Array<{ id: string; op: string; config?: Record<string, unknown> }>;
    edges: Array<{ from: string; to: string }>;
  };
}

test.describe("F8.5 — teclado completo do canvas", () => {
  test("F2 renomeia INLINE no card e config.label persiste no graph salvo", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `rn_${Date.now()}`);
    await openBoard(page, board.id);

    // Seleciona o nó e pede o rename por teclado (F2, paridade n8n).
    await page.getByTestId("pb-node-flt").click();
    await page.keyboard.press("F2");
    const input = page.getByTestId("pb-node-rename-flt");
    await expect(input).toBeVisible();
    await input.fill("Filtro G1");
    await page.keyboard.press("Enter");

    // O card mostra o rótulo novo imediatamente (input fechou).
    await expect(page.getByTestId("pb-node-rename-flt")).toHaveCount(0);
    await expect(page.getByTestId("pb-node-flt")).toContainText("Filtro G1");

    // Persistência REAL: salvar e provar o config.label no graph do servidor.
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const g = await serverGraph(page, board.id);
      return String(g.nodes.find((n) => n.id === "flt")?.config?.label ?? "");
    }, { timeout: 15000 }).toBe("Filtro G1");

    // Escape durante o rename CANCELA (não comita).
    await page.getByTestId("pb-node-flt").click();
    await page.keyboard.press("F2");
    await page.getByTestId("pb-node-rename-flt").fill("Nome descartado");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pb-node-rename-flt")).toHaveCount(0);
    await expect(page.getByTestId("pb-node-flt")).toContainText("Filtro G1");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("Ctrl+Z desfaz e Ctrl+Shift+Z refaz (histórico local da sessão)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `uz_${Date.now()}`);
    await openBoard(page, board.id);

    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(2);

    // Muda o graph (duplica o filtro) → 3 nós.
    await page.getByTestId("pb-node-flt").click();
    await page.keyboard.press("Control+d");
    await expect(nodes).toHaveCount(3);

    // Fora da janela de coalescência antes da próxima edição observável.
    await page.waitForTimeout(600);

    // Undo volta a 2; redo volta a 3.
    await page.keyboard.press("Control+z");
    await expect(nodes).toHaveCount(2);
    await page.keyboard.press("Control+Shift+z");
    await expect(nodes).toHaveCount(3);

    // O estado refeito é salvável e persiste (3 nós no servidor).
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => (await serverGraph(page, board.id)).nodes.length, { timeout: 15000 }).toBe(3);

    // E o undo pós-save continua local: desfaz de novo → 2 nós no canvas.
    await page.waitForTimeout(600);
    await page.keyboard.press("Control+z");
    await expect(nodes).toHaveCount(2);

    // Undo de POSIÇÃO (o caso invisível ao sig id+op+config → resyncKey):
    // arrastar o nó e desfazer devolve o card ao lugar.
    const wrapper = page.locator('.react-flow__node[data-id="flt"]');
    const before = await wrapper.getAttribute("style");
    const box = await page.getByTestId("pb-node-flt").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 140, box!.y + box!.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => await wrapper.getAttribute("style")).not.toBe(before);
    await page.waitForTimeout(600); // fecha a rajada de coalescência do drag
    await page.keyboard.press("Control+z");
    await expect.poll(async () => await wrapper.getAttribute("style"), { timeout: 5000 }).toBe(before);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("drag-box seleciona múltiplos · Ctrl+A/C/V copia e cola com ids novos", async ({ page, context }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3002" });
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `ms_${Date.now()}`);
    await openBoard(page, board.id);

    const selectedCards = page.locator('[data-testid^="pb-node-"][aria-pressed="true"]');

    // Drag-box: arrastar no FUNDO desenha a caixa e seleciona os nós tocados
    // (selectionOnDrag + SelectionMode.Partial — gesto n8n). GOTCHA: o retângulo
    // precisa começar/terminar DENTRO do pane (min-48 caía no aside do Acervo e
    // o mousedown nem chegava ao canvas) → clamp ao box do pb-canvas.
    const b1 = await page.getByTestId("pb-node-src").boundingBox();
    const b2 = await page.getByTestId("pb-node-flt").boundingBox();
    const cv = await page.getByTestId("pb-canvas").boundingBox();
    expect(b1 && b2 && cv).toBeTruthy();
    const x0 = Math.max(cv!.x + 4, Math.min(b1!.x, b2!.x) - 48);
    const y0 = Math.max(cv!.y + 4, Math.min(b1!.y, b2!.y) - 48);
    const x1 = Math.min(cv!.x + cv!.width - 4, Math.max(b1!.x + b1!.width, b2!.x + b2!.width) + 48);
    const y1 = Math.min(cv!.y + cv!.height - 4, Math.max(b1!.y + b1!.height, b2!.y + b2!.height) + 48);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 8 });
    await page.mouse.up();
    await expect(selectedCards).toHaveCount(2);

    // Escape limpa a seleção; Ctrl+A seleciona tudo de volta.
    await page.keyboard.press("Escape");
    await expect(selectedCards).toHaveCount(0);
    await page.keyboard.press("Control+a");
    await expect(selectedCards).toHaveCount(2);

    // Ctrl+C serializa a seleção; Ctrl+V importa o JSON com ids NOVOS +
    // aresta interna remapeada → 4 nós e 2 arestas no canvas.
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(page.locator(".react-flow__node")).toHaveCount(4);
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);

    // Persistência: 4 nós / 2 arestas / ids únicos no graph salvo.
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const g = await serverGraph(page, board.id);
      const ids = g.nodes.map((n) => n.id);
      return `${ids.length}:${new Set(ids).size}:${g.edges.length}`;
    }, { timeout: 15000 }).toBe("4:4:2");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("Ctrl+Enter sem seleção executa o BOARD (run real via SSE)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `rb_${Date.now()}`);
    await openBoard(page, board.id);

    // Clique no fundo garante seleção vazia → Ctrl+Enter = executar o board.
    await page.locator(".react-flow__pane").click({ position: { x: 30, y: 30 } });
    await page.keyboard.press("Control+Enter");

    // Prova real: estado vivo por nó aparece e o filtro conclui.
    await expect(page.getByTestId("pb-node-state-flt")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("pb-node-state-flt")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("zoom por teclado: + aproxima · 0 reseta p/ 100% · 1 enquadra", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `zm_${Date.now()}`);
    await openBoard(page, board.id);

    const scale = async () => {
      const t = await page.locator(".react-flow__viewport").getAttribute("style") ?? "";
      const m = t.match(/scale\(([\d.]+)\)/);
      return m ? Number(m[1]) : NaN;
    };

    // 0 → zoomTo(1): escala exatamente 100%.
    await page.keyboard.press("0");
    await expect.poll(scale, { timeout: 5000 }).toBe(1);

    // + → aproxima (escala cresce).
    await page.keyboard.press("+");
    await expect.poll(scale, { timeout: 5000 }).toBeGreaterThan(1);

    // − → afasta de volta.
    await page.keyboard.press("-");
    await expect.poll(scale, { timeout: 5000 }).toBeLessThanOrEqual(1.0001);

    // 1 → fit view (a escala muda p/ enquadrar o graph — diferente de 100%).
    await page.keyboard.press("1");
    await expect.poll(async () => {
      const s = await scale();
      return Number.isFinite(s) && Math.abs(s - 1) > 0.001;
    }, { timeout: 5000 }).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("guard: NDV aberto PAUSA o teclado do canvas (D não desativa por trás)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `gd_${Date.now()}`);
    await openBoard(page, board.id);

    // Abre o NDV do filtro e pressiona D com o foco fora de inputs.
    await page.getByTestId("pb-node-flt").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.getByTestId("pb-config-overlay").click({ position: { x: 10, y: 10 } });
    await page.keyboard.press("d");
    await page.keyboard.press("Escape"); // fecha o NDV
    await expect(page.getByTestId("pb-config-overlay")).toHaveCount(0);

    // O nó NÃO foi desativado por trás do overlay (sem borda tracejada de
    // disabled) — e o graph em edição não ganhou disabled.
    const cls = await page.getByTestId("pb-node-flt").getAttribute("class");
    expect(cls ?? "").not.toContain("border-dashed");

    // Com o NDV fechado, D volta a valer (comportamento existente preservado).
    await page.getByTestId("pb-node-flt").click();
    await page.keyboard.press("d");
    await expect.poll(async () => (await page.getByTestId("pb-node-flt").getAttribute("class")) ?? "").toContain("border-dashed");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
