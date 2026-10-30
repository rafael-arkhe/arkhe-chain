/**
 * M4 #9 — Desenho da Operação (AIP Arquiteto diagram canvas).
 *
 * Cobre o 3-pane shell + o NOVO entry flow em CHAT (plan-mode):
 *   - render do canvas com empty-state + biblioteca de referência
 *   - o CHAT do AIP Arquiteto é um painel ANCORADO (in-page) ABAIXO do canvas,
 *     NÃO um modal/Dialog; "Planejar" e o CTA do canvas vazio EXPANDEM/focam
 *     esse painel (sem overlay). Ao detectar o bloco aegis:plano, dispara
 *     designGraph e o grafo de concept nodes (Coleta → Processamento →
 *     Ontologia → Aplicação) vira o artefato no canvas ACIMA do chat.
 *   - adicionar componente da paleta insere nó no canvas
 *   - salvar persiste (createDiagram)
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
// W8 (2026-06-28): a /painel-de-controle/solutions virou casca de redirect; o
// corpo foi extraído p/ SolutionsApp (registrado como app_route) e renderizado
// na view canônica /paginas/solutions/view. O teste do canvas exercita o
// componente diretamente.
import { SolutionsApp as SolutionsPage } from '@/components/solution-designer/SolutionsApp';
import { apiFetch } from '@/lib/api/client';

let capturedNodes: any[] = [];
let capturedEdges: any[] = [];

// F3: o canvas adiciona nós de objeto (id 'otype:<kind>') derivados do
// blueprint, além dos nós de FASE. Estes testes contam/inspecionam só as fases.
const phaseNodes = () => capturedNodes.filter((n) => !String(n.id).startsWith('otype:'));
// Arestas REAIS do grafo (exclui as DERIVADAS: rotas 'auto:' do deriveRouteEdges
// e as do blueprint p/ nós 'otype:'). Os testes contam só as arestas do usuário.
const phaseEdges = () =>
  capturedEdges.filter(
    (e) =>
      !String(e.id).startsWith('auto:') &&
      !String(e.source).startsWith('otype:') &&
      !String(e.target).startsWith('otype:'),
  );

let lastOnConnect: ((c: any) => void) | undefined;

jest.mock('reactflow', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: any) => {
      capturedNodes = props.nodes;
      capturedEdges = props.edges;
      lastOnConnect = props.onConnect;
      return React.createElement(
        'div',
        { 'data-testid': 'rf-mock' },
        (props.nodes || []).map((n: any) =>
          React.createElement(
            'button',
            {
              key: n.id,
              'data-testid': `rf-node-${n.id}`,
              onClick: () => props.onNodeClick?.({}, n),
            },
            n.data?.title,
          ),
        ),
      );
    },
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    NodeResizer: () => null,
    applyNodeChanges: (_c: any, n: any) => n,
    Position: { Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
  };
});

jest.mock('@/lib/api', () => ({
  Solutions: {
    listPatterns: jest.fn(),
    listDiagrams: jest.fn(),
    designGraph: jest.fn(),
    designGraphViaTask: jest.fn(),
    design: jest.fn(),
    materialize: jest.fn(),
    createDiagram: jest.fn(),
    saveDiagram: jest.fn(),
    implementations: jest.fn(),
    expandNode: jest.fn(),
    ontologyModel: jest.fn(),
    buildWalkthrough: jest.fn(),
    fromLineage: jest.fn(),
  },
  // #5 — HistoryPanel fetches AIP-generation audit events.
  Lineage: { listEvents: jest.fn() },
  // W2 — a /solutions resolve a Page (status/perm/params) via Pages.get; o
  // fallback local (seed) cobre quando resolve undefined (offline/sem registro).
  Pages: { get: jest.fn(() => Promise.resolve(undefined)) },
  Spaces: { list: jest.fn(() => Promise.resolve([])) },
  // #1 — ConnectDataSection (nós de Coleta) lista fontes/conectores/datasets.
  Sources: { list: jest.fn(() => Promise.resolve([])) },
  Connectors: { list: jest.fn(() => Promise.resolve([])) },
  Datasets: { list: jest.fn(() => Promise.resolve([])) },
  Ingest: { event: jest.fn() },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

const { Solutions, Lineage, Pages } = jest.requireMock('@/lib/api') as {
  Solutions: Record<string, jest.Mock>;
  Lineage: Record<string, jest.Mock>;
  Pages: Record<string, jest.Mock>;
};
const mockApiFetch = apiFetch as unknown as jest.Mock;

/** Bloco aegis:plano que o AIP Arquiteto emite ao finalizar a coleta. */
const PLAN_BLOCK =
  'Perfeito, montei o plano da operação.\n\n```aegis:plano\n' +
  JSON.stringify({
    problem: 'monitorar viaturas e ocorrências em bairros críticos',
    domain: 'seguranca-publica',
    end_product: 'painel',
    source_data: 'existing',
    build_preference: 'low_code',
    requirements: 'triagem por severidade e sala de situação',
  }) +
  '\n```';

