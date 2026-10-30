/**
 * E2E · Onda 2 follow-on (a) — painel Marcações no inspetor de dataset.
 *
 * Prova o GESTO ao vivo: na seção Datasets da Tela de Dados, o inspetor (RIGHT)
 * mostra Classificação & Marcações; o operador aplica uma marcação need-to-know
 * por DROPDOWN (nunca slug digitado) → vira pill; remover passa pelo confirmModal
 * (nunca diálogo nativo) e some. O floor real (quem pode ler /sample) é provado
 * no backend (tests_expansion/test_datasets_marking_floor). Régua:
 * feedback_e2e_via_playwright_cli. Robusto: pula com graça se faltar vocabulário.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

test.describe("Onda 2 · Marcações no inspetor de dataset (gesto ao vivo)", () => {
  test("aplica marcação por dropdown → pill; remove via confirmModal → some", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));

    await login(page); // admin (bypassa elegibilidade/RBAC)

    // Semeia um dataset determinístico via API (cookies de sessão) p/ não depender
    // do estado do tenant nem poluir um dataset "real".
    const name = `e2e-mk-${Date.now()}`;
    const tx = await page.request.post(`/api/datasets/${name}/transactions`, {
      data: { kind: "SNAPSHOT", branch: "main" },
    });
    expect(tx.ok(), `criar tx falhou: ${tx.status()}`).toBeTruthy();
    const txId = (await tx.json()).id;
    const commit = await page.request.post(`/api/datasets/${name}/transactions/${txId}/commit`, {
      data: { input_payload: { payload: { rows: [{ a: 1 }, { a: 2 }] } } },
    });
    expect(commit.ok(), `commit falhou: ${commit.status()}`).toBeTruthy();

    await page.goto("/painel-de-controle/dados?aba=datasets");
    await page.getByTestId("acervo-item-datasets").click();
    await expect(page.getByTestId("acervo-contextual")).toBeVisible();

    // Seleciona o dataset semeado → inspetor com Classificação & Marcações.
    await page.getByTestId(`ds-item-${name}`).click();
    await expect(page.getByTestId("ds-inspector")).toBeVisible();
    const sectMarc = page.getByTestId("ds-marcacoes");
    await expect(sectMarc).toBeVisible();
    // Sem marcações ainda (dataset novo).
    await expect(page.getByTestId("ds-marcacoes-empty")).toBeVisible();

    // Aplica a 1ª marcação do vocabulário (dropdown, nunca texto livre).
    const pick = page.getByTestId("ds-marcacoes-pick");
    const optionCount = await pick.locator("option").count();
    if (optionCount <= 1) {
      test.info().annotations.push({ type: "skip", description: "tenant sem vocabulário de marcações" });
      expect(fatal, fatal.join(" | ")).toEqual([]);
      return;
    }
    await pick.selectOption({ index: 1 });
    await page.getByTestId("ds-marcacoes-apply").click();

    // A marcação aplicada vira pill na lista.
    await expect(page.getByTestId("ds-marcacoes-list")).toBeVisible();
    const pill = sectMarc.locator('[data-testid^="property-marking-"]').first();
    await expect(pill).toBeVisible();

    // Remover é SENSÍVEL → confirmModal REAL (nunca window.confirm).
    await sectMarc.locator('[data-testid^="ds-marcacoes-remove-"]').first().click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-ok").click();

    // Pós-remoção: volta ao estado vazio (floor levantado).
    await expect(page.getByTestId("ds-marcacoes-empty")).toBeVisible();

    expect(fatal, `erros fatais de página: ${fatal.join(" | ")}`).toEqual([]);
  });
});
