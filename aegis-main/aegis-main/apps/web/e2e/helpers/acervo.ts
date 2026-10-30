import type { Page } from "@playwright/test";

/**
 * A3 (complemento 2026-07-04) — ?aba=pipelines nasce com o Acervo COLAPSADO
 * (foco no canvas). Specs que precisam da lista de boards expandem primeiro.
 * Idempotente: se já estiver expandido, não faz nada.
 */
export async function expandAcervo(page: Page) {
  const nav = page.getByTestId("acervo-nav");
  await nav.waitFor({ state: "visible", timeout: 30000 });
  if ((await nav.getAttribute("data-collapsed")) === "true") {
    await page.getByTestId("acervo-expand").click();
  }
}
