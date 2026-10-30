/**
 * E2E · Onda 0 — gating do hub /dados (cert ao vivo via Playwright CLI).
 *
 * #3 (over-gate morto) + #5 (sidenav anyPerm): o hub deixou de ter um gate ÚNICO
 * (`data.datasets.read`) que escondia tudo de quem só tinha a perm de uma aba. Agora
 * cada aba some se o usuário não tem a SUA perm, e o item de sidenav "Dados" aparece p/
 * quem tem QUALQUER perm de dados.
 *
 * O teste é AUTO-VERIFICÁVEL: lê as permissões REAIS do principal (retorno do login) e
 * assere que cada aba aparece se-e-somente-se o usuário tem a perm — o código ANTIGO
 * mostrava as 7 abas sempre (só o conteúdo era gateado), então este assert distingue.
 */
import { test, expect } from "@playwright/test";

import { login, type WhoAmI } from "./helpers/login";

// Espelha app/painel-de-controle/dados/page.tsx (TABS) — aba → perm.
const TAB_PERM: Record<string, string> = {
  conexoes: "connectors.manage",
  provedores: "compute.providers.read",
  modelos: "aip.models.read",
  pipelines: "data.pipelines.read",
  datasets: "data.datasets.read",
  arquivos: "data.media.read",
  marcacoes: "markings.read",
};

function has(me: WhoAmI | null, perm: string): boolean {
  return !!me && (me.roles.includes("admin") || me.permissions.includes(perm));
}

test.describe("Onda 0 · gating do hub /dados", () => {
  test("#5 sidenav 'Dados' visível (admin) + href correto", async ({ page }) => {
    await login(page); // admin (default)
    await page.goto("/painel-de-controle");
    const dados = page.getByTestId("cp-nav-dados");
    await expect(dados).toBeVisible();
    await expect(dados).toHaveAttribute("href", "/painel-de-controle/dados");
  });

  test("Onda 2 · NAV_CLUSTERS 'dados' — item ativo em /dados mesmo com query/sub-rota", async ({ page }) => {
    await login(page);
    // O cluster torna o active-state baseado em ROTA: o ?aba=/?board= não desliga o item.
    await page.goto("/painel-de-controle/dados?aba=datasets");
    await expect(page.getByTestId("cp-nav-dados")).toHaveAttribute("aria-current", "page");
  });

  test("#3 admin vê as 7 abas, sem 'Sem permissão', sem crash de console", async ({ page }) => {
    const fatal: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /TypeError|ReferenceError|is not a function|Cannot read|Unhandled/.test(m.text())) {
        fatal.push(m.text());
      }
    });
    await login(page); // admin
    await page.goto("/painel-de-controle/dados");
    await expect(page.getByRole("heading", { name: "Dados" })).toBeVisible();
    for (const tab of Object.keys(TAB_PERM)) {
      await expect(page.getByTestId(`acervo-item-${tab}`)).toBeVisible();
    }
    await expect(page.getByText("Sem permissão para este recurso.")).toHaveCount(0);
    expect(fatal, `erros fatais de console: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("#3 abas espelham as perms REAIS do usuário (ferreira) — abas sem perm SOMEM", async ({ page }) => {
    const me = await login(page, { username: "ferreira", password: "CertPass-2026!" });
    expect(me, "login ferreira falhou").not.toBeNull();
    await page.goto("/painel-de-controle/dados");
    // hub renderiza (não bloqueado por over-gate) — ao menos as abas que ela tem aparecem
    let anyVisible = false;
    for (const [tab, perm] of Object.entries(TAB_PERM)) {
      const loc = page.getByTestId(`acervo-item-${tab}`);
      if (has(me, perm)) {
        await expect(loc, `seção '${tab}' deveria aparecer (tem ${perm})`).toBeVisible();
        anyVisible = true;
      } else {
        await expect(loc, `seção '${tab}' NÃO deveria aparecer (sem ${perm})`).toHaveCount(0);
      }
    }
    expect(anyVisible, "ferreira deveria ver ao menos uma seção de dados").toBeTruthy();
  });
});
