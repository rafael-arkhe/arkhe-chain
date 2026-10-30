import { synthesizeSampleSkeleton } from '@/components/dev/synthesize-sample';

describe('synthesizeSampleSkeleton', () => {
  it('default por tipo: string→"", number→0, bool→false, array→[], object→{}', () => {
    const sk = synthesizeSampleSkeleton([
      { key: 'username', type: 'string' },
      { key: 'seguidores', type: 'integer' },
      { key: 'verificado', type: 'boolean' },
      { key: 'posts', type: 'array' },
      { key: 'metadados', type: 'object' },
    ]);
    expect(sk).toEqual({
      username: '',
      seguidores: 0,
      verificado: false,
      posts: [],
      metadados: {},
    });
  });

  it('tipos desconhecidos caem em string vazia', () => {
    expect(synthesizeSampleSkeleton([{ key: 'bio', type: 'text' }])).toEqual({ bio: '' });
  });

  it('ignora props sem key e lista vazia produz {}', () => {
    expect(synthesizeSampleSkeleton([])).toEqual({});
    expect(
      synthesizeSampleSkeleton([{ key: '', type: 'string' }, { key: 'ok', type: 'string' }]),
    ).toEqual({ ok: '' });
  });
});
