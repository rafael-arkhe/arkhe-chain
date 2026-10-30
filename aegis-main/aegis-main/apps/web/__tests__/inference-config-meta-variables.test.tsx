/**
 * inference-config-meta-variables.test.tsx
 *
 * Task 2 — InferenceConfigSection model metadata card
 * Task 3 — Variables sub-panel (add/remove/insert/unresolved warning)
 *
 * AIPModels.catalog e Ontology.listNodeTypes mockados.
 * useT() devolve a chave (via mock automático do provider).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { InferenceConfigSection } from '@/components/solution-designer/InferenceConfigSection';
import type { SolutionNode } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  AIPModels: { defaults: jest.fn() },
  Ontology: {
    listNodeTypes: jest.fn(),
    objectTypeSchema: jest.fn(),
  },
}));

const { AIPModels, Ontology } = jest.requireMock('@/lib/api') as {
  AIPModels: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
};

const BASE_NODE: SolutionNode = {
  id: 'n1',
  kind: 'inference',
  phase: 'processamento',
  title: 'Análise de texto',
  config: {},
};

const CATALOG = [
  {
    id: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    capabilities: ['tool_use', 'vision'],
    context_window: 200000,
    source: 'preset' as const,
    description: null,
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B',
    provider: 'meta-llama',
    capabilities: ['streaming'],
    context_window: 8000,
    source: 'preset' as const,
    description: null,
  },
];

// Fase 3c: o picker de modelo + o card de metadados do nó foram REMOVIDOS — o nó
// usa o modelo padrão da finalidade "Agentes" (config central em Dados › Modelos).
// Os testes de "Task 2: model metadata" saíram junto. A cobertura do display
// read-only vive em inference-config-section.test.tsx.

describe('InferenceConfigSection — Task 3: variables sub-panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AIPModels.defaults.mockResolvedValue([]);
    Ontology.listNodeTypes.mockResolvedValue([
      { name: 'Alert', label: 'Alerta', count: 3 },
    ]);
    Ontology.objectTypeSchema.mockResolvedValue({
      kind: 'Alert',
      display_name: 'Alerta',
      title_property: 'title',
      count: 3,
      properties: [
        { key: 'title', label: 'Título', type: 'string', is_title: true },
        { key: 'severity', label: 'Severidade', type: 'string', is_title: false },
      ],
      links: [],
      actions: [],
    });
  });

  it('renders variables panel with built-in vars', async () => {
    render(
      <InferenceConfigSection node={BASE_NODE} onPatchNode={jest.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variables')).toBeInTheDocument();
    });
    // Built-ins always visible
    expect(screen.getByText('{{now}}')).toBeInTheDocument();
    expect(screen.getByText('{{tenant_slug}}')).toBeInTheDocument();
  });

  it('shows empty state when no variables declared', async () => {
    render(
      <InferenceConfigSection node={BASE_NODE} onPatchNode={jest.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variables')).toBeInTheDocument();
    });
    // "Nenhuma variável declarada" — useT() returns real pt-BR text
    expect(screen.getByText('Nenhuma variável declarada.')).toBeInTheDocument();
  });

  it('opens add form when "Adicionar variável" is clicked', async () => {
    render(
      <InferenceConfigSection node={BASE_NODE} onPatchNode={jest.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variables-add-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('inference-variables-add-btn'));
    expect(screen.getByTestId('inference-variable-add-form')).toBeInTheDocument();
    expect(screen.getByTestId('inference-variable-name-input')).toBeInTheDocument();
  });

  it('adds a static variable via the form and patches the node config', async () => {
    const onPatchNode = jest.fn();
    render(
      <InferenceConfigSection node={BASE_NODE} onPatchNode={onPatchNode} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variables-add-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('inference-variables-add-btn'));

    const nameInput = screen.getByTestId('inference-variable-name-input');
    fireEvent.change(nameInput, { target: { value: 'nivel_alerta' } });

    fireEvent.click(screen.getByTestId('inference-variable-save-btn'));

    await waitFor(() => {
      expect(onPatchNode).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({
          config: expect.objectContaining({
            inference_variables: expect.arrayContaining([
              expect.objectContaining({ name: 'nivel_alerta', kind: 'static' }),
            ]),
          }),
        }),
      );
    });
  });

  it('shows declared variables from node config', async () => {
    const node: SolutionNode = {
      ...BASE_NODE,
      config: {
        inference_variables: [
          { name: 'score_risco', kind: 'static', description: 'score de risco' },
        ],
      },
    };
    render(
      <InferenceConfigSection node={node} onPatchNode={jest.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variable-score_risco')).toBeInTheDocument();
    });
    expect(screen.getByText('{{score_risco}}')).toBeInTheDocument();
  });

  it('removes a declared variable when Remover is clicked', async () => {
    const onPatchNode = jest.fn();
    const node: SolutionNode = {
      ...BASE_NODE,
      config: {
        inference_variables: [
          { name: 'score_risco', kind: 'static' },
        ],
      },
    };
    render(
      <InferenceConfigSection node={node} onPatchNode={onPatchNode} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variable-remove-score_risco')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('inference-variable-remove-score_risco'));
    expect(onPatchNode).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({
        config: expect.objectContaining({
          inference_variables: [],
        }),
      }),
    );
  });

  it('shows unresolved refs warning for {{refs}} not in variables or builtins', async () => {
    const node: SolutionNode = {
      ...BASE_NODE,
      config: {
        inference_prompt: 'Analise o {{alvo}} com score {{score_risco}} em {{now}}.',
        inference_variables: [
          { name: 'score_risco', kind: 'static' },
        ],
      },
    };
    render(
      <InferenceConfigSection node={node} onPatchNode={jest.fn()} />,
    );
    await waitFor(() => {
      // "alvo" is unresolved; "score_risco" is declared; "now" is builtin
      expect(screen.getByTestId('inference-variables-unresolved')).toBeInTheDocument();
    });
    const warn = screen.getByTestId('inference-variables-unresolved');
    expect(warn.textContent).toContain('{{alvo}}');
    expect(warn.textContent).not.toContain('{{score_risco}}');
    expect(warn.textContent).not.toContain('{{now}}');
  });

  it('opens variable picker when "Inserir variável" is clicked', async () => {
    render(
      <InferenceConfigSection node={BASE_NODE} onPatchNode={jest.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variables-insert-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('inference-variables-insert-btn'));
    expect(screen.getByTestId('inference-variable-picker')).toBeInTheDocument();
    // Built-ins in picker
    expect(screen.getByTestId('inference-picker-builtin-now')).toBeInTheDocument();
  });

  it('does NOT save a variable with empty name', async () => {
    const onPatchNode = jest.fn();
    render(
      <InferenceConfigSection node={BASE_NODE} onPatchNode={onPatchNode} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variables-add-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('inference-variables-add-btn'));
    // Save button without typing name
    fireEvent.click(screen.getByTestId('inference-variable-save-btn'));
    expect(onPatchNode).not.toHaveBeenCalled();
  });

  // Task 4: "Adicionar variável" opens a Dialog modal (not an always-expanded form)
  it('Task 4: "Adicionar variável" opens a modal dialog, not an inline expanded form', async () => {
    render(
      <InferenceConfigSection node={BASE_NODE} onPatchNode={jest.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('inference-variables-add-btn')).toBeInTheDocument();
    });
    // Before clicking, modal content (add form) must not be visible
    expect(screen.queryByTestId('inference-variable-add-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('inference-variables-add-btn'));

    // After clicking, the modal wrapper and the form inside it are in the document
    await waitFor(() => {
      expect(screen.getByTestId('inference-variable-add-modal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('inference-variable-add-form')).toBeInTheDocument();
    expect(screen.getByTestId('inference-variable-name-input')).toBeInTheDocument();
  });
});
