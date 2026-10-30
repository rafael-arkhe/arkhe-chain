/**
 * E2E · Onda 2 follow-on (b) — chips de governança no Acervo filtram de verdade.
 *
 * GET /datasets passa a expor classification_level + marking_count por linha, e a
 * lista do Acervo ganha um badge de classificação por dataset + chips de filtro.
 * Prova o gesto ao vivo: dois datasets (confidencial vs público) → clicar o chip
 * "confidencial" esconde o público. Régua: feedback_e2e_via_playwright_cli.
 */
import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";

async function seedClassified(page: Page, name: string, level: string) {
  const tx = await page.request.post(`/api/datasets/${name}/transactions`, {
    data: { kind: "SNAPSHOT", branch: "main" },
  });
  expect(tx.ok(), `criar tx falhou: ${tx.status()}`).toBeTruthy();
  const txId = (await tx.json()).id;
  const commit = await page.request.post(`/api/datasets/${name}/transactions/${txId}/commit`, {
    data: { input_payload: { payload: { rows: [{ a: 1 }] } } },
  });
  expect(commit.ok(), `commit falhou: ${commit.status()}`).toBeTruthy();
  const cls = await page.request.patch(`/api/datasets/${name}/classification`, {
    data: { data_classification: level, file_classification: level },
  });
  expect(cls.ok(), `classificar falhou: ${cls.status()}`).toBeTruthy();
}

test.describe("Onda 2 · chips de governança no Acervo (gesto ao vivo)", () => {
  test("badge por linha + chip de classificação filtra a lista", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin

    const ts = Date.now();
    const conf = `e2e-chip-conf-${ts}`;
    const pub = `e2e-chip-pub-${ts}`;
    await seedClassified(page, conf, "confidencial");
    await seedClassified(page, pub, "publico");

    await page.goto("/painel-de-controle/dados?aba=datasets");
    await page.getByTestId("acervo-item-datasets").click();
    await expect(page.getByTestId("acervo-contextual")).toBeVisible();

    // Ambos na lista; o confidencial mostra o badge de classificação na linha.
    await expect(page.getByTestId(`ds-item-${conf}`)).toBeVisible();
    await expect(page.getByTestId(`ds-item-${pub}`)).toBeVisible();
    await expect(page.getByTestId(`ds-item-cls-${conf}`)).toContainText(/confidencial/i);

    // Chip "confidencial" filtra a lista DE VERDADE → o público some.
    await page.getByTestId("ds-gov-chip-confidencial").click();
    await expect(page.getByTestId(`ds-item-${pub}`)).toHaveCount(0);
    await expect(page.getByTestId(`ds-item-${conf}`)).toBeVisible();

    // Re-clicar limpa o filtro → o público volta.
    await page.getByTestId("ds-gov-chip-confidencial").click();
    await expect(page.getByTestId(`ds-item-${pub}`)).toBeVisible();

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