/**
 * Conduz o chat do AIP Arquiteto até finalizar o plano: EXPANDE o painel
 * ancorado ("Planejar"), digita um briefing, envia, e a inferência mockada
 * responde com o bloco aegis:plano — o que dispara Solutions.designGraphViaTask
 * automaticamente. O painel é in-page (não modal).
 */
async function finalizePlanViaChat() {
  // O chat do AIP nasce docado e aberto (não há mais botão "Planejar").
  expect(await screen.findByTestId('solutions-arquiteto')).toBeInTheDocument();
  fireEvent.change(await screen.findByTestId('arquiteto-input'), {
    target: { value: 'quero um painel de viaturas e ocorrências' },
  });
  fireEvent.click(screen.getByTestId('arquiteto-send'));
}

const sampleBlueprint = {
  id: 'bp-1',
  problem: 'monitorar viaturas e ocorrências',
  domain: 'security',
  summary: 's',
  backend: 'llm',
  ontology_types: [{ kind: 'Vehicle', rationale: 'r', properties: [] }],
  logic_functions: [
    { slug: 'sec.triagem', display_name: 'Triagem', description: 'd', prompt: '{{x}}', inputs: ['x'] },
  ],
  action_types: [{ name: 'sec.acao', description: 'd', code_ref: 'app.x', auto_approvable: false, rationale: 'r' }],
  workspace_layout: [{ type: 'counter', config: {}, rationale: 'r' }],
  proposed_project: { slug: 'op-security', display_name: 'Operação · security', description: 'd', domain: 'security', rationale: 'r' },
  proposed_agents: [{ slug: 'security-coleta', display_name: 'Coleta · security', kind: 'worker', description: 'd', skill_key: '', phase: 'coleta', rationale: 'r' }],
  proposed_flows: [{ slug: 'security-ingest', name: 'Fluxo de ingestão', description: 'd', phase: 'coleta', trigger: { type: 'manual' }, graph: {}, rationale: 'r' }],
  created_at: '2026-05-24T00:00:00Z',
  created_by: 'admin',
};

const fourPhaseGraph = {
  nodes: [
    { id: 'c1', kind: 'concept', phase: 'coleta', title: 'Coleta de dados', config: { items: [{ label: 'Fonte externa' }] } },
    { id: 'c2', kind: 'concept', phase: 'processamento', title: 'Processamento', config: { items: [{ label: 'Analisar narrativa' }] } },
    { id: 'c3', kind: 'concept', phase: 'ontologia', title: 'Ontologia', config: { generate_data_model: true, items: [{ label: 'Narrativa' }] } },
    { id: 'c4', kind: 'concept', phase: 'aplicacao', title: 'Construção da aplicação', config: { items: [{ label: 'Indicador (KPI)' }] } },
  ],
  edges: [
    { id: 'e1', source: 'c1', target: 'c2' },
    { id: 'e2', source: 'c2', target: 'c3' },
    { id: 'e3', source: 'c3', target: 'c4' },
  ],
  wizard: { domain: 'security' },
  backend: 'llm',
  domain: 'security',
  blueprint: sampleBlueprint,
};

