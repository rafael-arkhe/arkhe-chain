/**
 * F4 — TDD do resumo de compatibilidade (diff proposto × ontologia existente).
 */
import { compatSummary } from '../components/solution-designer/compat-summary';

const diff = {
  added_types: [{ kind: 'Contexto' } as never],
  removed_types: [],
  updated_types: [
    {
      kind: 'PerfilInstagram',
      // a operação precisa de bio/seguidores; o tipo existente não tem
      added_properties: [{ key: 'bio' } as never, { key: 'seguidores' } as never],
      removed_properties: ['campo_legado'],
      changed_properties: [{ key: 'status', from_type: 'text', to_type: 'enum' }],
      relabeled_properties: [],
    },
    {
      kind: 'SemDelta',
      added_properties: [],
      removed_properties: [],
      changed_properties: [],
      relabeled_properties: [],
    },
  ],
  added_links: [
    { source_kind: 'PerfilInstagram', target_kind: 'PostInstagram', relation: 'possui_post' } as never,
  ],
  removed_links: [],
  added_actions: [],
  removed_actions: [],
};

describe('compatSummary', () => {
  it('lista, por tipo existente, o que falta / diverge / sobra', () => {
    const s = compatSummary(diff as never);
    expect(s.conflicts).toHaveLength(1); // SemDelta é filtrado (sem delta)
    const c = s.conflicts[0];
    expect(c.kind).toBe('PerfilInstagram');
    expect(c.missing).toEqual(['bio', 'seguidores']);
    expect(c.divergent).toEqual([{ key: 'status', from: 'text', to: 'enum' }]);
    expect(c.extra).toEqual(['campo_legado']);
    expect(c.destructive).toBe(true); // tem divergência/remoção
  });

  it('lista relações a criar e tipos novos', () => {
    const s = compatSummary(diff as never);
    expect(s.relationsToCreate).toEqual([
      { source: 'PerfilInstagram', relation: 'possui_post', target: 'PostInstagram' },
    ]);
    expect(s.newTypes).toEqual(['Contexto']);
    expect(s.hasAny).toBe(true);
  });

  it('diff vazio/nulo → nada a sinalizar', () => {
    expect(compatSummary(null).hasAny).toBe(false);
    expect(compatSummary(undefined).conflicts).toEqual([]);
    const empty = compatSummary({
      added_types: [], removed_types: [], updated_types: [], added_links: [],
      removed_links: [], added_actions: [], removed_actions: [],
    } as never);
    expect(empty.hasAny).toBe(false);
  });
});
