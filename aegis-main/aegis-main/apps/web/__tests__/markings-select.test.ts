import { parseMarkingsValue } from '@/components/ui/markings-select';

describe('parseMarkingsValue', () => {
  it('array de slugs passa filtrando não-strings', () => {
    expect(parseMarkingsValue(['UNCLASSIFIED', 'SECRET', '', 5 as never])).toEqual([
      'UNCLASSIFIED',
      'SECRET',
    ]);
  });
  it('JSON-string de array é parseado', () => {
    expect(parseMarkingsValue('["A","B"]')).toEqual(['A', 'B']);
  });
  it('string única não-JSON vira 1 slug', () => {
    expect(parseMarkingsValue('UNCLASSIFIED')).toEqual(['UNCLASSIFIED']);
  });
  it('vazio/null/undefined → []', () => {
    expect(parseMarkingsValue(undefined)).toEqual([]);
    expect(parseMarkingsValue(null)).toEqual([]);
    expect(parseMarkingsValue('')).toEqual([]);
    expect(parseMarkingsValue({})).toEqual([]);
  });
});
