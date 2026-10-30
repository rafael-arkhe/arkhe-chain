/**
 * Roteiros — visão padrão "Plano" (redesign visual · 2026-05-24).
 *
 * O DEFAULT agora é a linha do tempo visual: objetivo + passos numerados em
 * cards. Escolher a ação usa um seletor com busca (nome claro, nunca code_ref
 * cru); os campos de entrada são form tipado (nunca textarea JSON na visão
 * padrão). Pré-visualizar chama ActionTypes.plan; Executar chama Pilots.start.
 *
 * Os mesmos endpoints REST do modo Avançado; aqui cobrimos o caminho visual.
 */
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import PilotsPage from '@/app/painel-de-controle/pilots/page';

jest.mock('@/lib/api', () => ({
  ActionTypes: { list: jest.fn(), plan: jest.fn() },
  Pilots: {
    start: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    listMine: jest.fn(),
    resume: jest.fn(),
    templates: jest.fn(),
  },
  ControlPanel: {
    approvals: { list: jest.fn().mockResolvedValue([]) },
  },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/iam/api', () => ({
  usersApi: { list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));
jest.mock('@/lib/responsive/use-is-mobile', () => ({
  useIsMobile: () => false,
}));

const { ActionTypes, Pilots } = jest.requireMock('@/lib/api') as {
  ActionTypes: { list: jest.Mock; plan: jest.Mock };
  Pilots: {
    start: jest.Mock;
    get: jest.Mock;
    list: jest.Mock;
    listMine: jest.Mock;
    templates: jest.Mock;
  };
};

const fakeActionAuto = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  name: 'Validar ocorrência',
  description: 'Confirma prioridade e dados mínimos.',
  input_schema: {
    type: 'object',
    properties: { occurrence_id: { type: 'string' } },
  },
  output_schema: {},
  code_ref: 'app.actions.test.lineage',
  requires_markings: [],
  requires_clearances: [],
  timeout_seconds: 5,
  auto_approvable: true,
  version: 1,
  created_at: '2026-05-23T10:00:00Z',
};

const fakeActionManual = {
  ...fakeActionAuto,
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  name: 'Investigar placa',
  auto_approvable: false,
  description: 'Investiga placa (requer aprovação humana).',
  input_schema: {},
  code_ref: 'app.actions.investigate_plate',
};

/** Seleciona uma ação no SearchableSelect do passo idx (abre + clica opção). */
function pickAction(idx: number, actionId: string) {
  const sel = screen.getByTestId(`pilots-plan-step-${idx}-action`);
  // Abre o combobox.
  fireEvent.click(within(sel).getByRole('button'));
  // Clica na opção.
  fireEvent.click(screen.getByTestId(`pilots-plan-step-${idx}-action-option-${actionId}`));
}

describe('Roteiros — visão padrão Plano', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ActionTypes.list.mockResolvedValue([fakeActionAuto, fakeActionManual]);
    ActionTypes.plan.mockResolvedValue({});
    Pilots.listMine.mockResolvedValue([]);
    Pilots.templates.mockResolvedValue([]);
  });

  it('renders the Plano view by DEFAULT (visual timeline, not a form/chat)', async () => {
    render(<PilotsPage />);
    expect(screen.getByTestId('pilots-page')).toBeInTheDocument();
    // Plano é o default — sem clicar em nada.
    expect(screen.getByTestId('pilots-plan')).toBeInTheDocument();
    expect(screen.getByTestId('pilots-plan-goal')).toBeInTheDocument();
    // Linha do tempo com 1 passo inicial.
    expect(screen.getByTestId('pilots-plan-step-0')).toBeInTheDocument();
    expect(screen.queryByTestId('pilots-plan-step-1')).not.toBeInTheDocument();
    // NÃO é o chat nem o builder Avançado.
    expect(screen.queryByTestId('pilot-chat-pane')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pilots-builder')).not.toBeInTheDocument();
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
  });

  it('shows the three modes with Plano selected by default', () => {
    render(<PilotsPage />);
    expect(screen.getByTestId('pilots-mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('pilots-mode-plan')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('pilots-mode-chat')).toBeInTheDocument();
    expect(screen.getByTestId('pilots-mode-advanced')).toBeInTheDocument();
  });

  it('adds and removes steps in the timeline', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('pilots-plan-add-step'));
    expect(screen.getByTestId('pilots-plan-step-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pilots-plan-add-step'));
    expect(screen.getByTestId('pilots-plan-step-2')).toBeInTheDocument();
    // Remove o último passo via menu "⋮".
    fireEvent.click(screen.getByTestId('pilots-plan-step-2-menu-trigger'));
    fireEvent.click(screen.getByTestId('pilots-plan-step-2-menu-remove'));
    expect(screen.queryByTestId('pilots-plan-step-2')).not.toBeInTheDocument();
  });

  it('does not show a raw JSON textarea in the default view', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    // O card está em edição por default; escolhe uma ação que pede campos.
    pickAction(0, fakeActionAuto.id);
    const body = await screen.findByTestId('pilots-plan-step-0-body');
    expect(body.querySelector('textarea')).toBeNull();
  });

  it('picking an action shows typed FORM inputs derived from input_schema', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    pickAction(0, fakeActionAuto.id);
    // O título do card (no botão de editar) passa a ser o nome claro da ação.
    expect(screen.getByTestId('pilots-plan-step-0-edit')).toHaveTextContent(
      'Validar ocorrência',
    );
    // Campo tipado occurrence_id aparece como <input> (não JSON).
    const field = await screen.findByTestId(
      'pilots-plan-step-0-field-occurrence_id',
    );
    expect(field.tagName.toLowerCase()).toBe('input');
  });

  it('shows "sem informações extras" hint for actions with empty schema', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    pickAction(0, fakeActionManual.id);
    expect(
      await screen.findByText(/não precisa de informações extras/i),
    ).toBeInTheDocument();
  });

  it('Pré-visualizar calls ActionTypes.plan with materialized fields', async () => {
    ActionTypes.plan.mockResolvedValueOnce({
      total: 1,
      will_execute: 1,
      will_request_approval: 0,
      will_deny: 0,
      steps: [],
    });
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    pickAction(0, fakeActionAuto.id);
    fireEvent.change(
      await screen.findByTestId('pilots-plan-step-0-field-occurrence_id'),
      { target: { value: 'OC-1' } },
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilots-plan-preview'));
      await Promise.resolve();
    });
    await waitFor(() => expect(ActionTypes.plan).toHaveBeenCalled());
    expect(ActionTypes.plan.mock.calls[0][0]).toEqual([
      { action_id: fakeActionAuto.id, input: { occurrence_id: 'OC-1' } },
    ]);
    expect(
      await screen.findByTestId('pilots-plan-preview-result'),
    ).toBeInTheDocument();
  });

  it('Executar roteiro calls Pilots.start and renders the run timeline', async () => {
    Pilots.start.mockResolvedValueOnce({
      pilot_run_id: 'run-1',
      goal: 'Triar ocorrência',
      status: 'SUCCESS',
      steps: [
        {
          step_index: 0,
          action_id: fakeActionAuto.id,
          action_name: 'Validar ocorrência',
          status: 'SUCCESS',
          output: { ok: true },
          execution_id: 'exec-1',
          lineage_event_id: 'lin-1',
          duration_ms: 12,
        },
      ],
      started_at: '2026-05-23T10:00:00Z',
      finished_at: '2026-05-23T10:00:05Z',
    });
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('pilots-plan-goal'), {
      target: { value: 'Triar ocorrência' },
    });
    pickAction(0, fakeActionAuto.id);
    fireEvent.change(
      await screen.findByTestId('pilots-plan-step-0-field-occurrence_id'),
      { target: { value: 'OC-9' } },
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilots-plan-execute'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(Pilots.start).toHaveBeenCalledWith('Triar ocorrência', [
        {
          action_id: fakeActionAuto.id,
          input: { occurrence_id: 'OC-9' },
          note: undefined,
          depends_on: undefined,
        },
      ]),
    );
    // Run timeline da sessão aparece, com status pt-BR "Concluído" + duração.
    const run = await screen.findByTestId('pilots-plan-run');
    expect(within(run).getByTestId('pilots-step-detail-0')).toBeInTheDocument();
    expect(within(run).getAllByText(/Concluído/).length).toBeGreaterThan(0);
    expect(within(run).getByText(/12 ms/)).toBeInTheDocument();
  });

  it('shows "Ver aprovação" + resume bar when a step is PENDING_APPROVAL', async () => {
    Pilots.start.mockResolvedValueOnce({
      pilot_run_id: 'run-3',
      goal: 'Aguardando humano',
      status: 'PAUSED',
      steps: [
        {
          step_index: 0,
          action_id: fakeActionManual.id,
          action_name: 'Investigar placa',
          status: 'PENDING_APPROVAL',
          output: { approval_id: 'appr-9' },
          approval_id: 'appr-9',
          lineage_event_id: 'lin-9',
        },
      ],
      started_at: '2026-05-23T11:00:00Z',
      finished_at: null,
    });
    Pilots.get.mockResolvedValue({
      pilot_run_id: 'run-3',
      goal: 'Aguardando humano',
      status: 'PAUSED',
      steps: [
        {
          step_index: 0,
          action_id: fakeActionManual.id,
          action_name: 'Investigar placa',
          status: 'PENDING_APPROVAL',
          output: { approval_id: 'appr-9' },
          approval_id: 'appr-9',
          lineage_event_id: 'lin-9',
        },
      ],
      started_at: '2026-05-23T11:00:00Z',
      finished_at: null,
    });
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('pilots-plan-goal'), {
      target: { value: 'Aguardando humano' },
    });
    pickAction(0, fakeActionManual.id);
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilots-plan-execute'));
      await Promise.resolve();
    });
    // O run da sessão aparece no compositor (e também fica registrado no
    // histórico) — escopamos pro bloco de execução do compositor.
    const runArea = await screen.findByTestId('pilots-plan-run');
    const link = within(runArea).getByTestId('pilots-step-0-approval-link');
    expect(link.getAttribute('href')).toContain('appr-9');
    expect(within(runArea).getByTestId('pilots-resume-bar')).toBeInTheDocument();
  });

  it('blocks execution with a clear error when an action is missing', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('pilots-plan-goal'), {
      target: { value: 'Sem ação' },
    });
    fireEvent.click(screen.getByTestId('pilots-plan-execute'));
    expect(await screen.findByTestId('pilots-plan-error')).toHaveTextContent(
      /escolha o que fazer/i,
    );
    expect(Pilots.start).not.toHaveBeenCalled();
  });

  it('blocks execution when the goal is too short', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    pickAction(0, fakeActionAuto.id);
    fireEvent.click(screen.getByTestId('pilots-plan-execute'));
    expect(await screen.findByTestId('pilots-plan-error')).toHaveTextContent(
      /objetivo/i,
    );
    expect(Pilots.start).not.toHaveBeenCalled();
  });

  // ─── Templates ────────────────────────────────────────────────────────────

  it('one-click template populates goal + timeline from Pilots.templates()', async () => {
    Pilots.templates.mockResolvedValue([
      {
        id: 'triagem',
        label: 'Triagem',
        description: 'Triar ocorrência e despachar.',
        goal: 'Triar ocorrência e despachar viatura mais próxima',
        steps: [
          {
            title: 'Validar ocorrência',
            note: 'Confirma prioridade',
            action_code_ref_hint: 'app.actions.test.lineage',
            input_hint: { occurrence_id: 'OC-77' },
          },
        ],
      },
    ]);
    render(<PilotsPage />);
    await waitFor(() => expect(Pilots.templates).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('pilots-plan-template-triagem'));
    expect((screen.getByTestId('pilots-plan-goal') as HTMLInputElement).value).toBe(
      'Triar ocorrência e despachar viatura mais próxima',
    );
    // O passo carregou a ação casada pelo code_ref e pré-preencheu o campo.
    expect(
      within(screen.getByTestId('pilots-plan-step-0')).getByText('Validar ocorrência'),
    ).toBeInTheDocument();
  });

  // ─── Histórico persistido (Pilots.listMine) ────────────────────────────────

  it('calls Pilots.listMine() on mount and shows empty state when none', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(Pilots.listMine).toHaveBeenCalled());
    expect(
      await screen.findByText(/Nenhum roteiro executado ainda/i),
    ).toBeInTheDocument();
  });

  it('renders persisted archive items returned by listMine', async () => {
    Pilots.listMine.mockResolvedValueOnce([
      {
        pilot_run_id: 'archive-run-1',
        goal: 'pilot de ontem',
        status: 'SUCCESS',
        started_at: '2026-05-22T10:00:00Z',
        finished_at: '2026-05-22T10:00:30Z',
        initiated_by: 'admin',
        n_steps: 2,
      },
    ]);
    render(<PilotsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('pilots-run-archive-run-1')).toBeInTheDocument(),
    );
    expect(screen.getByText('pilot de ontem')).toBeInTheDocument();
  });

  it('expands an archive row into its run timeline via Pilots.get', async () => {
    Pilots.listMine.mockResolvedValueOnce([
      {
        pilot_run_id: 'archive-run-2',
        goal: 'pilot expansível',
        status: 'SUCCESS',
        started_at: '2026-05-22T10:00:00Z',
        finished_at: '2026-05-22T10:00:30Z',
        initiated_by: 'admin',
        n_steps: 1,
      },
    ]);
    Pilots.get.mockResolvedValueOnce({
      pilot_run_id: 'archive-run-2',
      goal: 'pilot expansível',
      status: 'SUCCESS',
      steps: [
        {
          step_index: 0,
          action_id: fakeActionAuto.id,
          action_name: 'Validar ocorrência',
          status: 'SUCCESS',
          output: {},
          duration_ms: 5,
        },
      ],
      started_at: '2026-05-22T10:00:00Z',
      finished_at: '2026-05-22T10:00:30Z',
    });
    render(<PilotsPage />);
    fireEvent.click(
      (await screen.findByTestId('pilots-run-archive-run-2')).querySelector(
        'button',
      )!,
    );
    await waitFor(() => expect(Pilots.get).toHaveBeenCalledWith('archive-run-2'));
    expect(
      await screen.findByTestId('pilots-run-archive-run-2-detail'),
    ).toBeInTheDocument();
  });

  it('refreshes the archive after a successful execution', async () => {
    Pilots.start.mockResolvedValueOnce({
      pilot_run_id: 'new-run',
      goal: 'novo',
      status: 'SUCCESS',
      steps: [
        {
          step_index: 0,
          action_id: fakeActionAuto.id,
          action_name: 'Validar ocorrência',
          status: 'SUCCESS',
          output: {},
        },
      ],
      started_at: '2026-05-23T10:00:00Z',
      finished_at: '2026-05-23T10:00:05Z',
    });
    render(<PilotsPage />);
    await waitFor(() => expect(Pilots.listMine).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('pilots-plan-goal'), {
      target: { value: 'novo' },
    });
    pickAction(0, fakeActionAuto.id);
    fireEvent.change(
      await screen.findByTestId('pilots-plan-step-0-field-occurrence_id'),
      { target: { value: 'x' } },
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilots-plan-execute'));
      await Promise.resolve();
    });
    await waitFor(() => expect(Pilots.start).toHaveBeenCalled());
    await waitFor(() =>
      expect(Pilots.listMine.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  // ─── Modo Avançado segue disponível (ADD-alongside) ─────────────────────────

  it('keeps the Avançado JSON builder available behind its mode', async () => {
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('pilots-mode-advanced'));
    expect(screen.getByTestId('pilots-builder')).toBeInTheDocument();
    // No Avançado o campo de entrada é JSON cru (poder total).
    expect(screen.getByTestId('pilots-step-0-input').tagName.toLowerCase()).toBe(
      'textarea',
    );
    // E volta pro Plano.
    fireEvent.click(screen.getByTestId('pilots-mode-plan'));
    expect(screen.getByTestId('pilots-plan')).toBeInTheDocument();
    expect(screen.queryByTestId('pilots-builder')).not.toBeInTheDocument();
  });
});
