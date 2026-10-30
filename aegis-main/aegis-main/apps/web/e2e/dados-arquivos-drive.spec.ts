/**
 * E2E · Aba Arquivos = GOOGLE DRIVE (frente 2, feedback do operador
 * 2026-07-06: "quero essa aba EXATAMENTE COMO UM GOOGLE DRIVE").
 *
 * O gesto completo do operador AO VIVO, num só fluxo:
 *   Nova pasta → entrar → enviar arquivo NA pasta (upload imediato) →
 *   renomear via menu "..." → BUSCA acha e navega até a pasta →
 *   preview GRANDE (lightbox) + download com conteúdo exato →
 *   mover para a raiz (diálogo com dropdowns reais) → alternar p/ LISTA →
 *   excluir com confirmação → some.
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

test.describe("Arquivos — UX Google Drive completa", () => {
  test("pasta → upload na pasta → renomear → buscar → lightbox → mover → lista → excluir", async ({ page }) => {
    test.setTimeout(240_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `drv${Date.now()}`;
    const mk = await page.request.post(`/api/platform/v23/media/sets`, {
      data: { slug: `e2e-${tag}`, display_name: `E2E Drive ${tag}`, media_type: "mixed" },
    });
    expect(mk.ok(), `create set → ${mk.status()}`).toBeTruthy();

    await page.goto("/painel-de-controle/dados?aba=arquivos");
    await expect(page.getByTestId("md-list")).toBeVisible({ timeout: 45000 });
    await page.getByTestId(`md-item-e2e-${tag}`).click();
    await expect(page.getByTestId("md-toolbar")).toBeVisible({ timeout: 15000 });

    // ── 1. Nova pasta via + Novo (promptModal, nunca diálogo nativo) ────
    await page.getByTestId("md-new").click();
    await page.getByTestId("md-new-folder").click();
    await page.getByTestId("prompt-input").fill("Operações");
    await page.getByTestId("prompt-ok").click();
    const folderTile = page.getByTestId("md-folder-operacoes");
    await expect(folderTile).toBeVisible({ timeout: 15000 });

    // ── 2. entrar na pasta (duplo-clique) → breadcrumb ──────────────────
    await folderTile.dblclick();
    await expect(page.getByTestId("md-crumb-0")).toHaveText("Operações");

    // ── 3. upload IMEDIATO dentro da pasta ─────────────────────────────
    const conteudo = `laudo ${tag}\ncorpo do laudo\n`;
    await page.getByTestId("md-upload-input").setInputFiles({
      name: `laudo-${tag}.txt`, mimeType: "text/plain",
      buffer: Buffer.from(conteudo, "utf-8"),
    });
    await expect(page.getByTestId("md-upload-tray")).toBeVisible({ timeout: 15000 });
    const card = page.locator('[data-testid^="md-card-"]').first();
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(card).toContainText(`laudo-${tag}.txt`);

    // ── 4. renomear via menu "..." ──────────────────────────────────────
    await card.hover();
    await page.locator('[data-testid^="md-menu-"]').first().click();
    await page.getByTestId("md-menu-rename").click();
    await page.getByTestId("prompt-input").fill(`laudo-final-${tag}.txt`);
    await page.getByTestId("prompt-ok").click();
    await expect(page.getByText(`laudo-final-${tag}.txt`).first()).toBeVisible({ timeout: 15000 });

    // ── 5. busca tenant-wide acha e NAVEGA até a pasta ─────────────────
    await page.getByTestId("md-crumb-root").click(); // sai da pasta p/ provar a navegação
    await page.getByTestId("md-search").fill(`laudo-final-${tag}`);
    const hit = page.locator('[data-testid^="md-hit-"]').first();
    await expect(hit).toBeVisible({ timeout: 15000 });
    await expect(hit).toContainText(`laudo-final-${tag}.txt`);
    await hit.click();
    await expect(page.getByTestId("md-crumb-0")).toHaveText("Operações", { timeout: 15000 });

    // ── 6. preview GRANDE (lightbox) + download com conteúdo exato ─────
    await page.locator('[data-testid^="md-card-"]').first().dblclick();
    await expect(page.getByTestId("md-lightbox")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("md-lb-name")).toContainText(`laudo-final-${tag}.txt`);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByTestId("md-lb-download").click(),
    ]);
    const path = await download.path();
    const fs = await import("fs");
    expect(fs.readFileSync(path!, "utf-8")).toBe(conteudo);
    await page.getByTestId("md-lb-close").click();
    await expect(page.getByTestId("md-lightbox")).not.toBeVisible();

    // ── 7. mover para a RAIZ (dropdowns reais, nunca ID digitado) ──────
    await page.locator('[data-testid^="md-card-"]').first().hover();
    await page.locator('[data-testid^="md-menu-"]').first().click();
    await page.getByTestId("md-menu-move").click();
    await expect(page.getByTestId("md-move-dialog")).toBeVisible();
    await page.getByTestId("md-move-folder").selectOption("/");
    await page.getByTestId("md-move-ok").click();
    await expect(page.getByTestId("md-move-dialog")).not.toBeVisible({ timeout: 15000 });
    await page.getByTestId("md-crumb-root").click();
    await expect(page.getByText(`laudo-final-${tag}.txt`).first()).toBeVisible({ timeout: 15000 });

    // ── 8. LISTA com colunas + ordenação visível ────────────────────────
    await page.getByTestId("md-view-list").click();
    const row = page.locator('[data-testid^="md-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(`laudo-final-${tag}.txt`);
    await expect(page.getByTestId("md-sort-name")).toBeVisible();

    // ── 9. excluir com confirmação → some ──────────────────────────────
    await row.hover();
    await page.locator('[data-testid^="md-menu-"]').first().click();
    await page.getByTestId("md-menu-delete").click();
    await page.getByTestId("confirm-ok").click();
    await expect(page.getByText(`laudo-final-${tag}.txt`)).toHaveCount(0, { timeout: 15000 });

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
