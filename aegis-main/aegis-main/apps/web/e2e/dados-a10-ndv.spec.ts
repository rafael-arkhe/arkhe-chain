/**
 * E2E · A10 (complemento do operador 2026-07-04) — NDV do DAG:
 *   (b) "Executar etapa" atualiza o OUTPUT com a SAÍDA REAL do run (bug: antes só
 *       mexia em contagens; o OUTPUT lia `preview` → nunca refrescava). Certifica
 *       o caminho SSE (jsdom/jest cobre o blocking).
 *   (a) Hierarquia de superfícies "trilhos recuados, centro em foco": Entrada e
 *       Saída no tom recuado (#ECEFF2 = raised-light) e o centro de Parâmetros no
 *       plano elevado (#FFFFFF = canvas-light). Dentro do DS (só borda, sem glow).
 *
 * Régua: gesto do operador ao vivo (feedback_no_false_done_claims), nunca só seed.
 */
import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedBoard(page: Page, tag: string) {
  const ds = `e2e_a10_${tag}`;
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
    data: { kind: "SNAPSHOT", branch: "main" },
  });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(
    `/api/datasets/${ds}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows: [{ g: "G1", a: "1" }, { g: "G2", a: "2" }] } } } },
  );
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-a10-${tag}`, display_name: `E2E A10 ${tag}`,
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

async function seedMergeBoard(page: Page, tag: string) {
  const mkDs = async (name: string, rows: Record<string, unknown>[]) => {
    const begin = await page.request.post(`/api/datasets/${name}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
    expect(begin.ok(), `begin ${name} → ${begin.status()}`).toBeTruthy();
    const tx = await begin.json();
    const commit = await page.request.post(`/api/datasets/${name}/transactions/${tx.id}/commit`,
      { data: { input_payload: { payload: { rows } } } });
    expect(commit.ok(), `commit ${name} → ${commit.status()}`).toBeTruthy();
  };
  const dsA = `e2e_a10m_a_${tag}`, dsB = `e2e_a10m_b_${tag}`;
  await mkDs(dsA, [{ cpf: "1", nome: "Ana" }]);       // lado esquerdo: nome (só aqui)
  await mkDs(dsB, [{ cpf: "1", cidade: "SP" }]);       // lado direito: cidade (só aqui)
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-a10m-${tag}`, display_name: `E2E A10M ${tag}`,
      graph: {
        nodes: [
          { id: "sa", op: "source", config: { dataset: dsA }, position: { x: 60, y: 80 } },
          { id: "sb", op: "source", config: { dataset: dsB }, position: { x: 60, y: 280 } },
          { id: "mrg", op: "merge", config: { mode: "append" }, position: { x: 380, y: 180 } },
        ],
        edges: [{ from: "sa", to: "mrg" }, { from: "sb", to: "mrg" }],
      },
    },
  });
  expect(mk.ok(), `create merge board → ${mk.status()}`).toBeTruthy();
  return { board: await mk.json() as { id: string } };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

const bg = (p: Page, id: string) =>
  p.getByTestId(id).evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("A10 — NDV: refresh do OUTPUT + hierarquia de superfícies", () => {
  test("Executar etapa refresca o OUTPUT com a saída real; trilhos recuados vs centro elevado", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `${Date.now()}`);
    await openBoard(page, board.id);

    // NDV do nó de transform (filter).
    await page.getByTestId("pb-node-flt").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();

    // (a) HIERARQUIA — trilhos Entrada/Saída recuados (#ECEFF2) e centro elevado (#FFFFFF).
    expect(await bg(page, "pb-panel-input"), "Entrada recuada").toBe("rgb(236, 239, 242)");
    expect(await bg(page, "pb-panel-output"), "Saída recuada").toBe("rgb(236, 239, 242)");
    expect(await bg(page, "pb-panel-params"), "centro elevado").toBe("rgb(255, 255, 255)");

    // (b) OUTPUT vazio ANTES de rodar (sem preview computado).
    await expect(page.getByTestId("pb-preview-result")).toHaveCount(0);

    // Executar etapa → o OUTPUT reflete a SAÍDA REAL do run (não precisa Pré-visualizar).
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
    // aba Schema mostra a coluna real 'g' (schema {coluna: tipo}).
    await expect(page.getByTestId("pb-panel-output")).toContainText("g");

    // i18n — nenhuma chave CRUA vaza no NDV (ex.: pbw.columnPlaceholderOption que
    // aparecia no select CAMPO). Guard geral contra chave i18n não traduzida.
    await expect(page.getByTestId("pb-config-overlay")).not.toContainText("pbw.");

    // aba JSON: a linha real do run (G1 passa o filtro; G2 não).
    await page.getByTestId("pb-panel-out-json").click();
    await expect(page.getByTestId("pb-panel-output")).toContainText("G1");
    await expect(page.getByTestId("pb-panel-output")).not.toContainText("G2");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("INPUT port-aware: merge de 2 fontes tem abas Esquerda/Direita; right_on lê o lado direito", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedMergeBoard(page, `${Date.now()}`);
    await openBoard(page, board.id);

    await page.getByTestId("pb-node-mrg").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();

    // >=2 pais → abas por ENTRADA (rótulos traduzidos ao vivo).
    await expect(page.getByTestId("pb-input-ports")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("pb-input-port-0")).toContainText("Esquerda");
    await expect(page.getByTestId("pb-input-port-1")).toContainText("Direita");

    // Esquerda (ativa) → coluna SÓ do 1º pai (nome); nada do 2º (cidade).
    await expect(page.getByTestId("pb-schema-col-nome")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("pb-schema-col-cidade")).toHaveCount(0);

    // Direita → coluna SÓ do 2º pai (cidade) — o débito incoming[0] fechado.
    await page.getByTestId("pb-input-port-1").click();
    await expect(page.getByTestId("pb-schema-col-cidade")).toBeVisible({ timeout: 30000 });

    // MergeConfig combine: right_on oferece a coluna do lado DIREITO (cidade),
    // left_on a do lado esquerdo (nome).
    await page.getByTestId("pb-cfg-merge-mode").selectOption("combine");
    await expect(page.getByTestId("pb-cfg-merge-right").locator('option[value="cidade"]'))
      .toHaveCount(1, { timeout: 30000 });
    await expect(page.getByTestId("pb-cfg-merge-left").locator('option[value="nome"]')).toHaveCount(1);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
