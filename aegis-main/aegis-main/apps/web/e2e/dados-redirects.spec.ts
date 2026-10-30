/**
 * E2E · Onda 2 · I1b — redirects das rotas-irmãs → Tela de Dados (cert ao vivo).
 *
 * A Tela de Dados unificou a camada num só 3-pane (/painel-de-controle/dados). As
 * rotas standalone NÃO somem (feedback_no_deprecation_of_existing_code): viram
 * deep-links estáveis que redirecionam (router.replace) para a seção certa do
 * Acervo. Este teste reproduz o GESTO do operador (abrir o deep-link antigo) e
 * prova que ele aterrissa na Tela de Dados, na seção esperada (régua: cert por
 * gesto ao vivo · feedback_e2e_via_playwright_cli).
 *
 * NB: o /conectores da RAIZ (app/conectores) é OUTRA tela (saúde das fontes) e
 * NÃO é redirecionada — só o /painel-de-controle/conectores.
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

const CASES: { route: string; aba: string; modo?: string }[] = [
  { route: "/painel-de-controle/conectores", aba: "conexoes" },
  { route: "/painel-de-controle/datasets", aba: "datasets" },
  { route: "/painel-de-controle/pipelines", aba: "pipelines" },
  { route: "/painel-de-controle/pipeline-builder", aba: "pipelines" },
  { route: "/painel-de-controle/media", aba: "arquivos" },
];

test.describe("Onda 2 · I1b — redirects das rotas-irmãs → Tela de Dados", () => {
  test("cada rota standalone aterrissa na seção certa do Acervo", async ({ page }) => {
    // 5 rotas frias (first-compile do next dev) + o redirect SPA de cada uma.
    test.setTimeout(180000);
    await login(page); // admin (todas as perms → todas as seções visíveis)

    // Aquece o hub: compila /dados antes — o redirect aterrissa nele já pronto.
    await page.goto("/painel-de-controle/dados");
    await expect(page.getByRole("heading", { name: "Dados" })).toBeVisible();

    for (const { route, aba, modo } of CASES) {
      // O redirect é client-side (router.replace) — não espera 'load' do doc
      // antigo (que é substituído pela soft-nav); espera a URL final mudar.
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForURL(new RegExp(`/painel-de-controle/dados\\?.*aba=${aba}`), { timeout: 30000 });
      if (modo) {
        expect(page.url(), `${route} preserva modo=${modo}`).toMatch(new RegExp(`modo=${modo}`));
      }
      // Aterrissou de fato na Tela de Dados: o Acervo mostra a seção esperada.
      await expect(page.getByTestId(`acervo-item-${aba}`)).toBeVisible();
      // Sidenav "Dados" acende (NAV_CLUSTERS engloba a rota-irmã).
      await expect(page.getByTestId("cp-nav-dados")).toHaveAttribute("aria-current", "page");
    }
  });
});
