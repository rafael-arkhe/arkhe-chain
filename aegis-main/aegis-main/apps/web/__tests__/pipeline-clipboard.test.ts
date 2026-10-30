/**
 * F8.5 — clipboard do canvas (copiar/colar nós): serialização da seleção,
 * parse tolerante (payload novo / legado / graph completo) e materialização
 * (ids novos, arestas remapeadas, offset +36).
 */
import {
  PIPELINE_CLIPBOARD_KIND,
  PASTE_OFFSET,
  serializeNodesToClipboard,
  parseClipboardText,
  materializePaste,
} from '@/lib/pipeline/clipboard';
import type { PipelineBoardGraph } from '@/lib/api';

const GRAPH: PipelineBoardGraph = {
  nodes: [
    { id: 'src_1', op: 'source', config: { dataset: 'ds_a' }, position: { x: 10, y: 20 } },
    { id: 'tf_1', op: 'transform', config: { op: 'filter', args: {} }, position: { x: 200, y: 20 } },
    { id: 'out_1', op: 'output', config: { target_node_type: 'Pessoa' } },
  ],
  edges: [
    { from: 'src_1', to: 'tf_1' },
    { from: 'tf_1', to: 'out_1' },
  ],
};

describe('serializeNodesToClipboard', () => {
  it('serializa só os nós pedidos + arestas INTERNAS à seleção', () => {
    const text = serializeNodesToClipboard(GRAPH, ['src_1', 'tf_1']);
    const obj = JSON.parse(text);
    expect(obj.kind).toBe(PIPELINE_CLIPBOARD_KIND);
    expect(obj.nodes.map((n: { id: string }) => n.id)).toEqual(['src_1', 'tf_1']);
    // aresta tf_1→out_1 sai (out_1 não está na seleção)
    expect(obj.edges).toEqual([{ from: 'src_1', to: 'tf_1' }]);
  });

  it('nó único vira payload de 1 nó sem arestas', () => {
    const obj = JSON.parse(serializeNodesToClipboard(GRAPH, ['out_1']));
    expect(obj.nodes).toHaveLength(1);
    expect(obj.nodes[0].op).toBe('output');
    expect(obj.edges).toEqual([]);
  });
});

describe('parseClipboardText', () => {
  it('roundtrip do payload novo', () => {
    const parsed = parseClipboardText(serializeNodesToClipboard(GRAPH, ['src_1', 'tf_1']));
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes.map((n) => n.id)).toEqual(['src_1', 'tf_1']);
    expect(parsed!.edges).toEqual([{ from: 'src_1', to: 'tf_1' }]);
  });

  it('aceita o formato LEGADO de nó único {op, config}', () => {
    const parsed = parseClipboardText(JSON.stringify({ op: 'transform', config: { op: 'set', args: {} } }));
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes).toHaveLength(1);
    expect(parsed!.nodes[0].op).toBe('transform');
    expect(parsed!.edges).toEqual([]);
  });

  it('aceita um graph COMPLETO (export F8.7)', () => {
    const parsed = parseClipboardText(JSON.stringify(GRAPH));
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes).toHaveLength(3);
    expect(parsed!.edges).toHaveLength(2);
  });

  it('descarta arestas com ponta fora dos nós do payload', () => {
    const parsed = parseClipboardText(JSON.stringify({
      nodes: [{ id: 'a', op: 'transform', config: {} }],
      edges: [{ from: 'a', to: 'fantasma' }],
    }));
    expect(parsed!.edges).toEqual([]);
  });

  it('lixo → null (nunca lança)', () => {
    expect(parseClipboardText('não é json')).toBeNull();
    expect(parseClipboardText('42')).toBeNull();
    expect(parseClipboardText('{"foo":"bar"}')).toBeNull();
    expect(parseClipboardText('{"nodes":[{"config":{}}]}')).toBeNull(); // nó sem op
  });
});

