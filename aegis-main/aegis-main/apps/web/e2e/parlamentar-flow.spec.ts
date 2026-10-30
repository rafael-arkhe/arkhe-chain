/**
 * E2E · Fluxo Parlamentar (Sprint 4)
 * ───────────────────────────────────────────────────────────────────
 *
 * Cobre o caminho operacional canônico do security-app:
 *
 *   /buscar      → digita "Lula" + fontes Câmara + Instagram + Entidades
 *                  → fila sequencial conclui 3 itens (1 por fonte)
 *   /buscar      → resultado local "Carlos Roberto Silva" (pes-001)
 *                  → clica "Abrir ficha"
 *   /ficha/{id}  → header com paleta/inspetor, abas Identidade/Histórico/
 *                  Atividade → clica "Atividade" → confirma tabpanel +
 *                  widget de observações CCTV.
 *   /rede        → busca "Carlos" → seleciona pes-001 → confirma canvas
 *                  + inspetor mostra o nó raiz → clica "Abrir ficha".
 *
 * O teste é totalmente offline: cada chamada ao proxy `/api/*` é
 * interceptada por `page.route()` com fixtures determinísticas. Não
 * exige ontology-module nem MCP adapter rodando — o operador pode
 * disparar este spec em qualquer máquina com `npm run test:e2e`.
 *
 * Cobertura desta sprint cobre o fluxo end-to-end UI; nenhum agente
 * real é executado (a página /agentes não é tocada — não há fixture
 * pra "Rodar agora" sem worker do ontology).
 */
import { test, expect } from "@playwright/test";

import { login } from "./helpers/login";

// ── Fixtures determinísticas ────────────────────────────────────────

// Envelope idêntico ao backend real: `{adapters: [{module, provider,
// tier, requires_env, env_status, tools: [{name, version, description}]}], count}`.
const MCP_ADAPTERS = {
  count: 3,
  adapters: [
    {
      module: "app.mcp_adapters.camara_adapter",
      provider: "camara",
      tier: "free",
      requires_env: [],
      env_status: {},
      tools: [
        {
          name: "camara_deputados",
          version: "v1",
          description: "Câmara dos Deputados — busca por nome",
        },
      ],
      breaker_open: false,
    },
    {
      module: "app.mcp_adapters.senado_adapter",
      provider: "senado",
      tier: "free",
      requires_env: [],
      env_status: {},
      tools: [
        {
          name: "senado_senadores",
          version: "v1",
          description: "Senado — busca por nome",
        },
      ],
      breaker_open: false,
    },
    {
      module: "app.mcp_adapters.bluesky_adapter",
      provider: "bluesky",
      tier: "free",
      requires_env: [],
      env_status: {},
      tools: [
        {
          name: "bluesky_search_posts",
          version: "v1",
          description: "Bluesky search posts",
        },
      ],
      breaker_open: false,
    },
  ],
};

// 1 deputado da Câmara — shape com `nome`, `partido`, `uf` que o
// `genericNormalize` reconhece.
const CAMARA_INVOKE = {
  tool: "camara_deputados@v1",
  version: "v1",
  result: {
    dados: [
      {
        id: 220714,
        nome: "Luiz Inácio Lula da Silva",
        partido: "PT",
        uf: "SP",
        url: "https://www.camara.leg.br/deputados/220714",
      },
    ],
  },
};

// 1 post de Bluesky — shape com `text`, `author`, `uri`.
const BLUESKY_INVOKE = {
  tool: "bluesky_search_posts@v1",
  version: "v1",
  result: {
    posts: [
      {
        id: "bsky-1",
        author: { handle: "lula.bsky.social", displayName: "Lula" },
        text: "Boa tarde a todos os brasileiros…",
        uri: "https://bsky.app/profile/lula.bsky.social/post/abc",
        likeCount: 12_500,
      },
    ],
  },
};

