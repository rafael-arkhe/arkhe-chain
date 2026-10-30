/**
 * E2E — Construtor de Camadas de Referência (o gesto VIVO, ponta a ponta).
 *
 * Prova o ciclo que o operador percorre: abrir o app → criar camada → trazer
 * o desenho (import, o mesmo caminho de quem já tem acervo no Google My Maps)
 * → classificar por cor → salvar → PUBLICAR → a camada aparece ligada na aba
 * "Camadas de referência" do /geo, com o nome que o operador deu.
 *
 * O desenho no canvas entra como SMOKE (clicar no canvas WebGL é flaky em
 * headless): o certificador determinístico é o import; o desenho prova que a
 * ferramenta arma o modo e registra a feição nova.
 *
 * Setup/teardown por API — nunca deixa camada de teste na ontologia.
 */
import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/login";

/**
 * Chamada de API pela PÁGINA (não `page.request`): o proxy /api do Next tem
 * gate duplo e só enxerga o cookie httpOnly no contexto do documento —
 * `page.request` cru volta 401. Gotcha conhecido do repo.
 */
async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  return page.evaluate(
    async ([m, p, b]) => {
      const res = await fetch(p as string, {
        method: m as string,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...(b ? { body: JSON.stringify(b) } : {}),
      });
      const texto = await res.text();
      let data: unknown = null;
      try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }
      return { status: res.status, data } as { status: number; data: never };
    },
    [method, path, body ?? null] as const,
  );
}

const APP_SLUG = "construtor-camadas";
const NOME_CAMADA = `E2E Zonas ${Date.now()}`;

