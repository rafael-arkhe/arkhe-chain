/**
 * Roteiros — Retomar (resume) + pré-requisitos (depends_on) na visão Plano.
 *
 * Cobre 2 comportamentos, agora exercidos pela visão padrão visual:
 *   1. Botão "Retomar" aparece em roteiros PAUSED quando a CPApproval do passo
 *      pendente está ``approved``. Click chama Pilots.resume(). O histórico é
 *      compartilhado entre Plano e Avançado.
 *   2. O passo nº2+ expõe "Só começa depois de…" (via menu ⋮) e o Executar
 *      envia depends_on no payload de Pilots.start.
 */
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import PilotsPage from '@/app/painel-de-controle/pilots/page';

jest.mock('@/lib/api', () => ({
  ActionTypes: { list: jest.fn(), plan: jest.fn().mockResolvedValue({}) },
  Pilots: {
    start: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    listMine: jest.fn(),
    resume: jest.fn(),
    templates: jest.fn().mockResolvedValue([]),
  },
  ControlPanel: {
    approvals: { list: jest.fn() },
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

const { ActionTypes, Pilots, ControlPanel } = jest.requireMock('@/lib/api') as {
  ActionTypes: { list: jest.Mock; plan: jest.Mock };
  Pilots: {
    start: jest.Mock;
    get: jest.Mock;
    list: jest.Mock;
    listMine: jest.Mock;
    resume: jest.Mock;
  };
  ControlPanel: {
    approvals: { list: jest.Mock };
  };
};

const fakeActionAuto = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  name: 'Validar ocorrência',
  description: 'auto-approvable smoke',
  input_schema: {},
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
};

const APPROVAL_ID = 'app-1';
const PILOT_ID = 'pilot-1';

const pausedHistoryItem = {
  pilot_run_id: PILOT_ID,
  goal: 'Pilot E2E pausado',
  status: 'PAUSED',
  started_at: '2026-05-23T10:00:00Z',
  finished_at: null,
  initiated_by: 'admin',
  n_steps: 1,
};

const pausedDetail = {
  pilot_run_id: PILOT_ID,
  goal: 'Pilot E2E pausado',
  status: 'PAUSED',
  started_at: '2026-05-23T10:00:00Z',
  finished_at: null,
  initiated_by: 'admin',
  steps: [
    {
      step_index: 0,
      action_id: fakeActionManual.id,
      action_name: fakeActionManual.name,
      status: 'PENDING_APPROVAL',
      output: { approval_id: APPROVAL_ID },
      execution_id: null,
      lineage_event_id: 'lin-pending',
      duration_ms: null,
      approval_id: APPROVAL_ID,
      depends_on: [],
    },
  ],
};

/** Seleciona ação no SearchableSelect do passo idx. */
function pickAction(idx: number, actionId: string) {
  const sel = screen.getByTestId(`pilots-plan-step-${idx}-action`);
  fireEvent.click(within(sel).getByRole('button'));
  fireEvent.click(
    screen.getByTestId(`pilots-plan-step-${idx}-action-option-${actionId}`),
  );
}

describe('Roteiros — Retomar + pré-requisitos (Plano)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ActionTypes.list.mockResolvedValue([fakeActionAuto, fakeActionManual]);
    Pilots.listMine.mockResolvedValue([pausedHistoryItem]);
    Pilots.get.mockResolvedValue(pausedDetail);
  });

  it('does not show "Retomar" when the related approval is still open', async () => {
    ControlPanel.approvals.list.mockResolvedValue([
      {
        id: APPROVAL_ID,
        requester_id: 'admin',
        resource_kind: 'action_type',
        resource_id: fakeActionManual.id,
        title: 'Pilot pending',
        action: 'execute',
        status: 'open',
        submitted_at: '2026-05-23T10:00:01Z',
        decided_at: null,
        decided_by_id: null,
        rationale: null,
      },
    ]);
    render(<PilotsPage />);
    // Histórico aparece na visão padrão Plano (sem trocar de modo).
    await waitFor(() =>
      expect(screen.getByTestId(`pilots-run-${PILOT_ID}`)).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByTestId(`pilots-run-${PILOT_ID}`).querySelector('button')!,
    );
    await waitFor(() =>
      expect(screen.getByTestId('pilots-resume-bar')).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('pilots-resume-btn') as HTMLButtonElement,
    ).toBeDisabled();
  });

  it('enables "Retomar" once the approval is approved and calls Pilots.resume on click', async () => {
    ControlPanel.approvals.list.mockResolvedValue([
      {
        id: APPROVAL_ID,
        requester_id: 'admin',
        resource_kind: 'action_type',
        resource_id: fakeActionManual.id,
        title: 'Pilot pending',
        action: 'execute',
        status: 'approved',
        submitted_at: '2026-05-23T10:00:01Z',
        decided_at: '2026-05-23T10:01:00Z',
        decided_by_id: 'other-user',
        rationale: 'approved by 4-eyes',
      },
    ]);
    Pilots.resume.mockResolvedValue({
      pilot_run_id: PILOT_ID,
      status: 'SUCCESS',
      resumed_step_index: 0,
      steps_executed: [0],
      finished_at: '2026-05-23T10:02:00Z',
    });
    render(<PilotsPage />);
    await waitFor(() =>
      expect(screen.getByTestId(`pilots-run-${PILOT_ID}`)).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByTestId(`pilots-run-${PILOT_ID}`).querySelector('button')!,
    );
    await waitFor(() =>
      expect(screen.getByTestId('pilots-resume-bar')).toBeInTheDocument(),
    );
    const btn = screen.getByTestId('pilots-resume-btn') as HTMLButtonElement;
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => expect(Pilots.resume).toHaveBeenCalledWith(PILOT_ID));
  });

  it('does not show "Só começa depois de…" on step #1 (no previous step)', async () => {
    ControlPanel.approvals.list.mockResolvedValue([]);
    Pilots.listMine.mockResolvedValue([]);
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    // Step 0 está em edição por default; o painel de pré-requisitos não existe.
    expect(
      screen.queryByTestId('pilots-plan-step-0-depends-wrap'),
    ).not.toBeInTheDocument();
    // E o item de menu de dependência não é oferecido no passo 0.
    fireEvent.click(screen.getByTestId('pilots-plan-step-0-menu-trigger'));
    expect(
      screen.queryByTestId('pilots-plan-step-0-menu-deps'),
    ).not.toBeInTheDocument();
  });

  it('exposes "Só começa depois de…" for step #2 and submits depends_on in payload', async () => {
    ControlPanel.approvals.list.mockResolvedValue([]);
    Pilots.listMine.mockResolvedValue([]);
    Pilots.start.mockResolvedValueOnce({
      pilot_run_id: 'r-new',
      goal: 'DAG smoke',
      status: 'SUCCESS',
      steps: [],
      started_at: '2026-05-23T11:00:00Z',
      finished_at: '2026-05-23T11:00:01Z',
    });
    render(<PilotsPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('pilots-plan-goal'), {
      target: { value: 'DAG smoke' },
    });
    fireEvent.click(screen.getByTestId('pilots-plan-add-step'));
    // Após adicionar, o passo 2 (idx=1) fica em edição. Escolhe a ação dele,
    // depois abre o passo 1 (idx=0) e escolhe a ação dele.
    pickAction(1, fakeActionAuto.id);
    fireEvent.click(screen.getByTestId('pilots-plan-step-0-edit'));
    pickAction(0, fakeActionAuto.id);
    // Reabre o passo 2 pra acessar o painel de pré-requisitos.
    fireEvent.click(screen.getByTestId('pilots-plan-step-1-edit'));
    // Passo 2 (idx=1): abre o menu ⋮ e ativa os pré-requisitos.
    fireEvent.click(screen.getByTestId('pilots-plan-step-1-menu-trigger'));
    fireEvent.click(screen.getByTestId('pilots-plan-step-1-menu-deps'));
    await waitFor(() =>
      expect(
        screen.getByTestId('pilots-plan-step-1-depends-wrap'),
      ).toBeInTheDocument(),
    );
    // Toggle "depende do passo 1" (idx=0).
    fireEvent.click(screen.getByTestId('pilots-plan-step-1-dep-0'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('pilots-plan-execute'));
      await Promise.resolve();
    });
    await waitFor(() => expect(Pilots.start).toHaveBeenCalled());
    const callArgs = Pilots.start.mock.calls[0];
    expect(callArgs[0]).toBe('DAG smoke');
    expect(callArgs[1][1].depends_on).toEqual([0]);
    expect(callArgs[1][0].depends_on).toBeUndefined();
  });
});
