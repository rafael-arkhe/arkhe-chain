/**
 * E2E — HOME do câmara (inicio-itapetininga) COM o mapa Mapbox (heatmap + clusters)
 * no topo, sem os indicadores, gargalos/demandas/autores em cards e a tabela com
 * situação colorida. Gera camara-home-map.png (fullPage) + camara-home-mapa.png (só o mapa).
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

test("home câmara: mapa heatmap + cards + tabela ativada", async ({ page }) => {
  test.setTimeout(150_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await login(page);
  await page.setViewportSize({ width: 1680, height: 1180 });
  await page.goto("/paginas/inicio-itapetininga/view");
  // Mapbox baixa tiles + resolve o object set + pinta heatmap/clusters — dá tempo.
  await page.waitForTimeout(15000);

  // O mapa deve ter montado um canvas do MapboxGL.
  const canvas = page.locator("canvas.mapboxgl-canvas");
  const hasMap = (await canvas.count()) > 0;
  console.log("MAPBOX_CANVAS=", hasMap);

  await page.screenshot({ path: "camara-home-map.png", fullPage: true });
  // Recorte só do topo (o mapa) pra inspecionar heatmap/clusters de perto.
  if (hasMap) {
    try {
      await canvas.first().screenshot({ path: "camara-home-mapa.png" });
    } catch (e) {
      console.log("MAP_CROP_ERR=", String(e));
    }
  }
  // Rola até a tabela de requerimentos e a recorta (confere a situação colorida).
  const tabTitle = page.getByText("a prova por trás dos gargalos", { exact: false }).first();
  if (await tabTitle.count()) {
    await tabTitle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "camara-home-tabela.png" });
  }
  console.log("PAGE_ERRORS=", JSON.stringify(errs));
  console.log("HOME_MAP_SCREENSHOT_OK");
});