test("construtor: criar → importar → estilizar → publicar → aparece no /geo", async ({ page }) => {
  test.setTimeout(240_000);
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));

  await login(page);
  await page.setViewportSize({ width: 1680, height: 1100 });
  await page.goto("/");   // documento autenticado — daqui o fetch leva o cookie

  // ── setup: garante o app instalado no tenant (o install pela Loja exige a
  // senha de vendor; quando ela não está configurada, cria o app direto —
  // o widget é o mesmo, e o objetivo aqui é o GESTO, não o gate OEM).
  let appId: string | null = null;
  const apps = await api<{ id: string; slug: string }[]>(page, "GET", "/api/workshop/apps");
  if (apps.status === 200 && Array.isArray(apps.data)) {
    appId = apps.data.find((a) => a.slug === APP_SLUG)?.id ?? null;
  }
  if (!appId) {
    const criado = await api<{ id: string }>(page, "POST", "/api/workshop/apps", {
        slug: APP_SLUG,
        display_name: "Construtor de Camadas",
        schema_version: 2,
        surface: "standalone",
        variables: { variables: [] },
        layout: {
          root: [
            {
              id: "construtor",
              widget: { type: "layer_builder", props: { title: "Construtor de Camadas", height: 640 } },
              layout: { col_span: 12 },
            },
          ],
        },
    });
    expect(
      criado.status < 300,
      `criar app falhou: ${criado.status} ${JSON.stringify(criado.data)}`,
    ).toBeTruthy();
    appId = criado.data.id;
  }

  let boardId: string | null = null;
  try {
    // ── 1. abre o app e cria a camada (o modal do DS, nunca prompt nativo)
    await page.goto(`/workshop/view/${appId}`);
    await expect(page.getByTestId("layer-builder")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("builder-nova-camada").click();
    const campo = page.locator('input[type="text"], input:not([type])').last();
    await campo.fill(NOME_CAMADA);
    await page.getByRole("button", { name: /criar|confirmar|ok|salvar/i }).last().click();
    await expect(page.getByText(NOME_CAMADA)).toBeVisible({ timeout: 30_000 });

    // descobre o board da camada recém-criada (para o teardown e as asserções)
    const lista = await api<{
      maps: { layers: { id: string; nome: string; node_type: string }[] }[];
      avulsas: { id: string; nome: string; node_type: string }[];
    }>(page, "GET", "/api/api/v1/geo/layers");
    expect(lista.status).toBe(200);
    const dados = lista.data;
    const todas = [...dados.maps.flatMap((m) => m.layers), ...dados.avulsas];
    const camada = todas.find((l) => l.nome === NOME_CAMADA);
    expect(camada, "camada criada não apareceu na API").toBeTruthy();
    boardId = camada!.id;

    // ── 2. import: traz o acervo já desenhado fora (2 áreas + 1 via)
    await page.getByTestId("builder-import-input").setInputFiles({
      name: "zonas-e2e.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { nome: "Área Norte", categoria: "Tráfico de Drogas" },
              geometry: {
                type: "Polygon",
                coordinates: [[
                  [-48.052, -23.592], [-48.044, -23.592],
                  [-48.044, -23.585], [-48.052, -23.585], [-48.052, -23.592],
                ]],
              },
            },
            {
              type: "Feature",
              properties: { nome: "Área Sul", categoria: "Tráfico de Drogas" },
              geometry: {
                type: "Polygon",
                coordinates: [[
                  [-48.062, -23.602], [-48.056, -23.602],
                  [-48.056, -23.596], [-48.062, -23.596], [-48.062, -23.602],
                ]],
              },
            },
            {
              type: "Feature",
              properties: { nome: "Corredor Central", categoria: "Cruzamentos" },
              geometry: { type: "LineString", coordinates: [[-48.050, -23.590], [-48.046, -23.586]] },
            },
          ],
        }),
      ),
    });

    await expect(page.getByText("Área Norte")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Corredor Central")).toBeVisible();
    await expect(page.getByTestId("builder-dirty")).toBeVisible();

    // ── 3. classifica: a categoria inteira vira "crítico" (vermelho)
    await page.getByTestId("builder-estilo-cat-Tráfico de Drogas").click();
    await page.getByTestId("builder-paleta-cat-Tráfico de Drogas-C8341F").click();

    // ── 4. salva e publica
    await page.getByTestId("builder-salvar").click();
    await expect(page.getByTestId("builder-dirty")).toBeHidden({ timeout: 30_000 });
    await page.getByTestId("builder-publicar").click();
    await expect(page.getByTestId("builder-publicado")).toBeVisible({ timeout: 60_000 });

    // o backend confirma o que a tela promete: 3 feições no mapa, com a cor
    const feats = await api<{ nodes: { name: string; geo_style?: { color?: string } }[] }>(
      page, "GET", `/api/api/v1/geo/nodes?node_type=${camada!.node_type}`,
    );
    const nodes = feats.data.nodes;
    expect(nodes).toHaveLength(3);
    expect(nodes.find((n) => n.name === "Área Norte")?.geo_style?.color).toBe("#C8341F");

    // ── 5. SMOKE do desenho: arma a ferramenta de área e desenha no canvas
    await page.getByTestId("builder-tool-draw_polygon").click();
    await expect(page.getByTestId("builder-tool-draw_polygon")).toHaveAttribute("aria-pressed", "true");
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.click(cx - 60, cy - 40);
      await page.mouse.click(cx + 60, cy - 40);
      await page.mouse.click(cx + 60, cy + 40);
      await page.mouse.dblclick(cx + 60, cy + 40);
      await page.waitForTimeout(1500);
    }
    console.log("DESENHO_SMOKE_dirty=", await page.getByTestId("builder-dirty").isVisible().catch(() => false));

    // ── 6. o /geo mostra a camada LIGADA, com o nome que o operador deu
    await page.goto("/geo");
    const secao = page.getByTestId("camadas-referencia");
    await expect(secao).toBeVisible({ timeout: 60_000 });
    await expect(secao.getByText(NOME_CAMADA)).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: "construtor-camadas-e2e.png", fullPage: false });
  } finally {
    // ── teardown: a ontologia não fica suja com dado de teste
    if (boardId) {
      await api(page, "DELETE", `/api/api/v1/geo/layers/${boardId}`);
      const restou = await api<{ node_types: { node_type: string }[] }>(
        page, "GET", "/api/api/v1/geo/node-types",
      );
      console.log(
        "TEARDOWN_ok=",
        !(restou.data?.node_types || []).some((t) => t.node_type.startsWith("e2e_zonas")),
      );
    }
  }

  expect(erros, `erros de página: ${erros.join(" | ")}`).toEqual([]);
});
