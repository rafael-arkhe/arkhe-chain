/**
 * E2E · Onda 4a — Coleções enriquecido (Painel RAG · Conversas).
 *
 * Prova o GESTO ao vivo: o operador abre Conversas, vê o catálogo enriquecido
 * (proveniência humanizada + doc_count honesto), troca a PROFUNDIDADE em buckets
 * e a busca envia o top_k real correspondente (assert no POST de verdade), e
 * filtra por FACETA REAL (origem). Régua: feedback_e2e_via_playwright_cli.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

test.describe("Onda 4a · Coleções enriquecido (RAG)", () => {
  test("profundidade em buckets → top_k real no POST + metadados honestos + filtro por origem", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin
    await page.goto("/painel-de-controle/aip-threads");
    // /aip-threads redireciona p/ /paginas/aip-threads/view (Page app_route) →
    // espera o app montar (redirect + resolução da Page + cold-compile podem passar de 5s).
    await expect(page.getByTestId("aip-threads-page")).toBeVisible({ timeout: 20000 });

    // O painel RAG abre por padrão; se estiver recolhido, reabre.
    const opener = page.getByTestId("aip-rag-artifact-open");
    if (await opener.count()) await opener.click();
    await expect(page.getByTestId("aip-rag-artifact")).toBeVisible();

    // Catálogo carregado: o controle de profundidade (buckets) está presente.
    await expect(page.getByTestId("aip-rag-depth")).toBeVisible();
    await expect(page.getByTestId("aip-rag-depth-focus")).toHaveAttribute("aria-pressed", "true");

    // Metadados HONESTOS: proveniência humanizada (telegram = federação social).
    await expect(page.getByTestId("aip-rag-coll-prov-telegram")).toContainText("social", { ignoreCase: true });
    // doc_count exibido (número real OU "—" honesto — nunca em branco).
    await expect(page.getByTestId("aip-rag-coll-count-telegram")).not.toBeEmpty();

    // Filtro por FACETA REAL (origem): "Vídeo" (cctv) some o telegram (social).
    await expect(page.getByTestId("aip-rag-source-filter")).toBeVisible();
    await page.getByTestId("aip-rag-source-cctv").click();
    await expect(page.getByTestId("aip-rag-coll-row-cctv_faces")).toBeVisible();
    await expect(page.getByTestId("aip-rag-coll-row-telegram")).toHaveCount(0);
    await page.getByTestId("aip-rag-source-all").click();
    await expect(page.getByTestId("aip-rag-coll-row-telegram")).toBeVisible();

    // Profundidade → top_k REAL no POST: Amplo = 20 (sem expor o nº cru na escolha).
    await page.getByTestId("aip-rag-depth-broad").click();
    await expect(page.getByTestId("aip-rag-depth-broad")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("aip-rag-query").fill("teste de profundidade");
    const reqP = page.waitForRequest(
      (r) => r.url().includes("/aip-rag/query") && r.method() === "POST",
    );
    await page.getByTestId("aip-rag-run").click();
    const req = await reqP;
    expect(req.postDataJSON().top_k).toBe(20);

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
