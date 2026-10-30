/**
 * Pós-1.0 do aegis-platform-sdk — os módulos situational/correlation/merge/
 * solucoes-marketplace delegam ao SDK mantendo URLs e bodies idênticos aos do
 * apiFetch antigo. Caminho REAL (fetch global mockado, nada de mockar o módulo).
 */
import { Situational } from '@/lib/api/situational';
import { Correlation } from '@/lib/api/correlation';
import { Merge } from '@/lib/api/merge';
import { SolucoesMarketplace } from '@/lib/api/solucoes-marketplace';

const jsonResponse = (data: unknown, status = 200) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(data),
  }) as unknown as Response;

describe('lib/api/* → aegis-platform-sdk (pós-1.0)', () => {
  const originalFetch = global.fetch;
  let calls: { url: string; init?: RequestInit }[];

  beforeEach(() => {
    calls = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({});
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('Situational.nearby: kinds CSV vira param, path preservado', async () => {
    await Situational.nearby({ node_id: 'n1', radius_m: 150, kinds: 'Event,Alert' });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/api/v1/situational/nearby');
    expect(url.searchParams.get('node_id')).toBe('n1');
    expect(url.searchParams.get('radius_m')).toBe('150');
    expect(url.searchParams.get('kinds')).toBe('Event,Alert');
  });

  it('Situational.correlate: anchor no body', async () => {
    await Situational.correlate({ anchor_node_id: 'n1', radius_m: 100 });
    expect(new URL(calls[0]!.url).pathname).toBe('/api/api/v1/situational/correlations');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      anchor_node_id: 'n1',
      radius_m: 100,
    });
  });

  it('Correlation.quickLinks e startChain preservam bodies', async () => {
    await Correlation.quickLinks({ value: '+5511999', kind: 'phone' });
    expect(new URL(calls[0]!.url).pathname).toBe('/api/correlation/quick-links');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ value: '+5511999', kind: 'phone' });

    await Correlation.startChain({ value: 'x@y.com', max_depth: 3 });
    expect(new URL(calls[1]!.url).pathname).toBe('/api/correlation/chain');
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ value: 'x@y.com', max_depth: 3 });
  });

  it('Merge.preview: target aninhado + input no topo (contrato do backend)', async () => {
    await Merge.preview({
      target: { node_type: 'Person', canonical: 'joao' },
      result_payload: { nome: 'João' },
    });
    expect(new URL(calls[0]!.url).pathname).toBe('/api/ontology/merge/preview');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      target: { node_type: 'Person', canonical: 'joao' },
      result_payload: { nome: 'João' },
    });
  });

  it('Merge.apply: field_resolutions + link fluem', async () => {
    await Merge.apply({
      target: { object_id: 'o1' },
      properties: { cpf: '123' },
      field_resolutions: { cpf: 'replace' },
      link: { target_object_id: 'o2', relation_type: 'associado_a' },
    });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.target).toEqual({ object_id: 'o1' });
    expect(body.field_resolutions).toEqual({ cpf: 'replace' });
    expect(body.link.relation_type).toBe('associado_a');
  });

  it('SolucoesMarketplace.listings/install: paths da loja', async () => {
    await SolucoesMarketplace.listings({ status: 'unlisted', q: 'condominio' });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/solutions/marketplace/listings');
    expect(url.searchParams.get('status')).toBe('unlisted');
    expect(url.searchParams.get('q')).toBe('condominio');

    await SolucoesMarketplace.install('l1');
    expect(new URL(calls[1]!.url).pathname).toBe('/api/solutions/marketplace/listings/l1/install');
    expect(calls[1]!.init?.method).toBe('POST');
  });
});
