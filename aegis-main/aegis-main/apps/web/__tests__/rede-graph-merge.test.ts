/**
 * Onda 2 — /rede unify. normalizeRedeGraph aceita os DOIS shapes (canônico
 * OntologyNode/Edge e legado Entity/EntityLink), namespacia ids (n:/e:) e o
 * merge dedupa nós + mantém só arestas com os dois endpoints presentes.
 */
import {
  normalizeRedeGraph,
  mergeRedeGraphs,
  overviewToRede,
  nsId,
  stripNs,
} from '@/lib/rede/graph';

describe('nsId / stripNs', () => {
  it('round-trip canônico e legado', () => {
    expect(nsId('node', 'abc')).toBe('n:abc');
    expect(nsId('entity', 'abc')).toBe('e:abc');
    expect(stripNs('n:abc')).toEqual({ origin: 'node', rawId: 'abc' });
    expect(stripNs('e:abc')).toEqual({ origin: 'entity', rawId: 'abc' });
    expect(stripNs('abc')).toEqual({ origin: null, rawId: 'abc' });
  });
});

describe('normalizeRedeGraph — shape canônico (/ontology/graph)', () => {
  const g = {
    nodes: [
      { id: 'A', name: 'estrutura', node_type: 'concept', markings: [] },
      { id: 'B', name: 'câmera', node_type: 'cctv_stream', markings: ['OPERACIONAL'] },
    ],
    edges: [
      { id: 'E1', source_node_id: 'A', target_node_id: 'B', relation_type: 'MONITORA' },
      { id: 'E2', source_node_id: 'A', target_node_id: 'GHOST', relation_type: 'X' },
    ],
  };

  it('namespacia com n: e mapeia node_type→entity_type', () => {
    const out = normalizeRedeGraph(g, 'node');
    expect(out.nodes.map((n) => n.id)).toEqual(['n:A', 'n:B']);
    expect(out.nodes[0]._rawId).toBe('A');
    expect(out.nodes[0]._origin).toBe('node');
    expect(out.nodes[0].entity_type).toBe('concept');
    expect(out.nodes[1].entity_type).toBe('cctv_stream');
    expect(out.nodes[1].classification).toBe('restrito'); // OPERACIONAL→restrito
  });

  it('mapeia source_node_id/target_node_id/relation_type e namespacia', () => {
    const out = normalizeRedeGraph(g, 'node');
    expect(out.links).toHaveLength(2);
    expect(out.links[0]).toMatchObject({
      source_id: 'n:A',
      target_id: 'n:B',
      link_type: 'MONITORA',
    });
  });
});

describe('normalizeRedeGraph — shape legado (/entities/global/graph)', () => {
  it('usa kind/display e namespacia com e:; edges vazias → 0 links', () => {
    const g = {
      nodes: [{ id: 'X', display: 'Fulano', kind: 'pessoa', markings: [] }],
      edges: [],
    };
    const out = normalizeRedeGraph(g, 'entity');
    expect(out.nodes[0]).toMatchObject({ id: 'e:X', _rawId: 'X', name: 'Fulano', entity_type: 'pessoa' });
    expect(out.links).toHaveLength(0);
  });

  it('aceita "links" no lugar de "edges" e src/dst/rel', () => {
    const g = { nodes: [{ id: 'X' }, { id: 'Y' }], links: [{ src: 'X', dst: 'Y', rel: 'liga' }] };
    const out = normalizeRedeGraph(g, 'entity');
    expect(out.links[0]).toMatchObject({ source_id: 'e:X', target_id: 'e:Y', link_type: 'liga' });
  });
});

describe('overviewToRede — clusters viram super-nós', () => {
  const ov = {
    by: 'node_type',
    total_nodes: 1746,
    clusters: [
      { key: 'Event', label: 'Event', count: 1424 },
      { key: 'Camera', label: 'Camera', count: 322 },
    ],
    edges: [
      { source: 'Event', target: 'Camera', count: 1411 },
      { source: 'Event', target: 'GHOST', count: 9 }, // endpoint sem cluster → cai
    ],
  };
  it('mapeia clusters p/ super-nós com _cluster/_count e nome com contagem', () => {
    const { nodes } = overviewToRede(ov, 'node');
    expect(nodes.map((n) => n.id)).toEqual(['n:cluster:Event', 'n:cluster:Camera']);
    expect(nodes[0]).toMatchObject({ _cluster: true, _clusterKey: 'Event', _count: 1424, entity_type: 'Event' });
    expect(nodes[0].name).toContain('Event');
    expect(nodes[0].name).toMatch(/mil/); // 1424 → "1,4 mil"
  });
  it('arestas agregadas só entre clusters presentes (descarta órfã)', () => {
    const { links } = overviewToRede(ov, 'node');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ source_id: 'n:cluster:Event', target_id: 'n:cluster:Camera', link_type: '1,4 mil' });
  });
});

describe('mergeRedeGraphs', () => {
  it('mescla os dois stores, dedupa nós e descarta arestas órfãs', () => {
    const canon = normalizeRedeGraph(
      {
        nodes: [{ id: 'A' }, { id: 'B' }],
        edges: [
          { id: 'E1', source_node_id: 'A', target_node_id: 'B', relation_type: 'r' },
          { id: 'E2', source_node_id: 'A', target_node_id: 'GHOST', relation_type: 'r' },
        ],
      },
      'node',
    );
    const legacy = normalizeRedeGraph({ nodes: [{ id: 'A' }], edges: [] }, 'entity');
    const merged = mergeRedeGraphs([canon, legacy]);
    // n:A, n:B, e:A — sem colisão entre n:A e e:A (namespaces distintos)
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(['e:A', 'n:A', 'n:B']);
    // E1 fica (A,B presentes); E2 cai (GHOST ausente)
    expect(merged.links.map((l) => l.id)).toEqual(['E1']);
  });

  it('soma evidenceCount e não duplica nós repetidos', () => {
    const a = normalizeRedeGraph({ nodes: [{ id: 'A' }], edges: [], evidence_count: 2 }, 'node');
    const b = normalizeRedeGraph({ nodes: [{ id: 'A' }], edges: [], evidence_count: 3 }, 'node');
    const merged = mergeRedeGraphs([a, b]);
    expect(merged.nodes).toHaveLength(1); // n:A dedupado
    expect(merged.evidenceCount).toBe(5);
  });
});
