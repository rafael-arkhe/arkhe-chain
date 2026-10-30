/**
 * Onda 0 Safe Tag — cert ao vivo do Delta 1 (vendor-hide do FALLBACK nav).
 *
 * O gesto do operador de campo (tenant `condominio-piloto`, role
 * `operador_campo`, `cp_nav_hidden=[buscar,browser]`): ao logar no
 * security-app, o item "Buscar" NÃO aparece no sidenav — a família OSINT
 * está escondida (não removida) para o vertical condomínio. Um item vizinho
 * que fica ("Mapa"/geo) prova que só o oculto sumiu, não a nav inteira.
 *
 * Requer o stack com AEGIS_SEED_SAFETAG=1 e o usuário semeado pela cert de
 * API (scratchpad/cert_onda0.py cria operador.portaria). Credenciais via env
 * E2E_SAFETAG_USER / E2E_SAFETAG_PASS (default = os da cert).
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

const USER = process.env.E2E_SAFETAG_USER || "operador.portaria";
const PASS = process.env.E2E_SAFETAG_PASS || "Portaria!Piloto2026x";

test("Onda 0: operador de campo NÃO vê 'Buscar' no sidenav (cp_nav_hidden)", async ({ page }) => {
  const fatal: string[] = [];
  page.on("pageerror", (e) => fatal.push(String(e)));

  const who = await login(page, { username: USER, password: PASS });
  expect(who, "login do operador de campo falhou").not.toBeNull();
  // pré-condições do seed, provadas pelo backend
  expect(who!.tenant?.slug).toBe("condominio-piloto");
  expect(who!.roles).toContain("operador_campo");

  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Âncora positiva: um item do FALLBACK que FICA visível prova que o
  // sidenav renderizou (senão o teste passaria por nav vazia). Espera o
  // shell hidratar (dev server pode compilar na 1ª visita).
  const mapa = page.getByRole("link", { name: /^Mapa$/ });
  await expect(mapa.first(), "item 'Mapa' (geo) deveria estar visível").toBeVisible({
    timeout: 90000,
  });

  // O gesto: 'Buscar' (/buscar, OSINT) está ESCONDIDO.
  const buscarLink = page.locator('a[href="/buscar"]');
  await expect(buscarLink, "'/buscar' NÃO deveria existir no nav do operador de campo").toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /^Buscar$/ }),
    "link 'Buscar' visível — cp_nav_hidden não aplicou",
  ).toHaveCount(0);

  expect(fatal, `erros de página: ${fatal.join("; ")}`).toHaveLength(0);
});
