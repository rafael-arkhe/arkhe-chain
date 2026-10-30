/**
 * Wave 1 inc2 · batch 2b — TRANSFORM_REGISTRY: os transform-ops DECLARÁVEIS
 * (datetime/limit/splitout/dedupe/select/derive/crypto/html/xml/rss/markdown/
 * subworkflow) viram DADO (NodeFieldSpec[]), matando o JSX à mão no TransformConfig.
 *
 * Contrato (contrato-antes, TDD): (1) só os DECLARÁVEIS entram — os bespoke
 * (filter/set/join/sort/rename/agg/extract/llm/code/loop/http_request/extract_file/
 * convert_file) NÃO; (2) cada campo preserva o testid histórico `pb-cfg-*`; (3) os
 * defaults do registro batem 1:1 com `defaultArgsForTransform` (fonte única) — zero
 * drift de default entre o registro e o seed do backend.
 */
import { TRANSFORM_REGISTRY } from '@/lib/pipeline/node-registry';
import { defaultArgsForTransform } from '@/lib/pipeline/node-defaults';
import type { NodeFieldSpec } from '@/lib/pipeline/node-fields';

const MIGRATED = [
  'select', 'datetime', 'limit', 'splitout', 'dedupe', 'derive',
  'crypto', 'html', 'xml', 'rss', 'markdown', 'subworkflow',
  'geopoint', // Wave 2 — /geo referência → DAG (geometria GeoJSON → geopoint)
] as const;

// Os que seguem BESPOKE (serialização própria / pickers ricos) — NUNCA no registro.
const CUSTOM = [
  'filter', 'set', 'extract', 'join', 'sort', 'rename', 'agg',
  'llm', 'code', 'loop', 'http_request', 'extract_file', 'convert_file',
] as const;

const flat = (fields: NodeFieldSpec[]) => fields;

describe('TRANSFORM_REGISTRY (batch 2b + batch 3)', () => {
  it('é COMPLETO: os 13 declaráveis + os 13 bespoke roteados como custom (26 ops)', () => {
    // batch 3 — o registro vira a fonte ÚNICA de enumeração dos transform-ops:
    // declarável = fields[]; bespoke = marker `custom` (componente rico preservado).
    expect(Object.keys(TRANSFORM_REGISTRY).sort()).toEqual(
      [...MIGRATED, ...CUSTOM].sort(),
    );
  });

  it('bespoke: entry marcada custom===op, sem fields (o JSX rico continua a fonte)', () => {
    for (const op of CUSTOM) {
      const spec = TRANSFORM_REGISTRY[op];
      expect(spec).toBeDefined();
      expect(spec.custom).toBe(op);
      expect(spec.fields).toEqual([]);
    }
  });

  it('declarável: entry SEM marker custom e com fields', () => {
    for (const op of MIGRATED) {
      const spec = TRANSFORM_REGISTRY[op];
      expect(spec.custom).toBeUndefined();
      expect(spec.fields.length).toBeGreaterThan(0);
    }
  });

  it('todo campo carrega o testid histórico pb-cfg-* e um container', () => {
    for (const [, spec] of Object.entries(TRANSFORM_REGISTRY)) {
      expect(spec.container).toMatch(/^pb-cfg-/);
      for (const f of flat(spec.fields)) {
        if (f.type === 'notice') continue;
        expect(f.testid).toMatch(/^pb-cfg-/);
      }
    }
  });

  it('marker custom só existe nos bespoke (nunca custom + fields juntos)', () => {
    for (const [op, spec] of Object.entries(TRANSFORM_REGISTRY)) {
      if (spec.custom) {
        expect(spec.custom).toBe(op); // o marker aponta o próprio op (dispatch 1:1)
        expect(spec.fields).toEqual([]);
      }
    }
  });

  // Sem drift de default: onde `defaultArgsForTransform` define uma chave, o registro
  // usa o MESMO default (o seletor de op semeia args via defaultArgsForTransform).
  it('defaults do registro batem com defaultArgsForTransform (fonte única)', () => {
    for (const op of MIGRATED) {
      const seed = defaultArgsForTransform(op);
      for (const f of TRANSFORM_REGISTRY[op].fields) {
        if (f.default === undefined) continue;
        if (!(f.key in seed)) continue; // select/dedupe/derive não têm seed (args {})
        expect({ op, key: f.key, val: f.default }).toEqual({ op, key: f.key, val: seed[f.key] });
      }
    }
  });

  it('refs de coluna usam field type column/column-multi (nunca options estrito)', () => {
    const colRefs: Record<string, string[]> = {
      select: ['columns'], splitout: ['field'], dedupe: ['by'], derive: ['inputs'],
      crypto: ['input'], html: ['input'], xml: ['input'], markdown: ['input'], geopoint: ['input'],
    };
    for (const [op, keys] of Object.entries(colRefs)) {
      for (const k of keys) {
        const f = TRANSFORM_REGISTRY[op].fields.find((x) => x.key === k)!;
        expect(['column', 'column-multi']).toContain(f.type);
        expect(f.typeOptions?.loadOptions).toBe('columns');
      }
    }
  });

  it('subworkflow: board_id carrega loadOptions=boards e pass_rows é boolean default true', () => {
    const sub = TRANSFORM_REGISTRY.subworkflow;
    const board = sub.fields.find((f) => f.key === 'board_id')!;
    expect(board.type).toBe('options');
    expect(board.typeOptions?.loadOptions).toBe('boards');
    const pass = sub.fields.find((f) => f.key === 'pass_rows')!;
    expect(pass.type).toBe('boolean');
    expect(pass.default).toBe(true);
  });
});
