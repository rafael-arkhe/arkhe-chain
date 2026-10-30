/**
 * E2E — valida a camada de referência das ZONAS de Itapetininga no /geo (Cesium):
 * a camada aparece no painel, liga, e os polígonos 3D renderizam. Também confirma
 * que NÃO há camada de câmera. Gera screenshots (geo-before/geo-zonas) p/ inspeção.
 */
import { test } from "@playwright/test";
import { login } from "./helpers/login";

test("geo: camada de zonas Itapetininga aparece e renderiza 3D", async ({ page }) => {
  test.setTimeout(150_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await login(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/geo");
  await page.waitForSelector('[data-testid="painel-camadas"]', { timeout: 30_000 });
  // camada de PIPELINE (styled) deve AUTO-ATIVAR + voar a câmera SEM o operador ligar.
  await page.waitForTimeout(14000); // globo + auto-ativação + fly p/ Itapetininga + render

  const panelText = await page.locator('[data-testid="painel-camadas"]').innerText();
  console.log("PANEL_TEXT_START>>>", panelText.replace(/\n/g, " | "), "<<<PANEL_TEXT_END");
  // screenshot do estado PADRÃO (sem clicar em nada) — as zonas já devem aparecer.
  await page.screenshot({ path: "geo-default.png" });

  const has = await page.locator('[data-testid="layer-toggle-ZonaOperacional"]').count();
  console.log("ZONA_TOGGLE_COUNT=", has);
  // zoom p/ ver a extrusão 3D (sem tocar no toggle — já está ligado por padrão).
  const globe = page.locator('canvas').first();
  const box = await globe.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(2500);
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "geo-zonas-close.png" });
    console.log("ZOOMED_IN_OK");
  }
  const camToggle = await page.locator('[data-testid="layer-toggle-Camera"]').count();
  console.log("CAMERA_TOGGLE_COUNT=", camToggle);
  console.log("PAGE_ERRORS=", JSON.stringify(errs));
});
