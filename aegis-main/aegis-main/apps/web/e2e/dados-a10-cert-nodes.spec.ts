/**
 * E2E · A10(c) — CERT NÓ-A-NÓ ao vivo (feedback_no_false_done_claims).
 * Cada nó é EXECUTADO de verdade pelo NDV ("Executar etapa") e a SAÍDA REAL é
 * conferida no OUTPUT (que agora refresca — A10 onda 1). Onda 1 desta cert cobre
 * os transforms DETERMINÍSTICOS (sem rede) + um nó de FLUXO (if, saída = união das
 * portas). Merge (multi-entrada) já certificado em dados-a10-ndv.
 *
 * Nós de rede (rss/http_request), arquivo (extract/convert_file), subworkflow e
 * IA (llm/code/aip*) usam o MESMO mecanismo de OUTPUT (run → sample) e foram
 * certificados funcionalmente nas ondas 2/3/4 — re-cert pelo NDV é onda 2 da cert.
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
    data: { slug: `e2e-a10c-${tag}`, display_name: `E2E A10C ${tag}`, graph },
  });
  expect(mk.ok(), `create board ${tag} → ${mk.status()}`).toBeTruthy();
  return (await mk.json()) as { id: string };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

/** Abre o NDV do nó, Executa etapa, espera o OUTPUT refrescar e devolve o texto JSON. */
async function runNodeJson(page: Page, nodeId: string): Promise<string> {
  await page.getByTestId(`pb-node-${nodeId}`).dblclick();
  await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
  await page.getByTestId("pb-panel-exec-step").click();
  await expect(page.getByTestId("pb-preview-result")).toBeVisible({ timeout: 45000 });
  await page.getByTestId("pb-panel-out-json").click();
  const txt = (await page.getByTestId("pb-panel-output").textContent()) ?? "";
  await page.keyboard.press("Escape"); // fecha o overlay p/ o próximo nó
  return txt;
}

// Transforms determinísticos: [nome, linhas da fonte, config do transform, has[], hasnt[]].
type TCase = {
  op: string; rows: Record<string, unknown>[]; args: Record<string, unknown>;
  has: string[]; hasnt: string[]; hashHex?: boolean; ordered?: [string, string];
};
const CASES: Record<string, TCase> = {
  select:   { op: "select",   rows: [{ nome: "Ana", extra: "zzz" }], args: { columns: ["nome"] }, has: ["nome", "Ana"], hasnt: ["extra", "zzz"] },
  filter:   { op: "filter",   rows: [{ g: "G1" }, { g: "G2" }], args: { where: { g: "G1" } }, has: ["G1"], hasnt: ["G2"] },
  set:      { op: "set",      rows: [{ a: "1" }], args: { fields: [{ key: "origem", value: "PMESP", type: "text" }] }, has: ["origem", "PMESP"], hasnt: [] },
  datetime: { op: "datetime", rows: [{ a: "1" }], args: { output: "carimbo", mode: "datetime" }, has: ["carimbo"], hasnt: [] },
  limit:    { op: "limit",    rows: [{ i: "aaa" }, { i: "bbb" }], args: { count: 1 }, has: ["aaa"], hasnt: ["bbb"] },
  splitout: { op: "splitout", rows: [{ tags: "x,y,z" }], args: { field: "tags", output: "tag", delimiter: "," }, has: ["x", "z"], hasnt: [] },
  dedupe:   { op: "dedupe",   rows: [{ cpf: "1", v: "keepA" }, { cpf: "1", v: "dropB" }, { cpf: "2", v: "keepC" }], args: { by: ["cpf"] }, has: ["keepA", "keepC"], hasnt: ["dropB"] },
  sort:     { op: "sort",     rows: [{ k: "zebra" }, { k: "alpha" }], args: { by: [{ key: "k", dir: "asc" }] }, has: ["alpha", "zebra"], hasnt: [], ordered: ["alpha", "zebra"] },
  crypto:   { op: "crypto",   rows: [{ cpf: "12345678900" }], args: { input: "cpf", algo: "sha256", output: "cpf_hash" }, has: ["cpf_hash"], hasnt: [], hashHex: true },
  extract:  { op: "extract",  rows: [{ endereco: "RuaX,SP,BR" }], args: { input: "endereco", mode: "split", delimiter: ",", into: ["rua", "uf", "pais"] }, has: ["rua", "RuaX", "uf", "SP"], hasnt: [] },
  agg:      { op: "agg",      rows: [{ bairro: "Norte" }, { bairro: "Norte" }, { bairro: "Sul" }], args: { by: ["bairro"], outputs: [{ name: "qtd", op: "count" }] }, has: ["bairro", "qtd", "Norte", "Sul"], hasnt: [] },
  html:     { op: "html",     rows: [{ h: "<h1>Boletim</h1>" }], args: { input: "h", selector: "h1", output: "titulo" }, has: ["titulo", "Boletim"], hasnt: [] },
  xml:      { op: "xml",      rows: [{ x: "<r><t>Alerta</t></r>" }], args: { input: "x", path: "t", output: "texto" }, has: ["texto", "Alerta"], hasnt: [] },
  markdown: { op: "markdown", rows: [{ m: "**Grave**" }], args: { input: "m", mode: "html", output: "md" }, has: ["md", "strong", "Grave"], hasnt: [] },
  derive:   { op: "derive",   rows: [{ valor: "100" }], args: { name: "valor_copia", inputs: ["valor"] }, has: ["valor_copia", "100"], hasnt: [] },
  rename:   { op: "rename",   rows: [{ sobrenome: "Silva" }], args: { map: { sobrenome: "familia" } }, has: ["familia", "Silva"], hasnt: ["sobrenome"] },
  loop:     { op: "loop",     rows: [{ v: "loopd" }], args: { batch_size: 1, annotate: true }, has: ["loopd", "__loop_item_index"], hasnt: [] },
};

