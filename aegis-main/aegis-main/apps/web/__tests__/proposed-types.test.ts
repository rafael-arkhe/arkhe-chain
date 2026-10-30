/**
 * F1 — TDD da fusão tipos-propostos × tipos-existentes no select de "objeto" da
 * Coleta, e da extração dos propostos do blueprint embutido.
 */
import {
  mergeObjectTypeOptions,
  proposedTypesFromGraph,
} from '../components/solution-designer/proposed-types-context';

describe('proposedTypesFromGraph', () => {
  it('extrai {kind,label} dos ontology_types do blueprint embutido', () => {
    const graph = {
      wizard: {
        _blueprint: {
          ontology_types: [
            { kind: 'PerfilInstagram', display_name: 'Perfil do Instagram' },
            { kind: 'PostInstagram' },
          ],
        },
      },
    };
    expect(proposedTypesFromGraph(graph)).toEqual([
      { kind: 'PerfilInstagram', label: 'Perfil do Instagram' },
      { kind: 'PostInstagram', label: 'PostInstagram' },
    ]);
  });

  it('é seguro sem blueprint / sem wizard', () => {
    expect(proposedTypesFromGraph(undefined)).toEqual([]);
    expect(proposedTypesFromGraph({})).toEqual([]);
    expect(proposedTypesFromGraph({ wizard: {} })).toEqual([]);
  });
});

describe('mergeObjectTypeOptions', () => {
  const existing = [
    { value: 'User', label: 'User' },
    { value: 'Post', label: 'Post' },
  ];
  const proposed = [
    { kind: 'PerfilInstagram', label: 'Perfil do Instagram' },
    { kind: 'User', label: 'User' }, // já existe → não duplica
  ];

  it('coloca os propostos-novos PRIMEIRO, com sufixo e flag proposed', () => {
    const out = mergeObjectTypeOptions(existing, proposed);
    expect(out[0]).toEqual({
      value: 'PerfilInstagram',
      label: 'Perfil do Instagram · proposto',
      proposed: true,
    });
    // existentes preservados, sem duplicar User
    expect(out.filter((o) => o.value === 'User')).toHaveLength(1);
    expect(out.map((o) => o.value)).toEqual(['PerfilInstagram', 'User', 'Post']);
  });

  it('sem propostos → opções existentes inalteradas', () => {
    expect(mergeObjectTypeOptions(existing, [])).toEqual(existing);
  });

  it('dedupe entre os próprios propostos', () => {
    const out = mergeObjectTypeOptions(
      [],
      [
        { kind: 'A', label: 'A' },
        { kind: 'A', label: 'A dup' },
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('A');
  });
});
