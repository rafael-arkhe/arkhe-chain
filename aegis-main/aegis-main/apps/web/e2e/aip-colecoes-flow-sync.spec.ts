/**
 * E2E · A11 — AIP Chat "Coleções" ⇄ DAG (proveniência do fluxo, ao vivo).
 * A coleção PRODUZIDA por um fluxo do DAG (dataset board.{slug}.derived embeddado)
 * aparece na lista Coleções com a identidade do fluxo: NOME do fluxo + tags/
 * personalizações + link "do fluxo X" clicável (deep-link ao board no DAG). Faceta
 * por tag presente. Depende do seed (board a11cert + DatasetEmbedRun ds_a11cert).
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

test.describe("A11 — AIP Chat Coleções ⇄ DAG", () => {
  test("coleção produzida por fluxo mostra nome/tags/link do fluxo ao vivo", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    // rota canônica (a antiga /painel-de-controle/aip-threads redireciona p/ cá).
    await page.goto("/paginas/aip-threads/view");
    await expect(page.getByTestId("aip-threads-page")).toBeVisible({ timeout: 60000 });

    // o painel Coleções abre por padrão; a coleção do fluxo seedado aparece.
    const row = page.getByTestId("aip-rag-coll-row-ds_a11cert");
    await expect(row).toBeVisible({ timeout: 30000 });
    // rótulo = NOME DO FLUXO (não o nome técnico "board.a11cert.derived")
    await expect(row).toContainText("Fluxo A11 Cert");
    await expect(row).not.toContainText("board.a11cert.derived");

    // tags/personalizações do board produtor
    await expect(page.getByTestId("aip-rag-coll-tag-ds_a11cert-osint")).toBeVisible();
    await expect(page.getByTestId("aip-rag-coll-tag-ds_a11cert-a11")).toBeVisible();

    // "do fluxo X" clicável → deep-link ao board no DAG (UUID, não slug)
    const link = page.getByTestId("aip-rag-coll-flow-ds_a11cert");
    await expect(link).toContainText("do fluxo");
    await expect(link).toHaveAttribute("href", /aba=pipelines&board=[0-9a-f-]{36}/);

    // faceta por TAG presente com as tags reais dos fluxos
    await expect(page.getByTestId("aip-rag-tag-filter")).toBeVisible();
    await expect(page.getByTestId("aip-rag-tag-osint")).toBeVisible();

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
