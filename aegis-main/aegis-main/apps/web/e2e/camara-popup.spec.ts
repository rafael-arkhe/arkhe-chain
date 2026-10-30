/**
 * E2E — popup RICO ao clicar num requerimento no mapa da home. Dá zoom até os pontos
 * desagruparem, clica alguns pontos perto do centro (downtown denso) e captura o popup
 * (deve trazer Nº/categoria/autor/situação/ementa/local + link SISCAM). Gera camara-popup.png.
 */
import { test } from "@playwright/test";
import { login } from "./helpers/login";

test("home câmara: popup rico do marcador", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/paginas/inicio-itapetininga/view");
  await page.waitForTimeout(12000);

  const zoomIn = page.locator(".mapboxgl-ctrl-zoom-in").first();
  // 2 zooms: passa do clusterMaxZoom (14) mas mantém os pontos DENSOS no core (fácil de acertar).
  for (let i = 0; i < 2; i++) {
    if (await zoomIn.count()) await zoomIn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(1400);
  }

  const canvas = page.locator("canvas.mapboxgl-canvas").first();
  const b = await canvas.boundingBox();
  let got = false;
  if (b) {
    // Varre uma grade densa sobre o CORE (metade central) — lá a densidade de pontos é
    // altíssima, então quase todo clique acerta um requerimento. Sai no 1º popup.
    const x0 = b.x + b.width * 0.42, x1 = b.x + b.width * 0.62;
    const y0 = b.y + b.height * 0.35, y1 = b.y + b.height * 0.7;
    for (let y = y0; y <= y1 && !got; y += 14) {
      for (let x = x0; x <= x1 && !got; x += 14) {
        await page.mouse.click(x, y);
        await page.waitForTimeout(90);
        if (await page.locator(".mapboxgl-popup-content").count()) got = true;
      }
    }
  }
  const popupTxt = got ? await page.locator(".mapboxgl-popup-content").first().innerText().catch(() => "") : "";
  console.log("POPUP_FOUND=", got);
  console.log("POPUP_TEXT=", JSON.stringify(popupTxt).slice(0, 500));
  await page.screenshot({ path: "camara-popup.png" });
});
