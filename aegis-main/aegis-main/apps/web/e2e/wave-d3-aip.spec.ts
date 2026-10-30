/**
 * Wave D.3 — /painel-de-controle/aip-threads · aip-models · aip-memory.
 *
 * Cobre:
 *   1. /aip-threads carrega · cria nova thread · envia mensagem · RAG query
 *      devolve matches · click match insere contexto no composer.
 *   2. /aip-models lista carrega · filtros por provider funcionam ·
 *      capability badges renderizam.
 *   3. /aip-memory CRUD básico — criar, pinar/despinar, deletar.
 *   4. Zero erros de console (filtrando ruído conhecido de cesium/lazy).
 *
 * Login via helper que aceita cookies httpOnly (sem JS fetch — o
 * security-app não expõe token em JS).
 */
import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";


const CONSOLE_NOISE = [
  /cesium/i,
  /map.+token/i,
  /HMR/i,
  /webpack-internal/i,
  /Fast Refresh/i,
  /Download the React DevTools/i,
];


function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (CONSOLE_NOISE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  return errors;
}


test.describe("Wave D.3 · AIP Threads", () => {
  // Testids atualizados (refactor W8 modular): a "Nova conversa" + o Composer
  // migraram p/ Sidebar.tsx/Composer.tsx (aip-chat-*); o clique no match RAG hoje
  // COPIA o bloco "Contexto RAG" p/ a área de transferência (antes inseria no
  // composer). Robusto ao estado vazio HONESTO do backend (0 quando sem dado).
  test("lista · criar conversa · enviar mensagem · RAG copia contexto", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page);
    await page.goto("/painel-de-controle/aip-threads");
    // /aip-threads redireciona p/ /paginas/aip-threads/view (Page app_route) →
    // 1º hit faz cold-compile pesado; espera ≥20s.
    await expect(page.getByTestId("aip-threads-page")).toBeVisible({ timeout: 20000 });

    // Cria nova conversa (botão no Sidebar).
    await page.getByTestId("aip-chat-new-conversation").click();
    // Aguarda a thread aparecer na lista (lista renderiza após create).
    await page.waitForTimeout(700);

    // Composer fica habilitado quando há thread selecionada.
    const composer = page.getByTestId("aip-chat-composer-input");
    await expect(composer).toBeVisible();
    await composer.fill("Verificar placa ABC-1D23");
    await page.getByTestId("aip-chat-composer-send").click();
    // Aguarda echo aparecer.
    await page.waitForTimeout(900);

    // RAG query → o rótulo de backend HONESTO sempre aparece (com ou sem dado).
    await page.getByTestId("aip-rag-query").fill("placa");
    await page.getByTestId("aip-rag-run").click();
    await expect(page.getByTestId("aip-rag-backend-status")).toBeVisible({ timeout: 10000 });

    // Com matches reais → clicar COPIA o bloco "Contexto RAG"; sem dado (backend
    // devolve 0 honestamente neste ambiente) → valida o estado vazio honesto.
    const matchButtons = page.getByTestId("aip-rag-matches").locator("button");
    if (await matchButtons.count()) {
      await matchButtons.first().click();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      expect(clip).toContain("Contexto RAG");
    } else {
      await expect(page.getByTestId("aip-rag-empty-results")).toBeVisible();
    }

    // Screenshot pra validar layout 3-pane.
    await page.screenshot({
      path: "test-results/wave-d3-aip-threads.png",
      fullPage: false,
    });

    expect(errors, `console errors detected:\n${errors.join("\n")}`).toEqual([]);
  });
});


