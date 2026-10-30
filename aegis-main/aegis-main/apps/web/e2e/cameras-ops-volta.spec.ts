/**
 * E2E · /cameras — a VOLTA de "Placas procuradas" + "Pipeline de detecções"
 * (ADD-alongside do §C C5; o gestor mantém as mesmas seções em /dados) +
 * o fix do bug original 2026-07-05: TEXTO BRANCO em modal branco (os modais
 * portalam pro <body> dark e herdavam a cor quase-branca).
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

test.describe("/cameras — hotlist + pipeline de volta + contraste dos modais", () => {
  test("drawer de placas/pipeline abre no cockpit; modal claro tem texto ESCURO", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    await page.goto("/cameras");
    await expect(page.getByTestId("mosaic-trigger")).toBeVisible({ timeout: 60000 });

    // ── 1. Placas procuradas DE VOLTA: drawer claro com a seção real ────
    await page.getByTestId("cam-ops-hotlist-btn").click();
    const drawer = page.getByTestId("cam-ops-drawer");
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await expect(drawer.getByTestId("hotlist-section")).toBeVisible({ timeout: 15000 });
    await expect(drawer.getByTestId("hotlist-plate-input")).toBeVisible();
    // o texto do drawer é ESCURO sobre superfície clara (não herda o dark)
    const drawerColor = await drawer.evaluate((el) => getComputedStyle(el).color);
    expect(drawerColor, `drawer herdou texto claro: ${drawerColor}`).not.toBe("rgb(230, 233, 238)");
    await page.getByTestId("cam-ops-drawer-close").click();
    await expect(drawer).not.toBeVisible();

    // ── 2. Pipeline de detecções DE VOLTA ────────────────────────────────
    await page.getByTestId("cam-ops-pipeline-btn").click();
    await expect(page.getByTestId("cam-ops-drawer")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("cam-ops-drawer").getByTestId("pipeline-section")).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape"); // ESC fecha o drawer
    await expect(page.getByTestId("cam-ops-drawer")).not.toBeVisible();

    // ── 3. BUG ORIGINAL (2026-07-05): modal claro com texto branco. O
    // editor de mosaico abre sem stream ativo — prova o fix do card root
    // (text-text-on-light): o input de NOME digitado tem cor ESCURA. ──────
    await page.getByTestId("mosaic-trigger").click();
    await page.getByTestId("mosaic-new").click();
    const modal = page.getByTestId("mosaic-editor-modal");
    await expect(modal).toBeVisible({ timeout: 15000 });
    const nameInput = page.getByTestId("mosaic-name-input");
    await nameInput.fill("Contraste OK");
    const inputColor = await nameInput.evaluate((el) => getComputedStyle(el).color);
    // a cor herdada do body dark era rgb(230, 233, 238) — o fix cascateia
    // text-text-on-light do card root (deve ser um tom ESCURO).
    const [r, g, b] = (inputColor.match(/\d+/g) || []).map(Number);
    expect(r + g + b, `texto do input ainda claro: ${inputColor}`).toBeLessThan(360);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
