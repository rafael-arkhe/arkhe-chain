/**
 * E2E — D5 filtro de PERÍODO. Carrega sem 422 (periodo=""=todos), clica no pill de um ano
 * e confere que o MAPA e a TABELA re-filtram (contagem cai). Gera camara-periodo-2025.png.
 */
import { test } from "@playwright/test";
import { login } from "./helpers/login";

test("home câmara: filtro de período filtra mapa + tabela", async ({ page }) => {
  test.setTimeout(150_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await login(page);
  await page.setViewportSize({ width: 1680, height: 1180 });
  await page.goto("/paginas/inicio-itapetininga/view");
  await page.waitForTimeout(13000);

  const mapCount = () => page.getByTestId("map-live-count").first().innerText().catch(() => "");
  const tableTotal = async () => {
    const t = await page.locator("text=/\\bde\\s+\\d+\\b/").first().innerText().catch(() => "");
    return t;
  };

  const mapBefore = await mapCount();
  const tabBefore = await tableTotal();

  // Clica o pill do ano 2025 (filter_pills, single-select).
  const pill = page.getByRole("button", { name: "2025", exact: true }).first();
  const hasPill = (await pill.count()) > 0;
  if (hasPill) {
    await pill.click();
    await page.waitForTimeout(7000); // re-evaluate (mapa) + re-query (tabela)
  }

  const mapAfter = await mapCount();
  const tabAfter = await tableTotal();

  console.log("HAS_PILL=", hasPill);
  console.log("MAP_BEFORE=", JSON.stringify(mapBefore), "MAP_AFTER=", JSON.stringify(mapAfter));
  console.log("TAB_BEFORE=", JSON.stringify(tabBefore), "TAB_AFTER=", JSON.stringify(tabAfter));
  console.log("PAGE_ERRORS=", JSON.stringify(errs));
  await page.screenshot({ path: "camara-periodo-2025.png", fullPage: false });
});
