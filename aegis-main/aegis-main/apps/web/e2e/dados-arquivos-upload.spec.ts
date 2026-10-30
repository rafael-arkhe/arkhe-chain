/**
 * E2E · Aba Arquivos (feedback do operador 2026-07-06) — o gesto que "não
 * funcionava": ENVIAR um arquivo de verdade, VISUALIZAR o conteúdo e BAIXAR.
 * Pós-frente 2 (UX Drive): o upload é IMEDIATO (seleção → tray de progresso,
 * sem botão "Enviar") e o CENTER é a superfície Drive (toolbar+breadcrumb).
 * Multipart → MinIO (file_io) → preview/download servidos pelo backend
 * (o browser nunca vê a uri interna s3://).
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

test.describe("Arquivos — upload de verdade + visualizar + baixar", () => {
  test("enviar arquivo → item lista com bytes → preview + download servem o conteúdo", async ({ page }) => {
    test.setTimeout(180_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `arq_${Date.now()}`;
    // conjunto novo via API (gesto de UI da criação já coberto pelo workspace)
    const mk = await page.request.post(`/api/platform/v23/media/sets`, {
      data: { slug: `e2e-${tag}`, display_name: `E2E Arquivos ${tag}`, media_type: "mixed" },
    });
    expect(mk.ok(), `create set → ${mk.status()}`).toBeTruthy();

    await page.goto("/painel-de-controle/dados?aba=arquivos");
    await expect(page.getByTestId("md-list")).toBeVisible({ timeout: 45000 });

    // abre o conjunto recém-criado → superfície Drive (toolbar)
    await page.getByTestId(`md-item-e2e-${tag}`).click();
    await expect(page.getByTestId("md-toolbar")).toBeVisible({ timeout: 15000 });

    // O GESTO: enviar um arquivo REAL — upload IMEDIATO (sem botão Enviar)
    const conteudo = `boletim ${tag}\nlinha 2 do arquivo\n`;
    await page.getByTestId("md-upload-input").setInputFiles({
      name: `boletim-${tag}.txt`, mimeType: "text/plain",
      buffer: Buffer.from(conteudo, "utf-8"),
    });
    await expect(page.getByTestId("md-upload-tray")).toBeVisible({ timeout: 15000 });

    // o item aparece na grade com o NOME real (não fantasma) — clique no CARD
    await expect(page.getByText(`boletim-${tag}.txt`).first()).toBeVisible({ timeout: 30000 });
    await page.locator('[data-testid^="md-card-"]').first().click();

    // VISUALIZAR: painel de detalhes com download habilitado
    await expect(page.getByTestId("md-preview")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("md-preview-download")).toBeVisible();

    // BAIXAR: o clique dispara um download com o conteúdo EXATO
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByTestId("md-preview-download").click(),
    ]);
    expect(download.suggestedFilename()).toContain(`boletim-${tag}`);
    const path = await download.path();
    const fs = await import("fs");
    expect(fs.readFileSync(path!, "utf-8")).toBe(conteudo);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