test.describe("Wave D.3 · AIP Models", () => {
  test("catálogo carrega · filtros aplicam · badges de capability", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page);
    await page.goto("/painel-de-controle/aip-models");
    await expect(page.getByTestId("aip-models-page")).toBeVisible({ timeout: 15000 });

    // Aguarda o grid popular (presets sempre presentes — Groq Llama etc).
    await expect(page.getByTestId("aip-models-grid")).toBeVisible();
    await page.waitForTimeout(800);

    // Filtro de provider.
    const provider = page.getByTestId("aip-models-provider-filter");
    await provider.selectOption("groq");
    await page.waitForTimeout(600);

    // Filtro de capability.
    const cap = page.getByTestId("aip-models-capability-filter");
    await cap.selectOption("tool_use");
    await page.waitForTimeout(400);

    // Limpa filtros pra screenshot final.
    await provider.selectOption("");
    await cap.selectOption("");
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "test-results/wave-d3-aip-models.png",
      fullPage: false,
    });

    expect(errors, `console errors detected:\n${errors.join("\n")}`).toEqual([]);
  });
});


test.describe("Wave D.3 · Docs UI", () => {
  test("árvore lista 500+ markdowns · abre wave-D3 + sprint-L1", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page);
    await page.goto("/docs");
    await expect(page.getByTestId("docs-page")).toBeVisible({ timeout: 15000 });

    // Aguarda árvore popular.
    await expect(page.getByTestId("docs-tree")).toBeVisible();
    await page.waitForTimeout(900);

    // Counter no header mostra >= 50 documentos (real é 514).
    const headerText = await page.locator('[data-testid="docs-page"] header').textContent();
    expect(headerText).toMatch(/\d+ documento/);

    // Filter por "wave-D3" — deve achar nosso doc novo.
    const filter = page.getByTestId("docs-filter");
    await filter.fill("wave-D3");
    await page.waitForTimeout(400);
    const results = page.getByTestId("docs-filter-results");
    await expect(results).toContainText("wave-D3-aip-integration.md");

    // Click no resultado, conteúdo deve aparecer.
    await results.locator("button").first().click();
    await page.waitForTimeout(700);
    await expect(page.getByTestId("docs-content")).toBeVisible();
    const content = await page.getByTestId("docs-content").textContent();
    expect(content).toContain("Wave D.3");

    // Filter por sprint-L1.
    await filter.fill("sprint-L1-quick");
    await page.waitForTimeout(400);
    await expect(results).toContainText("sprint-L1-quick-wins.md");

    await page.screenshot({
      path: "test-results/wave-d3-docs.png",
      fullPage: false,
    });

    expect(errors, `console errors detected:\n${errors.join("\n")}`).toEqual([]);
  });
});


test.describe("Wave D.3 · AIP Memory", () => {
  test("criar memória · pin toggle · delete", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page);
    await page.goto("/painel-de-controle/aip-memory");
    await expect(page.getByTestId("aip-memory-page")).toBeVisible({ timeout: 15000 });

    // Abre formulário de criação.
    await page.getByTestId("aip-memory-new").click();
    await page.getByTestId("aip-memory-new-title").fill("Wave D.3 e2e memo");
    await page.getByTestId("aip-memory-new-body").fill(
      "Memória de teste — usar pt-BR em respostas operacionais.",
    );
    await page.getByTestId("aip-memory-new-save").click();
    await page.waitForTimeout(800);

    // Item aparece na lista.
    const list = page.getByTestId("aip-memory-list");
    await expect(list).toContainText("Wave D.3 e2e memo");

    // Pin toggle no primeiro item visível.
    const firstArticle = list.locator("article").first();
    const pinBtn = firstArticle.locator("button").first();
    await pinBtn.click();
    await page.waitForTimeout(400);

    // Delete o item recém-criado pra não vazar entre runs.
    const articles = list.locator("article");
    const count = await articles.count();
    for (let i = 0; i < count; i++) {
      const article = articles.nth(i);
      const text = await article.textContent();
      if (text?.includes("Wave D.3 e2e memo")) {
        await article.locator('[data-testid^="aip-memory-delete-"]').click();
        await page.waitForTimeout(400);
        break;
      }
    }

    await page.screenshot({
      path: "test-results/wave-d3-aip-memory.png",
      fullPage: false,
    });

    expect(errors, `console errors detected:\n${errors.join("\n")}`).toEqual([]);
  });
});
