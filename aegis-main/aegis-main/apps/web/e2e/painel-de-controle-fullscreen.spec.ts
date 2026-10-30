/**
 * E2E · Painel de Controle full-bleed (Sprint H1)
 * ───────────────────────────────────────────────────────────────────
 *
 * Sprint H1 (2026-05-22): o Painel de Controle ganhou o tratamento
 * Palantir/Foundry "Open Control Panel":
 *
 *   1. Saiu do sidenav (grupo "Plataforma" removido).
 *   2. Entrou no UserMenu (dropdown do perfil no navbar).
 *   3. A rota /painel-de-controle e suas filhas (/aprovacoes, /atividade,
 *      /comunicacoes) renderizam SEM header/sidenav/footer globais —
 *      só o ControlPanelShell ocupa a tela inteira.
 *
 * Saída pelo "Voltar ao AEGIS" no rodapé do shell (espelho do
 * "↗ Open Foundry" da Foundry — `CpSidebarFooter`).
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

test.describe("Painel de Controle · full-bleed", () => {
  test("sidenav NÃO contém mais o item Painel de Controle", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await expect(page.getByTestId("sidenav")).toBeVisible();
    await expect(page.getByTestId("nav-painel-de-controle")).toHaveCount(0);
    await expect(page.locator('[data-testid="section-plataforma"]')).toHaveCount(0);
  });

  // Sprint H1.2 (2026-05-22): Fluxos migrou pro Painel como "Lineage".
  test("Fluxos saiu do sidenav (migrou pro Painel de Controle como Lineage)", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await expect(page.getByTestId("nav-fluxos")).toHaveCount(0);
  });

  test("brand zone do painel mostra logo + AEGIS + Painel de Controle", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    const brand = page.getByTestId("cp-sidebar-header");
    await expect(brand).toBeVisible();
    await expect(brand.locator("img")).toHaveAttribute("src", "/logo-white.svg");
    await expect(brand).toContainText("AEGIS");
    await expect(brand).toContainText("Painel de Controle");
  });

  test("top zone do painel tem exatamente 3 items: Início, Aprovações, Buscar", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    await expect(page.getByTestId("cp-nav-home")).toBeVisible();
    await expect(page.getByTestId("cp-nav-aprovacoes")).toBeVisible();
    await expect(page.getByTestId("cp-nav-search")).toBeVisible();
    // Comunicações e Atividade NÃO devem ser top items — agora vivem em
    // grupos. Vamos só confirmar que existem na sidebar.
    await expect(page.getByTestId("cp-nav-comunicacoes")).toBeVisible();
    await expect(page.getByTestId("cp-nav-atividade")).toBeVisible();
  });

  test("Lineage aparece no painel e abre /fluxos?cp=1 (modo embedded)", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    const lineage = page.getByTestId("cp-nav-lineage");
    await expect(lineage).toBeVisible();
    // Sprint H1.4: hrefs externos do painel ganham ?cp=1.
    await expect(lineage).toHaveAttribute("href", "/fluxos?cp=1");
    await expect(lineage).toContainText("Lineage");
  });

  test("acesso via UserMenu do navbar (item 'Configurações' — H1.3 rename)", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await page.getByTestId("header-user-menu").click();
    const link = page.getByTestId("header-user-configuracoes");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/painel-de-controle");
    await link.click();
    await page.waitForURL("**/painel-de-controle");
  });

  test("rota /painel-de-controle não renderiza header/sidenav/footer globais", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    await expect(page.getByTestId("cp-sidebar")).toBeVisible();
    await expect(page.getByTestId("header")).toHaveCount(0);
    await expect(page.getByTestId("sidenav")).toHaveCount(0);
    await expect(page.getByTestId("footer")).toHaveCount(0);
  });

  test("rotas filhas também são full-bleed", async ({ page }) => {
    await login(page);
    for (const sub of ["/painel-de-controle/aprovacoes", "/painel-de-controle/atividade", "/painel-de-controle/comunicacoes"]) {
      await page.goto(sub);
      await expect(page.getByTestId("cp-sidebar")).toBeVisible();
      await expect(page.getByTestId("header")).toHaveCount(0);
      await expect(page.getByTestId("sidenav")).toHaveCount(0);
      await expect(page.getByTestId("footer")).toHaveCount(0);
    }
  });

  test("'Voltar ao AEGIS' no CpSidebarFooter retorna pro app principal", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    await page.getByTestId("cp-footer-back").click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByTestId("header")).toBeVisible();
    await expect(page.getByTestId("sidenav")).toBeVisible();
  });

  // Sprint H1.3 (2026-05-22): /configuracoes migrou pra dentro do
  // painel; UserMenu renomeado de "Painel de Controle" pra
  // "Configurações" (ícone Cog).
  test("UserMenu mostra item único 'Configurações' (não mais 'Painel de Controle')", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await page.getByTestId("header-user-menu").click();
    const link = page.getByTestId("header-user-configuracoes");
    await expect(link).toBeVisible();
    await expect(link).toContainText("Configurações");
    await expect(link).toHaveAttribute("href", "/painel-de-controle");
    // O testid antigo não existe mais
    await expect(page.getByTestId("header-user-painel")).toHaveCount(0);
  });

  // Sprint H1.5 (2026-05-22): /preferencias renomeado pra /conta;
  // sub-rotas viraram /browser e /notificacoes sibling (sem prefixo).
  test("/configuracoes redireciona pra /painel-de-controle/conta", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.waitForURL("**/painel-de-controle/conta");
    await expect(page.getByTestId("cp-sidebar")).toBeVisible();
    await expect(page.getByTestId("cp-nav-conta")).toBeVisible();
  });

  test("/configuracoes/browser redireciona pra /painel-de-controle/browser", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes/browser");
    await page.waitForURL("**/painel-de-controle/browser");
  });

  test("/painel-de-controle/preferencias redireciona pra /painel-de-controle/conta (H1.5 rename)", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle/preferencias");
    await page.waitForURL("**/painel-de-controle/conta");
  });

  test("3 items flat (Conta/Browser/Notificações) no painel", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    const conta = page.getByTestId("cp-nav-conta");
    const browser = page.getByTestId("cp-nav-browser");
    const notif = page.getByTestId("cp-nav-notificacoes");
    await expect(conta).toBeVisible();
    await expect(browser).toBeVisible();
    await expect(notif).toBeVisible();
    await expect(conta).toHaveAttribute("href", "/painel-de-controle/conta");
    await expect(browser).toHaveAttribute("href", "/painel-de-controle/browser");
    await expect(notif).toHaveAttribute("href", "/painel-de-controle/notificacoes");

    // Click Notificações navega
    await notif.click();
    await page.waitForURL("**/painel-de-controle/notificacoes");
    await expect(page.getByTestId("cp-sidebar")).toBeVisible();
  });

  // Sprint H1.5: FAVORITAS deletado da UI inteira.
  test("sidebar do painel NÃO mostra mais a seção FAVORITAS", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    await expect(page.getByTestId("cp-sidebar")).toBeVisible();
    await expect(page.getByText("FAVORITAS")).toHaveCount(0);
  });

  // Sprint H1.4: hrefs externos (Workshop, IAM, Fluxos) ganham ?cp=1
  // e AuthShell envelopa no ControlPanelShell — sidebar do painel
  // persiste, chrome global some.
  test("Clicar Lineage abre /fluxos?cp=1 dentro do painel (sidebar persiste)", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    await page.getByTestId("cp-nav-lineage").click();
    await page.waitForURL("**/fluxos?cp=1");
    // Sidebar do painel persiste; header global some
    await expect(page.getByTestId("cp-sidebar")).toBeVisible();
    await expect(page.getByTestId("header")).toHaveCount(0);
    await expect(page.getByTestId("sidenav")).toHaveCount(0);
    await expect(page.getByTestId("footer")).toHaveCount(0);
  });

  test("Clicar Catálogo de apps abre /workshop?cp=1 dentro do painel", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    await page.getByTestId("cp-nav-apps").click();
    await page.waitForURL("**/workshop?cp=1");
    await expect(page.getByTestId("cp-sidebar")).toBeVisible();
    await expect(page.getByTestId("header")).toHaveCount(0);
  });

  test("Acesso direto /workshop (sem ?cp=1) mostra chrome global normal", async ({ page }) => {
    await login(page);
    await page.goto("/workshop");
    await expect(page.getByTestId("header")).toBeVisible();
    await expect(page.getByTestId("sidenav")).toBeVisible();
    await expect(page.getByTestId("cp-sidebar")).toHaveCount(0);
  });

  test("Footer back em rota externa (cp=1) mostra 'Painel de Controle' (ChevronLeft) e volta pro painel", async ({ page }) => {
    await login(page);
    await page.goto("/fluxos?cp=1");
    const back = page.getByTestId("cp-footer-back");
    await expect(back).toBeVisible();
    await expect(back).toContainText("Painel de Controle");
    await expect(back).toHaveAttribute("href", "/painel-de-controle");
    await back.click();
    await page.waitForURL("**/painel-de-controle");
  });

  // Sprint H1.7 (2026-05-22): cp mode persiste via cookie em navegação
  // interna (Workshop edit, IAM sub-rotas etc. — Links nativos
  // descartam querystring; sem cookie, AuthShell mostraria chrome).
  test("Navegação interna em Workshop preserva cp mode via cookie", async ({ page }) => {
    await login(page);
    // Entra em cp mode pelo painel
    await page.goto("/painel-de-controle");
    await page.getByTestId("cp-nav-apps").click();
    await page.waitForURL("**/workshop?cp=1");
    // Aguarda useEffect do AuthShell escrever o cookie (rola após paint)
    await page.waitForFunction(() => document.cookie.includes("aegis_cp=1"));
    const cookies = await page.context().cookies();
    const cpCookie = cookies.find((c) => c.name === "aegis_cp");
    expect(cpCookie?.value).toBe("1");
    // Simula navegação interna sem ?cp=1 (Link nativo do Workshop)
    await page.goto("/workshop/some-app-id/edit");
    // Mesmo sem ?cp=1 na URL, ainda cp mode (cookie carregando)
    await expect(page.getByTestId("cp-sidebar")).toBeVisible();
    await expect(page.getByTestId("header")).toHaveCount(0);
    await expect(page.getByTestId("sidenav")).toHaveCount(0);
  });

  test("Acesso direto a sub-rota sem cookie → chrome normal", async ({ page }) => {
    await login(page);
    // Garante que não há cookie aegis_cp
    await page.context().clearCookies({ name: "aegis_cp" });
    await page.goto("/workshop/some-app-id/edit");
    await expect(page.getByTestId("header")).toBeVisible();
    await expect(page.getByTestId("sidenav")).toBeVisible();
    await expect(page.getByTestId("cp-sidebar")).toHaveCount(0);
  });

  test("Voltar ao AEGIS limpa cookie aegis_cp", async ({ page }) => {
    await login(page);
    await page.goto("/painel-de-controle");
    await page.getByTestId("cp-nav-apps").click(); // entra em cp mode (cookie set)
    await page.waitForURL("**/workshop?cp=1");
    // Volta pro painel
    await page.goto("/painel-de-controle");
    await page.getByTestId("cp-footer-back").click(); // "Voltar ao AEGIS"
    await page.waitForURL("**/");
    // Cookie aegis_cp deve estar limpo
    const cookies = await page.context().cookies();
    const cpCookie = cookies.find((c) => c.name === "aegis_cp");
    expect(cpCookie?.value ?? '').not.toBe("1");
    // E chrome global voltou
    await expect(page.getByTestId("header")).toBeVisible();
    await expect(page.getByTestId("sidenav")).toBeVisible();
  });
});
