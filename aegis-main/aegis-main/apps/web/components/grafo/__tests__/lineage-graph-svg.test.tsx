/**
 * Sprint L9 — <LineageGraphSVG /> força-grafo SVG.
 *
 * Cobre: render, filtragem por modo (all/neighbors/upstream/downstream),
 * seleção/click, hover, empty state, marker/legenda. A simulação roda em
 * jsdom (Verlet puro, sem RAF); damos um pequeno setTimeout pra deixar o
 * primeiro tick acontecer antes do assert de posicionamento.
 */
import * as React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { LineageGraphSVG } from '@/components/grafo/lineage-graph-svg';
import type { LineageGraphNode, LineageGraphEdge } from '@/lib/api';

const N: LineageGraphNode[] = [
  { id: 'asset:1', kind: 'DataAsset', label: 'logs.bo', markings: [], extra: {} },
  {
    id: 'action:abc',
    kind: 'ActionType',
    label: 'security.criar_caso',
    markings: ['SIGILOSO'],
    extra: {},
  },
  {
    id: 'logic:llm-1',
    kind: 'LogicFunction',
    label: 'classify_intent',
    markings: [],
    extra: {},
  },
  {
    id: 'asset:2',
    kind: 'DataAsset',
    label: 'caso.123',
    markings: [],
    extra: {},
  },
];

const E: LineageGraphEdge[] = [
  {
    id: 'e1',
    from_id: 'asset:1',
    to_id: 'logic:llm-1',
    kind: 'logic.invoke',
    event_id: null,
    actor: 'alice',
    created_at: null,
  },
  {
    id: 'e2',
    from_id: 'logic:llm-1',
    to_id: 'action:abc',
    kind: 'action.plan',
    event_id: 'ev-2',
    actor: 'alice',
    created_at: null,
  },
  {
    id: 'e3',
    from_id: 'action:abc',
    to_id: 'asset:2',
    kind: 'action.execute.success',
    event_id: 'ev-3',
    actor: 'alice',
    created_at: null,
  },
];

