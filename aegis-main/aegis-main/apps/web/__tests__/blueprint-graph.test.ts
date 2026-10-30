/**
 * F3 — arestas de lineage reais no diagrama do AIP.
 * TDD da função PURA que deriva nós de tipo de objeto + arestas
 * (relações, Coleta→objeto, objeto→consumidores) do blueprint embutido,
 * usando o blueprint REAL da operação do Instagram do operador.
 */
import {
  deriveBlueprintGraph,
  objectNodeId,
  orderByFlow,
} from '../components/solution-designer/blueprint-graph';

// Subconjunto fiel do que /design-graph embute em wizard._blueprint
// (capturado na operação "hashtag → perfis → posts → inferência → contexto").
const bp = {
  ontology_types: [
    { kind: 'Hashtag', display_name: 'Hashtag' },
    { kind: 'PerfilInstagram', display_name: 'Perfil do Instagram' },
    { kind: 'PostInstagram' },
    { kind: 'Inferencia' },
    { kind: 'Contexto' },
  ],
  proposed_links: [
    { source_kind: 'Hashtag', target_kind: 'PerfilInstagram', relation: 'coletado_por_hashtag' },
    { source_kind: 'PerfilInstagram', target_kind: 'PostInstagram', relation: 'possui_post' },
    { source_kind: 'PerfilInstagram', target_kind: 'Inferencia', relation: 'inferido_sobre_perfil' },
    { source_kind: 'PostInstagram', target_kind: 'Inferencia', relation: 'inferido_sobre_post' },
    { source_kind: 'Inferencia', target_kind: 'Contexto', relation: 'gera_contexto' },
  ],
  action_types: [{ target_kind: 'PerfilInstagram' }, { target_kind: 'Inferencia' }],
  workspace_layout: [{ type: 'object_table_v2', config: { object_kind: 'PerfilInstagram' } }],
  proposed_pages: [
    { widgets: [{ type: 'writeback_form', config: { object_kind: 'Inferencia' } }] },
  ],
};

const phases = [
  {
    id: 'p-col',
    kind: 'concept',
    phase: 'coleta',
    config: {
      items: [
        { label: 'Ingestão · Hashtag' },
        { label: 'Ingestão · PerfilInstagram' },
        { label: 'Ingestão · PostInstagram' },
      ],
    },
  },
  { id: 'p-onto', kind: 'concept', phase: 'ontologia', config: {} },
  { id: 'p-app', kind: 'concept', phase: 'aplicacao', config: {} },
];