test.describe("A10(c) — cert nó-a-nó ao vivo (transforms determinísticos + fluxo)", () => {
  for (const [name, cse] of Object.entries(CASES)) {
    test(`transform: ${name} roda e o OUTPUT mostra a saída real`, async ({ page }) => {
      const fatal: string[] = [];
      page.on("pageerror", (e) => fatal.push(String(e)));
      await login(page);
      await page.setViewportSize({ width: 1680, height: 900 });
      const tag = `${name}_${Date.now()}`;
      const ds = `e2e_a10c_${tag}`;
      await seedDs(page, ds, cse.rows);
      const board = await makeBoard(page, tag, {
        nodes: [
          { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
          { id: "t", op: "transform", config: { op: cse.op, args: cse.args }, position: { x: 380, y: 160 } },
        ],
        edges: [{ from: "src", to: "t" }],
      });
      await openBoard(page, board.id);
      const json = await runNodeJson(page, "t");

      for (const h of cse.has) expect(json, `${name}: OUTPUT deve conter "${h}"`).toContain(h);
      for (const n of cse.hasnt) expect(json, `${name}: OUTPUT NÃO deve conter "${n}"`).not.toContain(n);
      if (cse.hashHex) expect(json, `${name}: OUTPUT deve ter um hash sha256 (64 hex)`).toMatch(/[0-9a-f]{64}/);
      if (cse.ordered) expect(json.indexOf(cse.ordered[0]), `${name}: ordenação`).toBeLessThan(json.indexOf(cse.ordered[1]));
      expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
    });
  }

  test("fluxo: if executa e o OUTPUT mostra a UNIÃO das portas (true+false)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `if_${Date.now()}`;
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ g: "G1", id: "1" }, { g: "G2", id: "2" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "i", op: "if", config: { predicate: { path: "g", op: "eq", value: "G1" } }, position: { x: 380, y: 160 } },
        { id: "o", op: "ontology_output", config: { target_node_type: "Pessoa", id_field: "id" }, position: { x: 700, y: 160 } },
      ],
      edges: [{ from: "src", to: "i" }, { from: "i", to: "o", port: "true" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "i");
    // stop_at o if (nó de fluxo, não escreve 'main') → OUTPUT = união true+false.
    expect(json, "if OUTPUT deve ter a linha true (G1)").toContain("G1");
    expect(json, "if OUTPUT deve ter a linha false (G2) — nada some").toContain("G2");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("fluxo: switch roteia por regra; OUTPUT = união das portas (regra + default)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `sw_${Date.now()}`;
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ uf: "SP", id: "1" }, { uf: "RJ", id: "2" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "sw", op: "switch", config: { rules: [{ name: "sp", predicate: { path: "uf", op: "eq", value: "SP" } }] }, position: { x: 380, y: 160 } },
        { id: "o", op: "ontology_output", config: { target_node_type: "Pessoa", id_field: "id" }, position: { x: 700, y: 160 } },
      ],
      edges: [{ from: "src", to: "sw" }, { from: "sw", to: "o", port: "sp" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "sw");
    expect(json, "switch OUTPUT (união): regra sp = SP").toContain("SP");
    expect(json, "switch OUTPUT (união): default = RJ").toContain("RJ");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("fluxo: wait (seconds=0) repassa as linhas inalteradas no OUTPUT", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `wait_${Date.now()}`;
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ a: "passou" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "w", op: "wait", config: { seconds: 0 }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "w" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "w");
    expect(json, "wait OUTPUT repassa as linhas").toContain("passou");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("fluxo: compare de 2 fontes distribui em 4 portas (OUTPUT = união)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `cmp_${Date.now()}`;
    const dsA = `e2e_a10c_a_${tag}`, dsB = `e2e_a10c_b_${tag}`;
    await seedDs(page, dsA, [{ k: "1", nome: "soA" }]);          // só em A
    await seedDs(page, dsB, [{ k: "2", nome: "soB" }]);          // só em B
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "sa", op: "source", config: { dataset: dsA }, position: { x: 60, y: 80 } },
        { id: "sb", op: "source", config: { dataset: dsB }, position: { x: 60, y: 280 } },
        { id: "cmp", op: "compare", config: { key: "k" }, position: { x: 380, y: 180 } },
        { id: "o", op: "ontology_output", config: { target_node_type: "Pessoa", id_field: "k" }, position: { x: 700, y: 180 } },
      ],
      edges: [{ from: "sa", to: "cmp" }, { from: "sb", to: "cmp" }, { from: "cmp", to: "o", port: "a_only" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "cmp");
    // a_only (soA) + b_only (soB) na união das 4 portas.
    expect(json, "compare OUTPUT (união): a_only soA").toContain("soA");
    expect(json, "compare OUTPUT (união): b_only soB").toContain("soB");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("transform: join casa com um 2º dataset (with_dataset) no OUTPUT", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `join_${Date.now()}`;
    const dsMain = `e2e_a10c_main_${tag}`, dsLook = `e2e_a10c_look_${tag}`;
    await seedDs(page, dsMain, [{ cpf: "1", nome: "AnaJoin" }]);
    await seedDs(page, dsLook, [{ cpf: "1", cidade: "SampaJoin" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: dsMain }, position: { x: 60, y: 160 } },
        { id: "j", op: "transform", config: { op: "join", args: { with_dataset: dsLook, left_on: "cpf", right_on: "cpf", how: "left" } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "j" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "j");
    expect(json, "join OUTPUT tem a coluna do dataset principal").toContain("AnaJoin");
    expect(json, "join OUTPUT tem a coluna casada do 2º dataset").toContain("SampaJoin");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("rede: rss lê um feed real e o OUTPUT lista os itens", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `rss_${Date.now()}`;
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ x: "1" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "r", op: "transform", config: { op: "rss", args: { url: "https://hnrss.org/newest?count=8", limit: 5 } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "r" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "r");
    // itens do feed carregam as chaves title/link (RSS 2.0/Atom → linhas).
    expect(json, "rss OUTPUT tem a coluna title dos itens do feed").toContain("title");
    expect(json, "rss OUTPUT tem a coluna link dos itens do feed").toContain("link");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("rede: http_request enriquece por linha e grava a resposta no OUTPUT", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `http_${Date.now()}`;
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ q: "1" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "h", op: "transform", config: { op: "http_request", args: { url: "https://httpbin.org/json", method: "GET", mode: "per_row", parse: "json", output: "resposta" } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "h" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "h");
    expect(json, "http OUTPUT tem a coluna resposta").toContain("resposta");
    // httpbin.org/json devolve um objeto com "slideshow".
    expect(json, "http OUTPUT tem o JSON buscado").toContain("slideshow");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("composição: subworkflow chama um board filho e devolve as linhas transformadas", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `sub_${Date.now()}`;
    // Board FILHO (padrão onda 3): gatilho subworkflow (recebe as linhas do pai) +
    // uma fonte, unidos por merge → set adiciona "fromchild". O filho precisa de 1
    // fonte e ser DAG (validação do board-alvo).
    const dsChild = `e2e_a10c_child_${tag}`;
    await seedDs(page, dsChild, [{ childbase: "childown" }]);
    const child = await makeBoard(page, `child_${tag}`, {
      nodes: [
        { id: "trg", op: "trigger", config: { trigger_kind: "subworkflow" }, position: { x: 60, y: 80 } },
        { id: "csrc", op: "source", config: { dataset: dsChild }, position: { x: 60, y: 260 } },
        { id: "m", op: "merge", config: { mode: "append" }, position: { x: 360, y: 170 } },
        { id: "st", op: "transform", config: { op: "set", args: { fields: [{ key: "fromchild", value: "YES", type: "text" }] } }, position: { x: 660, y: 170 } },
      ],
      edges: [{ from: "trg", to: "m" }, { from: "csrc", to: "m" }, { from: "m", to: "st" }],
    });
    const dsParent = `e2e_a10c_${tag}`;
    await seedDs(page, dsParent, [{ base: "parentrow" }]);
    const parent = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: dsParent }, position: { x: 60, y: 160 } },
        { id: "sw", op: "transform", config: { op: "subworkflow", args: { board_id: child.id, pass_rows: true } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "sw" }],
    });
    await openBoard(page, parent.id);
    const json = await runNodeJson(page, "sw");
    expect(json, "subworkflow OUTPUT tem a linha do pai").toContain("parentrow");
    expect(json, "subworkflow OUTPUT tem a coluna que o FILHO adicionou").toContain("fromchild");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  async function makeMediaSet(page: Page, tag: string): Promise<string> {
    const slug = `e2e_a10c_ms_${tag}`;
    const ms = await page.request.post(`/api/platform/v23/media/sets`, {
      data: { slug, display_name: `MS ${tag}`, media_type: "document", markings: [] },
    });
    expect(ms.ok(), `create media set → ${ms.status()} ${await ms.text().catch(() => "")}`).toBeTruthy();
    return slug;
  }

  test("arquivo: convert_file grava um CSV no MinIO e repassa as linhas (OUTPUT)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `conv_${Date.now()}`;
    const setSlug = await makeMediaSet(page, tag);
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ nome: "FileAna", cpf: "1" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "conv", op: "transform", config: { op: "convert_file", args: { media_set: setSlug, filename: "conv.csv", format: "csv" } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "conv" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "conv");
    expect(json, "convert_file repassa as linhas (pass-through)").toContain("FileAna");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("arquivo: extract_file lê de volta o CSV que convert_file gravou (ciclo MinIO)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `ext_${Date.now()}`;
    const setSlug = await makeMediaSet(page, tag);
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ nome: "CycleBob", cpf: "9" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "conv", op: "transform", config: { op: "convert_file", args: { media_set: setSlug, filename: "cycle.csv", format: "csv" } }, position: { x: 360, y: 160 } },
        { id: "ext", op: "transform", config: { op: "extract_file", args: { media_set: setSlug, item: "cycle.csv", format: "csv" } }, position: { x: 660, y: 160 } },
      ],
      edges: [{ from: "src", to: "conv" }, { from: "conv", to: "ext" }],
    });
    await openBoard(page, board.id);
    // rodar 'ext' roda a cadeia: convert grava cycle.csv → extract lê de volta.
    const json = await runNodeJson(page, "ext");
    expect(json, "extract_file leu de volta a linha do CSV").toContain("CycleBob");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("IA: llm (AIP) enriquece 1 linha com LLM REAL e grava a coluna de saída", async ({ page }) => {
    // LLM REAL (groq) — feedback_aip_e2e_real_llm; cap max_rows=1 p/ custo mínimo.
    test.setTimeout(120000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `llm_${Date.now()}`;
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ texto: "boletim de ocorrência" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "l", op: "transform", config: { op: "llm", args: { provider: "groq", prompt: "Responda apenas a palavra OK.", output: "resp", max_rows: 1 } }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "l" }],
    });
    await openBoard(page, board.id);
    const json = await runNodeJson(page, "l");
    // o run só chega aqui (pb-preview-result) se a inferência REAL rodou; a coluna
    // de saída 'resp' presente prova que o LLM escreveu.
    expect(json, "llm OUTPUT tem a coluna de saída 'resp' preenchida pelo modelo real").toContain("resp");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("fluxo: stop_error falha o run com a mensagem (OUTPUT mostra o erro, não sample)", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `se_${Date.now()}`;
    const ds = `e2e_a10c_${tag}`;
    await seedDs(page, ds, [{ a: "1" }]);
    const board = await makeBoard(page, tag, {
      nodes: [
        { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
        { id: "se", op: "stop_error", config: { message: "parada-teste-a10" }, position: { x: 380, y: 160 } },
      ],
      edges: [{ from: "src", to: "se" }],
    });
    await openBoard(page, board.id);
    await page.getByTestId("pb-node-se").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.getByTestId("pb-panel-exec-step").click();
    // stop_error → run FAILED → OUTPUT mostra o ERRO (não pb-preview-result).
    await expect(page.getByTestId("pb-preview-error")).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId("pb-preview-error")).toContainText("parada-teste-a10");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
