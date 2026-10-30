/**
 * Wave 1 inc2 — o motor de visibilidade declarativa (displayOptions) do nó do DAG.
 * Espelho da semântica do n8n: AND entre chaves de show, OR dentro da chave,
 * hide vence show; + defaults a partir do schema.
 */
import {
  shouldDisplayField,
  fieldValueMatches,
  defaultsFromFields,
  type NodeFieldSpec,
} from '@/lib/pipeline/node-fields';

const F = (over: Partial<NodeFieldSpec>): NodeFieldSpec => ({
  key: 'f', label: 'F', type: 'string', ...over,
});

describe('fieldValueMatches (OR dentro da chave, coerção por string)', () => {
  it('casa valor literal', () => {
    expect(fieldValueMatches('a', ['a', 'b'])).toBe(true);
    expect(fieldValueMatches('c', ['a', 'b'])).toBe(false);
  });
  it('coage number/string', () => {
    expect(fieldValueMatches(30, ['30'])).toBe(true);
    expect(fieldValueMatches('30', [30])).toBe(true);
  });
  it('booleano por truthiness', () => {
    expect(fieldValueMatches(true, [true])).toBe(true);
    expect(fieldValueMatches('', [false])).toBe(true);
    expect(fieldValueMatches('x', [true])).toBe(true);
  });
});

describe('shouldDisplayField (displayOptions estilo n8n)', () => {
  it('sem displayOptions → sempre visível', () => {
    expect(shouldDisplayField(F({}), {})).toBe(true);
  });
  it('show: TODAS as chaves precisam casar (AND)', () => {
    const f = F({ displayOptions: { show: { mode: ['per_row'], parse: ['json'] } } });
    expect(shouldDisplayField(f, { mode: 'per_row', parse: 'json' })).toBe(true);
    expect(shouldDisplayField(f, { mode: 'per_row', parse: 'text' })).toBe(false);
    expect(shouldDisplayField(f, { mode: 'once', parse: 'json' })).toBe(false);
  });
  it('show: OR dentro dos valores de UMA chave', () => {
    const f = F({ displayOptions: { show: { algo: ['sha256', 'sha1'] } } });
    expect(shouldDisplayField(f, { algo: 'sha1' })).toBe(true);
    expect(shouldDisplayField(f, { algo: 'md5' })).toBe(false);
  });
  it('hide esconde se QUALQUER chave casar; hide vence show', () => {
    const f = F({ displayOptions: { show: { mode: ['a'] }, hide: { adv: [true] } } });
    expect(shouldDisplayField(f, { mode: 'a', adv: false })).toBe(true);
    expect(shouldDisplayField(f, { mode: 'a', adv: true })).toBe(false); // hide vence
  });
});

describe('defaultsFromFields', () => {
  it('semeia só os campos com default declarado', () => {
    const fields: NodeFieldSpec[] = [
      F({ key: 'seconds', type: 'number', default: 5 }),
      F({ key: 'mode', type: 'options', default: 'append' }),
      F({ key: 'nolabel', type: 'string' }), // sem default → omitido
    ];
    expect(defaultsFromFields(fields)).toEqual({ seconds: 5, mode: 'append' });
  });
});
