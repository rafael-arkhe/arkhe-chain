/**
 * E2E · Fase 7 (Passo 0d) — RE-CERT ao vivo dos gestos sem spec dedicado.
 *
 * Pós-reset do banco (2026-07-03) toda cert antiga é inválida até re-prova.
 * Este spec fecha o checklist do plano V3.1 §4-F7 item 4 que não tinha
 * cobertura Playwright própria:
 *   1. Overlay 3 colunas (duplo-clique/Enter) + Executar passo (play por nó)
 *   2. Atalhos 6F (Enter abre · Esc fecha · Ctrl+D duplica · Delete remove)
 *   3. Notas canvas-native (texto/cor + persistência)
 *   4. Webhook trigger FIM-A-FIM (criar no nó gatilho → POST HMAC → run real)
 *   5. Re-pull agendado (schedule no nó gatilho → persiste → aparece na lista)
 *   6. Media upload (conjunto → upload real → grid → preview)
 *
 * Seeds via API com os cookies da sessão (mesmo padrão da fase2). Nada de
 * estado falso: os runs são reais (motor v22/v23 + SSE), o upload vai ao
 * MinIO real, o webhook entra pelo endpoint público com HMAC verdadeiro.
 * Régua: feedback_e2e_via_playwright_cli.
 */
import { createHmac } from "node:crypto";

import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