// Shape mínimo que casa com `lib/api/types.ts → Entity` (sem importar
// pra não acoplar o spec ao tsconfig do app).
interface E2EEntity {
  id: string;
  name: string;
  entity_type: string;
  properties: Record<string, unknown>;
  classification: string;
  signed_hash: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

// 3 entidades locais — pessoa principal + veículo + mandado.
// `pes-001` é a entidade-raiz reutilizada em ficha + rede.
const ENTITIES: E2EEntity[] = [
  {
    id: "pes-001",
    name: "CARLOS ROBERTO SILVA",
    entity_type: "pessoa",
    properties: {
      RG: "34.521.788-9",
      CPF: "***.452.901-**",
      Alcunha: "Beto da Vila",
    },
    classification: "confidencial",
    signed_hash: "sha256:e2e-fixture-pes-001",
    version: 17,
    created_by: "investigador.mendonca",
    created_at: "2026-04-12T09:31:00-03:00",
    updated_at: "2026-05-16T14:22:00-03:00",
  },
  {
    id: "vei-001",
    name: "GM/ONIX — ABC-1D23",
    entity_type: "veiculo",
    properties: { Placa: "ABC-1D23", Modelo: "GM/ONIX", Ano: "2019" },
    classification: "confidencial",
    signed_hash: null,
    version: 3,
    created_by: "sistema.ingest",
    created_at: "2026-03-02T17:48:00-03:00",
    updated_at: null,
  },
  {
    id: "mdt-008",
    name: "MBA 0008/2026 — Carlos R. Silva",
    entity_type: "mandado",
    properties: {
      "Número CNJ": "0001234-56.2026.8.26.0050",
      Situação: "EM ABERTO",
    },
    classification: "sigiloso",
    signed_hash: null,
    version: 1,
    created_by: "del.rodrigues",
    created_at: "2026-05-02T09:02:00-03:00",
    updated_at: null,
  },
];

// Subgrafo de pes-001 — 4 nós (pessoa raiz + veículo + mandado + telefone),
// 5 arestas (vínculos cruzados).
const TELEFONE: E2EEntity = {
  id: "tel-552",
  name: "+55 11 9****-7188",
  entity_type: "telefone",
  properties: { Operadora: "TIM", Status: "ATIVO" },
  classification: "confidencial",
  signed_hash: null,
  version: 2,
  created_by: "sistema.lpr-bridge",
  created_at: "2026-04-11T12:42:00-03:00",
  updated_at: null,
};

const GRAPH_PES_001 = {
  nodes: [...ENTITIES, TELEFONE],
  edges: [
    {
      id: "lnk-001",
      source_id: "pes-001",
      target_id: "vei-001",
      link_type: "veiculo_associado",
      properties: {},
    },
    {
      id: "lnk-002",
      source_id: "pes-001",
      target_id: "mdt-008",
      link_type: "alvo_mandado",
      properties: {},
    },
    {
      id: "lnk-003",
      source_id: "pes-001",
      target_id: "tel-552",
      link_type: "telefone_associado",
      properties: {},
    },
    {
      id: "lnk-004",
      source_id: "vei-001",
      target_id: "mdt-008",
      link_type: "veiculo_apreendido_em",
      properties: {},
    },
    {
      id: "lnk-005",
      source_id: "tel-552",
      target_id: "vei-001",
      link_type: "interceptado_em",
      properties: {},
    },
  ],
  evidence_count: 3,
};

const WHOAMI = {
  user_id: "u-admin",
  username: "admin",
  display_name: "Administrador",
  email: null,
  tenant: null,
  clearances: ["publico", "restrito", "confidencial", "sigiloso"],
  roles: ["admin"],
  permissions: [
    "security.buscar.view",
    "security.rede.view",
    "security.ficha.view",
  ],
  must_change_password: false,
  totp_enabled: false,
};

// ── Spec ────────────────────────────────────────────────────────────

test.describe.serial("Fluxo parlamentar · busca → ficha → rede", () => {
  test("busca parlamentar → enriquece → ficha → rede → correlação CCTV", async ({
    page,
  }) => {
    // 0. Setup · mocks de TODAS as chamadas ao proxy /api/* relevantes
    //    pra que o teste rode sem ontology-module.

    await test.step("setup · intercepta proxy /api/*", async () => {
      // auth/login + auth/me · forçamos OK pra o login() helper não
      // bater no backend real.
      await page.route("**/api/auth/login", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            // Cookies httpOnly determinísticos pra middleware deixar passar.
            "Set-Cookie": [
              "aegis_access=e2e-access; Path=/; HttpOnly; SameSite=Lax",
              "aegis_refresh=e2e-refresh; Path=/; HttpOnly; SameSite=Lax",
            ].join(", "),
          },
          body: JSON.stringify({
            must_change_password: false,
            token_type: "Bearer",
            expires_in: 3600,
          }),
        });
      });
      await page.route("**/api/auth/me", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(WHOAMI),
        });
      });

      // mcp-adapters/list — devolve só os 3 adapters do cenário.
      await page.route("**/api/mcp-adapters/list", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MCP_ADAPTERS),
        });
      });

      // mcp-adapters/{tool}/invoke — case-by-tool.
      await page.route(
        "**/api/mcp-adapters/camara_deputados%40v1/invoke",
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(CAMARA_INVOKE),
          });
        },
      );
      await page.route(
        "**/api/mcp-adapters/bluesky_search_posts%40v1/invoke",
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(BLUESKY_INVOKE),
          });
        },
      );

      // /entities (lista) — sempre devolve as 3 entidades locais.
      // Aceita tanto /api/entities quanto /api/entities?q=...
      await page.route(/\/api\/entities(\?.*)?$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ENTITIES),
        });
      });

      // /entities/{id} — devolve a entidade certa pra ficha.
      await page.route(/\/api\/entities\/([^\/?]+)$/, async (route) => {
        const match = route.request().url().match(/\/api\/entities\/([^\/?]+)$/);
        const id = match ? decodeURIComponent(match[1]) : "";
        const ent = ENTITIES.find((e) => e.id === id);
        if (!ent) {
          await route.fulfill({ status: 404, body: "not found" });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ent),
        });
      });

      // /entities/{id}/graph — subgrafo determinístico de pes-001.
      await page.route(/\/api\/entities\/[^\/]+\/graph(\?.*)?$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(GRAPH_PES_001),
        });
      });

      // /entities/{id}/evidence — devolve lista vazia (basta pro inspetor).
      await page.route(/\/api\/entities\/[^\/]+\/evidence(\?.*)?$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });

      // /entities/{id}/links — vazio também.
      await page.route(/\/api\/entities\/[^\/]+\/links(\?.*)?$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });
    });

    // 1. login · grava cookies httpOnly e hidrata o principal.
    await test.step("login · sessão admin", async () => {
      const principal = await login(page);
      expect(principal?.username).toBe("admin");
    });

    // 2. /buscar · digita query + seleciona fontes externas.
    await test.step("/buscar · seleciona Câmara + Instagram", async () => {
      await page.goto("/buscar");
      await expect(page.getByTestId("buscar-input")).toBeVisible();
      // Hidrata async — a página dispara fetch ao /mcp-adapters/list no
      // mount. Dá tempo de o state subir antes do popover abrir.
      await page.waitForTimeout(3000);
      await page.getByTestId("buscar-input").fill("Lula");
      await page.getByTestId("buscar-fontes-toggle").click();
      await expect(page.getByTestId("buscar-fontes-painel")).toBeVisible();
      // Hidrata async (depois do mount /buscar dispara fetch ao
      // /mcp-adapters/list). Espera o checkbox aparecer antes de
      // tentar marcar.
      await expect(
        page.getByTestId("buscar-fonte-bluesky_search_posts@v1"),
      ).toBeVisible({ timeout: 15_000 });
      // Garante o estado-alvo via .check() (idempotente — se já vier
      // marcada, não troca).
      const camara = page.getByTestId("buscar-fonte-camara_deputados@v1");
      if (!(await camara.isChecked())) await camara.check();
      const bluesky = page.getByTestId("buscar-fonte-bluesky_search_posts@v1");
      if (!(await bluesky.isChecked())) await bluesky.check();
      // Desmarca Senado pra fila ter exatamente 3 itens previsíveis.
      const senado = page.getByTestId("buscar-fonte-senado_senadores@v1");
      if (await senado.isChecked()) await senado.uncheck();
      // Fecha o popover (clica fora) pra o submit não esbarrar nele.
      await page.getByTestId("buscar-input").click();
      await page.getByTestId("buscar-submit").click();
    });

    // 3. aguarda o worker virtual concluir os 3 itens (entities +
    //    camara + instagram).
    await test.step("/buscar · worker sequencial conclui 3 itens", async () => {
      await expect(page.getByTestId("buscar-fila")).toBeVisible();
      await expect
        .poll(
          async () =>
            await page.locator("[data-testid^=\"buscar-fila-item-\"][data-status=\"done\"]").count(),
          { timeout: 10_000 },
        )
        .toBe(3);
    });

    // 4. clica num resultado local pra abrir a ficha.
    await test.step("/buscar · clica em \"Abrir ficha\" da entidade pes-001", async () => {
      const abrir = page.getByTestId("buscar-abrir-ficha-pes-001");
      await expect(abrir).toBeVisible();
      await abrir.click();
      // /ficha/[id] é dynamic route — Next dev cold-compila (~6s na 1ª visita).
      await expect(page).toHaveURL(/\/ficha\/pes-001/, { timeout: 30_000 });
    });

    // 5. /ficha · paleta + tabs + widgets agrupados por aba.
    await test.step("/ficha · paleta + abas + widget da aba Atividade", async () => {
      await expect(page.getByTestId("paleta-widgets")).toBeVisible();
      await expect(page.getByTestId("inspetor")).toBeVisible();
      await expect(page.getByTestId("ficha-tabs")).toBeVisible();
      await expect(page.getByTestId("ficha-tab-identidade")).toBeVisible();
      await expect(page.getByTestId("ficha-tab-historico")).toBeVisible();
      await expect(page.getByTestId("ficha-tab-atividade")).toBeVisible();

      await page.getByTestId("ficha-tab-atividade").click();
      await expect(page.getByTestId("ficha-tabpanel-atividade")).toBeVisible();
      await expect(
        page.getByTestId("ficha-widget-ficha_observacoes_cctv"),
      ).toBeVisible();
    });

    // 6. /rede · busca a mesma entidade, abre o subgrafo no canvas.
    await test.step("/rede · busca Carlos e seleciona pes-001 como raiz", async () => {
      await page.goto("/rede");
      await expect(page.getByTestId("rede-sidebar")).toBeVisible();
      await page.getByTestId("rede-search").fill("Carlos");
      const resultado = page.getByTestId("rede-result-pes-001");
      await expect(resultado).toBeVisible();
      await resultado.click();

      // Aguarda container do canvas. `rede-canvas` só renderiza quando
      // ForceGraph dynamic resolve E o ResizeObserver vê size>0 — em
      // headless isso pode ficar em loading. `rede-canvas-container`
      // está sempre lá. O subgrafo ter sido fetchado é validado por
      // `rede-root-name` (que só aparece quando há subgrafo).
      await expect(page.getByTestId("rede-canvas-container")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("rede-root-name")).toContainText(
        "CARLOS ROBERTO SILVA",
      );
      await expect(page.getByTestId("rede-inspector-name")).toContainText(
        "CARLOS ROBERTO SILVA",
      );
    });

    // 7. inspetor → "Abrir ficha" → volta pra /ficha/pes-001.
    await test.step("/rede · inspetor abre ficha da raiz", async () => {
      await page.getByTestId("rede-abrir-ficha").click();
      await expect(page).toHaveURL(/\/ficha\/pes-001/);
      await expect(page.getByTestId("ficha-tabs")).toBeVisible();
    });
  });
});
