/**
 * Wave 2 — nó de CORRELAÇÃO (declarativo): trava o contrato do registro.
 * O nó é 1 só, method-driven; cada método revela seus campos via displayOptions
 * (paridade n8n operation+displayOptions). Reusa o motor de shouldDisplayField.
 */
import { NODE_REGISTRY } from '@/lib/pipeline/node-registry';
import { shouldDisplayField, defaultsFromFields, type NodeFieldSpec } from '@/lib/pipeline/node-fields';
import { defaultNodeConfig } from '@/lib/pipeline/node-defaults';

const spec = NODE_REGISTRY.correlate;

function field(key: string): NodeFieldSpec {
  const f = spec.fields.find((x) => x.key === key);
  if (!f) throw new Error(`campo ausente: ${key}`);
  return f;
}

describe('correlate — registro declarativo', () => {
  it('existe com container pb-cfg-correlate e os 5 métodos', () => {
    expect(spec).toBeTruthy();
    expect(spec.container).toBe('pb-cfg-correlate');
    const method = field('method');
    expect(method.type).toBe('options');
    expect(method.options?.map((o) => o.value)).toEqual([
      'chain', 'spatiotemporal', 'resolve_entity', 'watchlist', 'identity',
    ]);
  });

  it('default do nó nasce no método chain, per_row, saída correlate_output', () => {
    const c = defaultNodeConfig('correlate');
    expect(c.method).toBe('chain');
    expect(c.mode).toBe('per_row');
    expect(c.output).toBe('correlate_output');
    expect(c.max_rows).toBe(20);
  });

  it('displayOptions: campos de chain aparecem SÓ em method=chain', () => {
    const seed = field('seed_value');
    expect(shouldDisplayField(seed, { method: 'chain' })).toBe(true);
    expect(shouldDisplayField(seed, { method: 'spatiotemporal' })).toBe(false);
  });

  it('displayOptions: raio/janela (spatiotemporal) escondidos em outros métodos', () => {
    for (const key of ['radius_m', 'window_s', 'anchor_id', 'materialize']) {
      const f = field(key);
      expect(shouldDisplayField(f, { method: 'spatiotemporal' })).toBe(true);
      expect(shouldDisplayField(f, { method: 'chain' })).toBe(false);
    }
  });

  it('cada método revela ao menos 1 campo próprio; comuns sempre visíveis', () => {
    const byMethod: Record<string, string[]> = {
      chain: ['seed_value', 'max_depth'],
      spatiotemporal: ['radius_m', 'window_s'],
      resolve_entity: ['entity_kind', 'entity_value'],
      watchlist: ['plate'],
      identity: ['nome'],
    };
    for (const [method, keys] of Object.entries(byMethod)) {
      for (const k of keys) expect(shouldDisplayField(field(k), { method })).toBe(true);
      // comuns (sem displayOptions) aparecem em qualquer método
      for (const k of ['mode', 'output', 'max_rows']) {
        expect(shouldDisplayField(field(k), { method })).toBe(true);
      }
    }
  });

  it('defaultsFromFields cobre os campos com default (radius/janela/limite)', () => {
    const d = defaultsFromFields(spec.fields);
    expect(d.radius_m).toBe(200);
    expect(d.window_s).toBe(300);
    expect(d.limit).toBe(50);
    expect(d.max_depth).toBe(2);
  });
});
