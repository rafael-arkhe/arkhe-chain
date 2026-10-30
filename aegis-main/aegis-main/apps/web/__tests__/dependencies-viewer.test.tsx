/**
 * Wave D.4 — Dependencies viewer page tests (2026-05-23).
 *
 * /painel-de-controle/dependencies/[workspace_id] — grafo de
 * dependências (variables ↔ widgets ↔ actions ↔ queries) + perf stats.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DependenciesPage from '@/app/painel-de-controle/dependencies/[workspace_id]/page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ workspace_id: 'app-abc' }),
}));

jest.mock('@/lib/workshop/client', () => ({
  Workshop: {
    get: jest.fn(),
  },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// LineageGraphSVG depende de d3-force-3d — mockamos para um snapshot mínimo
// que ainda expõe nodes/edges/mode pra inspeção.
jest.mock('@/components/grafo/lineage-graph-svg', () => ({
  __esModule: true,
  LineageGraphSVG: (props: Record<string, unknown>) => {
    const nodes = (props.nodes as { id: string; label: string }[]) ?? [];
    const edges = (props.edges as { id: string }[]) ?? [];
    return (
      <div data-testid="lineage-graph-svg-mock" data-mode={String(props.mode)}>
        <span data-testid="nodes-count">{nodes.length}</span>
        <span data-testid="edges-count">{edges.length}</span>
        <ul>
          {nodes.map((n) => (
            <li key={n.id} data-testid={`graph-node-${n.id}`}>{n.label}</li>
          ))}
        </ul>
      </div>
    );
  },
}));

const { Workshop } = jest.requireMock('@/lib/workshop/client') as {
  Workshop: { get: jest.Mock };
};

const fakeApp = {
  id: 'app-abc',
  display: 'Painel Operacional',
  schema_version: 2 as const,
  variables: [
    {
      id: 'v1',
      external_id: 'caso_atual',
      type: 'String',
      kind: 'static',
      recompute_mode: 'auto',
    },
    {
      id: 'v2',
      external_id: 'lista_casos',
      type: 'ObjectSet',
      kind: 'objectSet',
      recompute_mode: 'auto',
      spec: { object_type: 'Case' },
    },
  ],
  actions: [
    {
      id: 'a1',
      label: 'Encerrar caso',
      params: [{ name: 'id', type: 'String', required: true }],
      permissions: [],
    },
  ],
  layout: {
    columns: 12,
    root: [
      {
        id: 'w1',
        widget: {
          type: 'object_table',
          props: { source: 'lista_casos' },
        },
        events: [
          {
            trigger: 'select_change',
            action: 'set_variable',
            params: { target: 'caso_atual' },
          },
        ],
      },
      {
        id: 'w2',
        widget: { type: 'markdown_v2', props: { content: 'caso ${caso_atual}' } },
      },
    ],
  },
};

describe('DependenciesPage — Wave D.4', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega o painel via Workshop.get e renderiza o grafo', async () => {
    Workshop.get.mockResolvedValue(fakeApp);
    render(<DependenciesPage />);
    await waitFor(() => expect(Workshop.get).toHaveBeenCalledWith('app-abc'));
    expect(screen.getByTestId('dependencies-page')).toBeInTheDocument();
    expect(await screen.findByTestId('lineage-graph-svg-mock')).toBeInTheDocument();
  });

  it('inclui um nó por variable, action e widget no grafo', async () => {
    Workshop.get.mockResolvedValue(fakeApp);
    render(<DependenciesPage />);
    // 2 vars + 1 action + 2 widgets = 5
    const counter = await screen.findByTestId('nodes-count');
    expect(counter.textContent).toBe('5');
    expect(screen.getByTestId('graph-node-var:caso_atual')).toBeInTheDocument();
    expect(screen.getByTestId('graph-node-var:lista_casos')).toBeInTheDocument();
    expect(screen.getByTestId('graph-node-widget:w1')).toBeInTheDocument();
    expect(screen.getByTestId('graph-node-widget:w2')).toBeInTheDocument();
    expect(screen.getByTestId('graph-node-action:a1')).toBeInTheDocument();
  });

  it('cria edges de leitura (var → widget) e escrita (widget → var)', async () => {
    Workshop.get.mockResolvedValue(fakeApp);
    render(<DependenciesPage />);
    const counter = await screen.findByTestId('edges-count');
    // w1 lê lista_casos + w1 escreve em caso_atual = 2 edges no mínimo
    expect(Number(counter.textContent)).toBeGreaterThanOrEqual(2);
  });

  it('alterna entre modos de destaque (Selected/Neighbors/Upstream/Downstream)', async () => {
    Workshop.get.mockResolvedValue(fakeApp);
    render(<DependenciesPage />);
    const graph = await screen.findByTestId('lineage-graph-svg-mock');
    expect(graph.getAttribute('data-mode')).toBe('all');

    fireEvent.click(screen.getByTestId('dependencies-mode-upstream'));
    expect(
      screen.getByTestId('lineage-graph-svg-mock').getAttribute('data-mode'),
    ).toBe('upstream');

    fireEvent.click(screen.getByTestId('dependencies-mode-downstream'));
    expect(
      screen.getByTestId('lineage-graph-svg-mock').getAttribute('data-mode'),
    ).toBe('downstream');
  });

  it('mostra tabela de performance com Time/Server/Load por nó', async () => {
    Workshop.get.mockResolvedValue(fakeApp);
    render(<DependenciesPage />);
    // Aguarda o grafo carregar (= app foi setado no state)
    await screen.findByTestId('lineage-graph-svg-mock');
    const list = screen.getByTestId('dependencies-perf-list');
    expect(list).toBeInTheDocument();
    // w1, w2 e a query (lista_casos) devem aparecer (3 nós executáveis)
    await waitFor(() => {
      const rows = list.querySelectorAll('[data-testid^="dependencies-perf-row-"]');
      expect(rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('mostra resumo com contagens por tipo', async () => {
    Workshop.get.mockResolvedValue(fakeApp);
    render(<DependenciesPage />);
    await waitFor(() => expect(screen.getByTestId('dependencies-summary')).toBeInTheDocument());
    expect(screen.getByTestId('dependencies-summary-dados')).toBeInTheDocument();
    expect(screen.getByTestId('dependencies-summary-consultas')).toBeInTheDocument();
    expect(screen.getByTestId('dependencies-summary-widgets')).toBeInTheDocument();
    expect(screen.getByTestId('dependencies-summary-ações')).toBeInTheDocument();
  });
});

/* Wave G.2 (2026-05-23) — InspectorDepsTab interativo. */
import { InspectorDepsTab } from '@/components/workshop/inspector-deps-tab';
import type { WorkshopApp } from '@/lib/workshop/types';

