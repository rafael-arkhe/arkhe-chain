/**
 * Wave H.3 — Autopilot Workbench (Kanban 4-col + animated dashed).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AutopilotPage from '@/app/painel-de-controle/autopilot/page';

jest.mock('@/lib/api', () => ({
  ActionTypes: {
    list: jest.fn(),
  },
  Autopilot: {
    run: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    listMine: jest.fn(),
  },
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

const { ActionTypes, Autopilot } = jest.requireMock('@/lib/api') as {
  ActionTypes: { list: jest.Mock };
  Autopilot: { listMine: jest.Mock; get: jest.Mock };
};

const fakeRunRunning = {
  autopilot_run_id: 'ap-running',
  goal: 'Loop em execução',
  action_id: 'a-1',
  action_name: 'Reprocessar',
  status: 'RUNNING',
  reason: 'em andamento',
  started_at: new Date().toISOString(),
  finished_at: null,
  initiated_by: 'admin',
  steps_ran: 3,
  elapsed_s: 12.4,
};

const fakeRunDone = {
  autopilot_run_id: 'ap-done',
  goal: 'Loop concluído',
  action_id: 'a-1',
  action_name: 'Reprocessar',
  status: 'SUCCESS',
  reason: 'sucesso final',
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  initiated_by: 'admin',
  steps_ran: 5,
  elapsed_s: 30.0,
};

const fakeRunFailed = {
  autopilot_run_id: 'ap-failed',
  goal: 'Loop com falha',
  action_id: 'a-1',
  action_name: 'Reprocessar',
  status: 'FAILED',
  reason: 'erro no step #2',
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  initiated_by: 'admin',
  steps_ran: 2,
  elapsed_s: 5.0,
};

function switchToWorkbench() {
  fireEvent.click(screen.getByTestId('autopilot-mode-workbench'));
}

describe('Wave H.3 — Autopilot Workbench', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ActionTypes.list.mockResolvedValue([]);
    Autopilot.listMine.mockResolvedValue([fakeRunRunning, fakeRunDone, fakeRunFailed]);
    Autopilot.get.mockResolvedValue({
      ...fakeRunDone,
      steps: [
        {
          step_index: 0,
          status: 'SUCCESS',
          output: { ok: true },
          duration_ms: 120,
        },
        {
          step_index: 1,
          status: 'SUCCESS',
          output: {},
          duration_ms: 80,
        },
      ],
    });
  });

  it('renders mode toggle with workbench tab', () => {
    render(<AutopilotPage />);
    expect(screen.getByTestId('autopilot-mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-mode-workbench')).toBeInTheDocument();
  });

  it('switches to workbench and renders 3-pane layout', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    expect(screen.getByTestId('autopilot-workbench')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-workbench-list')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-workbench-kanban')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-workbench-detail')).toBeInTheDocument();
  });

  it('renders the 4 Kanban columns', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    expect(screen.getByTestId('autopilot-kanban-col-queued')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-kanban-col-running')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-kanban-col-done')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-kanban-col-failed')).toBeInTheDocument();
  });

  it('distributes runs across columns by status', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    await waitFor(() => expect(Autopilot.listMine).toHaveBeenCalled());
    await screen.findByTestId(`autopilot-kanban-card-${fakeRunRunning.autopilot_run_id}`);
    // Running card lives in running column
    const runningCol = screen.getByTestId('autopilot-kanban-col-running');
    expect(runningCol).toContainElement(
      screen.getByTestId(`autopilot-kanban-card-${fakeRunRunning.autopilot_run_id}`),
    );
    const doneCol = screen.getByTestId('autopilot-kanban-col-done');
    expect(doneCol).toContainElement(
      screen.getByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}`),
    );
    const failedCol = screen.getByTestId('autopilot-kanban-col-failed');
    expect(failedCol).toContainElement(
      screen.getByTestId(`autopilot-kanban-card-${fakeRunFailed.autopilot_run_id}`),
    );
  });

  it('shows the animated dashed-progress only on RUNNING cards', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    await screen.findByTestId(`autopilot-kanban-card-${fakeRunRunning.autopilot_run_id}`);
    expect(
      screen.getByTestId(`autopilot-kanban-card-${fakeRunRunning.autopilot_run_id}-progress`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}-progress`),
    ).not.toBeInTheDocument();
  });

  it('clicking a card loads detail in the right pane', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    await screen.findByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}`);
    fireEvent.click(
      screen.getByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}`),
    );
    await waitFor(() => expect(Autopilot.get).toHaveBeenCalledWith(fakeRunDone.autopilot_run_id));
    expect(await screen.findByTestId('autopilot-workbench-detail-body')).toBeInTheDocument();
  });

  it('pause/resume buttons are disabled with honest tooltip', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    await screen.findByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}`);
    fireEvent.click(
      screen.getByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}`),
    );
    const pauseBtn = (await screen.findByTestId('autopilot-workbench-pause')) as HTMLButtonElement;
    const resumeBtn = screen.getByTestId('autopilot-workbench-resume') as HTMLButtonElement;
    expect(pauseBtn.disabled).toBe(true);
    expect(resumeBtn.disabled).toBe(true);
    expect(pauseBtn.title).toBe('Não suportado ainda');
    expect(resumeBtn.title).toBe('Não suportado ainda');
  });

  it('shows budget meters for the selected run', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    await screen.findByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}`);
    fireEvent.click(
      screen.getByTestId(`autopilot-kanban-card-${fakeRunDone.autopilot_run_id}`),
    );
    await waitFor(() => expect(Autopilot.get).toHaveBeenCalled());
    expect(await screen.findByTestId('autopilot-workbench-budget-steps')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-workbench-budget-time')).toBeInTheDocument();
  });

  it('refresh button re-fetches the list', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    // listMine pode ter sido chamado pela página de archive (autopilot-advanced)
    // E pelo workbench mount — basta confirmar >=1 e que clique aumenta o
    // contador.
    await waitFor(() => expect(Autopilot.listMine.mock.calls.length).toBeGreaterThanOrEqual(1));
    const before = Autopilot.listMine.mock.calls.length;
    fireEvent.click(screen.getByTestId('autopilot-workbench-refresh'));
    await waitFor(() =>
      expect(Autopilot.listMine.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('returns to the Rotina composer without errors', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    expect(screen.getByTestId('autopilot-workbench')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('autopilot-mode-routine'));
    expect(screen.queryByTestId('autopilot-workbench')).not.toBeInTheDocument();
    expect(screen.getByTestId('autopilot-composer')).toBeInTheDocument();
  });

  it('list pane shows refresh count next to header', async () => {
    render(<AutopilotPage />);
    switchToWorkbench();
    await waitFor(() => expect(Autopilot.listMine).toHaveBeenCalled());
    // Total runs from list = 3 in our mock
    const listPane = screen.getByTestId('autopilot-workbench-list');
    expect(listPane.textContent).toMatch(/Runs \(3\)/);
  });
});
