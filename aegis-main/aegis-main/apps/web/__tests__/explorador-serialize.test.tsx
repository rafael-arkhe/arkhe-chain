/**
 * T4 /explorador — serialização das CAMADAS para o SearchFeed (Criar alerta).
 * Funções PURAS exportadas pela página; o backend (entity_matches_filters) casa
 * o mesmo shape. Mantém os dois lados em acordo.
 */
import { estagiosToFilters, estagioLabel, type Estagio } from '@/app/explorador/page';

describe('estagiosToFilters', () => {
  it('tipo → { kind:"tipo", value }', () => {
    const out = estagiosToFilters([
      { id: '1', kind: 'tipo', valor: 'pessoa', antes: 10, depois: 4 },
    ]);
    expect(out).toEqual({ stages: [{ kind: 'tipo', value: 'pessoa' }] });
  });

  it('classificacao → { kind:"marcacao", markings } do nível', () => {
    const out = estagiosToFilters([
      { id: '1', kind: 'classificacao', valor: 'restrito', antes: 10, depois: 4 },
    ]);
    expect(out).toEqual({
      stages: [{ kind: 'marcacao', markings: ['OPERACIONAL', 'restrito'] }],
    });
  });

  it('classificacao desconhecida cai no próprio valor', () => {
    const out = estagiosToFilters([
      { id: '1', kind: 'classificacao', valor: 'zzz', antes: 1, depois: 1 },
    ]);
    expect(out).toEqual({ stages: [{ kind: 'marcacao', markings: ['zzz'] }] });
  });

  it('prop → { kind:"prop", path, op:"contains", value }', () => {
    const out = estagiosToFilters([
      { id: '1', kind: 'prop', key: 'correlations.uf', valor: 'SP', antes: 10, depois: 2 },
    ]);
    expect(out).toEqual({
      stages: [{ kind: 'prop', path: 'correlations.uf', op: 'contains', value: 'SP' }],
    });
  });

  it('texto → { kind:"texto", value }', () => {
    const out = estagiosToFilters([
      { id: '1', kind: 'texto', valor: 'joao', antes: 10, depois: 3 },
    ]);
    expect(out).toEqual({ stages: [{ kind: 'texto', value: 'joao' }] });
  });

  it('preserva a ordem das camadas', () => {
    const estagios: Estagio[] = [
      { id: '1', kind: 'tipo', valor: 'pessoa', antes: 10, depois: 8 },
      { id: '2', kind: 'prop', key: 'uf', valor: 'SP', antes: 8, depois: 5 },
      { id: '3', kind: 'texto', valor: 'silva', antes: 5, depois: 2 },
    ];
    const stages = estagiosToFilters(estagios).stages as Array<{ kind: string }>;
    expect(stages.map((s) => s.kind)).toEqual(['tipo', 'prop', 'texto']);
  });

  it('lista vazia → { stages: [] }', () => {
    expect(estagiosToFilters([])).toEqual({ stages: [] });
  });
});

describe('estagioLabel', () => {
  it('classificacao usa rótulo humano (CLASSIFICATION_LABEL)', () => {
    const lbl = estagioLabel({
      id: '1',
      kind: 'classificacao',
      valor: 'sigiloso',
      antes: 1,
      depois: 1,
    });
    expect(lbl).toContain('SIGILOSO');
  });

  it('prop mostra key e valor', () => {
    expect(
      estagioLabel({ id: '1', kind: 'prop', key: 'uf', valor: 'SP', antes: 1, depois: 1 }),
    ).toBe('uf contém "SP"');
  });

  it('texto', () => {
    expect(
      estagioLabel({ id: '1', kind: 'texto', valor: 'joao', antes: 1, depois: 1 }),
    ).toBe('Texto contém "joao"');
  });
});