const depsApp = {
  id: 'app-abc',
  display: 'Painel',
  schema_version: 2 as const,
  variables: [
    {
      id: 'v1',
      external_id: 'caso_atual',
      type: 'String',
      kind: 'static',
      recompute_mode: 'auto',
      label: 'Caso atual',
    },
    {
      id: 'v2',
      external_id: 'lista_casos',
      type: 'ObjectSet',
      kind: 'objectSet',
      recompute_mode: 'auto',
      spec: { object_type: 'Case' },
      label: 'Lista de casos',
    },
  ],
  layout: {
    columns: 12,
    root: [
      {
        id: 'w1',
        widget: { type: 'object_table', props: { source: 'lista_casos' } },
        events: [
          {
            trigger: 'select_change',
            action: 'set_variable',
            params: { target: 'caso_atual' },
          },
        ],
      },
      {
        id: 'w2',
        widget: { type: 'markdown_v2', props: { source: 'caso_atual' } },
      },
      {
        id: 'w3',
        widget: { type: 'kpi_card', props: {} },
      },
    ],
  },
};

describe('<InspectorDepsTab /> — Wave G.2', () => {
  it('renderiza painel + contagens upstream e downstream', () => {
    render(<InspectorDepsTab app={depsApp as unknown as WorkshopApp} widgetId="w1" />);
    expect(screen.getByTestId('inspector-deps-panel')).toBeInTheDocument();
    const counts = screen.getByTestId('inspector-deps-counts');
    // w1 lê lista_casos (1 upstream), escreve em caso_atual (lido por w2 → 1 downstream)
    expect(counts.textContent).toContain('1 usa');
    expect(counts.textContent).toContain('1 consumido');
  });

  it('lista upstream tem a variável lida (label resolvido)', () => {
    render(<InspectorDepsTab app={depsApp as unknown as WorkshopApp} widgetId="w1" />);
    expect(screen.getByTestId('inspector-deps-up-lista_casos')).toBeInTheDocument();
    expect(
      screen.getByTestId('inspector-deps-up-lista_casos').textContent,
    ).toContain('Lista de casos');
  });

  it('lista downstream tem o widget consumidor + via', () => {
    render(<InspectorDepsTab app={depsApp as unknown as WorkshopApp} widgetId="w1" />);
    const row = screen.getByTestId('inspector-deps-down-w2');
    expect(row).toBeInTheDocument();
    expect(row.textContent).toContain('caso_atual');
    expect(row.textContent).toContain('markdown_v2');
  });

  it('click no botão "abrir" do downstream chama onNavigateWidget', () => {
    const onNav = jest.fn();
    render(
      <InspectorDepsTab app={depsApp as unknown as WorkshopApp} widgetId="w1" onNavigateWidget={onNav} />,
    );
    fireEvent.click(screen.getByTestId('inspector-deps-down-nav-w2'));
    expect(onNav).toHaveBeenCalledWith('w2');
  });

  it('click no botão "abrir" do upstream chama onNavigateVariable', () => {
    const onNav = jest.fn();
    render(
      <InspectorDepsTab app={depsApp as unknown as WorkshopApp} widgetId="w1" onNavigateVariable={onNav} />,
    );
    fireEvent.click(screen.getByTestId('inspector-deps-up-nav-lista_casos'));
    expect(onNav).toHaveBeenCalledWith('lista_casos');
  });

  it('widget sem dependências mostra mensagens vazias', () => {
    render(<InspectorDepsTab app={depsApp as unknown as WorkshopApp} widgetId="w3" />);
    expect(screen.getByTestId('inspector-deps-upstream').textContent).toContain(
      'não lê',
    );
    expect(
      screen.getByTestId('inspector-deps-downstream').textContent,
    ).toContain('Nenhum widget');
  });
});