describe('deriveBlueprintGraph', () => {
  it('cria um nó por tipo de objeto, com id estável e rótulo humano', () => {
    const { objectNodes } = deriveBlueprintGraph(bp, phases);
    expect(objectNodes.map((n) => n.id).sort()).toEqual(
      ['Contexto', 'Hashtag', 'Inferencia', 'PerfilInstagram', 'PostInstagram']
        .map(objectNodeId)
        .sort(),
    );
    const perfil = objectNodes.find((n) => n.config.object_kind === 'PerfilInstagram')!;
    expect(perfil.title).toBe('Perfil do Instagram'); // usa display_name
    expect(perfil.kind).toBe('ontology_type');
    const post = objectNodes.find((n) => n.config.object_kind === 'PostInstagram')!;
    expect(post.title).toBe('PostInstagram'); // sem display_name → kind
  });

  it('desenha cada proposed_link como aresta tipo↔tipo, com a relação legível', () => {
    const { edges } = deriveBlueprintGraph(bp, phases);
    const rels = edges.filter((e) => e.relation);
    expect(rels).toHaveLength(5);
    const possui = rels.find(
      (e) => e.source === objectNodeId('PerfilInstagram') && e.target === objectNodeId('PostInstagram'),
    )!;
    expect(possui).toBeTruthy();
    expect(possui.label).toBe('possui post'); // humanizado (sem _)
  });

  it('liga o objeto à fase de Construção quando um widget/ação o consome', () => {
    const { edges } = deriveBlueprintGraph(bp, phases);
    const cons = edges.filter((e) => e.consumer);
    // PerfilInstagram (object_table_v2 + ação) e Inferencia (writeback_form + ação)
    const perfil = cons.find((e) => e.source === objectNodeId('PerfilInstagram'));
    const infer = cons.find((e) => e.source === objectNodeId('Inferencia'));
    expect(perfil?.target).toBe('p-app');
    expect(infer?.target).toBe('p-app');
    // Contexto não é consumido por nenhum widget/ação → sem aresta de consumo
    expect(cons.find((e) => e.source === objectNodeId('Contexto'))).toBeUndefined();
  });

  it('liga a Coleta aos objetos que ela ingere (dos itens do nó Coleta)', () => {
    const { edges } = deriveBlueprintGraph(bp, phases);
    const col = edges.filter((e) => e.source === 'p-col');
    const targets = col.map((e) => e.target).sort();
    expect(targets).toEqual(
      ['Hashtag', 'PerfilInstagram', 'PostInstagram'].map(objectNodeId).sort(),
    );
  });

  it('é seguro com blueprint vazio e sem nós de fase', () => {
    expect(deriveBlueprintGraph(undefined, [])).toEqual({ objectNodes: [], edges: [] });
    expect(deriveBlueprintGraph({}, [])).toEqual({ objectNodes: [], edges: [] });
    // sem fases: ainda dá os nós de objeto + relações, mas sem coleta/consumo
    const r = deriveBlueprintGraph(bp, []);
    expect(r.objectNodes).toHaveLength(5);
    expect(r.edges.every((e) => e.relation)).toBe(true);
  });

  it('cada nó de objeto CITA suas relações (→ referencia / ← referenciado por) (F5)', () => {
    const { objectNodes } = deriveBlueprintGraph(bp, phases);
    const perfil = objectNodes.find((n) => n.config.object_kind === 'PerfilInstagram')!;
    const labels = perfil.config.items.map((it) => it.label);
    // PerfilInstagram → possui_post → PostInstagram (referencia)
    expect(labels.some((l) => l.startsWith('→') && /possui post/.test(l) && /PostInstagram/.test(l))).toBe(true);
    // Hashtag → coletado_por_hashtag → PerfilInstagram  ⇒  PerfilInstagram é referenciado por Hashtag
    expect(labels.some((l) => l.startsWith('←') && /coletado por hashtag/.test(l) && /Hashtag/.test(l))).toBe(true);
  });

  it('ordena os tipos pelo fluxo (raiz→folha) p/ layout upstream→downstream (F7)', () => {
    const order = orderByFlow(
      ['Contexto', 'Inferencia', 'PostInstagram', 'Hashtag', 'PerfilInstagram'],
      bp.proposed_links,
    );
    // Hashtag(0) → PerfilInstagram(1) → PostInstagram(2) → Inferencia(3) → Contexto(4)
    expect(order).toEqual([
      'Hashtag',
      'PerfilInstagram',
      'PostInstagram',
      'Inferencia',
      'Contexto',
    ]);
  });

  it('orderByFlow não trava em ciclo', () => {
    const order = orderByFlow(
      ['A', 'B'],
      [
        { source_kind: 'A', target_kind: 'B', relation: 'x' },
        { source_kind: 'B', target_kind: 'A', relation: 'y' },
      ],
    );
    expect(order.sort()).toEqual(['A', 'B']);
  });

  it('nunca referencia um tipo desconhecido numa relação (link órfão é dropado)', () => {
    const r = deriveBlueprintGraph(
      {
        ontology_types: [{ kind: 'A' }],
        proposed_links: [{ source_kind: 'A', target_kind: 'Fantasma', relation: 'x' }],
      },
      [],
    );
    expect(r.edges).toHaveLength(0);
  });
});