/** Seed de dataset SNAPSHOT + board source→filter no tenant do admin. */
async function seedBoard(page: Page, tag: string) {
  const ds = `e2e_f7_${tag}`;
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
      slug: `e2e-f7-${tag}`, display_name: `E2E F7 ${tag}`,
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

test.describe("F7.0d — re-cert dos gestos do canvas", () => {
  test("overlay 3 colunas (duplo-clique) + Executar passo = play por nó", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `ov_${Date.now()}`);
    await openBoard(page, board.id);

    // Duplo-clique no nó de transformação → overlay 3 colunas (INPUT | config | OUTPUT).
    await page.getByTestId("pb-node-flt").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-panel-input")).toBeVisible();
    await expect(page.getByTestId("pb-panel-output")).toBeVisible();

    // Tabs do centro: Parâmetros ⇄ Configurações (settings por nó).
    await page.getByTestId("pb-panel-tab-settings").click();
    await page.getByTestId("pb-panel-tab-params").click();

    // "Executar passo" = play por nó (SSE parcial real, stop_at_node no backend).
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-node-state-flt")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("pb-node-state-flt")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });

    // Fecha pelo X do overlay.
    await page.getByTestId("pb-panel-close").click();
    await expect(page.getByTestId("pb-config-overlay")).toHaveCount(0);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("atalhos 6F: Enter abre overlay · Esc fecha · Ctrl+D duplica · Delete remove", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `kb_${Date.now()}`);
    await openBoard(page, board.id);

    // Nós do ReactFlow (o prefixo pb-node- também bate em drawer/guide/state).
    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(2); // src + flt

    // Enter com nó selecionado → abre o overlay; Esc → fecha.
    await page.getByTestId("pb-node-flt").click();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pb-config-overlay")).toHaveCount(0);

    // Ctrl+D duplica o nó selecionado.
    await page.getByTestId("pb-node-flt").click();
    await page.keyboard.press("Control+d");
    await expect(nodes).toHaveCount(3);

    // Delete remove o nó selecionado. O duplicado nasce a +36/+36 e cobre o
    // CENTRO do original → clica no canto sup-esq visível (gesto do operador).
    await page.getByTestId("pb-node-flt").click({ position: { x: 6, y: 6 } });
    await page.keyboard.press("Delete");
    await expect(nodes).toHaveCount(2);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("nota canvas-native: criar → texto/cor → salvar → persiste", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();
    const { board } = await seedBoard(page, `nt_${tag}`);
    await openBoard(page, board.id);

    // F8.1 — nós entram pelo NodesPanel (botão "+ Adicionar nó" na barra).
    await page.getByTestId("pb-add-node-btn").click();
    await page.getByTestId("pb-add-note").click();
    // A2 — config vive no NDV overlay: abre a nota recém-criada (id note_*).
    await page.locator('[data-testid^="pb-node-note_"]').first().dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-note-text")).toBeVisible();
    await page.getByTestId("pb-cfg-note-text").fill(`Anotação e2e ${tag}`);
    await page.getByTestId("pb-cfg-note-color").selectOption("blue");
    await expect(page.getByTestId("pb-cfg-note-preview")).toContainText(`Anotação e2e ${tag}`);
    await page.keyboard.press("Escape"); // fecha o NDV p/ alcançar o toolbar

    await page.getByTestId("pb-save").click();
    await expect(page.getByTestId("pb-msg")).toBeVisible({ timeout: 15000 });

    // Persistência REAL: o graph salvo tem o nó note com texto e cor.
    const res = await page.request.get(`/api/platform/v23/pipeline/${board.id}`);
    expect(res.ok(), `get board → ${res.status()}`).toBeTruthy();
    const saved = await res.json();
    const note = (saved.graph?.nodes ?? []).find((n: { op: string }) => n.op === "note");
    expect(note, "nó note ausente do graph salvo").toBeTruthy();
    expect(String(note.config?.note_text ?? "")).toContain(`Anotação e2e ${tag}`);
    expect(String(note.config?.note_color ?? "")).toBe("blue");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("webhook trigger fim-a-fim: nó gatilho → criar webhook → POST HMAC → run real", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();
    const { board } = await seedBoard(page, `wh_${tag}`);
    await openBoard(page, board.id);

    // Gesto do operador: nó gatilho → tipo webhook → criar webhook no painel.
    await page.getByTestId("pb-add-node-btn").click();
    await page.getByTestId("pb-add-trigger").click();
    // A2 — config vive no NDV overlay: abre o gatilho recém-criado (id trg_*).
    await page.locator('[data-testid^="pb-node-trg_"]').first().dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-trigger-kind")).toBeVisible();
    await page.getByTestId("pb-cfg-trigger-kind").selectOption("webhook");
    await expect(page.getByTestId("pb-trigger-webhook-config")).toBeVisible();
    await page.getByTestId("pb-trigger-webhook-toggle").click();
    await expect(page.getByTestId("pb-webhook-panel")).toBeVisible();

    const slug = `f7-recert-${tag}`;
    await page.getByTestId("pb-webhook-slug-input").fill(slug);
    await page.getByTestId("pb-webhook-create").click();

    // Secret exibido UMA vez → captura para assinar o POST.
    const secretCode = page.getByTestId("pb-webhook-panel").locator("code").first();
    await expect(secretCode).toBeVisible({ timeout: 15000 });
    const secret = (await secretCode.innerText()).trim();
    expect(secret.startsWith("aegis_"), `secret inesperado: ${secret}`).toBeTruthy();

    // F9b — o webhook roda o snapshot PUBLICADO (gate real): publica antes de entregar.
    expect((await page.request.post(`/api/platform/v23/pipeline/${board.id}/publish`, { data: {} })).ok()).toBeTruthy();

    // Entrega REAL pelo endpoint público com HMAC-SHA256 do body cru.
    const body = JSON.stringify({ fonte: "e2e-f7-recert", tag });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const hit = await page.request.post(`/api/platform/v23/pipeline/trigger/${slug}`, {
      headers: { "content-type": "application/json", "x-aegis-signature": sig },
      data: body,
    });
    expect(hit.ok(), `delivery → ${hit.status()} ${await hit.text()}`).toBeTruthy();
    const out = await hit.json();
    expect(out.status).toBe("accepted");
    expect(out.run_id, "run_id ausente").toBeTruthy();

    // HMAC errado é REJEITADO (401) — a porta não é aberta.
    const bad = await page.request.post(`/api/platform/v23/pipeline/trigger/${slug}`, {
      headers: { "content-type": "application/json", "x-aegis-signature": "0".repeat(64) },
      data: body,
    });
    expect(bad.status(), "assinatura inválida deveria dar 401").toBe(401);

    // O run disparado pelo webhook está no histórico do board.
    const runs = await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs?limit=10`);
    expect(runs.ok(), `runs → ${runs.status()}`).toBeTruthy();
    const list = await runs.json();
    const rows: Array<{ id: string }> = Array.isArray(list) ? list : (list.runs ?? []);
    expect(rows.some((r) => String(r.id) === String(out.run_id)), "run do webhook não listado").toBeTruthy();

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("re-pull agendado: schedule no nó gatilho → salva → persiste e aparece na lista", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();
    const { board } = await seedBoard(page, `sc_${tag}`);
    await openBoard(page, board.id);

    await page.getByTestId("pb-add-node-btn").click();
    await page.getByTestId("pb-add-trigger").click();
    // A2 — config vive no NDV overlay: abre o gatilho recém-criado (id trg_*).
    await page.locator('[data-testid^="pb-node-trg_"]').first().dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-trigger-kind")).toBeVisible();
    await page.getByTestId("pb-cfg-trigger-kind").selectOption("schedule");
    await expect(page.getByTestId("pb-cfg-trigger-schedule")).toBeVisible();
    await page.getByTestId("pb-cfg-trigger-schedule").selectOption("hourly");
    await page.keyboard.press("Escape"); // fecha o NDV p/ alcançar o toolbar

    await page.getByTestId("pb-save").click();
    await expect(page.getByTestId("pb-msg")).toBeVisible({ timeout: 15000 });

    // Persistência REAL do agendamento no graph (o scheduler do worker lê daqui).
    const res = await page.request.get(`/api/platform/v23/pipeline/${board.id}`);
    expect(res.ok(), `get board → ${res.status()}`).toBeTruthy();
    const saved = await res.json();
    const trig = (saved.graph?.nodes ?? []).find((n: { op: string }) => n.op === "trigger");
    expect(trig, "nó trigger ausente do graph salvo").toBeTruthy();
    expect(String(trig.config?.trigger_kind ?? "")).toBe("schedule");
    expect(String(trig.config?.schedule ?? "")).toBe("hourly");

    // BoardsList rica (F7.1): a linha do board mostra a agenda.
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await expect(page.getByTestId(`pb-board-${board.id}`)).toContainText(/hora|hour/i, { timeout: 15000 });

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("F8.1b — splice: + da aresta abre o painel e insere o nó NO MEIO", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `sp_${Date.now()}`);
    await openBoard(page, board.id);

    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(2); // src + flt

    // Hover no PONTO MÉDIO entre os nós (a aresta é o caminho entre eles;
    // interactionWidth 40 pega o mouse) → barra flutuante → "+" abre o painel.
    const a = await page.getByTestId("pb-node-src").boundingBox();
    const b = await page.getByTestId("pb-node-flt").boundingBox();
    expect(a && b, "bounding boxes dos nós").toBeTruthy();
    await page.mouse.move((a!.x + a!.width + b!.x) / 2, a!.y + a!.height / 2, { steps: 8 });
    await page.getByTestId("pb-edge-add").click();
    await expect(page.getByTestId("pb-nodes-panel")).toBeVisible();
    // splice só oferece nós com entrada+saída (fonte/gatilho ficam de fora).
    await expect(page.getByTestId("pb-add-source")).toHaveCount(0);
    await page.getByTestId("pb-add-set").click();

    // Nó entrou NO MEIO: 3 nós e o graph salvo re-ligado src→novo→flt.
    await expect(nodes).toHaveCount(3);
    await page.getByTestId("pb-save").click();
    await expect(page.getByTestId("pb-msg")).toBeVisible({ timeout: 15000 });
    const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
    const edges: Array<{ from: string; to: string }> = bd.graph?.edges ?? [];
    expect(edges.some((e) => e.from === "src" && e.to === "flt"), "aresta direta deveria sumir").toBe(false);
    expect(edges.some((e) => e.from === "src"), "src deveria ligar no novo nó").toBe(true);
    expect(edges.some((e) => e.to === "flt"), "novo nó deveria ligar no flt").toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("F8.2a — pill {{$json}}: arrastar campo → preview inline → engine resolve de verdade", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();

    // Seed: dataset + board src → set (campo novo vazio).
    const ds = `e2e_f8_${tag}`;
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
    expect(begin.ok()).toBeTruthy();
    const tx = await begin.json();
    const commit = await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [{ g: "G1", a: "1" }, { g: "G2", a: "2" }] } } },
    });
    expect(commit.ok()).toBeTruthy();
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-f8-${tag}`, display_name: `E2E F8 ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "st", op: "transform", config: { op: "set", args: { fields: [{ key: "novo", value: "", type: "text" }] } }, position: { x: 360, y: 160 } },
          ],
          edges: [{ from: "src", to: "st" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json();
    await openBoard(page, board.id);

    // Overlay do nó set (duplo-clique) → arrastar a variável g pro value.
    // NB: o set-fields renderiza no INSPETOR e no OVERLAY → escopar ao overlay.
    await page.getByTestId("pb-node-st").dblclick();
    const overlay = page.getByTestId("pb-config-overlay");
    await expect(overlay).toBeVisible();
    const valueInput = overlay.getByTestId("pb-cfg-set-value-0");
    const chip = overlay.getByTestId("pb-variable-g");
    await expect(chip).toBeVisible({ timeout: 15000 });
    await chip.dragTo(valueInput);
    await expect(valueInput).toHaveValue("{{ $json.g }}");

    // Preview INLINE resolvido contra a 1ª linha da amostra (200ms, espelho TS).
    await expect(overlay.getByTestId("pb-cfg-set-preview-0")).toContainText("G1", { timeout: 5000 });

    // F8.2b+c — aba Table do INPUT: busca + paging; hover numa linha muda o
    // preview do token AO VIVO (paridade n8n).
    await overlay.getByTestId("pb-panel-in-table").click();
    await expect(overlay.getByTestId("pb-ndv-in-table")).toBeVisible();
    await overlay.getByTestId("pb-ndv-in-search").fill("G2");
    await expect(overlay.getByTestId("pb-ndv-in-count")).toContainText("1/2");
    await overlay.getByTestId("pb-ndv-in-row-0").hover();
    await expect(overlay.getByTestId("pb-cfg-set-preview-0")).toContainText("G2", { timeout: 5000 });
    await overlay.getByTestId("pb-ndv-in-search").fill("");

    // Executar passo → o ENGINE resolve por linha → derivado tem novo=G1/G2.
    await page.getByTestId("pb-panel-exec-step").click();
    await expect(page.getByTestId("pb-node-state-st")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });
    // O derivado comita logo após o done do SSE → poll curto (sem corrida).
    let rows: Array<Record<string, unknown>> = [];
    let lastStatus = 0;
    for (let i = 0; i < 15 && rows.length === 0; i++) {
      const sample = await page.request.get(`/api/datasets/${encodeURIComponent(`board.e2e-f8-${tag}.derived`)}/sample?limit=10`);
      lastStatus = sample.status();
      if (sample.ok()) rows = (await sample.json()).rows ?? [];
      if (rows.length === 0) await page.waitForTimeout(1000);
    }
    const diag = rows.length === 0
      ? ` (status=${lastStatus}; runs=${JSON.stringify(await (await page.request.get(`/api/platform/v23/pipeline/${board.id}/runs?limit=3`)).json()).slice(0, 400)})`
      : "";
    expect(rows.length, `derivado sem linhas${diag}`).toBeGreaterThan(0);
    expect(rows.some((r) => r.novo === "G1"), `engine não resolveu o token: ${JSON.stringify(rows)}`).toBe(true);
    expect(rows.some((r) => r.novo === "G2")).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("F8.2d — pin/mock: editar saída pina → run manual usa o mock → webhook (produção) ignora", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();
    const { board } = await seedBoard(page, `pin_${tag}`);
    await openBoard(page, board.id);

    // Overlay do nó Fonte → Editar saída (JSON) → salvar = PINA.
    await page.getByTestId("pb-node-src").dblclick();
    const overlay = page.getByTestId("pb-config-overlay");
    await expect(overlay).toBeVisible();
    await overlay.getByTestId("pb-pin-edit").click();
    // O mock PASSA no filtro do board (g==G1) e carrega uma sentinela que o
    // dado real NÃO tem — é o que distingue pin de asset no derivado.
    await overlay.getByTestId("pb-pin-json").fill('[{"g":"G1","sentinela":"PIN"}]');
    await overlay.getByTestId("pb-pin-save").click();
    await expect(overlay.getByTestId("pb-pin-banner")).toBeVisible();
    await overlay.getByTestId("pb-panel-close").click();

    // Badge de pin no CARD + salvar o board (o pin viaja no graph).
    await expect(page.getByTestId("pb-node-pinned-src")).toBeVisible();
    await page.getByTestId("pb-save").click();
    // O pin-save já deixou pb-msg visível → não é sinal confiável do PUT do
    // board. Espera DETERMINÍSTICA: o graph salvo no servidor tem o pin.
    await expect.poll(async () => {
      const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const src = (bd.graph?.nodes ?? []).find((n: { id: string }) => n.id === "src");
      return Array.isArray(src?.config?.pinned_rows) ? src.config.pinned_rows.length : 0;
    }, { timeout: 15000 }).toBe(1);

    // RUN MANUAL → o engine parte do dado PINADO.
    const run = await page.request.post(`/api/platform/v23/pipeline/${board.id}/run`, { data: {} });
    expect(run.ok(), `run → ${run.status()} ${await run.text()}`).toBeTruthy();
    const runOut = await run.json();
    expect(runOut.status).toBe("OK");
    const derived = `board.e2e-f7-pin_${tag}.derived`;
    let rows = (await (await page.request.get(`/api/datasets/${encodeURIComponent(derived)}/sample?limit=10`)).json()).rows ?? [];
    expect(rows.some((r: Record<string, unknown>) => r.sentinela === "PIN"), `manual deveria usar o mock: ${JSON.stringify(rows)}`).toBe(true);

    // PRODUÇÃO (webhook HMAC) IGNORA o pin → derivado volta ao dado REAL.
    const mk = await page.request.post(`/api/platform/v23/pipeline/triggers`, {
      data: { slug: `pin-prod-${tag}`, board_id: board.id },
    });
    expect(mk.ok(), `trigger → ${mk.status()}`).toBeTruthy();
    // F9b — webhook roda o PUBLICADO (ignora o pin de qualquer forma): publica antes.
    expect((await page.request.post(`/api/platform/v23/pipeline/${board.id}/publish`, { data: {} })).ok()).toBeTruthy();
    const secret = (await mk.json()).secret as string;
    const body = JSON.stringify({ fonte: "producao" });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const hit = await page.request.post(`/api/platform/v23/pipeline/trigger/pin-prod-${tag}`, {
      headers: { "content-type": "application/json", "x-aegis-signature": sig },
      data: body,
    });
    expect(hit.ok(), `delivery → ${hit.status()} ${await hit.text()}`).toBeTruthy();
    rows = (await (await page.request.get(`/api/datasets/${encodeURIComponent(derived)}/sample?limit=10`)).json()).rows ?? [];
    expect(rows.some((r: Record<string, unknown>) => r.sentinela === "PIN"), `produção NÃO pode ver o mock: ${JSON.stringify(rows)}`).toBe(false);
    expect(rows.some((r: Record<string, unknown>) => r.g === "G1"), `produção deveria ler o dado real: ${JSON.stringify(rows)}`).toBe(true);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("F8.3 — settings por nó: Execute Once (motor honra) + nota no fluxo (card) + persiste", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();

    // Seed: dataset 3 linhas + board src → set (adiciona campo).
    const ds = `e2e_s_${tag}`;
    const begin = await page.request.post(`/api/datasets/${ds}/transactions`, { data: { kind: "SNAPSHOT", branch: "main" } });
    expect(begin.ok()).toBeTruthy();
    const tx = await begin.json();
    const commit = await page.request.post(`/api/datasets/${ds}/transactions/${tx.id}/commit`, {
      data: { input_payload: { payload: { rows: [{ g: "A" }, { g: "B" }, { g: "C" }] } } },
    });
    expect(commit.ok()).toBeTruthy();
    const mk = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-s-${tag}`, display_name: `E2E S ${tag}`,
        graph: {
          nodes: [
            { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
            { id: "st", op: "transform", config: { op: "set", args: { fields: [{ key: "x", value: "1", type: "text" }] } }, position: { x: 360, y: 160 } },
          ],
          edges: [{ from: "src", to: "st" }],
        },
      },
    });
    expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
    const board = await mk.json();
    await openBoard(page, board.id);

    // Overlay do nó set → aba Configurações → Execute Once + Nota + mostrar no fluxo.
    await page.getByTestId("pb-node-st").dblclick();
    const overlay = page.getByTestId("pb-config-overlay");
    await expect(overlay).toBeVisible();
    await overlay.getByTestId("pb-panel-tab-settings").click();
    await overlay.getByTestId("pb-set-execute-once").locator("input").check();
    await overlay.getByTestId("pb-set-notes").fill(`passo crítico ${tag}`);
    await overlay.getByTestId("pb-set-notes-in-flow").locator("input").check();
    await overlay.getByTestId("pb-panel-close").click();

    // Nota vira SUBTÍTULO no card + salvar (settings viajam no graph).
    await expect(page.getByTestId("pb-node-note-st")).toContainText(`passo crítico ${tag}`);
    await page.getByTestId("pb-save").click();
    await expect.poll(async () => {
      const bd = await (await page.request.get(`/api/platform/v23/pipeline/${board.id}`)).json();
      const st = (bd.graph?.nodes ?? []).find((n: { id: string }) => n.id === "st");
      return st?.config?.settings?.execute_once === true && st?.config?.settings?.notes_in_flow === true;
    }, { timeout: 15000 }).toBe(true);

    // RUN MANUAL → o MOTOR honra execute_once: 3 linhas de entrada → 1 de saída.
    const run = await page.request.post(`/api/platform/v23/pipeline/${board.id}/run`, { data: {} });
    expect(run.ok(), `run → ${run.status()} ${await run.text()}`).toBeTruthy();
    const runOut = await run.json();
    expect(runOut.status).toBe("OK");
    let rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 15 && rows.length === 0; i++) {
      const smp = await page.request.get(`/api/datasets/${encodeURIComponent(`board.e2e-s-${tag}.derived`)}/sample?limit=10`);
      if (smp.ok()) rows = (await smp.json()).rows ?? [];
      if (rows.length === 0) await page.waitForTimeout(1000);
    }
    expect(rows.length, `execute_once deveria produzir 1 linha: ${JSON.stringify(rows)}`).toBe(1);
    expect(rows[0].x).toBe("1");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("F8.4 — dirty node: executar → editar config → triângulo âmbar → re-executar limpa", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const { board } = await seedBoard(page, `dirty_${Date.now()}`);
    await openBoard(page, board.id);

    // 1) Executa o fluxo → o nó filtro conclui (marca de estado, SEM dirty).
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-flt")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });
    await expect(page.getByTestId("pb-node-dirty-flt")).toHaveCount(0);

    // 2) Edita a config do nó filtro (overlay) → salva a mudança no grafo em
    //    memória (patchNode) → a saída fica OBSOLETA → triângulo âmbar.
    await page.getByTestId("pb-node-flt").dblclick();
    const overlay = page.getByTestId("pb-config-overlay");
    await expect(overlay).toBeVisible();
    // muda o valor do filtro (where g == algo diferente)
    await overlay.getByTestId("pb-cfg-value").fill("G2");
    await overlay.getByTestId("pb-panel-close").click();
    await expect(page.getByTestId("pb-node-dirty-flt")).toBeVisible({ timeout: 10000 });
    // a marca de estado 'concluído' cede lugar ao dirty (não coexistem).
    await expect(page.getByTestId("pb-node-state-flt")).toHaveCount(0);

    // 3) Re-executa → o dirty some (saída atualizada).
    await page.getByTestId("pb-run").click();
    await expect(page.getByTestId("pb-node-state-flt")).toHaveAttribute("title", /Conclu/i, { timeout: 20000 });
    await expect(page.getByTestId("pb-node-dirty-flt")).toHaveCount(0);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("badge de marcações no nó Fonte: marcar dataset → card mostra governança", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();
    const { ds, board } = await seedBoard(page, `mk_${tag}`);

    // Seed de governança REAL: marcação no vocabulário + aplicada ao head do dataset.
    const mk = await page.request.post(`/api/markings`, {
      data: { slug: `f7-badge-${tag}`, display_name: `F7 Badge ${tag}` },
    });
    expect(mk.ok(), `create marking → ${mk.status()} ${await mk.text()}`).toBeTruthy();
    const marking = await mk.json();
    const ap = await page.request.post(`/api/datasets/${ds}/markings`, {
      data: { marking_id: marking.id },
    });
    expect(ap.ok(), `apply marking → ${ap.status()} ${await ap.text()}`).toBeTruthy();

    // Gesto: abrir o board → o CARD do nó Fonte mostra o badge de governança.
    await openBoard(page, board.id);
    const badge = page.getByTestId("pb-node-markings-src");
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toContainText("1");

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("media upload: conjunto novo → upload real → grid → preview", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();

    await page.goto("/painel-de-controle/dados?aba=arquivos");
    await page.getByTestId("md-create-toggle").click();
    await page.getByTestId("md-name").fill(`E2E F7 ${tag}`);
    await page.getByTestId("md-create-btn").click();
    // Criado → abre automaticamente (zona de upload visível).
    await expect(page.getByTestId("md-upload-zone")).toBeVisible({ timeout: 15000 });

    // PNG 1×1 real (upload REAL → MinIO).
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.getByTestId("md-upload-input").setInputFiles({
      name: `e2e-f7-${tag}.png`, mimeType: "image/png", buffer: png,
    });
    await expect(page.getByTestId("md-upload-pending")).toBeVisible();
    await page.getByTestId("md-upload-submit").click();

    // Item aparece no grid → clicar abre o preview (aside direito).
    const card = page.locator('[data-testid^="md-card-"]').first();
    await expect(card).toBeVisible({ timeout: 30000 });
    await card.click();
    await expect(page.getByTestId("md-preview")).toBeVisible();

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
