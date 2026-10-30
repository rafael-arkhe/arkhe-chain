/**
 * Instância única do AEGIS SDK (aegis-platform-sdk) em modo proxy.
 *
 * O security-app não fala com o backend direto: tudo passa pelas rotas
 * /api/* do Next (proxy reverso com cookie httpOnly — ver
 * `app/api/[...path]/route.ts` e `lib/api/client.ts`). Por isso o SDK é
 * construído com `baseUrl: "/api"` (relativa, resolvida contra a origem
 * do browser) e `credentials: "include"` — o cookie viaja sozinho e o
 * token nunca aparece no JS.
 *
 * Migração gradual (dogfood F4 do SDK): módulos de `lib/api/*` passam a
 * delegar para `aegis.<recurso>` mantendo suas assinaturas; chamadas sem
 * recurso no SDK usam `aegis.request(method, path)` — nunca fetch cru.
 */
import { AegisClient } from "aegis-platform-sdk";

export const aegis = new AegisClient({
  baseUrl: "/api",
  timeoutMs: 30_000,
  fetchInit: { credentials: "include", cache: "no-store" },
});
