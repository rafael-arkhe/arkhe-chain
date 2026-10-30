/**
 * E2E — screenshot da HOME do câmara (inicio-itapetininga) pra inspecionar o widget
 * de GARGALOS em CARDS (com tendência ano-a-ano, atendimento, quem cobra, bairros,
 * evidências). Gera gargalos-cards.png.
 */
import { test } from "@playwright/test";
import { login } from "./helpers/login";

test("home câmara: gargalos em cards", async ({ page }) => {
  test.setTimeout(120_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await login(page);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/paginas/inicio-itapetininga/view");
  await page.waitForTimeout(9000); // widgets + dados carregam
  await page.screenshot({ path: "gargalos-cards.png", fullPage: true });
  console.log("PAGE_ERRORS=", JSON.stringify(errs));
  console.log("HOME_SCREENSHOT_OK");
});
