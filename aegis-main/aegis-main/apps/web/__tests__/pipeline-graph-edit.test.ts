/**
 * F8.5 — edições puras de graph: rename inline (config.label) e remoção
 * multi-seleção (nós + arestas incidentes).
 */
import { applyNodeLabel, removeNodesFromGraph } from '@/lib/pipeline/graph-edit';
import type { PipelineBoardGraph } from '@/lib/api';

const GRAPH: PipelineBoardGraph = {
  nodes: [
    { id: 'src_1', op: 'source', config: { dataset: 'ds_a' } },
    { id: 'tf_1', op: 'transform', config: { op: 'filter', label: 'Filtro RJ' } },
    { id: 'out_1', op: 'output', config: {} },
  ],
  edges: [
    { from: 'src_1', to: 'tf_1' },
    { from: 'tf_1', to: 'out_1' },
  ],
};

describe('applyNodeLabel (F2 rename inline)', () => {
  it('grava o rótulo aparado em config.label sem tocar o resto', () => {
    const next = applyNodeLabel(GRAPH, 'src_1', '  Fonte G1  ');
    expect(next).not.toBeNull();
    const node = next!.nodes.find((n) => n.id === 'src_1')!;
    expect(node.config).toEqual({ dataset: 'ds_a', label: 'Fonte G1' });
    // original intacto (imutável)
    expect(GRAPH.nodes[0].config).toEqual({ dataset: 'ds_a' });
  });

  it('rótulo vazio REMOVE config.label (volta ao default por kind)', () => {
    const next = applyNodeLabel(GRAPH, 'tf_1', '   ');
    expect(next).not.toBeNull();
    expect(next!.nodes.find((n) => n.id === 'tf_1')!.config).toEqual({ op: 'filter' });
  });

  it('nó inexistente → null (caller não emite)', () => {
    expect(applyNodeLabel(GRAPH, 'nope', 'X')).toBeNull();
  });

  it('rótulo idêntico → null (não gera dirty/undo à toa)', () => {
    expect(applyNodeLabel(GRAPH, 'tf_1', 'Filtro RJ')).toBeNull();
    expect(applyNodeLabel(GRAPH, 'src_1', '')).toBeNull(); // já sem label
  });
});

describe('removeNodesFromGraph (delete multi-seleção)', () => {
  it('remove os nós do conjunto + arestas incidentes', () => {
    const next = removeNodesFromGraph(GRAPH, new Set(['tf_1']));
    expect(next.nodes.map((n) => n.id)).toEqual(['src_1', 'out_1']);
    expect(next.edges).toEqual([]);
  });

  it('conjunto vazio → graph igual', () => {
    const next = removeNodesFromGraph(GRAPH, new Set());
    expect(next.nodes).toHaveLength(3);
    expect(next.edges).toHaveLength(2);
  });

  it('remove vários de uma vez', () => {
    const next = removeNodesFromGraph(GRAPH, new Set(['src_1', 'out_1']));
    expect(next.nodes.map((n) => n.id)).toEqual(['tf_1']);
    expect(next.edges).toEqual([]);
  });
});
