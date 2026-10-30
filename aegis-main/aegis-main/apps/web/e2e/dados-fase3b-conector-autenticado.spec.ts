/**
 * E2E · Fase 3b (overhaul DAG n8n) — nó Fonte CONECTOR AUTENTICADO.
 *
 * Prova o GESTO ao vivo: "Testar chamada" roda a chamada AUTENTICADA (bearer com
 * o segredo do Vault) em modo amostra (sem persistir) → árvore de campos → "Gerar
 * dataset" = puxão REAL capado → SNAPSHOT → o nó passa a apontar p/ o dataset.
 *
 * A fonte de cert é `httpbin.org/bearer`, que responde 200 SÓ com o header
 * Authorization (401 sem) → se a árvore aparece com {authenticated, token}, o
 * segredo do Vault FOI resolvido sob escopo + enviado na chamada real (o headline
 * da 3b). O anti-SSRF bloqueia loopback, por isso a fonte é pública.
 *
 * Régua: feedback_e2e_via_playwright_cli + cert por gesto ao vivo (nunca seed-only).
 * O conector configurado é semeado via API (pré-requisito), igual a 3a semeava o board.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

test.describe("Fase 3b — conector autenticado: Testar chamada → schema → Gerar dataset", () => {
  test("conector bearer (Vault) → Testar (authed) → árvore → Gerar dataset", async ({ page }) => {
    // Cold-compile do /dados + chamadas autenticadas reais (httpbin) são lentas no
    // 1º hit do `next dev`; o teto generoso evita flake de compilação a frio.
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin (iam.governance + connectors.manage)
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = Date.now();

    // ── Seed (pré-requisito): segredo no Vault + conector bearer → httpbin/bearer ──
    const sec = await page.request.post("/api/governance/vault", {
      data: { namespace: "conector", slug: `e2e-${tag}`, display_name: `E2E token ${tag}`, value: "tok-e2e-aegis" },
    });
    expect(sec.ok(), `vault: ${sec.status()} ${await sec.text()}`).toBeTruthy();

    const ag = await page.request.post("/api/governance/agents", {
      data: { slug: `conn-e2e-${tag}`, display_name: `Fonte autenticada ${tag}`, kind: "worker", config: {} },
    });
    expect(ag.ok(), `agent: ${ag.status()} ${await ag.text()}`).toBeTruthy();
    const agentId = (await ag.json()).id as string;

    const bind = await page.request.post(`/api/governance/agents/${agentId}/skills`, {
      data: {
        skill_key: "connector.http",
        active: true,
        config: {
          base_url: "https://httpbin.org",
          path: "/bearer",
          method: "GET",
          node_type: "XEntidade",
          id_field: "token",
          auth: { mode: "bearer", secret_ref: `conector/e2e-${tag}` },
          serializer: { format: "json" },
        },
      },
    });
    expect(bind.ok(), `binding: ${bind.status()} ${await bind.text()}`).toBeTruthy();

    // ── Gesto no canvas ──
    await page.goto("/painel-de-controle/dados?aba=pipelines");
    await expandAcervo(page);
    await page.getByTestId("pb-new").click();
    await page.getByTestId("pb-create-name").fill(`f3b-${tag}`);
    await page.getByTestId("pb-create-confirm").click();
    // F7.3a — board NOVO aterrissa no empty-state n8n ("Add first step");
    // o canvas ReactFlow (lazy) só nasce com o 1º nó.
    await expect(page.getByTestId("pb-empty-canvas")).toBeVisible({ timeout: 30000 });

    // F8.1 — empty-state abre o NodesPanel; Fonte insere e fecha o drawer.
    await page.getByTestId("pb-empty-add-node").click();
    await page.getByTestId("pb-add-source").click();
    await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("pb-cfg-source-kind")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("pb-cfg-source-kind").selectOption("http");

    // 3º sub-modo: conector configurado → picker lista os conectores (lazy).
    await page.getByTestId("http-src-mode").selectOption("connector");
    await expect(page.getByTestId("http-src-connector")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("http-src-connector").selectOption(agentId);

    // "Testar chamada" → chamada AUTENTICADA real (bearer do Vault) → árvore.
    await page.getByTestId("http-src-test").click();
    await expect(page.getByTestId("schema-tree")).toBeVisible({ timeout: 30000 });
    // httpbin/bearer só responde 200 COM o Authorization → prova o segredo enviado.
    await expect(page.getByTestId("schema-field-authenticated")).toBeVisible();

    // "Gerar dataset" → puxão real capado → SNAPSHOT → nó vinculado.
    await page.getByTestId("http-src-dsname").fill(`f3b_ds_${tag}`);
    await page.getByTestId("http-src-generate").click();
    await expect(page.getByTestId("http-src-linked")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("http-src-msg")).toContainText(/gerado|generated/i);

    // ── F7 (rodada 9) — RE-PULL AGENDADO ao vivo (gesto F3b-2) ──
    // Nó vinculado ganha o seletor de agenda → salvar → "Agendador agora" do
    // operador (endpoint agora cobre nós Fonte) → re-pull ENFILEIRADO de verdade.
    await expect(page.getByTestId("http-src-schedule")).toBeVisible();
    await page.getByTestId("http-src-schedule").selectOption("15min");
    await page.getByTestId("pb-save").click();
    await expect(page.getByTestId("pb-msg")).toBeVisible({ timeout: 15000 });

    const tick = await page.request.post(`/api/governance/agents/scheduler/tick`);
    expect(tick.ok(), `tick → ${tick.status()} ${await tick.text()}`).toBeTruthy();
    const tickOut = await tick.json();
    expect(tickOut.source_nodes, "tick sem seção source_nodes").toBeTruthy();

    // O nó recém-agendado (sem last_repull_at) está vencido → carimbado QUEUED.
    const boards = await page.request.get(`/api/platform/v23/pipeline`);
    expect(boards.ok()).toBeTruthy();
    const mine = (await boards.json()).find((b: { slug: string }) => b.slug === `f3b-${tag}`);
    expect(mine, "board do teste não listado").toBeTruthy();
    const bd = await (await page.request.get(`/api/platform/v23/pipeline/${mine.id}`)).json();
    const srcNode = (bd.graph?.nodes ?? []).find((n: { op: string }) => n.op === "source");
    expect(String(srcNode?.config?.schedule_preset ?? "")).toBe("15min");
    expect(String(srcNode?.config?.last_repull_status ?? "")).toBe("QUEUED");

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
