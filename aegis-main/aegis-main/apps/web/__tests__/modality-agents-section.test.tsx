/**
 * Feature 2 — ModalityAgentsSection.
 *
 * Cobre:
 *   - renderiza agentes de modalidade com label + plataformas + badge de status;
 *   - ready=true → badge "ready" (solutions.skillReady);
 *   - ready=false → badge "pending" (solutions.skillNeedsActivation);
 *   - testids corretos por slug;
 *   - lista vazia → componente não renderiza nada.
 *
 * Feature 1 — effectiveMeta override no NodeInspector.
 *
 * Cobre:
 *   - aba Documentação mostra param_schema quando skill catalog retorna dados;
 *   - aba Sobre mostra description da skill;
 *   - aba Exemplo usa label da skill + primeiro param obrigatório;
 *   - aba Sobre para nó de Processamento mostra description da logic_function.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import {
  ModalityAgentsSection,
  type ProposedModalityAgent,
} from '@/components/solution-designer/ModalityAgentsSection';
import { NodeInspector } from '@/components/solution-designer/NodeInspector';
import { formatParamSchemaDoc } from '@/components/solution-designer/NodeInspector';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

jest.mock('@/lib/api', () => ({
  Solutions: {
    implementations: jest.fn(),
    expandNode: jest.fn(),
    ontologyModel: jest.fn(),
  },
  Skills: { catalog: jest.fn().mockResolvedValue([]) },
  Sources: { list: jest.fn().mockResolvedValue([]) },
  Connectors: { list: jest.fn().mockResolvedValue([]) },
  Datasets: { list: jest.fn().mockResolvedValue([]) },
  Ingest: { event: jest.fn() },
  AIPModels: { catalog: jest.fn().mockResolvedValue([]), defaults: jest.fn().mockResolvedValue([]) },
  // TransformerConfigSection (processamento nodes) needs Functions.
  Functions: { list: jest.fn().mockResolvedValue([]) },
  Ontology: {
    listNodeTypes: jest.fn().mockResolvedValue([]),
    objectTypeSchema: jest.fn().mockResolvedValue({ properties: [], links: [], actions: [] }),
  },
}));

// SandboxIDE (Monaco) must be mocked — jsdom cannot run it.
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

const { Skills } = jest.requireMock('@/lib/api') as { Skills: Record<string, jest.Mock> };

// ─── ModalityAgentsSection ───────────────────────────────────────────────────

describe('ModalityAgentsSection', () => {
  const mockAgents: ProposedModalityAgent[] = [
    { slug: 'aegis.vision', label: 'Visão computacional', platforms: ['linux'], ready: true },
    { slug: 'aegis.audio.transcribe', label: 'Transcrição de áudio', platforms: [], ready: false },
  ];

  it('renders the container and both agent cards', () => {
    render(<ModalityAgentsSection agents={mockAgents} />);
    expect(screen.getByTestId('modality-agents')).toBeInTheDocument();
    expect(screen.getByTestId('modality-agent-aegis.vision')).toBeInTheDocument();
    expect(screen.getByTestId('modality-agent-aegis.audio.transcribe')).toBeInTheDocument();
  });

  it('shows labels and platform badges', () => {
    render(<ModalityAgentsSection agents={mockAgents} />);
    expect(screen.getByText('Visão computacional')).toBeInTheDocument();
    expect(screen.getByText('Transcrição de áudio')).toBeInTheDocument();
    expect(screen.getByText('linux')).toBeInTheDocument();
  });

  it('ready=true shows -ready badge, not -pending', () => {
    render(<ModalityAgentsSection agents={mockAgents} />);
    expect(screen.getByTestId('modality-agent-aegis.vision-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('modality-agent-aegis.vision-pending')).not.toBeInTheDocument();
  });

  it('ready=false shows -pending badge, not -ready', () => {
    render(<ModalityAgentsSection agents={mockAgents} />);
    expect(screen.getByTestId('modality-agent-aegis.audio.transcribe-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('modality-agent-aegis.audio.transcribe-ready')).not.toBeInTheDocument();
  });

  it('renders nothing (null) when agents list is empty', () => {
    const { container } = render(<ModalityAgentsSection agents={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// ─── formatParamSchemaDoc (pure helper) ──────────────────────────────────────

describe('formatParamSchemaDoc', () => {
  it('formats required and optional params', () => {
    const params = [
      { key: 'hashtag', label: 'Hashtag', param_type: 'string', required: true, description: 'A hashtag monitorada' },
      { key: 'limit', label: 'Limite', param_type: 'number', required: false, description: '' },
    ];
    const doc = formatParamSchemaDoc(params, { required: 'obrigatório' });
    expect(doc).toContain('• Hashtag (string, obrigatório): A hashtag monitorada');
    expect(doc).toContain('• Limite (number)');
    expect(doc).not.toContain('Limite (number, obrigatório)');
  });

  it('returns empty string for empty params array', () => {
    expect(formatParamSchemaDoc([], { required: 'obrigatório' })).toBe('');
  });
});

// ─── NodeInspector — effectiveMeta override (Feature 1) ──────────────────────

const graphBase = {
  nodes: [],
  edges: [],
  wizard: { domain: 'security' },
};

const coletaNode = {
  id: 'c1',
  kind: 'worker',
  phase: 'coleta',
  title: 'Coletar dados',
  config: {},
};

const procNode = {
  id: 'p1',
  kind: 'logic',
  phase: 'processamento',
  title: 'Análise',
  config: {},
};

const defaultProps = {
  graph: graphBase,
  wizard: {},
  onGraphChange: jest.fn(),
  onDeleteNode: jest.fn(),
  onPatchNode: jest.fn(),
};

describe('NodeInspector — effectiveMeta (skill catalog override)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Documentação tab shows skill param_schema when catalog returns a match', async () => {
    const catalogRow = {
      skill_key: 'tiktok.monitor',
      label: 'Monitor TikTok',
      description: 'Monitora hashtags no TikTok.',
      category: 'social',
      source: 'native',
      platforms: ['tiktok'],
      requires_secrets: [],
      param_schema: [
        { key: 'hashtag', label: 'Hashtag', param_type: 'string', required: true, description: 'Tag a monitorar' },
      ],
    };
    // mockResolvedValue (not Once) so all calls in this test return the catalog
    Skills.catalog.mockResolvedValue([catalogRow]);

    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          proposed_agents: [
            { phase: 'coleta', kind: 'worker', skill_key: 'tiktok.monitor', skill_label: 'Monitor TikTok', skill_ready: true },
          ],
        },
      },
    };

    render(<NodeInspector node={coletaNode as never} {...defaultProps} graph={graph as never} />);

    // Navigate to Metadados tab first (component info is in that tab)
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    // open Documentation tab first (before or after catalog resolves)
    fireEvent.click(screen.getByTestId('info-documentation'));

    // wait for effectiveMeta to show skill param data after catalog resolves + state updates
    await waitFor(
      () => {
        const docBody = screen.getByTestId('info-body-documentation');
        expect(docBody.textContent).toContain('Hashtag');
      },
      { timeout: 3000 },
    );
    expect(screen.getByTestId('info-body-documentation').textContent).toContain('string');
  });

  it('Sobre tab shows skill description when catalog returns a match', async () => {
    const catalogRow = {
      skill_key: 'tiktok.monitor',
      label: 'Monitor TikTok',
      description: 'Monitora hashtags no TikTok.',
      category: 'social',
      source: 'native',
      platforms: [],
      requires_secrets: [],
      param_schema: [],
    };
    Skills.catalog.mockResolvedValue([catalogRow]);

    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          proposed_agents: [
            { phase: 'coleta', kind: 'worker', skill_key: 'tiktok.monitor', skill_label: 'Monitor TikTok', skill_ready: true },
          ],
        },
      },
    };

    render(<NodeInspector node={coletaNode as never} {...defaultProps} graph={graph as never} />);

    // Navigate to Metadados tab first (component info is in that tab)
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    // open About tab
    fireEvent.click(screen.getByTestId('info-about'));

    // wait for effectiveMeta to reflect the skill description (async state update)
    await waitFor(
      () => {
        const aboutBody = screen.getByTestId('info-body-about');
        expect(aboutBody.textContent).toContain('Monitora hashtags no TikTok.');
      },
      { timeout: 3000 },
    );
  });

  it('Sobre tab shows logic_function description for processamento node', () => {
    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          logic_functions: [
            {
              slug: 'triagem',
              display_name: 'Triagem de gravidade',
              description: 'Classifica a gravidade de cada ocorrência.',
              prompt: 'Analise e classifique.',
              inputs: ['ocorrencia_text'],
            },
          ],
        },
      },
    };

    render(<NodeInspector node={procNode as never} {...defaultProps} graph={graph as never} />);

    // Navigate to Metadados tab first (component info is in that tab)
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    // open About tab
    fireEvent.click(screen.getByTestId('info-about'));
    expect(screen.getByTestId('info-body-about')).toBeInTheDocument();

    const aboutBody = screen.getByTestId('info-body-about');
    expect(aboutBody.textContent).toContain('Classifica a gravidade de cada ocorrência.');
  });

  it('Documentação tab shows logic_function inputs for processamento node', () => {
    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          logic_functions: [
            {
              slug: 'triagem',
              display_name: 'Triagem',
              description: 'Classifica.',
              prompt: 'Analise.',
              inputs: ['campo_a', 'campo_b'],
            },
          ],
        },
      },
    };

    render(<NodeInspector node={procNode as never} {...defaultProps} graph={graph as never} />);

    // Navigate to Metadados tab first (component info is in that tab)
    fireEvent.click(screen.getByTestId('node-tab-metadata'));
    fireEvent.click(screen.getByTestId('info-documentation'));
    const docBody = screen.getByTestId('info-body-documentation');
    expect(docBody.textContent).toContain('campo_a');
    expect(docBody.textContent).toContain('campo_b');
  });
});

// ─── NodeInspector — Feature 2: modality agents rendered in inspector ─────────

describe('NodeInspector — modality agents section', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders ModalityAgentsSection when processamento node has aegis.* agents', async () => {
    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          proposed_agents: [
            {
              phase: 'processamento',
              kind: 'worker',
              skill_key: 'aegis.vision',
              skill_label: 'Visão computacional',
              skill_platforms: ['cctv'],
              skill_ready: true,
            },
          ],
        },
      },
    };

    render(<NodeInspector node={procNode as never} {...defaultProps} graph={graph as never} />);

    expect(screen.getByTestId('modality-agents')).toBeInTheDocument();
    expect(screen.getByTestId('modality-agent-aegis.vision')).toBeInTheDocument();
    expect(screen.getByTestId('modality-agent-aegis.vision-ready')).toBeInTheDocument();
  });

  it('does NOT render ModalityAgentsSection for coleta phase', () => {
    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          proposed_agents: [
            {
              phase: 'processamento',
              kind: 'worker',
              skill_key: 'aegis.vision',
              skill_label: 'Visão',
              skill_platforms: [],
              skill_ready: true,
            },
          ],
        },
      },
    };

    render(<NodeInspector node={coletaNode as never} {...defaultProps} graph={graph as never} />);

    // coleta node — modality-agents section must not appear
    expect(screen.queryByTestId('modality-agents')).not.toBeInTheDocument();
  });

  it('does NOT render ModalityAgentsSection when no aegis.* agents are present', () => {
    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          proposed_agents: [
            {
              phase: 'processamento',
              kind: 'worker',
              skill_key: 'tiktok.monitor', // not aegis.*
              skill_label: 'TikTok',
              skill_platforms: [],
              skill_ready: true,
            },
          ],
        },
      },
    };

    render(<NodeInspector node={procNode as never} {...defaultProps} graph={graph as never} />);

    expect(screen.queryByTestId('modality-agents')).not.toBeInTheDocument();
  });

  it('shows pending badge for aegis.* agent with ready=false', () => {
    const graph = {
      ...graphBase,
      wizard: {
        _blueprint: {
          proposed_agents: [
            {
              phase: 'processamento',
              kind: 'worker',
              skill_key: 'aegis.audio.transcribe',
              skill_label: 'Transcrição',
              skill_platforms: [],
              skill_ready: false,
            },
          ],
        },
      },
    };

    render(<NodeInspector node={procNode as never} {...defaultProps} graph={graph as never} />);

    expect(screen.getByTestId('modality-agent-aegis.audio.transcribe-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('modality-agent-aegis.audio.transcribe-ready')).not.toBeInTheDocument();
  });
});
