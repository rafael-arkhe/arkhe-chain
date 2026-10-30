/**
 * modality-agents-configure-transformer.test.tsx
 *
 * Task 1 + Task 4 — ModalityAgentsSection (configure + transformer) + TransformerConfigSection.
 *
 * Cobre:
 *  - Expandable "Como usar" / "Onde editar" por agente.
 *  - "Configurar" revela SchemaForm com params do skill catalog.
 *  - Agente sem params mostra mensagem "não tem parâmetros configuráveis".
 *  - TransformerConfigSection carrega Functions.list() e mostra opções no combobox.
 *  - Task 1: "Editar transformador"/"Novo transformador" abre Dialog inline (SandboxIDE).
 *  - Drawer pode ser fechado sem sair do painel.
 *
 * Mocks: lib/api (Skills, Functions), sandbox-ide (Monaco não disponível em jsdom).
 * useT NÃO é mockado — o provider resolve pt-BR real (asserts usam texto pt-BR).
 *
 * 2026-06-11 — commit 2edab8c trocou o <select> nativo da "Função transformadora"
 * pelo SearchableSelect (combobox com busca + slug como hint), a pedido do
 * operador ("nunca input técnico manual"). Os testes do TransformerConfigSection
 * foram atualizados para dirigir o combobox pelo MESMO gesto do operador
 * (abrir → clicar a opção) em vez de fireEvent.change num <select> nativo.
 * As proteções originais foram TODAS mantidas: opções carregam da API, onChange
 * recebe o slug, estado vazio explícito, fallback defensivo em erro de rede e
 * seleção refletida no controle.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock SandboxIDE — Monaco não roda em jsdom.
jest.mock('@/components/dev/sandbox-ide', () => ({
  SandboxIDE: () => <div data-testid="sandbox-ide-mock">SandboxIDE</div>,
}));

import {
  ModalityAgentsSection,
  TransformerConfigSection,
  type ProposedModalityAgent,
} from '@/components/solution-designer/ModalityAgentsSection';

jest.mock('@/lib/api', () => ({
  Skills: { catalog: jest.fn() },
  Functions: { list: jest.fn() },
}));

const { Skills, Functions } = jest.requireMock('@/lib/api') as {
  Skills: Record<string, jest.Mock>;
  Functions: Record<string, jest.Mock>;
};

const VISION_AGENT: ProposedModalityAgent = {
  slug: 'aegis.vision',
  label: 'Visão computacional',
  platforms: ['camera'],
  ready: true,
};

const AUDIO_AGENT: ProposedModalityAgent = {
  slug: 'aegis.audio',
  label: 'Transcrição de áudio',
  platforms: [],
  ready: false,
};

describe('ModalityAgentsSection — Task 4', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders null when agents array is empty', () => {
    Skills.catalog.mockResolvedValue([]);
    const { container } = render(
      <ModalityAgentsSection agents={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders each agent row with label and ready/pending badge', async () => {
    Skills.catalog.mockResolvedValue([]);
    render(
      <ModalityAgentsSection agents={[VISION_AGENT, AUDIO_AGENT]} />,
    );
    expect(screen.getByTestId('modality-agent-aegis.vision')).toBeInTheDocument();
    expect(screen.getByTestId('modality-agent-aegis.audio')).toBeInTheDocument();
    expect(screen.getByTestId('modality-agent-aegis.vision-ready')).toBeInTheDocument();
    expect(screen.getByTestId('modality-agent-aegis.audio-pending')).toBeInTheDocument();
  });

  it('expands "Como usar" section when expand button is clicked', async () => {
    Skills.catalog.mockResolvedValue([]);
    render(
      <ModalityAgentsSection agents={[VISION_AGENT]} />,
    );
    const expandBtn = screen.getByTestId('modality-agent-aegis.vision-expand');
    fireEvent.click(expandBtn);
    // Vision help text is rendered
    expect(screen.getByText(/Analisa frames de câmera/)).toBeInTheDocument();
  });

  it('shows "Configurar" button per agent and reveals params panel on click', async () => {
    Skills.catalog.mockResolvedValue([
      {
        skill_key: 'aegis.vision',
        label: 'Visão',
        description: 'desc',
        category: 'vision',
        source: 'native',
        platforms: ['camera'],
        requires_secrets: [],
        param_schema: [
          { key: 'threshold', label: 'Limiar de confiança', param_type: 'number', required: false, default: 0.7 },
        ],
      },
    ]);
    render(
      <ModalityAgentsSection agents={[VISION_AGENT]} />,
    );
    const configBtn = screen.getByTestId('modality-agent-aegis.vision-configure');
    fireEvent.click(configBtn);

    // Params panel should render SchemaForm with the threshold field
    await waitFor(() => {
      expect(screen.getByTestId('modality-agent-aegis.vision-params')).toBeInTheDocument();
    });
    expect(screen.getByTestId('modality-agent-aegis.vision-field-threshold')).toBeInTheDocument();
  });

  it('shows "não tem parâmetros" when skill has empty param_schema', async () => {
    Skills.catalog.mockResolvedValue([
      {
        skill_key: 'aegis.vision',
        label: 'Visão',
        description: 'desc',
        category: 'vision',
        source: 'native',
        platforms: [],
        requires_secrets: [],
        param_schema: [],
      },
    ]);
    render(
      <ModalityAgentsSection agents={[VISION_AGENT]} />,
    );
    const configBtn = screen.getByTestId('modality-agent-aegis.vision-configure');
    fireEvent.click(configBtn);
    await waitFor(() => {
      expect(screen.getByTestId('modality-agent-aegis.vision-params')).toBeInTheDocument();
    });
    // useT() returns real pt-BR text, not the i18n key
    expect(screen.getByText('Este agente não tem parâmetros configuráveis.')).toBeInTheDocument();
  });

  it('shows loading params message before catalog resolves', () => {
    // Never resolves
    Skills.catalog.mockReturnValue(new Promise(() => {}));
    render(
      <ModalityAgentsSection agents={[VISION_AGENT]} />,
    );
    fireEvent.click(screen.getByTestId('modality-agent-aegis.vision-configure'));
    // useT() returns real pt-BR text, not the i18n key
    expect(screen.getByText('Carregando parâmetros…')).toBeInTheDocument();
  });
});

describe('TransformerConfigSection — Task 4.3', () => {
  beforeEach(() => jest.clearAllMocks());

  /** Trigger do SearchableSelect — o botão (aria-haspopup="listbox") dentro do
   *  wrapper com data-testid="transformer-function-select". */
  function getSelectTrigger(): HTMLButtonElement {
    const wrap = screen.getByTestId('transformer-function-select');
    const btn = wrap.querySelector('button[aria-haspopup="listbox"]');
    if (!btn) throw new Error('SearchableSelect trigger not found');
    return btn as HTMLButtonElement;
  }

  it('renders transformer section with inline IDE button (Task 1: no external navigation)', async () => {
    Functions.list.mockResolvedValueOnce([
      { slug: 'extract-entities', display_name: 'Extrair entidades', language: 'python', version: 1 },
      { slug: 'normalize-text', display_name: 'Normalizar texto', language: 'python', version: 2 },
    ]);
    render(
      <TransformerConfigSection
        transformerFunction=""
        onChangeTransformerFunction={jest.fn()}
      />,
    );
    // "Novo transformador" button always present (no function selected yet)
    const ideBtn = screen.getByTestId('transformer-open-ide');
    expect(ideBtn).toBeInTheDocument();
    // Must be a button, NOT an anchor link (Task 1: inline, not navigation)
    expect(ideBtn.tagName).toBe('BUTTON');
    expect(ideBtn).not.toHaveAttribute('href');

    // Options load — combobox trigger habilita quando Functions.list resolve
    await waitFor(() => {
      expect(getSelectTrigger().disabled).toBe(false);
    });
    // Abrir o combobox lista as duas funções pelo display_name
    fireEvent.click(getSelectTrigger());
    expect(
      screen.getByTestId('transformer-function-select-option-extract-entities'),
    ).toHaveTextContent('Extrair entidades');
    expect(
      screen.getByTestId('transformer-function-select-option-normalize-text'),
    ).toHaveTextContent('Normalizar texto');
  });

  it('Task 1: clicking the IDE button opens the inline drawer with SandboxIDE', async () => {
    Functions.list.mockResolvedValueOnce([]);
    render(
      <TransformerConfigSection
        transformerFunction=""
        onChangeTransformerFunction={jest.fn()}
      />,
    );
    // IDE drawer not open initially
    expect(screen.queryByTestId('transformer-ide-drawer')).not.toBeInTheDocument();

    // Click the button
    fireEvent.click(screen.getByTestId('transformer-open-ide'));

    // Drawer opens with SandboxIDE inside
    await waitFor(() => {
      expect(screen.getByTestId('transformer-ide-drawer')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sandbox-ide-mock')).toBeInTheDocument();
  });

  it('Task 1: closing the drawer does not navigate away (stays in panel)', async () => {
    // Use mockResolvedValue (not Once) so the reload on close also resolves.
    Functions.list.mockResolvedValue([]);
    render(
      <TransformerConfigSection
        transformerFunction=""
        onChangeTransformerFunction={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('transformer-open-ide'));
    await waitFor(() => {
      expect(screen.getByTestId('transformer-ide-drawer')).toBeInTheDocument();
    });
    // Close drawer
    fireEvent.click(screen.getByTestId('transformer-ide-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('transformer-ide-drawer')).not.toBeInTheDocument();
    });
    // Function select still present — panel not navigated away
    expect(screen.getByTestId('transformer-function-select')).toBeInTheDocument();
  });

  it('calls onChangeTransformerFunction when a function is selected', async () => {
    Functions.list.mockResolvedValueOnce([
      { slug: 'extract-entities', display_name: 'Extrair entidades', language: 'python', version: 1 },
    ]);
    const onChange = jest.fn();
    render(
      <TransformerConfigSection
        transformerFunction=""
        onChangeTransformerFunction={onChange}
      />,
    );
    await waitFor(() => {
      expect(getSelectTrigger().disabled).toBe(false);
    });
    // Gesto do operador: abre o combobox e clica na opção
    fireEvent.click(getSelectTrigger());
    fireEvent.click(
      screen.getByTestId('transformer-function-select-option-extract-entities'),
    );
    expect(onChange).toHaveBeenCalledWith('extract-entities');
  });

  it('shows "no functions found" empty state when list returns empty', async () => {
    Functions.list.mockResolvedValueOnce([]);
    render(
      <TransformerConfigSection
        transformerFunction=""
        onChangeTransformerFunction={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(getSelectTrigger().disabled).toBe(false);
    });
    // Estado vazio explícito no trigger (placeholder pt-BR
    // 'solutions.transformerNoFunctions') — operador nunca vê controle mudo
    expect(getSelectTrigger()).toHaveTextContent(/nenhuma função encontrada/i);
  });

  it('renders correctly when Functions.list fails (defensive stub)', async () => {
    Functions.list.mockRejectedValueOnce(new Error('network error'));
    render(
      <TransformerConfigSection
        transformerFunction=""
        onChangeTransformerFunction={jest.fn()}
      />,
    );
    // IDE button must still be there and combobox must re-enable after error settles
    await waitFor(() => {
      expect(screen.getByTestId('transformer-open-ide')).toBeInTheDocument();
      expect(getSelectTrigger().disabled).toBe(false);
    });
  });

  it('shows selected function as selected in the dropdown', async () => {
    Functions.list.mockResolvedValueOnce([
      { slug: 'normalize-text', display_name: 'Normalizar texto', language: 'python', version: 1 },
    ]);
    render(
      <TransformerConfigSection
        transformerFunction="normalize-text"
        onChangeTransformerFunction={jest.fn()}
      />,
    );
    // O trigger reflete a seleção pelo display_name…
    await waitFor(() => {
      expect(getSelectTrigger()).toHaveTextContent('Normalizar texto');
    });
    // …e ao abrir, a opção correspondente aparece marcada (aria-selected)
    fireEvent.click(getSelectTrigger());
    expect(
      screen.getByTestId('transformer-function-select-option-normalize-text'),
    ).toHaveAttribute('aria-selected', 'true');
  });
});