describe('materializePaste', () => {
  const seqUid = () => {
    let i = 0;
    return (prefix: string) => `${prefix}_new${++i}`;
  };

  it('gera ids NOVOS, remapeia arestas e desloca posição em +36', () => {
    const payload = parseClipboardText(serializeNodesToClipboard(GRAPH, ['src_1', 'tf_1']))!;
    const out = materializePaste(payload, new Set(['src_1', 'tf_1', 'out_1']), seqUid());
    expect(out.nodes.map((n) => n.id)).toEqual(['src_new1', 'tf_new2']);
    expect(out.edges).toEqual([{ from: 'src_new1', to: 'tf_new2' }]);
    expect(out.nodes[0].position).toEqual({ x: 10 + PASTE_OFFSET, y: 20 + PASTE_OFFSET });
  });

  it('evita colisão com ids existentes (re-sorteia)', () => {
    let i = 0;
    const uid = (prefix: string) => `${prefix}_${++i}`; // 1ª tentativa colide com tf_1
    const out = materializePaste(
      { nodes: [{ id: 'x', op: 'transform', config: {} }], edges: [] },
      new Set(['tf_1']),
      uid,
    );
    expect(out.nodes[0].id).toBe('tf_2');
  });

  it('deep-clona o config (mutar o colado não afeta a origem)', () => {
    const payload = { nodes: [{ id: 'a', op: 'transform', config: { args: { columns: ['x'] } } }], edges: [] };
    const out = materializePaste(payload, new Set(), seqUid());
    (out.nodes[0].config!.args as { columns: string[] }).columns.push('y');
    expect((payload.nodes[0].config.args as { columns: string[] }).columns).toEqual(['x']);
  });

  it('nó sem position permanece sem position (dagre posiciona)', () => {
    const out = materializePaste(
      { nodes: [{ id: 'a', op: 'output', config: {} }], edges: [] },
      new Set(),
      seqUid(),
    );
    expect(out.nodes[0].position).toBeUndefined();
    expect(out.nodes[0].id.startsWith('out_')).toBe(true);
  });

  it('ontology_output ganha prefixo out_ (fonte única do nodePrefix — antes divergia)', () => {
    const out = materializePaste(
      { nodes: [{ id: 'a', op: 'ontology_output', config: {} }], edges: [] },
      new Set(),
      seqUid(),
    );
    expect(out.nodes[0].id.startsWith('out_')).toBe(true);
  });
});

// A4/A5 — DAG não-linear: a aresta carrega `port` (saída de if/switch/error).
describe('roundtrip com PORTA na aresta (A4/A5)', () => {
  it('serialize → parse → materialize preservam edge.port; ops de fluxo têm prefixo próprio', () => {
    const g: PipelineBoardGraph = {
      nodes: [
        { id: 'if_1', op: 'if', config: { predicate: { path: 'uf', op: 'eq', value: 'SP' } } },
        { id: 'tf_1', op: 'transform', config: { op: 'select', args: {} } },
      ],
      edges: [{ from: 'if_1', to: 'tf_1', port: 'true' }],
    };
    const parsed = parseClipboardText(serializeNodesToClipboard(g, ['if_1', 'tf_1']));
    expect(parsed).not.toBeNull();
    expect(parsed!.edges).toEqual([{ from: 'if_1', to: 'tf_1', port: 'true' }]);

    let i = 0;
    const uid = (prefix: string) => `${prefix}_new${++i}`;
    const out = materializePaste(parsed!, new Set(['if_1', 'tf_1']), uid);
    // porta viaja no remapeamento de ids; prefixo do if é 'if' (nodePrefix novo)
    expect(out.nodes[0].id.startsWith('if_')).toBe(true);
    expect(out.edges).toEqual([{ from: out.nodes[0].id, to: out.nodes[1].id, port: 'true' }]);
  });

  it('parse tolera port ausente/não-string (aresta main continua {from,to})', () => {
    const parsed = parseClipboardText(JSON.stringify({
      nodes: [{ id: 'a', op: 'transform', config: {} }, { id: 'b', op: 'transform', config: {} }],
      edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b', port: 42 }],
    }));
    expect(parsed!.edges).toEqual([{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }]);
  });
});
