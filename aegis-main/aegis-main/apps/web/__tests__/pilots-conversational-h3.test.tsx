/**
 * Wave H.3 — Pilot Conversational ("Modo Conversa").
 *
 * Cobre o split chat + plano editável que envelopa Pilots.start /
 * ActionTypes.plan / Pilots.templates. Endpoints REST são os mesmos
 * do modo Avançado (DAG/JSON).
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PilotsPage from '@/app/painel-de-controle/pilots/page';

jest.mock('@/lib/api', () => ({
  ActionTypes: {
    list: jest.fn(),
    plan: jest.fn(),
  },
  Pilots: {
    start: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    listMine: jest.fn(),
    resume: jest.fn(),
    templates: jest.fn(),
  },
  ControlPanel: {
    approvals: { list: jest.fn() },
  },
}));
jest.mock('@/lib/iam/api', () => ({
  usersApi: { list: jest.fn() },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));
jest.mock('@/lib/responsive/use-is-mobile', () => ({
  useIsMobile: () => false,
}));

const { ActionTypes, Pilots, ControlPanel } = jest.requireMock('@/lib/api') as {
  ActionTypes: { list: jest.Mock; plan: jest.Mock };
  Pilots: {
    start: jest.Mock;
    get: jest.Mock;
    listMine: jest.Mock;
    templates: jest.Mock;
  };
  ControlPanel: { approvals: { list: jest.Mock } };
};
const { usersApi } = jest.requireMock('@/lib/iam/api') as {
  usersApi: { list: jest.Mock };
};

const fakeAction = {
  id: 'act-1',
  tenant_id: null,
  name: 'Validar ocorrência',
  description: 'Valida prioridade',
  input_schema: {
    type: 'object',
    properties: {
      occurrence_id: { type: 'string' },
    },
  },
  output_schema: {},
  code_ref: 'ocorrencia.validate',
  requires_markings: [],
  requires_clearances: [],
  timeout_seconds: 30,
  auto_approvable: true,
  version: 1,
  created_at: new Date().toISOString(),
};

const fakeTemplate = {
  id: 'triagem-ocorrencia',
  label: 'Triar ocorrência e despachar',
  description: 'Recebe ocorrência, valida prioridade e despacha viatura.',
  goal: 'Triar ocorrência e despachar viatura mais próxima',
  steps: [
    {
      title: 'Validar ocorrência',
      note: 'Confirma prioridade e dados mínimos',
      action_code_ref_hint: 'ocorrencia.validate',
      input_hint: { occurrence_id: '<preencher>' },
    },
  ],
};

const fakeUser = {
  id: 'u-1',
  tenant_id: 'tenant-1',
  username: 'admin',
  display_name: 'Admin Demo',
  email: null,
  active: true,
  clearances: [],
  roles: ['admin'],
  must_change_password: false,
  totp_enabled: false,
  locked_until: null,
};

function switchToChat() {
  fireEvent.click(screen.getByTestId('pilots-mode-chat'));
}

describe('Wave H.3 — Pilot Chat panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ActionTypes.list.mockResolvedValue([fakeAction]);
    Pilots.templates.mockResolvedValue([fakeTemplate]);
    Pilots.listMine.mockResolvedValue([]);
    ControlPanel.approvals.list.mockResolvedValue([]);
    usersApi.list.mockResolvedValue([fakeUser]);
  });

  it('renders the mode toggle and switches to chat panel', () => {
    render(<PilotsPage />);
    expect(screen.getByTestId('pilots-mode-toggle')).toBeInTheDocument();
    switchToChat();
    expect(screen.getByTestId('pilot-chat-pane')).toBeInTheDocument();
    expect(screen.getByTestId('pilot-chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('pilot-plan-panel')).toBeInTheDocument();
  });

  it('shows the welcome assistant message', () => {
    render(<PilotsPage />);
    switchToChat();
    expect(screen.getByTestId('pilot-chat-messages')).toBeInTheDocument();
    expect(
      screen.getByText(/Descreva o que você quer fazer/i),
    ).toBeInTheDocument();
  });

  it('loads templates from backend and shows quick-pick buttons', async () => {
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    expect(await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`)).toBeInTheDocument();
  });

  it('clicking a template populates the plan from input_schema', async () => {
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`));
    expect((screen.getByTestId('pilot-chat-goal') as HTMLInputElement).value).toBe(fakeTemplate.goal);
    // Field derived from input_schema must exist
    expect(screen.getByTestId('pilot-chat-step-0-field-occurrence_id')).toBeInTheDocument();
  });

  it('sending a free-text message that matches keyword applies template heuristically', async () => {
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    // Aguarda template estar disponível no estado antes do envio.
    await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`);
    // Usa palavra que casa com tokens do template ("ocorrência", "despachar").
    fireEvent.change(screen.getByTestId('pilot-chat-input'), {
      target: { value: 'preciso despachar agora' },
    });
    fireEvent.click(screen.getByTestId('pilot-chat-send'));
    // Heurística usa setTimeout 250ms — aguarda até 2s.
    await waitFor(
      () => expect(screen.getByText(/Sugerindo o modelo/i)).toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect((screen.getByTestId('pilot-chat-goal') as HTMLInputElement).value).toBe(fakeTemplate.goal);
  });

  it('renders dropdown of users for the Aprovador field (no input native fallback)', async () => {
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(usersApi.list).toHaveBeenCalled());
    const sel = await screen.findByTestId('pilot-chat-approver-select');
    expect(sel).toBeInTheDocument();
    expect(sel.tagName.toLowerCase()).toBe('select');
  });

  it('renders FORM inputs (not raw JSON textarea) for step fields', async () => {
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`));
    const fields = screen.getByTestId('pilot-chat-step-0-fields');
    // Should NOT contain a textarea with raw JSON braces
    expect(fields.querySelector('textarea')).toBeNull();
    const field = screen.getByTestId('pilot-chat-step-0-field-occurrence_id');
    expect(field.tagName.toLowerCase()).toBe('input');
  });

  it('dry-run calls ActionTypes.plan with materialized fields', async () => {
    ActionTypes.plan.mockResolvedValueOnce({
      total: 1,
      will_execute: 1,
      will_request_approval: 0,
      will_deny: 0,
      steps: [
        {
          action_id: fakeAction.id,
          action_name: fakeAction.name,
          will_execute: true,
          will_request_approval: false,
          deny_reason: null,
          requires_markings: [],
          auto_approvable: true,
          input: { occurrence_id: 'OC-1' },
        },
      ],
    });
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`));
    fireEvent.change(screen.getByTestId('pilot-chat-step-0-field-occurrence_id'), {
      target: { value: 'OC-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilot-chat-dryrun'));
      await Promise.resolve();
    });
    await waitFor(() => expect(ActionTypes.plan).toHaveBeenCalled());
    expect(ActionTypes.plan.mock.calls[0][0]).toEqual([
      { action_id: fakeAction.id, input: { occurrence_id: 'OC-1' } },
    ]);
    expect(await screen.findByTestId('pilot-chat-plan-result')).toBeInTheDocument();
  });

  it('submitting the pilot calls Pilots.start with the correct body', async () => {
    Pilots.start.mockResolvedValueOnce({
      pilot_run_id: 'pr-1',
      goal: fakeTemplate.goal,
      status: 'SUCCESS',
      steps: [],
      started_at: new Date().toISOString(),
    });
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`));
    fireEvent.change(screen.getByTestId('pilot-chat-step-0-field-occurrence_id'), {
      target: { value: 'OC-2' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilot-chat-submit'));
      await Promise.resolve();
    });
    await waitFor(() => expect(Pilots.start).toHaveBeenCalled());
    const args = Pilots.start.mock.calls[0];
    expect(args[0]).toBe(fakeTemplate.goal);
    expect(args[1]).toEqual([
      { action_id: fakeAction.id, input: { occurrence_id: 'OC-2' }, note: 'Confirma prioridade e dados mínimos' },
    ]);
  });

  it('shows the run timeline after submit', async () => {
    Pilots.start.mockResolvedValueOnce({
      pilot_run_id: 'pr-2',
      goal: fakeTemplate.goal,
      status: 'SUCCESS',
      steps: [
        {
          step_index: 0,
          action_id: fakeAction.id,
          action_name: fakeAction.name,
          status: 'SUCCESS',
          output: {},
        },
      ],
      started_at: new Date().toISOString(),
    });
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`));
    fireEvent.change(screen.getByTestId('pilot-chat-step-0-field-occurrence_id'), {
      target: { value: 'OC-3' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilot-chat-submit'));
      await Promise.resolve();
    });
    await waitFor(() => expect(Pilots.start).toHaveBeenCalled());
    expect(await screen.findByTestId('pilot-chat-run-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('pilot-chat-run-step-0')).toBeInTheDocument();
  });

  it('disables submit while in flight', async () => {
    let resolveStart!: (v: unknown) => void;
    Pilots.start.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveStart = res as (v: unknown) => void;
        }),
    );
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`pilot-chat-template-${fakeTemplate.id}`));
    fireEvent.change(screen.getByTestId('pilot-chat-step-0-field-occurrence_id'), {
      target: { value: 'OC-4' },
    });
    fireEvent.click(screen.getByTestId('pilot-chat-submit'));
    const btn = screen.getByTestId('pilot-chat-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await act(async () => {
      resolveStart({
        pilot_run_id: 'pr-3',
        goal: fakeTemplate.goal,
        status: 'SUCCESS',
        steps: [],
        started_at: new Date().toISOString(),
      });
      await Promise.resolve();
    });
  });

  it('shows error message when goal is too short', async () => {
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('pilot-chat-submit'));
    expect(await screen.findByTestId('pilot-chat-error')).toBeInTheDocument();
  });

  it('returns to advanced mode without losing message history', async () => {
    render(<PilotsPage />);
    switchToChat();
    expect(screen.getByTestId('pilot-chat-pane')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pilots-mode-advanced'));
    expect(screen.queryByTestId('pilot-chat-pane')).not.toBeInTheDocument();
    expect(screen.getByTestId('pilots-builder')).toBeInTheDocument();
  });

  it('add step button adds an empty plan step', async () => {
    render(<PilotsPage />);
    switchToChat();
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('pilot-chat-add-step'));
    expect(screen.getByTestId('pilot-chat-step-1')).toBeInTheDocument();
  });
});
