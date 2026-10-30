/**
 * @jest-environment node
 */
/**
 * Relay de Bearer OSDK no catch-all /api/[...path] (AutoSync · Sprint 0).
 *
 * O túnel do edge-site aponta pro FRONTEND (same-origin). Auth programático
 * (AutoSync com token `osdk_…`) chega SEM cookie de sessão — e o proxy
 * strippava `Authorization` e devolvia 401 antes de encaminhar. Regra nova:
 *
 *   sem cookie de sessão + `Authorization: Bearer osdk_*` → repassa à api
 *   (validação/escopo 100% no backend; nada de sessão/refresh no caminho).
 *
 * Guardas anti-regressão: sessão por cookie continua mandando (bearer de
 * entrada NUNCA sobrepõe sessão), e sem credencial nenhuma segue 401.
 */
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/[...path]/route";
import { middleware } from "../middleware";

jest.mock("@/lib/auth/backend", () => ({
  BACKEND_URL: "http://backend.test",
  backendRefresh: jest.fn(),
}));

function ctx(...segments: string[]) {
  return { params: Promise.resolve({ path: segments }) };
}

describe("catch-all /api — relay de Bearer osdk_ sem sessão", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ username: "autosync" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("sem cookie e sem Authorization → 401 (comportamento atual preservado)", async () => {
    const req = new NextRequest("http://edge.local/api/platform/v23/auth/me");
    const res = await GET(req, ctx("platform", "v23", "auth", "me"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem cookie + Bearer osdk_* → repassa o MESMO bearer à api e devolve a resposta", async () => {
    const req = new NextRequest(
      "http://edge.local/api/platform/v23/auth/me?full=1",
      { headers: { authorization: "Bearer osdk_abc123" } },
    );
    const res = await GET(req, ctx("platform", "v23", "auth", "me"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/platform/v23/auth/me?full=1");
    expect((init.headers as Headers).get("authorization")).toBe(
      "Bearer osdk_abc123",
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ username: "autosync" });
  });

  it("sem cookie + Bearer NÃO-osdk → repassa também (desde 2026-08-18 o proxy relaya qualquer Bearer: edge_token do Desktop, osdk_, etc — quem valida é o backend)", async () => {
    const req = new NextRequest("http://edge.local/api/platform/v23/auth/me", {
      headers: { authorization: "Bearer eyJhbGciOi.jwt.qualquer" },
    });
    const res = await GET(req, ctx("platform", "v23", "auth", "me"));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("com sessão: bearer de entrada segue descartado (osdk NÃO sobrepõe cookie)", async () => {
    const req = new NextRequest("http://edge.local/api/platform/v23/auth/me", {
      headers: {
        cookie: "aegis_access=sess123",
        authorization: "Bearer osdk_intruso",
      },
    });
    const res = await GET(req, ctx("platform", "v23", "auth", "me"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("authorization")).toBe(
      "Bearer sess123",
    );
    expect(res.status).toBe(200);
  });

  // O gate de PRESENÇA roda no middleware, ANTES do route handler — sem estes
  // casos o relay do proxy nunca é alcançado (foi exatamente o bug do 1º build).
  describe("middleware (gate de presença)", () => {
    it("sem cookie + Bearer osdk_ em /api/* → deixa passar até o proxy", () => {
      const req = new NextRequest("http://edge.local/api/platform/v23/auth/me", {
        headers: { authorization: "Bearer osdk_abc123" },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });

    it("sem cookie e sem bearer em /api/* → 401 (comportamento atual)", () => {
      const req = new NextRequest("http://edge.local/api/platform/v23/auth/me");
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it("Bearer osdk_ NÃO abre navegação de página — segue redirect /login", () => {
      const req = new NextRequest("http://edge.local/painel-de-controle", {
        headers: { authorization: "Bearer osdk_abc123" },
      });
      const res = middleware(req);
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("com cookie de sessão → passa (regressão)", () => {
      const req = new NextRequest("http://edge.local/api/me/home", {
        headers: { cookie: "aegis_access=sess123" },
      });
      const res = middleware(req);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  });

  it("POST sem cookie + osdk → método e corpo chegam intactos na api", async () => {
    const payload = JSON.stringify({ function: "aegis.guest.issue_and_share" });
    const req = new NextRequest("http://edge.local/api/functions/invoke", {
      method: "POST",
      headers: {
        authorization: "Bearer osdk_abc123",
        "content-type": "application/json",
      },
      body: payload,
    });
    const res = await POST(req, ctx("functions", "invoke"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/functions/invoke");
    expect(init.method).toBe("POST");
    expect(Buffer.from(init.body as ArrayBuffer).toString()).toBe(payload);
    expect(res.status).toBe(200);
  });

  // O Desktop posta a forma SIMPLES (v1/edge/pair) quando o probe de base
  // escolhe o host sem /api (2026-08-20, OuroVille: 401 "unauthenticated" →
  // "Could not pair"). O proxy precisa (a) deixar passar sem credencial e
  // (b) remapear pro caminho que o backend monta (/api/v1/edge/pair).
  describe("pareamento edge/connector sem credencial (rota pública)", () => {
    beforeEach(() => {
      fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ edge_id: "e1", edge_token: "aegis-edge-x" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    it("forma simples v1/edge/pair: passa e remapeia pro backend /api/v1/edge/pair", async () => {
      const body = JSON.stringify({ pairing_code: "A1B2-C3D4", name: "mesa", kind: "desk_app" });
      const req = new NextRequest("http://edge.local/api/v1/edge/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const res = await POST(req, ctx("v1", "edge", "pair"));

      expect(res.status).toBe(201);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://backend.test/api/v1/edge/pair");
      expect(Buffer.from(init.body as ArrayBuffer).toString()).toBe(body);
    });

    it("forma dupla api/v1/edge/pair: segue como sempre (sem remapear)", async () => {
      const req = new NextRequest("http://edge.local/api/api/v1/edge/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairing_code: "A1B2-C3D4" }),
      });
      const res = await POST(req, ctx("api", "v1", "edge", "pair"));

      expect(res.status).toBe(201);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("http://backend.test/api/v1/edge/pair");
    });

    it("forma simples v1/connectors/pair: passa e remapeia", async () => {
      const req = new NextRequest("http://edge.local/api/v1/connectors/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairing_code: "X1" }),
      });
      const res = await POST(req, ctx("v1", "connectors", "pair"));

      expect(res.status).toBe(201);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("http://backend.test/api/v1/connectors/pair");
    });

    it("v1/edge/pair: middleware também deixa passar sem cookie (sincronia)", () => {
      const req = new NextRequest("http://edge.local/api/v1/edge/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairing_code: "A1B2-C3D4" }),
      });
      const res = middleware(req);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  });

  // 🔴 PROBE de base do Desktop (2026-08-20): GET /api/health sem cookie tem
  // de responder 200 para o app escolher a base COM /api — senão o trilho
  // edge inteiro (pair/heartbeat/dispositivos/stream) vira forma simples e o
  // proxy encaminha /v1/edge/* → 404 no backend ("Nunca conectou").
  describe("probe de base /api/health (Desktop escolhe base com /api)", () => {
    it("proxy: health sem cookie passa e encaminha pra raiz do backend", async () => {
      fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const req = new NextRequest("http://edge.local/api/health");
      const res = await GET(req, ctx("health"));

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("http://backend.test/health");
    });

    it("middleware: /api/health passa sem cookie (sincronia com o proxy)", () => {
      const req = new NextRequest("http://edge.local/api/health");
      const res = middleware(req);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });

    it("guarda: /api/health/extra não vira público (lista é exata, sem prefix)", () => {
      const req = new NextRequest("http://edge.local/api/health/extra");
      const res = middleware(req);
      expect(res.status).toBe(401);
    });
  });
});