async function flushSim() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe('<LineageGraphSVG /> — Sprint L9', () => {
  beforeEach(() => {
    // jsdom does not implement getBoundingClientRect dimensions; stub
    // to a sane value so drag math doesn't NaN.
    Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 760,
        bottom: 540,
        width: 760,
        height: 540,
        toJSON() {
          return {};
        },
      }),
    });
  });

  it('renderiza svg + nodes + edges quando há dados', async () => {
    render(<LineageGraphSVG nodes={N} edges={E} />);
    await flushSim();
    expect(screen.getByTestId('lineage-graph-svg')).toBeInTheDocument();
    const nodesG = screen.getByTestId('lineage-graph-nodes');
    expect(within(nodesG).getAllByTestId(/^lineage-svg-node-/).length).toBe(4);
    const edgesG = screen.getByTestId('lineage-graph-edges');
    expect(within(edgesG).getAllByTestId(/^lineage-edge-/).length).toBe(3);
  });

  it('renderiza empty state quando lista vazia', () => {
    render(<LineageGraphSVG nodes={[]} edges={[]} />);
    expect(screen.getByTestId('lineage-graph-svg-empty')).toBeInTheDocument();
  });

  it('inclui marker arrowhead nas defs', async () => {
    const { container } = render(<LineageGraphSVG nodes={N} edges={E} />);
    await flushSim();
    expect(container.querySelector('marker#lineage-arrow')).toBeTruthy();
    expect(container.querySelector('marker#lineage-arrow-active')).toBeTruthy();
  });

  it('chama onSelect quando o nó é clicado', async () => {
    const onSelect = jest.fn();
    render(<LineageGraphSVG nodes={N} edges={E} onSelect={onSelect} />);
    await flushSim();
    const node = screen.getByTestId('lineage-svg-node-asset:1');
    const circle = node.querySelector('circle')!;
    fireEvent.click(circle);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('asset:1');
  });

  it('modo "neighbors" reduz a 1 nó + vizinhos diretos', async () => {
    render(
      <LineageGraphSVG
        nodes={N}
        edges={E}
        selectedId="logic:llm-1"
        mode="neighbors"
      />,
    );
    await flushSim();
    const ids = screen
      .getAllByTestId(/^lineage-svg-node-/)
      .map((el) => el.getAttribute('data-testid'));
    // logic:llm-1 + asset:1 + action:abc (3 nós)
    expect(ids.sort()).toEqual(
      [
        'lineage-svg-node-asset:1',
        'lineage-svg-node-action:abc',
        'lineage-svg-node-logic:llm-1',
      ].sort(),
    );
  });

  it('modo "upstream" inclui só ancestrais a partir de selectedId', async () => {
    render(
      <LineageGraphSVG
        nodes={N}
        edges={E}
        selectedId="action:abc"
        mode="upstream"
        maxDepth={3}
      />,
    );
    await flushSim();
    const ids = screen
      .getAllByTestId(/^lineage-svg-node-/)
      .map((el) => el.getAttribute('data-testid'))
      .sort();
    // upstream de action:abc = logic:llm-1 (e2) e asset:1 (e1)
    expect(ids).toEqual(
      [
        'lineage-svg-node-action:abc',
        'lineage-svg-node-logic:llm-1',
        'lineage-svg-node-asset:1',
      ].sort(),
    );
    // asset:2 NÃO deve aparecer (é downstream)
    expect(
      screen.queryByTestId('lineage-svg-node-asset:2'),
    ).not.toBeInTheDocument();
  });

  it('modo "downstream" inclui só descendentes a partir de selectedId', async () => {
    render(
      <LineageGraphSVG
        nodes={N}
        edges={E}
        selectedId="logic:llm-1"
        mode="downstream"
        maxDepth={3}
      />,
    );
    await flushSim();
    const ids = screen
      .getAllByTestId(/^lineage-svg-node-/)
      .map((el) => el.getAttribute('data-testid'))
      .sort();
    expect(ids).toEqual(
      [
        'lineage-svg-node-logic:llm-1',
        'lineage-svg-node-action:abc',
        'lineage-svg-node-asset:2',
      ].sort(),
    );
    // asset:1 é upstream → NÃO deve aparecer
    expect(
      screen.queryByTestId('lineage-svg-node-asset:1'),
    ).not.toBeInTheDocument();
  });

  it('hover em um nó mostra tooltip com label + kind', async () => {
    render(<LineageGraphSVG nodes={N} edges={E} />);
    await flushSim();
    const node = screen.getByTestId('lineage-svg-node-action:abc');
    fireEvent.mouseEnter(node.querySelector('circle')!);
    const tip = await screen.findByTestId('lineage-graph-tooltip');
    expect(tip).toHaveTextContent('security.criar_caso');
    expect(tip).toHaveTextContent('ActionType');
    expect(tip).toHaveTextContent('SIGILOSO');
  });

  it('mostra indicador de modo no canto superior direito', async () => {
    render(<LineageGraphSVG nodes={N} edges={E} mode="downstream" />);
    await flushSim();
    const ind = screen.getByTestId('lineage-graph-mode-indicator');
    expect(ind).toHaveTextContent(/downstream/i);
  });

  /* ── Wave F.2 (2026-05-23) — Performance Stats card ───────────────── */

  it('renderiza card de estatísticas com contagem de nós + arestas (sem workspaceId)', async () => {
    render(<LineageGraphSVG nodes={N} edges={E} />);
    await flushSim();
    const card = screen.getByTestId('lineage-perf-stats');
    expect(card).toBeInTheDocument();
    // 4 nós N + 3 edges E
    expect(card).toHaveTextContent(/Nós:\s*4/);
    expect(card).toHaveTextContent(/Arestas:\s*3/);
  });

  /* ── Wave G.1 (2026-05-23) — perf-stats card real ─────────────────── */

  it('com workspaceId, consome PainelApps.perfStats e mostra total_ms', async () => {
    // Mock pontual de PainelApps usando spy no módulo (módulo já
    // importado pelo componente).
    const api = await import('@/lib/api');
    const spy = jest
      .spyOn(api.PainelApps, 'perfStats')
      .mockResolvedValue({
        app_id: 'ws-perf',
        total_ms: 142.5,
        sample_count: 3,
        slowest_3: [
          {
            widget_id: 'w-kpi',
            widget_type: 'kpi',
            time_in_node_ms: 30,
            server_time_ms: 80,
            total_load_ms: 110,
            samples: 3,
          },
        ],
        per_widget: [
          {
            widget_id: 'w-kpi',
            widget_type: 'kpi',
            time_in_node_ms: 30,
            server_time_ms: 80,
            total_load_ms: 110,
            samples: 3,
          },
        ],
      });
    render(<LineageGraphSVG nodes={N} edges={E} workspaceId="ws-perf" />);
    await flushSim();
    // Espera fetch resolver — re-render assíncrono.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(spy).toHaveBeenCalledWith('ws-perf');
    const card = screen.getByTestId('lineage-perf-stats');
    expect(card).toHaveTextContent(/Total/);
    const totalEl = screen.getByTestId('lineage-perf-stats-total');
    expect(totalEl).toHaveTextContent(/142\.5\s*ms/);
    expect(
      screen.getByTestId('lineage-perf-stats-slowest'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('lineage-perf-stats-widget-w-kpi'),
    ).toBeInTheDocument();
    spy.mockRestore();
  });

  it('aplica fill correto por kind nos circles', async () => {
    const { container } = render(<LineageGraphSVG nodes={N} edges={E} />);
    await flushSim();
    const dataAssetNode = screen.getByTestId('lineage-svg-node-asset:1');
    const circle = dataAssetNode.querySelector('circle')!;
    // DataAsset = #2D77BE
    expect(circle.getAttribute('fill')).toBe('#2D77BE');
    const actionNode = screen.getByTestId('lineage-svg-node-action:abc');
    expect(actionNode.querySelector('circle')!.getAttribute('fill')).toBe(
      '#7C3AED',
    );
    // checa que existe legenda
    expect(
      container.querySelector('[data-testid="lineage-graph-legend"]'),
    ).toBeTruthy();
  });
});
