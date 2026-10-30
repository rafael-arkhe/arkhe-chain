/**
 * M4 #9 — NodeInspector + WalkthroughPanel.
 *
 * Cobre as afordâncias do AIP Architect no inspector + painel de plano:
 *   - Concept node (não-ontologia): Select implementation → Inserir no grafo
 *   - Ontology node: Gerar modelo de dados
 *   - Walkthrough panel: build (Tour) + Next/Previous
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { NodeInspector } from '@/components/solution-designer/NodeInspector';
import { WalkthroughPanel } from '@/components/solution-designer/WalkthroughPanel';

jest.mock('@/lib/api', () => ({
  Solutions: {
    implementations: jest.fn(),
    expandNode: jest.fn(),
    ontologyModel: jest.fn(),
    buildWalkthrough: jest.fn(),
  },
  // #1 — ConnectDataSection (nós de Coleta) lista fontes/conectores/datasets.
  Sources: { list: jest.fn().mockResolvedValue([]) },
  Connectors: { list: jest.fn().mockResolvedValue([]) },
  Datasets: { list: jest.fn().mockResolvedValue([]) },
  Ingest: { event: jest.fn() },
  // TransformerConfigSection (processamento nodes) + Skills (effectiveMeta).
  Functions: { list: jest.fn().mockResolvedValue([]) },
  Skills: { catalog: jest.fn().mockResolvedValue([]) },
  AIPModels: { catalog: jest.fn().mockResolvedValue([]), defaults: jest.fn().mockResolvedValue([]) },
  Ontology: {
    listNodeTypes: jest.fn().mockResolvedValue([]),
    objectTypeSchema: jest.fn().mockResolvedValue({ properties: [], links: [], actions: [] }),
  },
}));

// SandboxIDE (Monaco) must be mocked — jsdom cannot run Monaco editor.
jest.mock('@/components/dev/sandbox-ide', () => ({
  SandboxIDE: () => <div data-testid="sandbox-ide-mock">SandboxIDE</div>,
}));
jest.mock('@/lib/aip/modelLabels', () => ({
  aipModelLabel: (id: string) => id,
  aipModelNote: () => null,
  isHiddenProvider: () => false,
}));
jest.mock('@/lib/aip/modelMeta', () => ({
  modelTier: () => 'equilibrado',
  TIER_I18N: { equilibrado: 'solutions.inferenceModelTierEquilibrado' },
  formatContextWindow: () => '200',
  capabilityI18nKey: () => null,
}));

const { Solutions } = jest.requireMock('@/lib/api') as {
  Solutions: Record<string, jest.Mock>;
};

const graph = {
  nodes: [
    {
      id: 'c1',
      kind: 'concept',
      phase: 'coleta',
      title: 'Coleta de dados',
      config: {
        domain: 'security',
        items: [
          { label: 'Ingestão · Ocorrencia', detail: 'Alimenta o tipo de objeto.' },
          { label: 'Fonte externa' },
        ],
      },
    },
    { id: 'o1', kind: 'concept', phase: 'ontologia', title: 'Ontologia', config: { generate_data_model: true } },
  ],
  edges: [],
  wizard: { domain: 'security' },
};

describe('NodeInspector — Select implementation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows empty state when no node selected', () => {
    render(
      <NodeInspector
        node={null}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    expect(screen.getByText(/Selecione um nó/i)).toBeInTheDocument();
  });

  it('loads implementation alternatives and inserts the chosen plan', async () => {
    Solutions.implementations.mockResolvedValueOnce([
      {
        id: 'coleta-worker',
        title: 'Worker de coleta dedicado',
        summary: 'Scraper pro-code.',
        nodes: [{ kind: 'worker', title: 'Worker' }],
      },
      {
        id: 'coleta-conector',
        title: 'Conector gerenciado',
        summary: 'Low-code.',
        nodes: [{ kind: 'connector', title: 'Conector' }],
      },
    ]);
    const expanded = { nodes: [{ id: 'w1', kind: 'worker', phase: 'coleta', title: 'Worker' }], edges: [] };
    Solutions.expandNode.mockResolvedValueOnce(expanded);
    const onGraphChange = jest.fn();

    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{ requirements: 'coletar dados' }}
        onGraphChange={onGraphChange}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inspector-select-implementation'));
    await waitFor(() => expect(Solutions.implementations).toHaveBeenCalled());
    expect(await screen.findByTestId('inspector-plans')).toBeInTheDocument();
    expect(screen.getByTestId('plan-coleta-worker')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('inspector-insert-graph'));
    await waitFor(() => expect(Solutions.expandNode).toHaveBeenCalled());
    expect(onGraphChange).toHaveBeenCalledWith(expanded);
  });

  it('shows component info (Sobre/Documentação/Exemplo) and edits description', () => {
    const onPatchNode = jest.fn();
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={onPatchNode}
      />,
    );
    // Navigate to Metadados tab where component-info and description live
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    // component-info section present, collapsed by default
    expect(screen.getByTestId('inspector-component-info')).toBeInTheDocument();
    expect(screen.queryByTestId('info-body-about')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('info-about'));
    expect(screen.getByTestId('info-body-about')).toBeInTheDocument();
    // description editor patches the node
    fireEvent.change(screen.getByTestId('inspector-description'), {
      target: { value: 'nó de coleta inicial' },
    });
    expect(onPatchNode).toHaveBeenCalledWith('c1', { description: 'nó de coleta inicial' });
  });

  it('node-aware "Sobre o componente" shows the selected node\'s real proposed items (#4b)', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    // Navigate to Metadados tab first
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    fireEvent.click(screen.getByTestId('info-about'));
    const body = screen.getByTestId('info-body-about');
    // kind label + phase of THIS node (never a raw kind/type)
    expect(body).toHaveTextContent('Conceito');
    expect(body).toHaveTextContent('Coleta de dados');
    // the AIP-proposed items the node carries (config.items)
    const items = screen.getByTestId('info-node-items');
    expect(items).toHaveTextContent('Ingestão · Ocorrencia');
    expect(items).toHaveTextContent('Fonte externa');
    // current settings surface the node's concrete config (domain)
    expect(screen.getByTestId('info-node-settings')).toHaveTextContent('security');
  });

  it('"Sobre o componente" reflects a DIFFERENT node when selection changes (node-aware, not static)', () => {
    const { rerender } = render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    // Navigate to Metadados tab first
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    fireEvent.click(screen.getByTestId('info-about'));
    expect(screen.getByTestId('info-node-items')).toHaveTextContent('Fonte externa');
    // switch to the ontology node — tab resets to Configuração on node change
    rerender(
      <NodeInspector
        node={graph.nodes[1]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    // Navigate to Metadados tab again after node switch
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    fireEvent.click(screen.getByTestId('info-about'));
    expect(screen.queryByTestId('info-node-items')).not.toBeInTheDocument();
    expect(screen.getByTestId('info-body-about')).toHaveTextContent(/Sem itens propostos/i);
  });

  it('"Perguntar à IA" dispatches aegis:aip-assist carrying the node context + a ready-to-send prompt (#4a)', () => {
    const handler = jest.fn();
    window.addEventListener('aegis:aip-assist', handler as EventListener);
    try {
      render(
        <NodeInspector
          node={graph.nodes[0]}
          graph={graph}
          wizard={{}}
          onGraphChange={jest.fn()}
          onDeleteNode={jest.fn()}
          onPatchNode={jest.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId('inspector-ask-aip'));
      expect(handler).toHaveBeenCalledTimes(1);
      const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.nodeId).toBe('c1');
      expect(detail.label).toBe('Conceito');
      // the prompt grounds the chat in THIS node + its proposed content
      expect(detail.prompt).toContain('Coleta de dados');
      expect(detail.prompt).toContain('Ingestão · Ocorrencia');
    } finally {
      window.removeEventListener('aegis:aip-assist', handler as EventListener);
    }
  });

  it('close button (#7) deselects/collapses the inspector via onClose', () => {
    const onClose = jest.fn();
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('inspector-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ontology node generates a data model (not Select implementation)', async () => {
    Solutions.ontologyModel.mockResolvedValueOnce({
      object_types: [{ kind: 'Person', properties: [{ key: 'cpf', type: 'text', label: 'CPF' }] }],
      link_types: [],
    });
    render(
      <NodeInspector
        node={graph.nodes[1]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    // No "Select implementation" for ontology
    expect(screen.queryByTestId('inspector-select-implementation')).not.toBeInTheDocument();
    expect(screen.getByTestId('inspector-generate-model')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('inspector-generate-model'));
    await waitFor(() => expect(Solutions.ontologyModel).toHaveBeenCalled());
    expect(await screen.findByTestId('inspector-model-result')).toHaveTextContent('Person');
  });

  // ── 3-tab layout (Foundry canonical inspector) ──────────────────────────

  it('renders 3 tabs: Configuração, Metadados, Exibição', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    expect(screen.getByTestId('node-tab-config')).toBeInTheDocument();
    expect(screen.getByTestId('node-tab-metadata')).toBeInTheDocument();
    expect(screen.getByTestId('node-tab-display')).toBeInTheDocument();
  });

  it('default active tab is Configuração and shows config panel', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    // Config panel is visible by default
    expect(screen.getByTestId('node-tabpanel-config')).toBeInTheDocument();
    // Metadata + Display panels are hidden
    expect(screen.queryByTestId('node-tabpanel-metadata')).not.toBeInTheDocument();
    expect(screen.queryByTestId('node-tabpanel-display')).not.toBeInTheDocument();
    // The concept node shows "Select implementation" in config tab
    expect(screen.getByTestId('inspector-select-implementation')).toBeInTheDocument();
  });

  it('clicking Metadados tab switches to metadata panel with title, description and raw JSON', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    // Metadata panel is now visible
    expect(screen.getByTestId('node-tabpanel-metadata')).toBeInTheDocument();
    // Config panel is hidden
    expect(screen.queryByTestId('node-tabpanel-config')).not.toBeInTheDocument();
    // title input with node name
    expect(screen.getByTestId('inspector-title')).toBeInTheDocument();
    // description textarea
    expect(screen.getByTestId('inspector-description')).toBeInTheDocument();
    // raw JSON view of node.config
    const rawJson = screen.getByTestId('inspector-raw-json');
    expect(rawJson).toBeInTheDocument();
    expect(rawJson.textContent).toContain('security');
  });

  it('clicking Exibição tab switches to display panel with phase/kind info', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('node-tab-display'));
    // Display panel is now visible
    expect(screen.getByTestId('node-tabpanel-display')).toBeInTheDocument();
    // Config panel is hidden
    expect(screen.queryByTestId('node-tabpanel-config')).not.toBeInTheDocument();
    // Shows the placeholder note for Variables engine
    expect(screen.getByTestId('inspector-display-note')).toBeInTheDocument();
  });

  it('config sections appear under Configuração tab (Connect data for coleta phase)', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    // Default tab is Configuração — ConnectDataSection is present (coleta phase)
    expect(screen.getByTestId('node-tabpanel-config')).toBeInTheDocument();
    // inspector-connect-data testid comes from ConnectDataSection root
    expect(screen.getByTestId('inspector-connect-data')).toBeInTheDocument();
  });

  it('Metadados tab raw JSON shows the node.config as formatted JSON', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    const rawJson = screen.getByTestId('inspector-raw-json');
    // The node config has domain: "security" and items array
    expect(rawJson.textContent).toContain('"domain"');
    expect(rawJson.textContent).toContain('"security"');
    // node title field should contain the node name
    expect((screen.getByTestId('inspector-title') as HTMLInputElement).value).toBe('Coleta de dados');
  });

  // Task 2: Metadados tab shows structured facts (phase, kind, transformer, variables count)
  it('Task 2: Metadados tab shows structured node summary facts', () => {
    const nodeWithConfig = {
      id: 'p1',
      kind: 'inference',
      phase: 'processamento',
      title: 'Análise de texto',
      config: {
        inference_model: 'llm-default',
        transformer_function: 'normalize-text',
        inference_variables: [
          { name: 'score', kind: 'static' },
          { name: 'alvo', kind: 'objectSet' },
        ],
      },
    };
    render(
      <NodeInspector
        node={nodeWithConfig as never}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    const facts = screen.getByTestId('inspector-meta-facts');
    expect(facts).toBeInTheDocument();
    // Shows transformer function
    expect(screen.getByTestId('meta-fact-transformer')).toBeInTheDocument();
    expect(facts.textContent).toContain('normalize-text');
    // Shows variables count
    expect(screen.getByTestId('meta-fact-variables')).toBeInTheDocument();
    expect(facts.textContent).toContain('2');
    // Shows model
    expect(screen.getByTestId('meta-fact-model')).toBeInTheDocument();
    expect(facts.textContent).toContain('llm-default');
  });

  // Task 2: Exibição tab shows graph connectivity when edges exist
  it('Task 2: Exibição tab shows inbound/outbound graph connections', () => {
    const nodeA = { id: 'a1', kind: 'worker', phase: 'coleta', title: 'Coletor', config: {} };
    const nodeB = { id: 'b1', kind: 'inference', phase: 'processamento', title: 'Análise', config: {} };
    const graphWithEdges = {
      nodes: [nodeA, nodeB],
      edges: [{ id: 'e1', source: 'a1', target: 'b1' }],
      wizard: {},
    };
    render(
      <NodeInspector
        node={nodeB as never}
        graph={graphWithEdges as never}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('node-tab-display'));
    // Shows connectivity section
    expect(screen.getByTestId('inspector-display-connectivity')).toBeInTheDocument();
    // Shows inbound from nodeA
    expect(screen.getByTestId('inspector-display-inbound')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-display-inbound').textContent).toContain('Coletor');
  });

  // Task 2: Exibição tab shows isolated state when no edges
  it('Task 2: Exibição tab shows isolated note when node has no connections', () => {
    render(
      <NodeInspector
        node={graph.nodes[0]}
        graph={graph}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('node-tab-display'));
    // No edges → isolated note shown
    expect(screen.getByTestId('inspector-display-isolated')).toBeInTheDocument();
  });
});

describe('NodeInspector — Processing mode (#6)', () => {
  beforeEach(() => jest.clearAllMocks());

  const procNode = (config: Record<string, unknown>) => ({
    id: 'p1',
    kind: 'concept',
    phase: 'processamento',
    title: 'Processamento',
    config,
  });
  const renderProc = (config: Record<string, unknown>, onPatchNode = jest.fn()) => {
    render(
      <NodeInspector
        node={procNode(config) as never}
        graph={{ nodes: [procNode(config)], edges: [], wizard: {} } as never}
        wizard={{}}
        onGraphChange={jest.fn()}
        onDeleteNode={jest.fn()}
        onPatchNode={onPatchNode}
      />,
    );
    return onPatchNode;
  };

  it('default (no field) is "both" — selector + inference + transformer all visible', () => {
    renderProc({});
    expect(screen.getByTestId('processing-mode-selector')).toBeInTheDocument();
    expect(screen.getByTestId('inference-config')).toBeInTheDocument();
    expect(screen.getByTestId('transformer-config')).toBeInTheDocument();
  });

  it('mode "transformer" hides inference, keeps transformer (operator not forced into LLM)', () => {
    renderProc({ processing_mode: 'transformer' });
    expect(screen.queryByTestId('inference-config')).not.toBeInTheDocument();
    expect(screen.getByTestId('transformer-config')).toBeInTheDocument();
  });

  it('mode "inference" hides transformer, keeps inference', () => {
    renderProc({ processing_mode: 'inference' });
    expect(screen.getByTestId('inference-config')).toBeInTheDocument();
    expect(screen.queryByTestId('transformer-config')).not.toBeInTheDocument();
  });

  it('clicking a mode patches the node config.processing_mode', () => {
    const onPatchNode = renderProc({});
    fireEvent.click(screen.getByTestId('processing-mode-radio-transformer'));
    expect(onPatchNode).toHaveBeenCalledWith('p1', {
      config: expect.objectContaining({ processing_mode: 'transformer' }),
    });
  });
});

describe('WalkthroughPanel — Next/Previous', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds a Tour and navigates pages', async () => {
    Solutions.buildWalkthrough.mockResolvedValueOnce({
      workspace_id: 'w1',
      update_id: 'u1',
      pages: [
        { ordering: 0, title: 'Coleta de dados', description: 'passo 1' },
        { ordering: 1, title: 'Processamento', description: 'passo 2' },
      ],
    });
    render(<WalkthroughPanel diagramId="d1" onClose={jest.fn()} />);
    fireEvent.click(screen.getByTestId('walkthrough-build'));
    await waitFor(() => expect(Solutions.buildWalkthrough).toHaveBeenCalled());
    expect(await screen.findByTestId('walkthrough-page')).toHaveTextContent('Coleta de dados');

    fireEvent.click(screen.getByTestId('walkthrough-next'));
    await waitFor(() =>
      expect(screen.getByTestId('walkthrough-page')).toHaveTextContent('Processamento'),
    );
    fireEvent.click(screen.getByTestId('walkthrough-prev'));
    await waitFor(() =>
      expect(screen.getByTestId('walkthrough-page')).toHaveTextContent('Coleta de dados'),
    );
  });

  it('blocks build without a saved diagram', () => {
    render(<WalkthroughPanel diagramId={null} onClose={jest.fn()} />);
    const btn = screen.getByTestId('walkthrough-build') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Salve o diagrama primeiro/i)).toBeInTheDocument();
  });
});
