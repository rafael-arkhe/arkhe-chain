/**
 * Sprint L1.8 — System Prompt editable via AgentConfigEditor.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentConfigEditor } from '@/components/agentes/AgentConfigEditor';
import type { AgentOut } from '@/lib/api/agentes';

jest.mock('@/lib/api/agentes', () => ({
  Agentes: {
    patchConfig: jest.fn(),
  },
}));

const { Agentes } = jest.requireMock('@/lib/api/agentes') as {
  Agentes: { patchConfig: jest.Mock };
};

function makeAgent(overrides: Partial<AgentOut> = {}): AgentOut {
  return {
    id: 'agent-1',
    slug: 'worker-news',
    display_name: 'Worker News',
    config: { feeds: [], system_prompt: 'Você é um agente.' },
    enabled: true,
    cron: null,
    preset: null,
    last_run: null,
    ...overrides,
  } as AgentOut;
}

describe('Sprint L1.8 — system_prompt editable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Agentes.patchConfig.mockResolvedValue({ id: 'agent-1', config: {} });
  });

  it('renders the system_prompt textarea seeded from config', () => {
    render(
      <AgentConfigEditor
        agent={makeAgent()}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    const textarea = screen.getByTestId('agent-system-prompt-input') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Você é um agente.');
  });

  it('omits system_prompt from patch when not edited', async () => {
    render(
      <AgentConfigEditor
        agent={makeAgent()}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId('agent-config-save'));
    await waitFor(() => expect(Agentes.patchConfig).toHaveBeenCalledTimes(1));
    const [, patch] = Agentes.patchConfig.mock.calls[0];
    expect(patch).not.toHaveProperty('system_prompt');
  });

  it('includes system_prompt in patch after edit', async () => {
    render(
      <AgentConfigEditor
        agent={makeAgent()}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    const textarea = screen.getByTestId('agent-system-prompt-input');
    fireEvent.change(textarea, {
      target: { value: 'Novo prompt customizado.' },
    });
    fireEvent.click(screen.getByTestId('agent-config-save'));
    await waitFor(() => expect(Agentes.patchConfig).toHaveBeenCalledTimes(1));
    const [, patch] = Agentes.patchConfig.mock.calls[0];
    expect(patch.system_prompt).toBe('Novo prompt customizado.');
  });

  it('clamps system_prompt to 8192 chars', () => {
    render(
      <AgentConfigEditor
        agent={makeAgent({ config: {} as Record<string, unknown> })}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    const textarea = screen.getByTestId('agent-system-prompt-input') as HTMLTextAreaElement;
    const huge = 'X'.repeat(10_000);
    fireEvent.change(textarea, { target: { value: huge } });
    expect(textarea.value.length).toBe(8192);
  });
});
