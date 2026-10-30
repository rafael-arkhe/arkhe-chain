/**
 * M5-10 — <LineageFlowCanvas> (reactflow + dagre).
 *
 * Verifica que o canvas constrói um DIAGRAMA DIRECIONADO determinístico:
 *   - nós tipados por kind com cor de realce
 *   - arestas direcionadas (source→target) com MarkerType.ArrowClosed
 *   - layout dagre LR invocado (rankdir=LR), não simulação força-dirigida
 *   - colorAxis (general/permissions/usage) muda a cor de realce
 *
 * `reactflow` é mockado: capturamos as props `nodes`/`edges` para
 * inspecionar a transformação. `dagre` é espionado para garantir o
 * rankdir LR e que `layout()` rodou (determinístico, sem stateful sim).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LineageFlowCanvas,
  LineageNodeView,
  computeLayout,
  splitConnectivity,
} from '@/components/grafo/lineage-flow-canvas';
import type { LineageGraphNode, LineageGraphEdge } from '@/lib/api';

let capturedNodes: any[] = [];
let capturedEdges: any[] = [];

jest.mock('reactflow', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: any) => {
      capturedNodes = props.nodes;
      capturedEdges = props.edges;
      return React.createElement(
        'div',
        { 'data-testid': 'rf-mock' },
        props.children,
      );
    },
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    // M5-8: o canvas agora usa Panel + ReactFlowProvider + useReactFlow.
    Panel: ({ children }: any) =>
      React.createElement('div', { 'data-testid': 'rf-panel' }, children),
    ReactFlowProvider: ({ children }: any) => children,
    useReactFlow: () => ({
      fitView: jest.fn(),
      setCenter: jest.fn(),
      getZoom: () => 1,
    }),
    Position: { Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
  };
});

// Espiona dagre para assegurar rankdir=LR + layout() chamado.
const setGraphSpy = jest.fn();
const layoutSpy = jest.fn();
jest.mock('dagre', () => {
  const nodeStore = new Map<string, { width: number; height: number }>();
  return {
    __esModule: true,
    default: {
      graphlib: {
        Graph: class {
          setGraph(cfg: unknown) {
            (globalThis as any).__dagreSetGraph?.(cfg);
            return this;
          }
          setDefaultEdgeLabel() {
            return this;
          }
          setNode(id: string, dims: { width: number; height: number }) {
            nodeStore.set(id, dims);
          }
          setEdge() {}
          node(id: string) {
            const d = nodeStore.get(id);
            return d ? { x: 100, y: 50, width: d.width, height: d.height } : undefined;
          }
        },
      },
      layout: (...args: unknown[]) => {
        (globalThis as any).__dagreLayout?.(...args);
      },
    },
  };
});

beforeAll(() => {
  (globalThis as any).__dagreSetGraph = setGraphSpy;
  (globalThis as any).__dagreLayout = layoutSpy;
});

const nodes = [
  {
    id: 'asset:1',
    kind: 'DataAsset',
    label: 'logs.bo',
    markings: [],
    extra: { version: 1 },
    org: { project_id: 'p-1', project_label: 'Operação Norte' },
  },
  {
    id: 'action:abc',
    kind: 'ActionType',
    label: 'criar_caso',
    markings: ['SIGILOSO'],
    extra: { version: 3 },
  },
  { id: 'logic:x', kind: 'LogicFunction', label: 'classificar', markings: [], extra: { version: 1 } },
  // M5-polish — Language model node + Workspace node with org.
  {
    id: 'model:groq/llama-4-scout',
    kind: 'LanguageModel',
    label: 'llama-4-scout',
    markings: [],
    extra: { provider: 'groq', calls: 3 },
  },
  {
    id: 'workspace:9',
    kind: 'Workspace',
    label: 'Sala',
    markings: [],
    extra: { version: 1 },
    org: { project_id: 'p-2', project_label: 'Operação Sul' },
  },
];
const edges = [
  {
    id: 'e1',
    from_id: 'asset:1',
    to_id: 'action:abc',
    kind: 'action.execute',
    event_id: 'e1',
    actor: 'alice',
    created_at: null,
  },
];

describe('LineageFlowCanvas — diagrama direcionado', () => {
  beforeEach(() => {
    capturedNodes = [];
    capturedEdges = [];
    setGraphSpy.mockClear();
    layoutSpy.mockClear();
  });

  it('uses dagre LR layout (deterministic, not force-directed)', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} />);
    expect(layoutSpy).toHaveBeenCalled();
    expect(setGraphSpy).toHaveBeenCalledWith(
      expect.objectContaining({ rankdir: 'LR' }),
    );
  });

  it('maps every lineage node to a reactflow node with a position', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} />);
    expect(capturedNodes).toHaveLength(5);
    for (const n of capturedNodes) {
      expect(n.type).toBe('lineageNode');
      expect(n.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    }
  });

  it('colors the LanguageModel node by its kind under the general axis', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} colorAxis="general" />);
    const llm = capturedNodes.find((n) => n.id === 'model:groq/llama-4-scout');
    expect(llm.data.accent).toBe('#DB2777'); // LanguageModel magenta
  });

  it('colors nodes by Operação/Espaço under the organization axis', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} colorAxis="organization" />);
    const north = capturedNodes.find((n) => n.id === 'asset:1'); // p-1
    const south = capturedNodes.find((n) => n.id === 'workspace:9'); // p-2
    const noOrg = capturedNodes.find((n) => n.id === 'logic:x'); // sem org
    // Operações diferentes → cores diferentes; estável e não-cinza.
    expect(north.data.accent).not.toBe('#94A3B8');
    expect(south.data.accent).not.toBe('#94A3B8');
    expect(north.data.accent).not.toBe(south.data.accent);
    // Recurso sem Operação → cinza neutro "sem Operação".
    expect(noOrg.data.accent).toBe('#94A3B8');
  });

  it('gives the same organization color to two nodes in the same Operação', () => {
    const sameOrg = [
      { id: 'a', kind: 'DataAsset', label: 'a', markings: [], extra: {}, org: { project_id: 'p-9' } },
      { id: 'b', kind: 'Workspace', label: 'b', markings: [], extra: {}, org: { project_id: 'p-9' } },
    ];
    render(<LineageFlowCanvas nodes={sameOrg} edges={[]} colorAxis="organization" />);
    const a = capturedNodes.find((n) => n.id === 'a');
    const b = capturedNodes.find((n) => n.id === 'b');
    expect(a.data.accent).toBe(b.data.accent);
  });

  it('builds directed edges with an arrow marker (source → target)', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} />);
    expect(capturedEdges).toHaveLength(1);
    const e = capturedEdges[0];
    expect(e.source).toBe('asset:1');
    expect(e.target).toBe('action:abc');
    expect(e.markerEnd).toEqual(
      expect.objectContaining({ type: 'arrowclosed' }),
    );
  });

  it('colors nodes by kind under the general axis', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} colorAxis="general" />);
    const dataNode = capturedNodes.find((n) => n.id === 'asset:1');
    const actionNode = capturedNodes.find((n) => n.id === 'action:abc');
    expect(dataNode.data.accent).toBe('#2D77BE'); // DataAsset blue
    expect(actionNode.data.accent).toBe('#7C3AED'); // ActionType violet
  });

  it('colors nodes by marking presence under the permissions axis', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} colorAxis="permissions" />);
    const marked = capturedNodes.find((n) => n.id === 'action:abc'); // has SIGILOSO
    const unmarked = capturedNodes.find((n) => n.id === 'asset:1');
    expect(marked.data.accent).toBe('#D97706'); // marked amber
    expect(unmarked.data.accent).toBe('#0D9488'); // unmarked teal
  });

  it('colors nodes by version under the usage axis (outdated vs current)', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} colorAxis="usage" />);
    const outdated = capturedNodes.find((n) => n.id === 'action:abc'); // version 3
    const current = capturedNodes.find((n) => n.id === 'asset:1'); // version 1
    expect(outdated.data.accent).toBe('#DC2626'); // outdated red
    expect(current.data.accent).toBe('#2D77BE'); // current blue
  });

  it('drops edges whose endpoints are not in the node set', () => {
    const danglingEdges = [
      ...edges,
      {
        id: 'e2',
        from_id: 'asset:1',
        to_id: 'missing:99',
        kind: 'derived',
        event_id: 'e2',
        actor: null,
        created_at: null,
      },
    ];
    render(<LineageFlowCanvas nodes={nodes} edges={danglingEdges} />);
    expect(capturedEdges).toHaveLength(1);
  });

  /* ── M5-8 visibility — busca realça/esmaece + densidade ─────────────── */

  it('dims nodes outside the search match set (matchIds)', () => {
    const match = new Set(['asset:1']);
    render(<LineageFlowCanvas nodes={nodes} edges={edges} matchIds={match} />);
    const inMatch = capturedNodes.find((n) => n.id === 'asset:1');
    const outMatch = capturedNodes.find((n) => n.id === 'logic:x');
    expect(inMatch.data.matched).toBe(true);
    expect(outMatch.data.matched).toBe(false);
  });

  it('keeps every node matched when matchIds is null/empty', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} matchIds={null} />);
    for (const n of capturedNodes) expect(n.data.matched).toBe(true);
    render(<LineageFlowCanvas nodes={nodes} edges={edges} matchIds={new Set()} />);
    for (const n of capturedNodes) expect(n.data.matched).toBe(true);
  });

  it('exposes the active density on the wrapper for the toolbar', () => {
    const { getByTestId, rerender } = render(
      <LineageFlowCanvas nodes={nodes} edges={edges} density="compact" />,
    );
    expect(getByTestId('lineage-flow-canvas')).toHaveAttribute(
      'data-density',
      'compact',
    );
    rerender(
      <LineageFlowCanvas nodes={nodes} edges={edges} density="comfortable" />,
    );
    expect(getByTestId('lineage-flow-canvas')).toHaveAttribute(
      'data-density',
      'comfortable',
    );
  });

  /* ── #11 — clareza/a11y: relação na aresta + ativação por teclado ─────── */

  it('labels each edge with its human relation (ariaLabel + data.relation)', () => {
    render(<LineageFlowCanvas nodes={nodes} edges={edges} />);
    const e = capturedEdges[0];
    // 'action.execute' → 'Ação' via labelLineageKind.
    expect(e.ariaLabel).toBe('Ação');
    expect(e.data.relation).toBe('Ação');
  });

  it('wires keyboard activation (data.onActivate) to onSelect', () => {
    const onSelect = jest.fn();
    render(<LineageFlowCanvas nodes={nodes} edges={edges} onSelect={onSelect} />);
    const n = capturedNodes.find((x) => x.id === 'asset:1');
    expect(typeof n.data.onActivate).toBe('function');
    n.data.onActivate();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset:1' }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* LineageNodeView — a11y do nó: estado em TEXTO (não só cor) + foco teclado.  */
/* -------------------------------------------------------------------------- */
describe('LineageNodeView — nó acessível (#11)', () => {
  function renderNode(over: Record<string, unknown> = {}) {
    const raw = {
      id: 'asset:1',
      kind: 'DataAsset',
      label: 'logs.bo',
      markings: ['SIGILOSO'],
      extra: { version: 3 },
    };
    const onActivate = jest.fn();
    const data = {
      raw,
      selected: false,
      accent: '#2D77BE',
      matched: true,
      onActivate,
      ...over,
    };
    render(<LineageNodeView data={data as any} {...({} as any)} />);
    return { onActivate };
  }

  it('carries freshness + restriction in the aria-label/title (not only color)', () => {
    renderNode();
    const node = screen.getByTestId('flow-node-asset:1');
    const aria = node.getAttribute('aria-label') ?? '';
    expect(aria).toMatch(/v3/); // versão
    expect(aria).toMatch(/desatualizado/i); // frescor textual (v>1)
    expect(aria).toMatch(/SIGILOSO/); // restrição textual
    expect(node).toHaveAttribute('title', aria);
  });

  it('is keyboard-focusable and selects on Enter and Space', () => {
    const { onActivate } = renderNode();
    const node = screen.getByTestId('flow-node-asset:1');
    expect(node).toHaveAttribute('role', 'button');
    expect(node).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: ' ' });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('marks a clean node as current with no restriction', () => {
    renderNode({ raw: { id: 'asset:2', kind: 'DataAsset', label: 'fresh', markings: [], extra: { version: 1 } } });
    const node = screen.getByTestId('flow-node-asset:2');
    const aria = node.getAttribute('aria-label') ?? '';
    expect(aria).toMatch(/v1/);
    expect(aria).toMatch(/atual/i);
    expect(aria).toMatch(/sem restrição/i);
  });
});

/* -------------------------------------------------------------------------- */
/* computeLayout — o coração do fix de VISIBILIDADE.                           */
/* O snapshot real traz centenas de nós SEM aresta; eles NÃO podem empilhar   */
/* numa única coluna. Verificamos o empacotamento em grid multi-coluna.       */
/* -------------------------------------------------------------------------- */
describe('computeLayout — empacotamento de nós desconexos', () => {
  function makeNodes(n: number, kind = 'DataAsset'): LineageGraphNode[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `${kind}:${String(i).padStart(4, '0')}`,
      kind,
      label: `${kind} ${i}`,
      markings: [],
      extra: {},
    }));
  }

  it('classifies degree-0 nodes as disconnected', () => {
    const ns = makeNodes(50);
    const { disconnectedIds } = computeLayout(ns, []);
    expect(disconnectedIds.size).toBe(50);
  });

  it('does NOT stack disconnected nodes into a single column', () => {
    // 60 nós desconexos: precisam de várias colunas (X distintos), senão
    // o operador vê uma torre ilegível — exatamente o bug que corrigimos.
    const ns = makeNodes(60);
    const { positions } = computeLayout(ns, []);
    const xs = new Set([...positions.values()].map((p) => Math.round(p.x)));
    const ys = new Set([...positions.values()].map((p) => Math.round(p.y)));
    expect(xs.size).toBeGreaterThan(1); // múltiplas colunas
    expect(ys.size).toBeGreaterThan(1); // múltiplas linhas
  });

  it('places every node at a unique (x,y) cell (no overlap in the grid)', () => {
    const ns = makeNodes(40);
    const { positions } = computeLayout(ns, []);
    const cells = new Set(
      [...positions.values()].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`),
    );
    expect(cells.size).toBe(40);
  });

  it('is deterministic — same input yields identical positions', () => {
    const ns = makeNodes(30);
    const a = computeLayout(ns, []);
    const b = computeLayout(ns, []);
    for (const n of ns) {
      expect(a.positions.get(n.id)).toEqual(b.positions.get(n.id));
    }
  });

  it('compact density uses a tighter row step than comfortable', () => {
    const ns = makeNodes(40);
    // Menor distância vertical positiva entre linhas adjacentes = passo do grid.
    const rowStep = (r: ReturnType<typeof computeLayout>) => {
      const ys = [...new Set([...r.positions.values()].map((p) => Math.round(p.y)))].sort(
        (a, b) => a - b,
      );
      let min = Infinity;
      for (let i = 1; i < ys.length; i += 1) min = Math.min(min, ys[i] - ys[i - 1]);
      return min;
    };
    expect(rowStep(computeLayout(ns, [], 'compact'))).toBeLessThan(
      rowStep(computeLayout(ns, [], 'comfortable')),
    );
  });

  /* ── Direção B — split reusado pela página (canvas limpo por padrão) ── */

  it('splitConnectivity separa conexos de soltos (mesmo critério do layout)', () => {
    const connected: LineageGraphNode[] = [
      { id: 'c:a', kind: 'DataAsset', label: 'a', markings: [], extra: {} },
      { id: 'c:b', kind: 'ActionType', label: 'b', markings: [], extra: {} },
    ];
    const loose = makeNodes(5, 'DataAsset');
    const eds: LineageGraphEdge[] = [
      {
        id: 'e',
        from_id: 'c:a',
        to_id: 'c:b',
        kind: 'x',
        event_id: null,
        actor: null,
        created_at: null,
      },
    ];
    const { connectedIds, disconnectedIds } = splitConnectivity(
      [...connected, ...loose],
      eds,
    );
    expect([...connectedIds].sort()).toEqual(['c:a', 'c:b']);
    expect(disconnectedIds.size).toBe(5);
    // Coerente com computeLayout (a página e o canvas dividem o mesmo critério).
    const layout = computeLayout([...connected, ...loose], eds);
    expect([...disconnectedIds].sort()).toEqual([...layout.disconnectedIds].sort());
  });

  it('an edge to a node outside the set does not connect it', () => {
    const ns = makeNodes(2);
    const eds: LineageGraphEdge[] = [
      {
        id: 'e',
        from_id: ns[0].id,
        to_id: 'missing:99',
        kind: 'x',
        event_id: null,
        actor: null,
        created_at: null,
      },
    ];
    const { connectedIds, disconnectedIds } = splitConnectivity(ns, eds);
    expect(connectedIds.size).toBe(0);
    expect(disconnectedIds.size).toBe(2);
  });

  it('separates the connected pipeline from the disconnected grid vertically', () => {
    // 2 nós conexos (asset→action) + 10 desconexos. O grid fica ABAIXO.
    const connected: LineageGraphNode[] = [
      { id: 'c:a', kind: 'DataAsset', label: 'a', markings: [], extra: {} },
      { id: 'c:b', kind: 'ActionType', label: 'b', markings: [], extra: {} },
    ];
    const loose = makeNodes(10, 'DataAsset');
    const eds: LineageGraphEdge[] = [
      {
        id: 'e',
        from_id: 'c:a',
        to_id: 'c:b',
        kind: 'x',
        event_id: null,
        actor: null,
        created_at: null,
      },
    ];
    const { positions, disconnectedIds } = computeLayout(
      [...connected, ...loose],
      eds,
    );
    expect(disconnectedIds.has('c:a')).toBe(false);
    expect(disconnectedIds.has('c:b')).toBe(false);
    expect(disconnectedIds.size).toBe(10);
    // o topo do grid de desconexos fica abaixo dos nós conexos.
    const connectedMaxY = Math.max(
      positions.get('c:a')!.y,
      positions.get('c:b')!.y,
    );
    const looseMinY = Math.min(
      ...loose.map((n) => positions.get(n.id)!.y),
    );
    expect(looseMinY).toBeGreaterThan(connectedMaxY);
  });
});