const seedPattern = {
  id: 'p1',
  slug: 'seguranca-publica-base',
  title: 'Segurança pública — base',
  description: 'Ingestão, triagem e sala de situação.',
  category: 'vertical',
  vertical: 'seguranca-publica',
  nodes: [{ id: 'sp1', kind: 'worker', phase: 'coleta', title: 'Ingestão', config: {} }],
  edges: [],
};

const techPattern = {
  id: 'p2',
  slug: 'rag-acervo',
  title: 'RAG sobre acervo documental',
  description: 'Indexação vetorial e perguntas-respostas.',
  category: 'tecnico',
  vertical: null,
  nodes: [{ id: 'rp1', kind: 'connector', phase: 'coleta', title: 'Documentos', config: {} }],
  edges: [],
};

const flowPattern = {
  id: 'p3',
  slug: 'fluxo-triagem-resposta',
  title: 'Triagem e resposta',
  description: 'Recebe, classifica, roteia.',
  category: 'fluxo',
  vertical: null,
  nodes: [{ id: 'fp1', kind: 'worker', phase: 'coleta', title: 'Fila', config: {} }],
  edges: [],
};

describe('Desenho da Operação — M4 #9 canvas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedNodes = [];
    capturedEdges = [];
    Solutions.listPatterns.mockResolvedValue([seedPattern]);
    Solutions.listDiagrams.mockResolvedValue([]);
    Lineage.listEvents.mockResolvedValue([]);
    // Default: a inferência do AIP Arquiteto responde com o bloco
    // aegis:plano (tool-loop `/agent/tools/run` → final_text). Testes que
    // não exercem o chat simplesmente não o abrem.
    mockApiFetch.mockResolvedValue({ final_text: PLAN_BLOCK, model: 'mistralai/mixtral-8x22b-instruct' });
  });

  // W2 — a /solutions LÊ os defaults da experiência (Page.config.params) e os
  // passa ao AIP Arquiteto: aqui params.depth='full' deve chegar ao
  // designGraphViaTask no lugar do literal 'lean'.
  it('reads Page.config.params (depth) and threads it into designGraphViaTask', async () => {
    Pages.get.mockResolvedValueOnce({
      slug: 'solutions',
      title: 'Soluções',
      route: '/paginas/solutions/view',
      status: 'published',
      workspace_bindings: { operacao_id: null, espaco_id: null, sala_id: null },
      marking_requirements: [],
      iam_perm_required: 'solution.diagram.read',
      config: {
        mode: 'app_route',
        experience_kind: 'solutions',
        note: 'n',
        params: { depth: 'full', scope: 'full' },
      },
      last_edited_by: null,
      last_edited_at: null,
      created_at: null,
    });
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    await waitFor(() => expect(Pages.get).toHaveBeenCalledWith('solutions'));
    await finalizePlanViaChat();
    await waitFor(() => expect(Solutions.designGraphViaTask).toHaveBeenCalled());
    expect(Solutions.designGraphViaTask.mock.calls[0][2]?.depth).toBe('full');
  });

  it('renders the shell; palette, canvas and inspector closed by default — chat open', async () => {
    render(<SolutionsPage />);
    expect(screen.getByTestId('solutions-page')).toBeInTheDocument();
    expect(screen.getByTestId('solutions-3pane')).toBeInTheDocument();
    // #4 (feedback do operador) — a paleta "Componentes/Referências" nasce
    // ESCONDIDA; o botão da toolbar mostra/esconde.
    expect(screen.queryByTestId('solutions-left-pane')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('solutions-toggle-left'));
    expect(screen.getByTestId('solutions-left-pane')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('solutions-toggle-left'));
    expect(screen.queryByTestId('solutions-left-pane')).not.toBeInTheDocument();
    // #3 — o CANVAS nasce ESCONDIDO (painel colapsável) e o CHAT nasce ABERTO
    // (protagonista da página até existir diagrama).
    expect(screen.getByTestId('solutions-canvas-panel')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('solutions-arquiteto')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('arquiteto-input')).toBeInTheDocument();
    // toggle do canvas abre o painel (estado vazio com CTA dentro dele)
    fireEvent.click(screen.getByTestId('solutions-canvas-toggle'));
    expect(screen.getByTestId('solutions-canvas-panel')).toHaveAttribute('data-open', 'true');
    expect(screen.getByText(/Inicie o planejamento/i)).toBeInTheDocument();
    // "Configuração do nó" fica FECHADO por padrão (sem nó selecionado) — só
    // aparece ao clicar num nó. Antes ficava sempre aberto (regressão corrigida).
    expect(screen.queryByTestId('solutions-inspector')).not.toBeInTheDocument();
  });

  it('renderiza em pt-BR e nunca menciona Solution Designer/Foundry', () => {
    // #20 — o cabeçalho ("Desenho da Operação" + subtítulo) foi REMOVIDO (o
    // canvas+chat são o protagonista). A página segue renderizando, sem jargão.
    render(<SolutionsPage />);
    expect(screen.getByTestId('solutions-page')).toBeInTheDocument();
    expect(screen.queryByText(/Solution Designer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Foundry/i)).not.toBeInTheDocument();
  });

  it('loads reference-library patterns into the left pane', async () => {
    render(<SolutionsPage />);
    await waitFor(() => expect(Solutions.listPatterns).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('solutions-toggle-left')); // paleta nasce escondida
    fireEvent.click(screen.getByTestId('left-tab-library'));
    expect(await screen.findByTestId('pattern-seguranca-publica-base')).toBeInTheDocument();
  });

  it('opens the AIP Arquiteto chat (not a form) and renders the concept-node graph as the artifact', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    await finalizePlanViaChat();

    // detected the aegis:plano block → designGraph fired with the parsed wizard
    await waitFor(() => expect(Solutions.designGraphViaTask).toHaveBeenCalled());
    const [problemArg, wizardArg] = Solutions.designGraphViaTask.mock.calls[0];
    expect(typeof problemArg).toBe('string');
    expect(wizardArg.end_product).toBe('painel');
    expect(wizardArg.build_preference).toBe('low_code');

    // canvas (artifact) now shows the 4 concept nodes
    await waitFor(() => expect(phaseNodes().length).toBe(4));
    const phases = phaseNodes().map((n) => n.data.phase).sort();
    expect(phases).toEqual(['aplicacao', 'coleta', 'ontologia', 'processamento']);
    expect(phaseEdges().length).toBe(3);
  });

  it('the entry flow is a DOCKED in-page chat (not a modal), never a Next/Prev wizard', async () => {
    render(<SolutionsPage />);
    // #3 — panel docked as a <section>, OPEN by default (chat é o protagonista
    // com o canvas escondido); o toggle do cabeçalho recolhe/expande.
    const panel = screen.getByTestId('solutions-arquiteto');
    expect(panel.tagName).toBe('SECTION');
    expect(panel).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('arquiteto-input')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('arquiteto-toggle'));
    expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('arquiteto-input')).not.toBeInTheDocument();

    // O toggle do próprio chat re-EXPANDE o painel docado — sem modal/overlay.
    fireEvent.click(screen.getByTestId('arquiteto-toggle'));
    expect(await screen.findByTestId('arquiteto-input')).toBeInTheDocument();
    expect(screen.getByTestId('solutions-arquiteto')).toHaveAttribute(
      'data-collapsed',
      'false',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // no remnants of the old wizard
    expect(screen.queryByTestId('solutions-wizard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wizard-next')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wizard-generate')).not.toBeInTheDocument();
  });

  it('the empty-canvas CTA also expands the docked chat panel (no modal)', async () => {
    render(<SolutionsPage />);
    // canvas nasce escondido → abre o painel do canvas pra ver o CTA
    fireEvent.click(screen.getByTestId('solutions-canvas-toggle'));
    // recolhe o chat primeiro pra provar que o CTA o expande de volta
    fireEvent.click(screen.getByTestId('arquiteto-toggle'));
    expect(screen.getByTestId('solutions-arquiteto')).toHaveAttribute('data-collapsed', 'true');
    fireEvent.click(screen.getByTestId('solutions-canvas-empty-cta'));
    expect(await screen.findByTestId('arquiteto-input')).toBeInTheDocument();
    expect(screen.getByTestId('solutions-arquiteto')).toHaveAttribute(
      'data-collapsed',
      'false',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('adds a component from the palette to the canvas', async () => {
    render(<SolutionsPage />);
    fireEvent.click(screen.getByTestId('solutions-toggle-left')); // paleta nasce escondida
    // components tab is default; click a worker palette item
    fireEvent.click(screen.getByTestId('palette-worker'));
    await waitFor(() => expect(phaseNodes().length).toBe(1));
    expect(phaseNodes()[0].data.kind).toBe('worker');
  });

  it('saves the diagram via createDiagram', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    Solutions.createDiagram.mockResolvedValueOnce({ id: 'd1', version: 1 });
    render(<SolutionsPage />);
    // generate a graph first (via the AIP Arquiteto chat)
    await finalizePlanViaChat();
    await waitFor(() => expect(phaseNodes().length).toBe(4));

    fireEvent.click(screen.getByTestId('solutions-save'));
    await waitFor(() => expect(Solutions.createDiagram).toHaveBeenCalled());
    expect(await screen.findByTestId('solutions-saved-msg')).toHaveTextContent('v1');
  });

  // ── L17 "Salvar e Construir" ─────────────────────────────────────────────
  it('shows "Salvar e Construir" only after a diagram is generated', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    // empty canvas: the build CTA is not present yet
    expect(screen.queryByTestId('solutions-save-build')).not.toBeInTheDocument();
    await finalizePlanViaChat();
    await waitFor(() => expect(phaseNodes().length).toBe(4));
    expect(screen.getByTestId('solutions-save-build')).toBeInTheDocument();
  });

  it('"Salvar e Construir" persists then opens the build dialog with the blueprint', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    Solutions.createDiagram.mockResolvedValueOnce({ id: 'd1', version: 1, blueprint: sampleBlueprint });
    render(<SolutionsPage />);
    await finalizePlanViaChat();
    await waitFor(() => expect(phaseNodes().length).toBe(4));

    fireEvent.click(screen.getByTestId('solutions-save-build'));
    // saved via createDiagram, then the MaterializeDialog opens
    await waitFor(() => expect(Solutions.createDiagram).toHaveBeenCalled());
    expect(await screen.findByTestId('solutions-materialize')).toBeInTheDocument();
    // the embedded blueprint seeds the proposed Operação group (no extra fetch)
    expect(screen.getByTestId('materialize-grp-operation')).toBeInTheDocument();
    expect(Solutions.design).not.toHaveBeenCalled();
  });

  // ── M4-REWORK ──────────────────────────────────────────────────────────
  it('renders LLM-generated per-phase content (config.items) on the canvas', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    await finalizePlanViaChat();
    await waitFor(() => expect(phaseNodes().length).toBe(4));
    // the ontologia node carries the LLM item "Narrativa"
    const onto = phaseNodes().find((n) => n.data.phase === 'ontologia');
    expect(onto.data.config.items.map((i: any) => i.label)).toContain('Narrativa');
  });

  it('groups the reference library into Industry/Technical/Workflow categories', async () => {
    Solutions.listPatterns.mockResolvedValue([seedPattern, techPattern, flowPattern]);
    render(<SolutionsPage />);
    await waitFor(() => expect(Solutions.listPatterns).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('solutions-toggle-left')); // paleta nasce escondida
    fireEvent.click(screen.getByTestId('left-tab-library'));
    expect(await screen.findByTestId('library-cat-vertical')).toBeInTheDocument();
    expect(screen.getByTestId('library-cat-tecnico')).toBeInTheDocument();
    expect(screen.getByTestId('library-cat-fluxo')).toBeInTheDocument();
    expect(screen.getByTestId('pattern-rag-acervo')).toBeInTheDocument();
    expect(screen.getByTestId('pattern-fluxo-triagem-resposta')).toBeInTheDocument();
  });

  it('drag-to-connect adds a directed edge between two nodes', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    await finalizePlanViaChat();
    await waitFor(() => expect(phaseEdges().length).toBe(3));
    // simulate reactflow firing onConnect (coleta → aplicacao, a new edge)
    expect(typeof lastOnConnect).toBe('function');
    lastOnConnect!({ source: 'c1', target: 'c4' });
    await waitFor(() => expect(phaseEdges().length).toBe(4));
    expect(phaseEdges().some((e) => e.source === 'c1' && e.target === 'c4')).toBe(true);
  });

  it('toolbar: Load from lineage generates a graph', async () => {
    Solutions.fromLineage.mockResolvedValueOnce({
      nodes: [
        { id: 'l1', kind: 'concept', phase: 'aplicacao', title: 'Construção da aplicação', config: {} },
      ],
      edges: [],
      wizard: { from_lineage: true },
    });
    render(<SolutionsPage />);
    // #9/#10 — "Carregar do histórico" agora vive no menu kebab (⋮).
    fireEvent.click(screen.getByTestId('solutions-more-trigger'));
    fireEvent.click(screen.getByTestId('solutions-more-from-lineage'));
    await waitFor(() => expect(Solutions.fromLineage).toHaveBeenCalled());
    await waitFor(() => expect(phaseNodes().length).toBe(1));
    expect(phaseNodes()[0].data.phase).toBe('aplicacao');
  });

  it('shows a loading affordance on the toolbar while loading from lineage (#9/#10)', async () => {
    // Como o kebab fecha ao clicar, o feedback de "carregando" migrou p/ a faixa
    // de status da toolbar. Promessa deferida p/ capturar o estado transitório.
    let resolveFn: (v: unknown) => void = () => {};
    Solutions.fromLineage.mockReturnValueOnce(
      new Promise((res) => {
        resolveFn = res;
      }),
    );
    render(<SolutionsPage />);
    fireEvent.click(screen.getByTestId('solutions-more-trigger'));
    fireEvent.click(screen.getByTestId('solutions-more-from-lineage'));
    expect(await screen.findByTestId('solutions-loading-lineage')).toBeInTheDocument();
    resolveFn({ nodes: [], edges: [], wizard: {} });
    await waitFor(() =>
      expect(screen.queryByTestId('solutions-loading-lineage')).not.toBeInTheDocument(),
    );
  });

  it('toolbar: undo reverts the last graph change', async () => {
    render(<SolutionsPage />);
    fireEvent.click(screen.getByTestId('solutions-toggle-left')); // paleta nasce escondida
    // add two palette components, then undo once
    fireEvent.click(screen.getByTestId('palette-worker'));
    await waitFor(() => expect(phaseNodes().length).toBe(1));
    fireEvent.click(screen.getByTestId('palette-dataset'));
    await waitFor(() => expect(phaseNodes().length).toBe(2));
    fireEvent.click(screen.getByTestId('solutions-undo'));
    await waitFor(() => expect(phaseNodes().length).toBe(1));
  });

  it('exposes New diagram / Import / Export in the overflow menu (#9/#10)', () => {
    render(<SolutionsPage />);
    // #9/#10 — só "Construir" e "Salvar ▾" ficam primários; o resto vai pro ⋮.
    expect(screen.getByTestId('solutions-diagram-description')).toBeInTheDocument();
    expect(screen.queryByTestId('solutions-more-new-diagram')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('solutions-more-trigger'));
    expect(screen.getByTestId('solutions-more-new-diagram')).toBeInTheDocument();
    expect(screen.getByTestId('solutions-more-import')).toBeInTheDocument();
    expect(screen.getByTestId('solutions-more-export')).toBeInTheDocument();
  });

  it('Salvar ▾ lists saved diagrams and reopens one (#10)', async () => {
    Solutions.listDiagrams.mockResolvedValue([
      { id: 'd1', title: 'Operação Alpha', version: 2, nodes: [{ id: 'n1', kind: 'worker', phase: 'coleta', title: 'W', config: {} }], edges: [], wizard: {} },
    ]);
    render(<SolutionsPage />);
    await waitFor(() => expect(Solutions.listDiagrams).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('solutions-save-menu-toggle'));
    expect(await screen.findByTestId('solutions-save-item-d1')).toHaveTextContent('Operação Alpha');
    fireEvent.click(screen.getByTestId('solutions-save-item-d1'));
    await waitFor(() => expect(phaseNodes().length).toBe(1));
  });

  // ── #5 — Histórico (AIP-generation audit) ────────────────────────────────
  it('Histórico toggle opens the read-only audit panel and fetches solution.design/materialize', async () => {
    Lineage.listEvents.mockResolvedValue([]);
    render(<SolutionsPage />);
    // panel hidden until toggled
    expect(screen.queryByTestId('solutions-history')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('solutions-toggle-history'));
    expect(await screen.findByTestId('solutions-history')).toBeInTheDocument();
    await waitFor(() => expect(Lineage.listEvents).toHaveBeenCalled());
    const types = Lineage.listEvents.mock.calls.map((c) => c[0].event_type).sort();
    expect(types).toContain('solution.design');
    expect(types).toContain('solution.materialize');
    // closing it hides the panel again
    fireEvent.click(screen.getByTestId('history-close'));
    await waitFor(() =>
      expect(screen.queryByTestId('solutions-history')).not.toBeInTheDocument(),
    );
  });

  // ── #4a — "Perguntar à IA" feeds the docked chat with node context ───────
  it('aegis:aip-assist opens the docked chat and seeds the composer with the node prompt', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    await finalizePlanViaChat();
    await waitFor(() => expect(phaseNodes().length).toBe(4));
    // chat collapsed after generation; dispatch the assist event (as the
    // NodeInspector "Perguntar à IA" button does)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('aegis:aip-assist', {
          detail: {
            nodeId: 'c1',
            prompt: 'Sobre o nó "Coleta de dados" (Conceito): explique o que ele faz.',
          },
        }),
      );
    });
    // the docked composer is shown (chat expanded) and seeded with the prompt
    const input = (await screen.findByTestId(
      'arquiteto-input',
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toContain('Coleta de dados'));
  });
});

