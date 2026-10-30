/**
 * E2E · Correções do operador (2026-07-04) — §A do
 * plano-complemento-operador-2026-07-04.md. Acumula os gestos AO VIVO de cada
 * item entregue:
 *   A1 — "Operação" do board = select DINÂMICO (fonte /operacoes): vincular
 *        persiste project_id no servidor; "—" desvincula; o campo enganoso
 *        ("Operação" mostrando node.id no settings) morreu.
 *   A2 — o painel INSPETOR morreu (redundante com o NDV); "Execuções" é uma
 *        opção do toolbar que abre MODAL com o histórico real.
 *   A3 — entrar em ?aba=pipelines nasce com CP sidenav + Acervo COLAPSADOS
 *        (foco no canvas); Fontes (datasets) vive DENTRO do picker Adicionar nó.
 *   A4/A5 — motor DAG NÃO-LINEAR ao vivo: If roteia true/false por porta na
 *        aresta; Merge junta DUAS fontes reais; o gesto de UI (picker → NDV →
 *        Adicionar depois) produz aresta COM porta persistida.
 *
 * Régua: persistência provada com expect.poll do estado no SERVIDOR (pb-msg
 * não é sinal confiável); feedback_e2e_via_playwright_cli.
 */
import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedBoard(page: Page, tag: string) {
  const ds = `e2e_ca_${tag}`;
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
    data: { kind: "SNAPSHOT", branch: "main" },
  });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(
    `/api/datasets/${ds}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows: [{ g: "G1", a: "1" }] } } } },
  );
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-ca-${tag}`, display_name: `E2E CA ${tag}`,
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

async function serverBoard(page: Page, boardId: string) {
  return (await (await page.request.get(`/api/platform/v23/pipeline/${boardId}`)).json()) as {
    project_id: string | null;
  };
}

test.describe("Correções §A — DAG", () => {
  test("A1: Operação do board é select dinâmico; vincular/desvincular persiste project_id", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;

    // Operação REAL criada via API (fonte do select dinâmico).
    const mkProj = await page.request.post(`/api/projects`, {
      data: { slug: `e2e-ca-op-${tag}`, display_name: `E2E Operação ${tag}` },
    });
    expect(mkProj.ok(), `create project → ${mkProj.status()}`).toBeTruthy();
    const proj = await mkProj.json() as { id: string };

    const { board } = await seedBoard(page, tag);
    await openBoard(page, board.id);

    // O campo é um SELECT (nunca input cru) e está populado com a Operação real.
    const sel = page.getByTestId("pb-project");
    await expect(sel).toBeVisible();
    expect(await sel.evaluate((el) => el.tagName)).toBe("SELECT");
    await expect(sel.locator(`option[value="${proj.id}"]`)).toHaveCount(1, { timeout: 15000 });

    // Vincular → PUT project_id persistido no SERVIDOR.
    await sel.selectOption(proj.id);
    await expect.poll(async () => (await serverBoard(page, board.id)).project_id, { timeout: 15000 })
      .toBe(proj.id);

    // "—" desvincula.
    await sel.selectOption("");
    await expect.poll(async () => (await serverBoard(page, board.id)).project_id, { timeout: 15000 })
      .toBeNull();

    // O campo enganoso morreu: aba Configurações do nó SEM input com node.id.
    await page.getByTestId("pb-node-flt").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.getByTestId("pb-panel-tab-settings").click();
    expect(await page.locator('input[value="flt"]').count()).toBe(0);
    await page.keyboard.press("Escape");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A2/F9a: sem painel Inspetor; Execuções é ABA persistente com run real", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `ex_${Date.now()}`);
    await openBoard(page, board.id);

    // O aside Inspetor MORREU: nem painel, nem botões de abrir/fechar.
    await expect(page.getByTestId("pb-inspector")).toHaveCount(0);
    await expect(page.getByTestId("pb-right-open")).toHaveCount(0);
    await expect(page.getByTestId("pb-right-close")).toHaveCount(0);

    // F9a — Execuções virou ABA persistente (Canvas | Execuções), sem modal.
    // Aba vazia honesta antes de qualquer run.
    await page.getByTestId("pb-tab-runs").click();
    await expect(page.getByTestId("pb-executions-panel")).toBeVisible();
    await expect(page.getByTestId("pb-runs-empty")).toBeVisible();
    // Voltar ao Canvas e rodar.
    await page.getByTestId("pb-tab-canvas").click();
    await expect(page.getByTestId("pb-executions-panel")).toHaveCount(0);

    // Run REAL → a aba lista a execução. O botão do toolbar tb seleciona a aba.
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-flt")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });
    await page.getByTestId("pb-executions-btn").click();
    await expect(page.getByTestId("pb-executions-panel")).toBeVisible();
    await expect(page.getByTestId("pb-executions-panel").locator('[data-testid^="pb-runrow-"]').first())
      .toBeVisible({ timeout: 15000 });

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A3: entrar em pipelines colapsa os rails (foco no canvas); Fontes vive no picker", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const { ds, board } = await seedBoard(page, `f_${tag}`);

    await page.goto("/painel-de-controle/dados?aba=pipelines");
    // A3 — os DOIS rails nascem colapsados na aba pipelines (asserção ANTES de
    // expandir; aqui NÃO usar o helper expandAcervo).
    await expect(page.getByTestId("acervo-nav")).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByTestId("cp-sidebar")).toHaveAttribute("data-collapsed", "true");
    // A palette antiga MORREU.
    await expect(page.getByTestId("pb-fontes")).toHaveCount(0);

    // Expandir o Acervo → abrir o board.
    await page.getByTestId("acervo-expand").click();
    await page.getByTestId(`pb-board-${board.id}`).click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });

    // Fontes DENTRO do picker: Adicionar nó → Fontes → dataset real → clique.
    await page.getByTestId("pb-add-node-btn").click();
    await page.getByTestId("pb-nodes-cat-fontes").click();
    await page.getByTestId(`pb-nodes-ds-${ds}`).click();

    // Nó Fonte pré-preenchido persistido no SERVIDOR (o seed já tinha 1 source
    // do mesmo dataset → agora 2).
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const g = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const nodes = (g.graph?.nodes ?? []) as Array<{ op: string; config?: { dataset?: string } }>;
      return nodes.filter((n) => n.op === "source" && n.config?.dataset === ds).length;
    }, { timeout: 15000 }).toBe(2);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4/A5: motor DAG ao vivo — If roteia por porta e o derivado sai certo", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const ds = `e2e_dag_${tag}`;
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
      data: { kind: "SNAPSHOT", branch: "main" },
    });
    const tx = await begin.json();
    await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [
        { id: "1", g: "G1" }, { id: "2", g: "G2" }, { id: "3", g: "G1" },
      ] } } },
    });
    const slug = `e2e-dag-${tag}`;
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug, display_name: `E2E DAG ${tag}`,
        graph: {
          nodes: [
            { id: "s", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "cond", op: "if", config: { predicate: { path: "g", op: "eq", value: "G1" } }, position: { x: 320, y: 160 } },
            { id: "wt", op: "wait", config: { seconds: 0 }, position: { x: 580, y: 120 } },
          ],
          edges: [
            { from: "s", to: "cond" },
            { from: "cond", to: "wt", port: "true" },
          ],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json() as { id: string };
    await openBoard(page, board.id);

    // Executar → o If anima e reporta o SPLIT real por porta.
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-detail-cond")).toContainText("true: 2", { timeout: 20000 });
    await expect(page.getByTestId("pb-node-state-wt")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });

    // Derivado REAL no servidor: só o ramo true (2 linhas G1).
    await expect.poll(async () => {
      const r = await page.request.get(`/api/datasets/board.${slug}.derived/sample?limit=10`);
      if (!r.ok()) return -1;
      const body = await r.json();
      return (body.rows ?? []).length;
    }, { timeout: 20000 }).toBe(2);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4/A5: Merge junta DUAS fontes reais (multi-entrada de verdade)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const mkDs = async (name: string, rows: unknown[]) => {
      const b = await page.request.post(`/api/datasets/${name}/transactions`, {
        data: { kind: "SNAPSHOT", branch: "main" },
      });
      const t = await b.json();
      await page.request.post(`/api/datasets/${name}/transactions/${t.id}/commit`, {
        data: { input_payload: { payload: { rows } } },
      });
    };
    await mkDs(`e2e_mg_a_${tag}`, [{ id: "1", g: "A" }, { id: "2", g: "A" }]);
    await mkDs(`e2e_mg_b_${tag}`, [{ id: "9", g: "B" }]);
    const slug = `e2e-mg-${tag}`;
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug, display_name: `E2E MG ${tag}`,
        graph: {
          nodes: [
            { id: "a", op: "source", config: { dataset: `e2e_mg_a_${tag}` }, position: { x: 60, y: 80 } },
            { id: "b", op: "source", config: { dataset: `e2e_mg_b_${tag}` }, position: { x: 60, y: 240 } },
            { id: "m", op: "merge", config: { mode: "append" }, position: { x: 340, y: 160 } },
          ],
          edges: [
            { from: "a", to: "m" },
            { from: "b", to: "m" },
          ],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json() as { id: string };
    await openBoard(page, board.id);

    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-m")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });
    await expect.poll(async () => {
      const r = await page.request.get(`/api/datasets/board.${slug}.derived/sample?limit=10`);
      if (!r.ok()) return -1;
      const body = await r.json();
      return (body.rows ?? []).length;
    }, { timeout: 20000 }).toBe(3);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4 onda 2: html→crypto extraem e hasheiam de verdade no motor", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const ds = `e2e_w2_${tag}`;
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
      data: { kind: "SNAPSHOT", branch: "main" },
    });
    const tx = await begin.json();
    await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [
        { id: "1", page: '<div class="t"><b>Alfa</b></div>' },
        { id: "2", page: '<div class="t">Beta</div>' },
      ] } } },
    });
    const slug = `e2e-w2-${tag}`;
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug, display_name: `E2E W2 ${tag}`,
        graph: {
          nodes: [
            { id: "s", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "h", op: "transform", config: { op: "html", args: { input: "page", selector: ".t", output: "titulo" } }, position: { x: 320, y: 160 } },
            { id: "c", op: "transform", config: { op: "crypto", args: { input: "titulo", algo: "sha256", output: "hash" } }, position: { x: 580, y: 160 } },
          ],
          edges: [{ from: "s", to: "h" }, { from: "h", to: "c" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json() as { id: string };
    await openBoard(page, board.id);

    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-c")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });

    // Derivado REAL: extração CSS + hash verificável.
    await expect.poll(async () => {
      const r = await page.request.get(`/api/datasets/board.${slug}.derived/sample?limit=10`);
      if (!r.ok()) return "";
      const rows = ((await r.json()).rows ?? []) as Array<{ id: string; titulo?: string; hash?: string }>;
      const alfa = rows.find((x) => x.id === "1");
      return `${alfa?.titulo}:${(alfa?.hash ?? "").slice(0, 8)}`;
    }, { timeout: 20000 }).toBe("Alfa:53b59486"); // sha256('Alfa') começa com 53b59486

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4 onda 2: Compare Datasets roteia same/different/a_only/b_only por porta", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const mkDs = async (name: string, rows: unknown[]) => {
      const b = await page.request.post(`/api/datasets/${name}/transactions`, {
        data: { kind: "SNAPSHOT", branch: "main" },
      });
      const t = await b.json();
      await page.request.post(`/api/datasets/${name}/transactions/${t.id}/commit`, {
        data: { input_payload: { payload: { rows } } },
      });
    };
    await mkDs(`e2e_cmp_a_${tag}`, [{ id: "1", v: "x" }, { id: "2", v: "x" }, { id: "3", v: "x" }]);
    await mkDs(`e2e_cmp_b_${tag}`, [{ id: "1", v: "x" }, { id: "2", v: "y" }]);
    const slug = `e2e-cmp-${tag}`;
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug, display_name: `E2E CMP ${tag}`,
        graph: {
          nodes: [
            { id: "a", op: "source", config: { dataset: `e2e_cmp_a_${tag}` }, position: { x: 60, y: 80 } },
            { id: "b", op: "source", config: { dataset: `e2e_cmp_b_${tag}` }, position: { x: 60, y: 240 } },
            { id: "cmp", op: "compare", config: { key: "id" }, position: { x: 340, y: 160 } },
            { id: "w", op: "wait", config: { seconds: 0 }, position: { x: 620, y: 160 } },
          ],
          edges: [
            { from: "a", to: "cmp" },
            { from: "b", to: "cmp" },
            { from: "cmp", to: "w", port: "different" },
          ],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json() as { id: string };
    await openBoard(page, board.id);

    await page.getByTestId("pb-run").click();
    // O card do compare reporta a contagem REAL por porta.
    await expect(page.getByTestId("pb-node-state-detail-cmp")).toContainText("different: 1", { timeout: 20000 });
    // Derivado = só a linha divergente (id 2).
    await expect.poll(async () => {
      const r = await page.request.get(`/api/datasets/board.${slug}.derived/sample?limit=10`);
      if (!r.ok()) return -1;
      return (((await r.json()).rows ?? []) as Array<{ id: string }>).length;
    }, { timeout: 20000 }).toBe(1);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4 onda 3: convert_file grava CSV no MinIO e extract_file lê de volta (ciclo completo)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const ms = await page.request.post(`/api/platform/v23/media/sets`, {
      data: { slug: `e2e-w3-${tag}`, display_name: `E2E W3 ${tag}`, media_type: "document" },
    });
    expect(ms.ok(), `create media set → ${ms.status()}`).toBeTruthy();
    const ds = `e2e_w3src_${tag}`;
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
      data: { kind: "SNAPSHOT", branch: "main" },
    });
    const tx = await begin.json();
    await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [{ id: "1", nome: "Ana" }, { id: "2", nome: "Bruno" }] } } },
    });
    const fname = `export-${tag}.csv`;
    // board 1: fonte → convert_file (escreve o CSV no acervo)
    const mk1 = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-w3a-${tag}`, display_name: `E2E W3a ${tag}`,
        graph: {
          nodes: [
            { id: "s", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "cf", op: "transform", config: { op: "convert_file", args: { media_set: `e2e-w3-${tag}`, filename: fname, format: "csv" } }, position: { x: 340, y: 160 } },
          ],
          edges: [{ from: "s", to: "cf" }],
        },
      },
    });
    expect(mk1.ok()).toBeTruthy();
    const b1 = await mk1.json() as { id: string };
    await openBoard(page, b1.id);
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-cf")).toHaveAttribute("title", /Conclu/i, { timeout: 25000 });

    // board 2: extract_file lê o MESMO arquivo de volta em linhas
    const mk2 = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-w3b-${tag}`, display_name: `E2E W3b ${tag}`,
        graph: {
          nodes: [
            { id: "s", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "xf", op: "transform", config: { op: "extract_file", args: { media_set: `e2e-w3-${tag}`, item: fname, format: "csv" } }, position: { x: 340, y: 160 } },
          ],
          edges: [{ from: "s", to: "xf" }],
        },
      },
    });
    expect(mk2.ok()).toBeTruthy();
    const b2 = await mk2.json() as { id: string };
    await openBoard(page, b2.id);
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-xf")).toHaveAttribute("title", /Conclu/i, { timeout: 25000 });
    await expect.poll(async () => {
      const r = await page.request.get(`/api/datasets/board.e2e-w3b-${tag}.derived/sample?limit=10`);
      if (!r.ok()) return "";
      const rows = ((await r.json()).rows ?? []) as Array<{ id: string; nome: string }>;
      return rows.map((x) => x.nome).sort().join(",");
    }, { timeout: 20000 }).toBe("Ana,Bruno");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4 onda 3: Error Trigger dispara ouvinte quando o fluxo FALHA (com as linhas do erro)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const ds = `e2e_et_${tag}`;
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
      data: { kind: "SNAPSHOT", branch: "main" },
    });
    const tx = await begin.json();
    await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [{ id: "1" }] } } },
    });
    const up = await (await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-et-up-${tag}`, display_name: `E2E ET up ${tag}`,
        graph: {
          nodes: [
            { id: "s", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "st", op: "stop_error", config: { message: `falha e2e ${tag}` }, position: { x: 340, y: 160 } },
          ],
          edges: [{ from: "s", to: "st" }],
        },
      },
    })).json() as { id: string };
    const ls = await (await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-et-ls-${tag}`, display_name: `E2E ET ls ${tag}`,
        graph: {
          nodes: [
            { id: "t", op: "trigger", config: { trigger_kind: "error", upstream_boards: [up.id] }, position: { x: 60, y: 160 } },
            { id: "w", op: "wait", config: { seconds: 0 }, position: { x: 340, y: 160 } },
          ],
          edges: [{ from: "t", to: "w" }],
        },
      },
    })).json() as { id: string };
    // F9b — o OUVINTE roda via gatilho (error) → precisa estar PUBLICADO (gate
    // real). O upstream roda MANUALMENTE (rascunho, não gated) — não publica.
    expect((await page.request.post(`/api/platform/v23/pipeline/${ls.id}/publish`, { data: {} })).ok()).toBeTruthy();

    await openBoard(page, up.id);
    await page.getByTestId("pb-run").click();
    // o run do upstream falha na UI…
    await expect(page.getByTestId("pb-node-state-st")).toHaveAttribute("title", /(Erro|Falh)/i, { timeout: 25000 });
    // …e o OUVINTE roda sozinho com trigger_source='error' + linhas do erro
    await expect.poll(async () => {
      const r = await page.request.get(`/api/platform/v23/pipeline/${ls.id}/runs?limit=5`);
      if (!r.ok()) return "";
      const runs = (await r.json()) as Array<{ trigger_source?: string; status?: string }>;
      const hit = runs.find((x) => x.trigger_source === "error");
      return hit ? `${hit.trigger_source}:${hit.status}` : "";
    }, { timeout: 25000 }).toBe("error:OK");
    await expect.poll(async () => {
      const r = await page.request.get(`/api/datasets/board.e2e-et-ls-${tag}.derived/sample?limit=5`);
      if (!r.ok()) return "";
      const rows = ((await r.json()).rows ?? []) as Array<{ error?: string }>;
      return rows[0]?.error ?? "";
    }, { timeout: 20000 }).toContain(`falha e2e ${tag}`);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4 onda 3: subworkflow — board pai chama board filho passando as linhas", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const mkDs = async (name: string, rows: unknown[]) => {
      const b = await page.request.post(`/api/datasets/${name}/transactions`, {
        data: { kind: "SNAPSHOT", branch: "main" },
      });
      const t = await b.json();
      await page.request.post(`/api/datasets/${name}/transactions/${t.id}/commit`, {
        data: { input_payload: { payload: { rows } } },
      });
    };
    await mkDs(`e2e_sw_child_${tag}`, [{ id: "c1" }, { id: "c2" }]);
    await mkDs(`e2e_sw_parent_${tag}`, [{ id: "p1" }]);
    const child = await (await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-sw-c-${tag}`, display_name: `E2E SW filho ${tag}`,
        graph: {
          nodes: [
            { id: "t", op: "trigger", config: { trigger_kind: "subworkflow" }, position: { x: 60, y: 80 } },
            { id: "s", op: "source", config: { dataset: `e2e_sw_child_${tag}` }, position: { x: 60, y: 240 } },
            { id: "m", op: "merge", config: { mode: "append" }, position: { x: 340, y: 160 } },
          ],
          edges: [{ from: "t", to: "m" }, { from: "s", to: "m" }],
        },
      },
    })).json() as { id: string };
    const parent = await (await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-sw-p-${tag}`, display_name: `E2E SW pai ${tag}`,
        graph: {
          nodes: [
            { id: "s", op: "source", config: { dataset: `e2e_sw_parent_${tag}` }, position: { x: 60, y: 160 } },
            { id: "sw", op: "transform", config: { op: "subworkflow", args: { board_id: child.id, pass_rows: true } }, position: { x: 340, y: 160 } },
          ],
          edges: [{ from: "s", to: "sw" }],
        },
      },
    })).json() as { id: string };

    await openBoard(page, parent.id);
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-sw")).toHaveAttribute("title", /Conclu/i, { timeout: 30000 });
    // derivado do PAI = derivado do filho (1 do pai + 2 do filho = 3)
    await expect.poll(async () => {
      const r = await page.request.get(`/api/datasets/board.e2e-sw-p-${tag}.derived/sample?limit=10`);
      if (!r.ok()) return -1;
      return (((await r.json()).rows ?? []) as unknown[]).length;
    }, { timeout: 20000 }).toBe(3);
    // e o run do FILHO existe com origem honesta
    await expect.poll(async () => {
      const r = await page.request.get(`/api/platform/v23/pipeline/${child.id}/runs?limit=5`);
      if (!r.ok()) return "";
      const runs = (await r.json()) as Array<{ trigger_source?: string }>;
      return runs.some((x) => x.trigger_source === "subworkflow") ? "sim" : "";
    }, { timeout: 15000 }).toBe("sim");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("A4/A5 gesto de UI: If entra pelo picker e ARRASTAR do handle true cria aresta COM porta", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `ui_${Date.now()}`);
    await openBoard(page, board.id);

    // Picker → categoria Fluxo → If (nasce à direita do nó selecionado/dagre).
    await page.getByTestId("pb-add-node-btn").click();
    await page.getByTestId("pb-nodes-cat-fluxo").click();
    await page.getByTestId("pb-add-if").click();
    const ifCard = page.locator('[data-testid^="pb-node-if_"]').first();
    await expect(ifCard).toBeVisible();
    const ifId = (await ifCard.getAttribute("data-testid"))!.replace("pb-node-", "");

    // Gesto n8n REAL: arrastar do handle 'true' do If até a ENTRADA do filtro.
    const srcHandle = page.locator(`[data-testid="pb-node-${ifId}"] .react-flow__handle[data-handleid="true"]`);
    const tgtHandle = page.locator('[data-testid="pb-node-flt"] .react-flow__handle.target').first();
    const hb = await srcHandle.boundingBox();
    const tb = await tgtHandle.boundingBox();
    expect(hb && tb).toBeTruthy();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb!.x + tb!.width / 2, tb!.y + tb!.height / 2, { steps: 12 });
    await page.mouse.up();

    // Salvar → o graph do servidor tem o nó if + a aresta com port='true'.
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const edges = (bd.graph?.edges ?? []) as Array<{ from: string; to: string; port?: string }>;
      const nodes = (bd.graph?.nodes ?? []) as Array<{ id: string; op: string }>;
      const hasIf = nodes.some((n) => n.op === "if");
      const ported = edges.some((e) => e.from === ifId && e.to === "flt" && e.port === "true");
      return hasIf && ported;
    }, { timeout: 15000 }).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
