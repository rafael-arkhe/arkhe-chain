/**
 * E2E · Wave 1 inc6 — nó de AÇÃO (fecha o ciclo AGIR). Cert AO VIVO: o nó despacha
 * ``dispatch_action(code_ref, input)`` POR LINHA (template {{ $json.col }} resolvido)
 * e grava a saída na coluna escolhida. Usa o caminho ECHO do dispatcher (code_ref não
 * registrado → {ok, received}) — determinístico e sem efeito colateral externo.
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
    data: { slug: `e2e-inc6-${tag}`, display_name: `E2E inc6 ${tag}`, graph },
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

test.describe("inc6 — nó de AÇÃO (AGIR) ao vivo", () => {
  test("despacha por linha (template resolvido) e grava a saída na coluna", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const tag = `act_${Date.now()}`;
    const ds = `e2e_inc6_${tag}`;
    await seedDs(page, ds, [{ nome: "Ana" }, { nome: "Bruno" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        // code_ref não-registrado → dispatch_action devolve o echo {ok, received} (sem efeito externo).
        { id: "act", op: "action", config: { code_ref: "aegis.pipeline.echo_test", params: { msg: "oi {{ $json.nome }}" }, mode: "per_row", output: "acao" }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "act" }],
    });
    await openBoard(page, board.id);

    // GESTO: abre o NDV do nó de ação → painel de config renderiza (code_ref setado).
    await page.getByTestId("pb-node-act").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-action")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-action-mode")).toHaveValue("per_row");

    // RODA → dispatch_action por linha → OUTPUT tem a coluna 'acao' com a msg echoada.
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
    await page.getByTestId("pb-panel-out-json").click();
    const json = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
    expect(json, "a ação gravou a saída na coluna 'acao'").toContain("acao");
    expect(json, "template {{ $json.nome }} resolvido por linha").toContain("oi Ana");
    expect(json, "2ª linha também despachada").toContain("oi Bruno");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
