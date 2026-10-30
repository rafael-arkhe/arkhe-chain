/**
 * E2E · Wave 3 — PACOTE ESSENCIAL. Cert AO VIVO: uma instalação nasce com a ESPINHA
 * de pé (não um DAG vazio). Os boards de fábrica (seed_pipelines, tag 'essencial')
 * expressam a inteligência das Waves 1-2 como pipelines EDITÁVEIS: cerca→alerta→
 * notificar (reactive) · evento→correlacionar vizinhos (correlate) · GeoJSON→mapa
 * (geopoint) · RAG por linha (aegis.embed). Prova: aparecem na lista, abrem, editam.
 *
 * Sem mudança de frontend: boards são DADO (seed no backend + init_db).
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/login";
import { expandAcervo } from "./helpers/acervo";

const ESSENTIAL = [
  // batch 1 (showcases das Waves 1-2)
  "essencial-cerca-alerta-notificar",
  "essencial-evento-correlacionar-vizinhos",
  "essencial-geojson-mapa",
  "essencial-rag-por-linha",
  // batch 2 (mais showcases — só DADO)
  "essencial-ingestao-http-ontologia",
  "essencial-repull-compare",
  "essencial-placa-hotlist-alerta",
  "essencial-identificador-cadeia",
  // batch 3 (fecha o pacote essencial — só DADO)
  "essencial-noticias-cluster-aip",
  "essencial-cctv-deteccao-hotlist",
  "essencial-enriquecer-por-api",
  "essencial-busca-monitorada-alerta",
  "essencial-coleta-multisite-ficha",
  // OP1/OP4 (zero-débito) — camadas de referência do /geo como pipelines
  "essencial-camada-focos-inpe",
  "essencial-camada-cnes-saude",
];

async function boardsBySlug(page: Page) {
  const res = await page.request.get("/api/platform/v23/pipeline");
  expect(res.ok(), `list boards → ${res.status()}`).toBeTruthy();
  const list = (await res.json()) as Array<{ id: string; slug: string; tags?: string[] }>;
  const by: Record<string, { id: string; tags?: string[] }> = {};
  for (const b of list) by[b.slug] = { id: b.id, tags: b.tags };
  return by;
}

async function openBoard(page: Page, boardId: string) {
  await page.goto("/painel-de-controle/dados?aba=pipelines");
  await expandAcervo(page);
  await page.getByTestId(`pb-board-${boardId}`).click();
  await expect(page.getByTestId("pb-canvas")).toBeVisible({ timeout: 30000 });
}

test.describe("inc11 — PACOTE ESSENCIAL (a espinha de fábrica) ao vivo", () => {
  test("os 4 boards essenciais nascem semeados, com a tag e a espinha das Waves 1-2", async ({ page }) => {
    await login(page);
    const by = await boardsBySlug(page);
    for (const slug of ESSENTIAL) {
      expect(by[slug], `board essencial ausente: ${slug}`).toBeTruthy();
      expect(by[slug].tags || [], `${slug} sem tag 'essencial'`).toContain("essencial");
    }
  });

  test("cerca→alerta→notificar abre no canvas e a espinha reativa está montada + editável", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const by = await boardsBySlug(page);
    await openBoard(page, by["essencial-cerca-alerta-notificar"].id);

    // a espinha REATIVA de fábrica: os 3 nós reactive encadeados renderizam no canvas.
    await expect(page.getByTestId("pb-node-cerca")).toBeVisible();
    await expect(page.getByTestId("pb-node-alerta")).toBeVisible();
    await expect(page.getByTestId("pb-node-aviso")).toBeVisible();

    // editável: abre o 1º nó → inspetor DECLARATIVO renderiza com o método certo.
    await page.getByTestId("pb-node-cerca").dblclick();
    await expect(page.getByTestId("pb-config-overlay")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-reactive-method")).toHaveValue("geofence_eval");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("GeoJSON→mapa e RAG por linha nascem com o passo geopoint / a skill aegis.embed", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const by = await boardsBySlug(page);

    // GeoJSON→mapa: o passo geometry→geopoint de fábrica.
    await openBoard(page, by["essencial-geojson-mapa"].id);
    await page.getByTestId("pb-node-geo").dblclick();
    await expect(page.getByTestId("pb-cfg-geopoint")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-geopoint-output")).toHaveValue("geopoint");
    await page.keyboard.press("Escape");

    // RAG por linha: o nó de capacidade rodando aegis.embed.
    await openBoard(page, by["essencial-rag-por-linha"].id);
    await page.getByTestId("pb-node-emb").dblclick();
    await expect(page.getByTestId("pb-cfg-skill")).toBeVisible();
  });

  test("batch 2: placa→lista→alerta (watchlist+emit_alert) e recoletar→comparar montam a espinha", async ({ page }) => {
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const by = await boardsBySlug(page);

    // placa→lista→alerta: correlate(watchlist) → reactive(emit_alert).
    await openBoard(page, by["essencial-placa-hotlist-alerta"].id);
    await page.getByTestId("pb-node-lista").dblclick();
    await expect(page.getByTestId("pb-cfg-correlate-method")).toHaveValue("watchlist");
    await page.keyboard.press("Escape");
    await page.getByTestId("pb-node-alerta").dblclick();
    await expect(page.getByTestId("pb-cfg-reactive-method")).toHaveValue("emit_alert");
    await page.keyboard.press("Escape");

    // recoletar→comparar: o nó compare (4 portas) de fábrica.
    await openBoard(page, by["essencial-repull-compare"].id);
    await page.getByTestId("pb-node-cmp").dblclick();
    await expect(page.getByTestId("pb-cfg-compare")).toBeVisible();

    // identificador→cadeia: correlate(chain) multi-hop.
    await openBoard(page, by["essencial-identificador-cadeia"].id);
    await page.getByTestId("pb-node-cadeia").dblclick();
    await expect(page.getByTestId("pb-cfg-correlate-method")).toHaveValue("chain");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("batch 3: cluster AIP, CCTV→hotlist, enrich por API, busca monitorada e multi-site→ficha montam a espinha", async ({ page }) => {
    test.setTimeout(240_000);
    const fatal: string[] = [];
    page.on("pageerror", (e) => fatal.push(String(e)));
    await login(page);
    await page.setViewportSize({ width: 1720, height: 940 });
    const by = await boardsBySlug(page);

    // notícias→cluster AIP: root aip_agent + sub-nodes Modelo/Ferramentas no canvas,
    // inspetor declarativo do agente com a coluna de saída de fábrica.
    await openBoard(page, by["essencial-noticias-cluster-aip"].id);
    await expect(page.getByTestId("pb-node-ag")).toBeVisible();
    await expect(page.getByTestId("pb-node-mdl")).toBeVisible();
    await expect(page.getByTestId("pb-node-tls")).toBeVisible();
    await page.getByTestId("pb-node-ag").dblclick();
    await expect(page.getByTestId("pb-cfg-aip-agent")).toBeVisible();
    await expect(page.getByTestId("pb-cfg-aip-output")).toHaveValue("narrativa");
    await page.keyboard.press("Escape");

    // CCTV→detecção→hotlist: skill camera.detect_tick + cadeia watchlist→emit_alert.
    await openBoard(page, by["essencial-cctv-deteccao-hotlist"].id);
    await page.getByTestId("pb-node-detec").dblclick();
    await expect(page.getByTestId("pb-cfg-skill")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("pb-node-lista").dblclick();
    await expect(page.getByTestId("pb-cfg-correlate-method")).toHaveValue("watchlist");
    await page.keyboard.press("Escape");

    // enriquecer por API: http_request per_row com URL template por linha.
    await openBoard(page, by["essencial-enriquecer-por-api"].id);
    await page.getByTestId("pb-node-api").dblclick();
    await expect(page.getByTestId("pb-cfg-http-url")).toHaveValue(/\$json\.documento/);
    await page.keyboard.press("Escape");

    // busca monitorada→alerta: skill de metabusca + alerta governado.
    await openBoard(page, by["essencial-busca-monitorada-alerta"].id);
    await page.getByTestId("pb-node-busca").dblclick();
    await expect(page.getByTestId("pb-cfg-skill")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("pb-node-alerta").dblclick();
    await expect(page.getByTestId("pb-cfg-reactive-method")).toHaveValue("emit_alert");
    await page.keyboard.press("Escape");

    // coleta multi-site→ficha: correlate(resolve_entity) fecha na ficha.
    await openBoard(page, by["essencial-coleta-multisite-ficha"].id);
    await page.getByTestId("pb-node-ficha").dblclick();
    await expect(page.getByTestId("pb-cfg-correlate-method")).toHaveValue("resolve_entity");
    expect(fatal, `erros fatais: ${fatal.join(" | ")}`).toEqual([]);
  });
});
