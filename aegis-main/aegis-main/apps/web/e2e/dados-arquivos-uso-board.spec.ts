/**
 * E2E · Arquivos⇄DAG frente 4 — cada arquivo lista QUAIS boards o usam.
 *
 * O gesto do operador: um board do DAG lê o arquivo (nó extract_file) →
 * na aba Arquivos, os Detalhes do arquivo mostram "Fluxos que usam" com o
 * board → o clique DEEP-LINKA pro canvas com o board ABERTO (espelho do
 * "Usado por" do dataset-browser).
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

test.describe("Arquivos — uso por board + deep-link canvas", () => {
  test("board com extract_file aparece em 'Fluxos que usam' e abre no canvas", async ({ page }) => {
    test.setTimeout(240_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });

    const tag = `uso${Date.now()}`;
    // conjunto + arquivo REAL via API (multipart → MinIO)
    const mk = await page.request.post(`/api/platform/v23/media/sets`, {
      data: { slug: `e2e-${tag}`, display_name: `E2E Uso ${tag}`, media_type: "mixed" },
    });
    expect(mk.ok(), `create set → ${mk.status()}`).toBeTruthy();
    const up = await page.request.post(`/api/platform/v23/media/sets/${(await mk.json()).id}/items/upload`, {
      multipart: {
        file: { name: `alvo-${tag}.csv`, mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2\n", "utf-8") },
      },
    });
    expect(up.ok(), `upload → ${up.status()}`).toBeTruthy();

    // board do DAG que LÊ o arquivo (extract_file por slug+filename)
    const boardName = `E2E Consome ${tag}`;
    const mkb = await page.request.post(`/api/platform/v23/pipeline`, {
      data: {
        slug: `e2e-uso-${tag}`,
        display_name: boardName,
        graph: {
          nodes: [
            { id: "t1", op: "trigger", config: { trigger: "manual" } },
            { id: "x1", op: "transform", config: { op: "extract_file", args: { media_set: `e2e-${tag}`, item: `alvo-${tag}.csv`, format: "csv" } } },
          ],
          edges: [{ from: "t1", to: "x1" }],
        },
      },
    });
    expect(mkb.ok(), `create board → ${mkb.status()}`).toBeTruthy();
    const board = (await mkb.json()) as { id: string };

    // ── aba Arquivos: selecionar o arquivo → Detalhes listam o board ────
    await page.goto("/painel-de-controle/dados?aba=arquivos");
    await expect(page.getByTestId("md-list")).toBeVisible({ timeout: 45000 });
    await page.getByTestId(`md-item-e2e-${tag}`).click();
    await expect(page.getByTestId("md-toolbar")).toBeVisible({ timeout: 15000 });
    await page.locator('[data-testid^="md-card-"]').first().click();
    await expect(page.getByTestId("md-preview")).toBeVisible({ timeout: 15000 });

    const usageLink = page.getByTestId(`md-usage-${board.id}`);
    await expect(usageLink).toBeVisible({ timeout: 20000 });
    await expect(usageLink).toContainText(boardName);
    await expect(page.getByTestId("md-usage")).toContainText("Lê");

    // ── deep-link: clique abre o board NO CANVAS (aba pipelines). O nome
    // do board não é texto no canvas — a prova de que é O NOSSO board é o
    // nó extract_file apontando pro arquivo específico. ─────────────────
    await usageLink.click();
    await expect(page).toHaveURL(new RegExp(`aba=pipelines&board=${board.id}`), { timeout: 15000 });
    await expect(page.getByText(`ler arquivo · alvo-${tag}.csv`).first()).toBeVisible({ timeout: 60000 });

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
