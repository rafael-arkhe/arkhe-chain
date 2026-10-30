/**
 * F4 (dogfood do aegis-platform-sdk) — o módulo lib/api/geo delega para o
 * SDK em modo proxy: baseUrl relativa "/api" (mesma origem, cookie
 * httpOnly via credentials: "include"), URLs idênticas às do apiFetch
 * antigo. Aqui exercitamos o caminho REAL (sem mockar @/lib/api/geo),
 * só o fetch global.
 */
import { Geo } from '@/lib/api/geo';

/** jsdom não tem Response — stub mínimo do que o transporte do SDK lê. */
const jsonResponse = (data: unknown, status = 200) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(data),
  }) as unknown as Response;

describe('lib/api/geo → aegis-platform-sdk (proxy mode)', () => {
  const originalFetch = global.fetch;
  let calls: { url: string; init?: RequestInit }[];

  beforeEach(() => {
    calls = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ nodes: [], truncated: false, edges: [], zones: [] });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('nodes() chama /api/api/v1/geo/nodes com params e cookie mode', async () => {
    await Geo.nodes({ node_type: 'Camera', since_minutes: 60, limit: 10 });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/api/v1/geo/nodes');
    expect(url.searchParams.get('node_type')).toBe('Camera');
    expect(url.searchParams.get('since_minutes')).toBe('60');
    expect(calls[0]!.init?.credentials).toBe('include');
    expect(calls[0]!.init?.cache).toBe('no-store');
  });

  it('edgesBetween() faz o batch em node_ids CSV', async () => {
    await Geo.edgesBetween(['a', 'b'], 'near');
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/api/v1/geo/edges');
    expect(url.searchParams.get('node_ids')).toBe('a,b');
    expect(url.searchParams.get('relation_types')).toBe('near');
  });

  it('importZones() posta features + opções', async () => {
    await Geo.importZones({
      features: [{ name: 'Z1', geometry: [[0, 0]] }],
      default_zone_type: 'observation',
    });
    expect(new URL(calls[0]!.url).pathname).toBe('/api/api/v1/geo/zones/import');
    expect(calls[0]!.init?.method).toBe('POST');
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.features).toHaveLength(1);
    expect(body.default_zone_type).toBe('observation');
  });

  it('deleteZone() usa DELETE e trata 204', async () => {
    global.fetch = jest.fn(async () =>
      ({ status: 204, ok: true, text: async () => '' }) as unknown as Response,
    ) as unknown as typeof fetch;
    await expect(Geo.deleteZone('z1')).resolves.toBeNull();
  });

  it('nunca vaza Authorization no modo proxy (token fica no cookie httpOnly)', async () => {
    await Geo.zones();
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
