/**
 * MaterializeDialog — "Salvar e Construir" (Sprint L17, 2026-05-24).
 *
 * Cobre o fluxo de materialização da operação a partir do blueprint do
 * diagrama:
 *   - renderiza os grupos propostos (Operação / Agentes / Fluxos / Tipos de
 *     objeto / Funções de IA / Ações / Painel) com rótulos humanos;
 *   - checkboxes começam todos marcados; toggles ajustam o accept payload;
 *   - "Construir" chama Solutions.materialize(blueprint, accept) com o payload
 *     correto e renderiza as contagens do resultado;
 *   - quando o diagrama não traz blueprint embutido, recai em Solutions.design.
 *
 * Solutions é mockado. useT() fora de provider devolve pt-BR (default).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { MaterializeDialog } from '@/components/solution-designer/MaterializeDialog';

jest.mock('@/lib/api', () => ({
  Solutions: {
    materialize: jest.fn(),
    design: jest.fn(),
  },
  Spaces: {
    list: jest.fn(() => Promise.resolve([])),
  },
}));
jest.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

const { Solutions } = jest.requireMock('@/lib/api') as {
  Solutions: Record<string, jest.Mock>;
};

const BLUEPRINT = {
  id: 'bp-1',
  problem: 'monitorar viaturas e ocorrências',
  domain: 'security',
  summary: 's',
  backend: 'llm',
  ontology_types: [
    { kind: 'Vehicle', rationale: 'chave de busca', properties: [] },
    { kind: 'Event', rationale: 'ocorrência', properties: [] },
  ],
  logic_functions: [
    { slug: 'sec.triagem', display_name: 'Triagem por severidade', description: 'd', prompt: '{{x}}', inputs: ['x'] },
  ],
  action_types: [
    { name: 'sec.despachar', description: 'despacha viatura', code_ref: 'app.x', auto_approvable: false, rationale: 'r' },
  ],
  workspace_layout: [{ type: 'counter', config: {}, rationale: 'r' }],
  proposed_project: {
    slug: 'op-security',
    display_name: 'Operação · Segurança',
    description: 'Container operacional',
    domain: 'security',
    rationale: 'r',
  },
  proposed_agents: [
    { slug: 'security-coleta', display_name: 'Coleta · Segurança', kind: 'worker', description: 'ingestão', skill_key: '', phase: 'coleta', rationale: 'r' },
  ],
  proposed_flows: [
    { slug: 'security-ingest', name: 'Fluxo de ingestão', description: 'roda a coleta', phase: 'coleta', trigger: { type: 'manual' }, graph: {}, rationale: 'r' },
  ],
  proposed_app: {
    slug: 'app-security',
    title: 'Aplicação · Segurança',
    description: 'Aplicação composta',
    rationale: 'r',
    widgets: [{ type: 'counter', config: {}, rationale: 'r' }],
  },
  proposed_pages: [
    {
      slug: 'pagina-security',
      title: 'Página · Segurança',
      rationale: 'r',
      widgets: [{ type: 'counter', config: {}, rationale: 'r' }],
    },
  ],
  created_at: '2026-05-24T00:00:00Z',
  created_by: 'admin',
};

const DIAGRAM_WITH_BP = {
  id: 'd1',
  title: 'Operação de segurança',
  nodes: [{ id: 'n1', kind: 'concept', phase: 'coleta', title: 'Coleta' }],
  edges: [],
  wizard: { domain: 'security' },
  blueprint: BLUEPRINT,
  project_id: null,
};

const RESULT_OK = {
  materialized: {
    ontology_types: 2,
    logic_functions: 1,
    action_types: 1,
    workspaces: 1,
    projects: 1,
    agents: 1,
    flows: 1,
    apps: 1,
    pages: 1,
    widgets: 3,
  },
  failures: [],
  lineage_event_ids: ['ev1'],
  blueprint_hash: 'abc123',
};

describe('MaterializeDialog — Salvar e Construir', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the proposed entity groups with human labels (never raw slugs only)', () => {
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />,
    );
    expect(screen.getByTestId('solutions-materialize')).toBeInTheDocument();
    // grouped sections
    expect(screen.getByTestId('materialize-grp-operation')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-grp-agents')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-grp-flows')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-grp-onto')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-grp-logic')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-grp-actions')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-grp-workspace')).toBeInTheDocument();
    // Sprint L18 — Workshop App + Páginas groups present.
    expect(screen.getByTestId('materialize-grp-app')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-grp-pages')).toBeInTheDocument();
    // human display labels surfaced
    expect(screen.getByText('Operação · Segurança')).toBeInTheDocument();
    expect(screen.getByText('Coleta · Segurança')).toBeInTheDocument();
    expect(screen.getByText('Fluxo de ingestão')).toBeInTheDocument();
    expect(screen.getByText('Triagem por severidade')).toBeInTheDocument();
    expect(screen.getByText('Aplicação · Segurança')).toBeInTheDocument();
    expect(screen.getByText('Página · Segurança')).toBeInTheDocument();
    // workspace shows the pt-BR kind label, never the raw widget type "counter"
    expect(screen.getByText('Painel (Sala)')).toBeInTheDocument();
    expect(screen.queryByText('counter')).not.toBeInTheDocument();
  });

  it('checkboxes start all checked', () => {
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />,
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it('Construir calls Solutions.materialize with the checked accept payload', async () => {
    Solutions.materialize.mockResolvedValueOnce(RESULT_OK);
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />,
    );

    // uncheck one agent to prove the payload reflects the selection
    fireEvent.click(screen.getByTestId('materialize-agent-security-coleta-cb'));

    fireEvent.click(screen.getByTestId('materialize-build'));
    await waitFor(() => expect(Solutions.materialize).toHaveBeenCalledTimes(1));

    const [bpArg, acceptArg] = Solutions.materialize.mock.calls[0];
    expect(bpArg.id).toBe('bp-1');
    // project accepted (bool), workspace accepted (bool)
    expect(acceptArg.project).toBe(true);
    expect(acceptArg.workspace_layout).toBe(true);
    // onto/logic/actions accepted by id/slug/name
    expect(acceptArg.ontology_types.sort()).toEqual(['Event', 'Vehicle']);
    expect(acceptArg.logic_functions).toEqual(['sec.triagem']);
    expect(acceptArg.action_types).toEqual(['sec.despachar']);
    // the unchecked agent is excluded; flows still present
    expect(acceptArg.agents).toEqual([]);
    expect(acceptArg.flows).toEqual(['security-ingest']);
    // Sprint L18 — Workshop App (bool) + Páginas (by slug) in the payload.
    expect(acceptArg.app).toBe(true);
    expect(acceptArg.pages).toEqual(['pagina-security']);
    // destination project id passed through
    expect(acceptArg.project_id).toBeNull();
  });

  it('renders the created counts and a link to operations on success', async () => {
    Solutions.materialize.mockResolvedValueOnce(RESULT_OK);
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />,
    );
    fireEvent.click(screen.getByTestId('materialize-build'));

    expect(await screen.findByTestId('materialize-result')).toBeInTheDocument();
    // success state + link to /painel-de-controle/operacoes
    const link = screen.getByTestId('materialize-view-operations') as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/painel-de-controle/operacoes');
    // Sprint L18 — App + Páginas links to /workshop and /painel-de-controle/paginas.
    const appLink = screen.getByTestId('materialize-view-apps') as HTMLAnchorElement;
    expect(appLink.getAttribute('href')).toBe('/workshop');
    const pagesLink = screen.getByTestId('materialize-view-pages') as HTMLAnchorElement;
    expect(pagesLink.getAttribute('href')).toBe('/painel-de-controle/paginas');
    // selection groups are gone once the result is shown
    expect(screen.queryByTestId('materialize-grp-operation')).not.toBeInTheDocument();
  });

  it('B (#3): a MESMA fonte com rotas DIFERENTES em nós distintos sobrevive ao dedupe', async () => {
    Solutions.materialize.mockResolvedValueOnce(RESULT_OK);
    const diag = {
      ...DIAGRAM_WITH_BP,
      nodes: [
        { id: 'c1', kind: 'concept', phase: 'coleta', title: 'Coleta A',
          config: { linked_sources: [{ kind: 'fonte', id: 'planilha', label: 'p.csv', target_node_type: 'Ocorrencia', id_field: 'protocolo' }] } },
        { id: 'c2', kind: 'concept', phase: 'coleta', title: 'Coleta B',
          config: { linked_sources: [{ kind: 'fonte', id: 'planilha', label: 'p.csv', target_node_type: 'Endereco', id_field: 'cep' }] } },
      ],
    };
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={diag} />);
    fireEvent.click(screen.getByTestId('materialize-build'));
    await waitFor(() => expect(Solutions.materialize).toHaveBeenCalledTimes(1));
    const linkedArg = Solutions.materialize.mock.calls[0][4]; // 5º arg = linkedSources
    expect(linkedArg).toHaveLength(2); // as duas rotas, não colapsadas em 1
    expect(linkedArg.map((s: { target_node_type: string }) => s.target_node_type).sort()).toEqual(['Endereco', 'Ocorrencia']);
  });

  it('N-SKILLS: cada skill do nó vira agentParams + worker sintetizado no blueprint', async () => {
    Solutions.materialize.mockResolvedValueOnce(RESULT_OK);
    const diag = {
      ...DIAGRAM_WITH_BP,
      nodes: [
        {
          id: 'c1', kind: 'concept', phase: 'coleta', title: 'Coleta',
          config: {
            coleta_skills: [
              { skill_key: 'social.instagram', params: { query: '#x' } },
              { skill_key: 'osint.extrair_posts', params: { limit: 5 } },
            ],
          },
        },
      ],
    };
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={diag} />);
    fireEvent.click(screen.getByTestId('materialize-build'));
    await waitFor(() => expect(Solutions.materialize).toHaveBeenCalledTimes(1));
    const [blueprintArg, acceptArg, , , , agentParamsArg] = Solutions.materialize.mock.calls[0];
    // agentParams keyed por skill_key (AMBAS as skills)
    expect(agentParamsArg['social.instagram']).toEqual({ query: '#x' });
    expect(agentParamsArg['osint.extrair_posts']).toEqual({ limit: 5 });
    // proposed_agents ganha um worker sintetizado por skill
    const keys = blueprintArg.proposed_agents.map((a: { skill_key?: string }) => a.skill_key);
    expect(keys).toContain('social.instagram');
    expect(keys).toContain('osint.extrair_posts');
    // accept.agents inclui os sintetizados (o operador escolheu a skill → roda)
    const synthSlugs = blueprintArg.proposed_agents
      .filter((a: { skill_key?: string }) =>
        ['social.instagram', 'osint.extrair_posts'].includes(a.skill_key || ''))
      .map((a: { slug: string }) => a.slug);
    expect(synthSlugs).toHaveLength(2);
    for (const s of synthSlugs) expect(acceptArg.agents).toContain(s);
  });

  it('N-SKILLS: o painel de agentes mostra o worker sintetizado (marcado + travado)', async () => {
    const diag = {
      ...DIAGRAM_WITH_BP,
      nodes: [
        {
          id: 'c1', kind: 'concept', phase: 'coleta', title: 'Coleta',
          config: { coleta_skills: [{ skill_key: 'social.instagram', params: {} }] },
        },
      ],
    };
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={diag} />);
    const synthRow = await screen.findByTestId('materialize-agent-coleta-social-instagram');
    const cb = within(synthRow).getByTestId(
      'materialize-agent-coleta-social-instagram-cb',
    ) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    expect(cb.disabled).toBe(true); // travado — remover-se no nó de Coleta
  });

  it('B (#1): resultado mostra a ROTA de cada fonte (Fonte → Tipo · status humano)', async () => {
    Solutions.materialize.mockResolvedValueOnce({
      ...RESULT_OK,
      source_results: [
        { label: 'planilha.csv', kind: 'fonte', target_node_type: 'Ocorrencia', action: 'typed-ingest:120' },
        { label: 'API municipal', kind: 'conector', target_node_type: 'Endereco', action: 'scheduled' },
        { label: 'dataset bruto', kind: 'dataset', target_node_type: '', action: 'registered' },
      ],
    });
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />);
    fireEvent.click(screen.getByTestId('materialize-build'));
    expect(await screen.findByTestId('materialize-source-routes')).toBeInTheDocument();
    const routes = screen.getAllByTestId('materialize-source-route');
    expect(routes).toHaveLength(3);
    // rota tipada: Fonte → Tipo + status humano "120 objetos criados" (nunca o código cru)
    expect(routes[0]).toHaveTextContent('planilha.csv');
    expect(routes[0]).toHaveTextContent('Ocorrencia');
    expect(routes[0]).toHaveTextContent('120 objetos criados');
    expect(routes[0]).not.toHaveTextContent('typed-ingest');
    // conector agendado
    expect(routes[1]).toHaveTextContent('Endereco');
    expect(routes[1]).toHaveTextContent('ingestão agendada');
    // sem saída → só proveniência (sem seta de Tipo)
    expect(routes[2]).toHaveTextContent('proveniência');
  });

  it('T2: surfa avisos de clamp (parâmetro ajustado) como aviso discreto — não falha', async () => {
    Solutions.materialize.mockResolvedValueOnce({
      ...RESULT_OK,
      warnings: [
        {
          kind: 'agent',
          name: 'coleta-cameras',
          message:
            'Máximo de câmeras por execução (max_cameras): 999 fora dos limites [1–100] — ajustado para 100.',
        },
      ],
    });
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />,
    );
    fireEvent.click(screen.getByTestId('materialize-build'));
    expect(await screen.findByTestId('materialize-warnings')).toBeInTheDocument();
    // título i18n pt-BR (default) + tom honesto: o que foi ajustado e p/ quê
    expect(screen.getByText('Parâmetros ajustados')).toBeInTheDocument();
    expect(screen.getByText('coleta-cameras')).toBeInTheDocument();
    expect(screen.getByText(/ajustado para 100/)).toBeInTheDocument();
    // aviso ≠ falha: o estado continua sucesso, sem bloco de falhas
    expect(screen.queryByTestId('materialize-failures')).not.toBeInTheDocument();
    expect(screen.getByText('Operação construída com sucesso.')).toBeInTheDocument();
  });

  it('T2: sem warnings no resultado → bloco de avisos não aparece', async () => {
    Solutions.materialize.mockResolvedValueOnce(RESULT_OK);
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />,
    );
    fireEvent.click(screen.getByTestId('materialize-build'));
    await screen.findByTestId('materialize-result');
    expect(screen.queryByTestId('materialize-warnings')).not.toBeInTheDocument();
  });

  it('shows failures when materialize reports them', async () => {
    Solutions.materialize.mockResolvedValueOnce({
      ...RESULT_OK,
      materialized: { ...RESULT_OK.materialized, projects: 0 },
      failures: [{ kind: 'project', name: 'op-security', reason: 'já existe' }],
    });
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM_WITH_BP} />,
    );
    fireEvent.click(screen.getByTestId('materialize-build'));
    expect(await screen.findByTestId('materialize-failures')).toBeInTheDocument();
    expect(screen.getByText(/já existe/)).toBeInTheDocument();
    // no Operação created → no operations link
    expect(screen.queryByTestId('materialize-view-operations')).not.toBeInTheDocument();
  });

  it('fetches a blueprint via Solutions.design when the diagram has none', async () => {
    Solutions.design.mockResolvedValueOnce(BLUEPRINT);
    const diagramNoBp = { ...DIAGRAM_WITH_BP, blueprint: null };
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={diagramNoBp} />,
    );
    await waitFor(() => expect(Solutions.design).toHaveBeenCalled());
    expect(await screen.findByTestId('materialize-grp-operation')).toBeInTheDocument();
  });

  it('marks generic actions "executável" and custom ones "personalizar" (Onda 4.1)', () => {
    const bp = {
      ...BLUEPRINT,
      action_types: [
        { name: 'cond.reservar', description: 'reservar área', code_ref: 'aegis.ontology.create_object', auto_approvable: true, rationale: 'r' },
        { name: 'sec.arquivar', description: 'arquivar', code_ref: 'app.actions.sec.arquivar', auto_approvable: false, rationale: 'r' },
      ],
    };
    render(
      <MaterializeDialog open onOpenChange={jest.fn()} diagram={{ ...DIAGRAM_WITH_BP, blueprint: bp }} />,
    );
    expect(screen.getByTestId('materialize-action-cond.reservar-badge')).toHaveTextContent('executável');
    expect(screen.getByTestId('materialize-action-sec.arquivar-badge')).toHaveTextContent('personalizar');
  });
});
