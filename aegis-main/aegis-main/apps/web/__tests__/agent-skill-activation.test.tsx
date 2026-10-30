/**
 * #2 — agentes propostos amarram skills REAIS + ativação no card (2026-06-05).
 *
 * No MaterializeDialog, cada agente de Coleta mostra a skill real casada pelo
 * Arquiteto: a fonte (label), badges de plataforma e uma pílula de status
 * honesta. Skill openclaw curada (ainda não registrada) vem "requer ativação"
 * com botão "Ativar skill" que chama o endpoint real (Skills.installOpenclaw);
 * skill builtin vem "pronta". Nada de smoke.echo.
 *
 * Solutions/Spaces/Skills mockados. useT() fora de provider devolve pt-BR.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { MaterializeDialog } from '@/components/solution-designer/MaterializeDialog';

jest.mock('@/lib/api', () => ({
  Solutions: { materialize: jest.fn(), design: jest.fn() },
  Spaces: { list: jest.fn(() => Promise.resolve([])) },
  Skills: { installOpenclaw: jest.fn() },
}));
jest.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

const { Skills } = jest.requireMock('@/lib/api') as { Skills: Record<string, jest.Mock> };

const BLUEPRINT = {
  id: 'bp-2',
  problem: 'monitorar Instagram de alvos + coletar de uma API',
  domain: 'osint',
  summary: 's',
  backend: 'llm',
  ontology_types: [{ kind: 'Profile', rationale: 'alvo', properties: [] }],
  logic_functions: [{ slug: 'x.tri', display_name: 'Triagem', description: 'd', prompt: '{{x}}', inputs: ['x'] }],
  action_types: [{ name: 'x.flag', description: 'sinaliza', code_ref: 'app.x', auto_approvable: false, rationale: 'r' }],
  workspace_layout: [{ type: 'counter', config: {}, rationale: 'r' }],
  proposed_project: { slug: 'op-osint', display_name: 'Operação · OSINT', description: 'd', domain: 'osint', rationale: 'r' },
  proposed_agents: [
    {
      slug: 'osint-coleta-ig',
      display_name: 'Coleta · Instagram',
      kind: 'worker',
      description: 'ingestão',
      skill_key: 'openclaw:postiz',
      skill_label: 'Postiz',
      skill_platforms: ['instagram', 'facebook'],
      skill_ready: false,
      phase: 'coleta',
      rationale: 'r',
    },
    {
      slug: 'osint-coleta-api',
      display_name: 'Coleta · API',
      kind: 'worker',
      description: 'ingestão HTTP',
      skill_key: 'connector.http',
      skill_label: 'HTTP Connector',
      skill_platforms: [],
      skill_ready: true,
      phase: 'coleta',
      rationale: 'r',
    },
    {
      slug: 'osint-proc',
      display_name: 'Processamento · OSINT',
      kind: 'aip',
      description: 'triagem por IA',
      skill_key: '',
      skill_ready: true,
      phase: 'processamento',
      rationale: 'r',
    },
  ],
  proposed_flows: [],
  proposed_app: { slug: 'app-osint', title: 'App OSINT', description: 'd', rationale: 'r', widgets: [{ type: 'counter', config: {}, rationale: 'r' }] },
  proposed_pages: [],
  created_at: '2026-06-05T00:00:00Z',
  created_by: 'admin',
};

const DIAGRAM = {
  id: 'd2',
  title: 'Operação OSINT',
  nodes: [],
  edges: [],
  wizard: { domain: 'osint' },
  blueprint: BLUEPRINT,
  project_id: null,
};

describe('AgentRow — skill real + ativação (#2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mostra a fonte real, badges de plataforma e status honesto por agente', () => {
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM} />);

    // openclaw → fonte "Postiz" + badge instagram + "requer ativação" + botão Ativar
    expect(screen.getByText(/Postiz/)).toBeInTheDocument();
    expect(screen.getByTestId('materialize-agent-osint-coleta-ig-plat-instagram')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-agent-osint-coleta-ig-status-pending')).toBeInTheDocument();
    expect(screen.getByTestId('materialize-agent-osint-coleta-ig-activate')).toBeInTheDocument();

    // builtin → "pronta", sem botão de ativação
    expect(screen.getByTestId('materialize-agent-osint-coleta-api-status-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('materialize-agent-osint-coleta-api-activate')).not.toBeInTheDocument();

    // jamais smoke.echo em lugar nenhum
    expect(screen.queryByText(/smoke\.echo/)).not.toBeInTheDocument();
  });

  it('fallback de label nunca expõe a chave crua com prefixo openclaw:', () => {
    // Achado #5 do review: sem skill_label, o rótulo humaniza o slug e NUNCA
    // mostra "openclaw:..." cru (feedback_ui_aip_not_openclaw).
    const bp = {
      ...BLUEPRINT,
      proposed_agents: [
        {
          slug: 'coleta-tt', display_name: 'Coleta · TikTok', kind: 'worker',
          description: 'ingestão', skill_key: 'openclaw:tiktok-crawling',
          skill_label: '', skill_platforms: ['tiktok'], skill_ready: false,
          phase: 'coleta', rationale: 'r',
        },
      ],
    };
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={{ ...DIAGRAM, blueprint: bp }} />);
    // humanizado a partir do slug, sem o prefixo de runtime
    expect(screen.getByText(/Tiktok Crawling/)).toBeInTheDocument();
    expect(screen.queryByText(/openclaw:/)).not.toBeInTheDocument();
  });

  it('agente de IA puro (kind=aip) não mostra skill nem ativação', () => {
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM} />);
    expect(screen.getByText('Processamento · OSINT')).toBeInTheDocument();
    expect(screen.queryByTestId('materialize-agent-osint-proc-status-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('materialize-agent-osint-proc-activate')).not.toBeInTheDocument();
  });

  it('Ativar skill chama o endpoint real e vira "pronta" ao registrar', async () => {
    Skills.installOpenclaw.mockResolvedValueOnce({ installed: true, discovered: ['postiz'] });
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM} />);

    fireEvent.click(screen.getByTestId('materialize-agent-osint-coleta-ig-activate'));

    await waitFor(() => expect(Skills.installOpenclaw).toHaveBeenCalledWith('openclaw:postiz'));
    // status flipou para pronta; a pílula de pendência sumiu
    await waitFor(() =>
      expect(screen.getByTestId('materialize-agent-osint-coleta-ig-status-ready')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('materialize-agent-osint-coleta-ig-status-pending')).not.toBeInTheDocument();
  });

  it('clicar Ativar não marca/desmarca o checkbox do agente', () => {
    render(<MaterializeDialog open onOpenChange={jest.fn()} diagram={DIAGRAM} />);
    const cb = screen.getByTestId('materialize-agent-osint-coleta-ig-cb') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(screen.getByTestId('materialize-agent-osint-coleta-ig-activate'));
    expect(cb.checked).toBe(true); // preventDefault/stopPropagation no botão
  });
});
