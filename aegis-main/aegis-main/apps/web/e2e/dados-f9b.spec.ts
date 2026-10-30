/**
 * E2E · F9b — Publish/Versioning (gate real, paridade n8n).
 *
 * O operador PROMOVE o rascunho ao que roda em produção. Gesto certificado AO VIVO:
 *   1. board novo nasce RASCUNHO (badge "Rascunho" + botão Publicar);
 *   2. Publicar → "Publicado · v1" (servidor: is_published + published_version_number=1);
 *   3. editar o rascunho → badge "vN · alterações não publicadas" + Publicar reaparece;
 *   4. Republicar → v2; o popover Versões lista v2 (ativa) + v1;
 *   5. Restaurar v1 → rascunho reverte (publicado segue v2 = dirty);
 *   6. Despublicar → volta a Rascunho (servidor: is_published=false).
 *
 * Régua: estado provado no SERVIDOR (expect.poll sobre GET /pipeline/{id}).
 * A prova do GATE em si (agendado/webhook roda o publicado, não o rascunho, e
 * fail-closed) está no pytest test_pipeline_publish_versioning.
 */
import { test, expect, type Page } from "@playwright/test";

import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

async function seedBoard(page: Page, tag: string) {
  const ds = `e2e_f9b_${tag}`;
  const begin = await page.request.post(`/api/datasets/${ds}/transactions`, {
    data: { kind: "SNAPSHOT", branch: "main" },
  });
  expect(begin.ok(), `begin tx → ${begin.status()}`).toBeTruthy();
  const tx = await begin.json();
  const commit = await page.request.post(
    `/api/datasets/${ds}/transactions/${tx.id}/commit`,
    { data: { input_payload: { payload: { rows: [{ g: "G1", a: "1" }] } } } },
  );
  expect(commit.ok(), `commit tx → ${commit.status()}`).toBeTruthy();
  const mk = await page.request.post(`/api/platform/v23/pipeline`, {
    data: {
      slug: `e2e-f9b-${tag}`, display_name: `E2E F9b ${tag}`,
      graph: {
        nodes: [
          { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
          { id: "flt", op: "filter", config: { op: "filter", args: { where: { g: "G1" } } }, position: { x: 360, y: 160 } },
        ],
        edges: [{ from: "src", to: "flt" }],
      },
    },
  });
  expect(mk.ok(), `create board → ${mk.status()}`).toBeTruthy();
  return { ds, board: await mk.json() as { id: string } };
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

// Edita o RASCUNHO no servidor (troca o filtro) — simula um Salvar do operador.
async function editDraft(page: Page, boardId: string, ds: string) {
  const put = await page.request.put(`/api/platform/v23/pipeline/${boardId}`, {
    data: {
      graph: {
        nodes: [
          { id: "src", op: "source", config: { dataset: ds }, position: { x: 60, y: 160 } },
          { id: "flt", op: "filter", config: { op: "filter", args: { where: { g: "G2" } } }, position: { x: 360, y: 160 } },
        ],
        edges: [{ from: "src", to: "flt" }],
      },
    },
  });
  expect(put.ok(), `edit draft → ${put.status()}`).toBeTruthy();
}

async function serverBoard(page: Page, boardId: string) {
  return (await (await page.request.get(`/api/platform/v23/pipeline/${boardId}`)).json()) as {
    is_published: boolean; published_version_number: number | null; is_dirty: boolean;
  };
}

test.describe("F9b — Publish/Versioning", () => {
  test("Publicar/editar/Republicar/Restaurar/Despublicar (gate real)", async ({ page }) => {
    test.setTimeout(150_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1680, height: 900 });
    const tag = `${Date.now()}`;
    const { ds, board } = await seedBoard(page, tag);

    // 1. Board novo = RASCUNHO.
    await openBoard(page, board.id);
    await expect(page.getByTestId("pb-publish-status")).toContainText(/Rascunho/i);
    await expect(page.getByTestId("pb-publish-btn")).toBeVisible();

    // 2. Publicar → v1 (badge + servidor).
    await page.getByTestId("pb-publish-btn").click();
    await expect(page.getByTestId("pb-publish-status")).toContainText(/Publicado.*v1/i);
    await expect(page.getByTestId("pb-publish-btn")).toHaveCount(0);
    await expect.poll(async () => {
      const b = await serverBoard(page, board.id);
      return b.is_published ? b.published_version_number : null;
    }, { timeout: 15000 }).toBe(1);

    // 3. Editar o rascunho → dirty + Publicar reaparece.
    await editDraft(page, board.id, ds);
    await openBoard(page, board.id);
    await expect(page.getByTestId("pb-publish-status")).toContainText(/não publicad/i);
    await expect(page.getByTestId("pb-publish-btn")).toBeVisible();

    // 4. Republicar → v2; popover lista v2 (ativa) + v1.
    await page.getByTestId("pb-publish-btn").click();
    await expect(page.getByTestId("pb-publish-status")).toContainText(/Publicado.*v2/i);
    await page.getByTestId("pb-versions-btn").click();
    await expect(page.getByTestId("pb-versions-pop")).toBeVisible();
    await expect(page.getByTestId("pb-version-2")).toContainText(/ativa/i);
    await expect(page.getByTestId("pb-version-1")).toBeVisible();

    // 5. Restaurar v1 → rascunho reverte; publicado segue v2 → dirty.
    await page.getByTestId("pb-version-restore-1").click();
    await expect(page.getByTestId("pb-publish-status")).toContainText(/não publicad/i);
    await expect.poll(async () => (await serverBoard(page, board.id)).published_version_number,
      { timeout: 10000 }).toBe(2);   // publicado inalterado pelo restore

    // 6. Despublicar → Rascunho (servidor: não publicado).
    await page.getByTestId("pb-versions-btn").click();
    await page.getByTestId("pb-unpublish-btn").click();
    await expect(page.getByTestId("pb-publish-status")).toContainText(/Rascunho/i);
    await expect.poll(async () => (await serverBoard(page, board.id)).is_published,
      { timeout: 10000 }).toBe(false);

    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