// ── #3 (feedback do operador) — layout modular: dock 4 lados + resize com
//    memorização no backend (/api/me/context.panel_layouts) + canvas colapsável
//    default escondido com auto-expand quando o diagrama nasce. ─────────────
describe('Desenho da Operação — #3 layout modular (dock/resize/memorização)', () => {
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedNodes = [];
    capturedEdges = [];
    Solutions.listPatterns.mockResolvedValue([]);
    Lineage.listEvents.mockResolvedValue([]);
    mockApiFetch.mockResolvedValue({ final_text: PLAN_BLOCK, model: 'mistralai/mixtral-8x22b-instruct' });
    fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/me/context' && (!init || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ panel_layouts: {} }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('dock: o chat ancora em qualquer um dos 4 lados e PERSISTE no backend', async () => {
    render(<SolutionsPage />);
    const center = screen.getByTestId('solutions-center');
    expect(center).toHaveAttribute('data-dock', 'bottom'); // default
    fireEvent.click(screen.getByTestId('arquiteto-dock-left'));
    expect(center).toHaveAttribute('data-dock', 'left');
    expect(screen.getByTestId('arquiteto-dock-left')).toHaveAttribute('aria-pressed', 'true');
    // memorização: UM PUT debounced com panel_layouts.solutions.chat_dock='left'
    await waitFor(
      () => {
        const put = fetchMock.mock.calls.find(
          ([, init]: [string, RequestInit?]) => init?.method === 'PUT',
        );
        expect(put).toBeTruthy();
        const body = JSON.parse(String(put![1]!.body));
        expect(body.panel_layouts.solutions.chat_dock).toBe('left');
      },
      { timeout: 2500 },
    );
  });

  it('#3: trocar a âncora do dock NÃO reseta o histórico do chat', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    await finalizePlanViaChat();
    // o chat acumulou turns (msg do operador + resposta do AIP)
    const count = () =>
      screen.getByTestId('arquiteto-messages').querySelectorAll('[data-testid^="arquiteto-message"]').length;
    await waitFor(() => expect(count()).toBeGreaterThan(0));
    const before = count();
    // troca a âncora cruzando o limite (bottom default → left → bottom): ANTES
    // remontava o chat e zerava o histórico; agora é UMA instância (CSS order).
    fireEvent.click(screen.getByTestId('arquiteto-dock-left'));
    expect(screen.getByTestId('solutions-center')).toHaveAttribute('data-dock', 'left');
    expect(count()).toBe(before); // histórico preservado
    fireEvent.click(screen.getByTestId('arquiteto-dock-bottom'));
    expect(count()).toBe(before);
  });

  it('canvas: nasce escondido e AUTO-EXPANDE quando o diagrama é gerado', async () => {
    Solutions.designGraphViaTask.mockResolvedValueOnce(fourPhaseGraph);
    render(<SolutionsPage />);
    expect(screen.getByTestId('solutions-canvas-panel')).toHaveAttribute('data-open', 'false');
    await finalizePlanViaChat();
    await waitFor(() =>
      expect(screen.getByTestId('solutions-canvas-panel')).toHaveAttribute('data-open', 'true'),
    );
    await waitFor(() => expect(phaseNodes().length).toBe(4));
  });

  it('resize: arrastar a alça redimensiona o chat e persiste chat_size', async () => {
    render(<SolutionsPage />);
    // abre o canvas pra existir a divisória (chat aberto + canvas aberto)
    fireEvent.click(screen.getByTestId('solutions-canvas-toggle'));
    const handle = screen.getByTestId('solutions-chat-resize');
    // jsdom não tem PointerEvent — MouseEvent com type 'pointerdown' aciona o
    // onPointerDown do React (delegação por tipo) E carrega clientY.
    act(() => {
      handle.dispatchEvent(
        new MouseEvent('pointerdown', { clientY: 500, bubbles: true }),
      );
    });
    // dock bottom: arrastar PARA CIMA aumenta o chat (340 + 50 = 390).
    // dispatch nativo (fora de evento React) → act() pra flush do estado.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 450 }));
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(screen.getByTestId('solutions-chat-wrap')).toHaveStyle({ height: '390px' });
    await waitFor(
      () => {
        const put = fetchMock.mock.calls.find(
          ([, init]: [string, RequestInit?]) => init?.method === 'PUT',
        );
        expect(put).toBeTruthy();
        expect(JSON.parse(String(put![1]!.body)).panel_layouts.solutions.chat_size).toBe(390);
      },
      { timeout: 2500 },
    );
  });

  it('dock lateral: painéis colapsados viram tiras VERTICAIS com borda cinza', async () => {
    render(<SolutionsPage />);
    // dock à esquerda
    fireEvent.click(screen.getByTestId('arquiteto-dock-left'));
    // canvas nasce colapsado → em dock lateral é TIRA VERTICAL com borda
    const canvasPanel = screen.getByTestId('solutions-canvas-panel');
    expect(canvasPanel).toHaveAttribute('data-orientation', 'vertical');
    expect(canvasPanel.className).toContain('border-l');
    expect(canvasPanel.className).toContain('w-9');
    // colapsa o chat → também vira tira vertical, com borda no lado do dock
    fireEvent.click(screen.getByTestId('arquiteto-toggle'));
    const chat = screen.getByTestId('solutions-arquiteto');
    expect(chat).toHaveAttribute('data-orientation', 'vertical');
    expect(chat.className).toContain('border-r');
    expect(chat.className).toContain('w-9');
    // a tira expande de volta
    fireEvent.click(screen.getByTestId('arquiteto-toggle'));
    expect(screen.getByTestId('solutions-arquiteto')).toHaveAttribute(
      'data-orientation',
      'horizontal',
    );
    // chat aberto em dock lateral leva a borda cinza do lado do canvas
    expect(screen.getByTestId('solutions-arquiteto').className).toContain('border-r');
  });

  it('memorização: o layout salvo é RESTAURADO do backend ao montar', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/me/context' && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              panel_layouts: {
                solutions: { chat_dock: 'right', chat_size: 480, canvas_open: true },
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    render(<SolutionsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('solutions-center')).toHaveAttribute('data-dock', 'right'),
    );
    expect(screen.getByTestId('solutions-canvas-panel')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('solutions-chat-wrap')).toHaveStyle({ width: '480px' });
  });
});
