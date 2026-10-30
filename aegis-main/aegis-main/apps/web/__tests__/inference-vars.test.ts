import { objectFieldNames, unresolvedRefs } from '@/components/solution-designer/inference-vars';

describe('objectFieldNames', () => {
  it('extrai keys, dedupe, ignora vazios', () => {
    expect(
      objectFieldNames([{ key: 'username' }, { key: '' }, { key: 'bio' }, { key: 'username' }]),
    ).toEqual(['username', 'bio']);
  });
  it('undefined → []', () => {
    expect(objectFieldNames(undefined)).toEqual([]);
  });
});

describe('unresolvedRefs', () => {
  it('só os {{x}} fora do conjunto conhecido', () => {
    expect(
      unresolvedRefs('Bio: {{bio}}, posts: {{posts}}, x: {{desconhecido}}', [
        'bio',
        'posts',
        'now',
      ]),
    ).toEqual(['desconhecido']);
  });
  it('campos do objeto entram como conhecidos → sem alerta', () => {
    const known = ['now', ...objectFieldNames([{ key: 'username' }, { key: 'biografia' }])];
    expect(unresolvedRefs('Analise {{username}} e {{biografia}}', known)).toEqual([]);
  });
  it('dedupe de refs repetidas', () => {
    expect(unresolvedRefs('{{x}} {{x}} {{y}}', [])).toEqual(['x', 'y']);
  });
  it('prompt vazio → []', () => {
    expect(unresolvedRefs('', ['a'])).toEqual([]);
  });
});
