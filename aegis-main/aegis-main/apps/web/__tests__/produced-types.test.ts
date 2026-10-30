import {
  producedTypes,
  withProducedTypes,
  type ProducingSource,
} from '@/components/solution-designer/produced-types';

// LinkedSource-like: carrega campos extras além dos de ProducingSource. Tipado
// em variável (não literal fresco) p/ evitar excess-property-check na chamada
// genérica — espelha o uso real em ConnectDataSection (passa um LinkedSource).
type SrcLike = ProducingSource & {
  kind?: string;
  id?: string;
  id_field?: string;
};

describe('producedTypes', () => {
  it('retrocompat: só o singular vira lista de 1', () => {
    expect(producedTypes({ target_node_type: 'PerfilInstagram' })).toEqual(['PerfilInstagram']);
  });

  it('prioriza a lista quando presente', () => {
    expect(
      producedTypes({
        target_node_type: 'PerfilInstagram',
        target_node_types: ['PerfilInstagram', 'PostInstagram'],
      }),
    ).toEqual(['PerfilInstagram', 'PostInstagram']);
  });

  it('dedupe + descarta vazios', () => {
    expect(
      producedTypes({ target_node_types: ['A', '', 'A', 'B'] }),
    ).toEqual(['A', 'B']);
  });

  it('sem nada → lista vazia', () => {
    expect(producedTypes({})).toEqual([]);
  });
});

describe('withProducedTypes', () => {
  it('sincroniza o singular com o 1º da lista', () => {
    const src: SrcLike = { kind: 'conector' };
    const out = withProducedTypes(src, ['PerfilInstagram', 'PostInstagram']);
    expect(out.target_node_type).toBe('PerfilInstagram');
    expect(out.target_node_types).toEqual(['PerfilInstagram', 'PostInstagram']);
  });

  it('lista vazia limpa ambos os campos', () => {
    const out = withProducedTypes({ target_node_type: 'X', target_node_types: ['X'] }, []);
    expect(out.target_node_type).toBeUndefined();
    expect(out.target_node_types).toBeUndefined();
  });

  it('dedupe ao gravar', () => {
    const src: SrcLike = {};
    const out = withProducedTypes(src, ['A', 'A', 'B']);
    expect(out.target_node_types).toEqual(['A', 'B']);
  });

  it('preserva outros campos da fonte', () => {
    const src: SrcLike = { kind: 'fonte', id: 'csv1', id_field: 'cpf' };
    const out = withProducedTypes(src, ['Pessoa']);
    expect(out.kind).toBe('fonte');
    expect(out.id).toBe('csv1');
    expect(out.id_field).toBe('cpf');
  });
});
