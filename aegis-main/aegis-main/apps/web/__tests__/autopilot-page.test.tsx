/**
 * Rotinas — /painel-de-controle/autopilot (redesign visual "frase").
 *
 * Exercita o novo fluxo: escolher ação no picker → escolher a condição "até"
 * (segmented: terminar sozinho | o resultado disser | um campo for) → ajustar
 * os limites (sliders pré-preenchidos) → Iniciar → anel de progresso + estado
 * final em pt-BR claro. Cobre também o histórico persistido e o aviso de
 * "nenhuma ação automática".
 *
 * Contratos do backend inalterados: Autopilot.run({goal, action_id, input,
 * max_steps, max_duration_s, terminator?}), Autopilot.listMine(50),
 * ActionTypes.list() filtrado por auto_approvable.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AutopilotPage from '@/app/painel-de-controle/autopilot/page';

jest.mock('@/lib/api', () => ({
  ActionTypes: { list: jest.fn() },
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
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

const { ActionTypes, Autopilot } = jest.requireMock('@/lib/api') as {
  ActionTypes: { list: jest.Mock };
  Autopilot: {
    run: jest.Mock;
    get: jest.Mock;
    list: jest.Mock;
    listMine: jest.Mock;
  };
};

const fakeAuto = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  name: 'aegis.test.lineage',
  description: 'Smoke test auto-aprovável.',
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

const fakeManual = {
  ...fakeAuto,
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  name: 'investigate_plate',
  auto_approvable: false,
};

/** Espera o picker de ações popular (1 placeholder + 1 auto-aprovável). */
async function waitForActions() {
  await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      (screen.getByTestId('autopilot-action') as HTMLSelectElement).options
        .length,
    ).toBeGreaterThan(1),
  );
}

function pickAction(id = fakeAuto.id) {
  fireEvent.change(screen.getByTestId('autopilot-action'), {
    target: { value: id },
  });
}

const SUCCESS_RUN = {
  autopilot_run_id: 'apr-success',
  goal: 'Repetir a ação aegis.test.lineage até concluir',
  action_id: fakeAuto.id,
  status: 'SUCCESS',
  reason: 'all steps ran',
  steps_ran: 3,
  elapsed_s: 0.4,
  steps: [
    {
      step_index: 0,
      status: 'SUCCESS',
      output: { result: 'ok' },
      duration_ms: 11,
      lineage_event_id: 'l1',
    },
  ],
  started_at: '2026-05-23T10:00:00Z',
  finished_at: '2026-05-23T10:00:01Z',
};

describe('AutopilotPage — redesign visual', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ActionTypes.list.mockResolvedValue([fakeAuto, fakeManual]);
    Autopilot.listMine.mockResolvedValue([]);
  });

  it('mostra o composer em frase com o picker só de ações automáticas', async () => {
    render(<AutopilotPage />);
    expect(screen.getByTestId('autopilot-page')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-composer')).toBeInTheDocument();
    await waitForActions();
    // 1 placeholder + 1 auto-aprovável; a manual fica de fora.
    expect(
      (screen.getByTestId('autopilot-action') as HTMLSelectElement).options
        .length,
    ).toBe(2);
    const opts = (screen.getByTestId('autopilot-action') as HTMLSelectElement)
      .options;
    expect(opts[1].textContent).toContain('aegis.test.lineage');
    // Limites pré-preenchidos com defaults sensatos (caminho feliz).
    expect(
      (screen.getByTestId('autopilot-max-steps') as HTMLInputElement).value,
    ).toBe('10');
    expect(
      (screen.getByTestId('autopilot-max-duration') as HTMLInputElement).value,
    ).toBe('60');
    // A condição default é "terminar sozinho".
    expect(screen.getByTestId('autopilot-stop-self')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('exige escolher uma ação antes de iniciar', async () => {
    render(<AutopilotPage />);
    await waitForActions();
    fireEvent.click(screen.getByTestId('autopilot-run'));
    expect(await screen.findByTestId('autopilot-error')).toHaveTextContent(
      /Escolha uma ação/i,
    );
    expect(Autopilot.run).not.toHaveBeenCalled();
  });

  it('caminho feliz: ação + "terminar sozinho" dispara sem terminator e deriva o goal', async () => {
    Autopilot.run.mockResolvedValueOnce(SUCCESS_RUN);
    render(<AutopilotPage />);
    await waitForActions();
    pickAction();
    // Sem digitar mais nada — happy path.
    fireEvent.click(screen.getByTestId('autopilot-run'));
    await waitFor(() => expect(Autopilot.run).toHaveBeenCalled());
    const arg = Autopilot.run.mock.calls[0][0];
    expect(arg.action_id).toBe(fakeAuto.id);
    expect(typeof arg.goal).toBe('string');
    expect(arg.goal.length).toBeGreaterThanOrEqual(3);
    expect(arg.goal).toContain('aegis.test.lineage');
    expect(arg.terminator).toBeUndefined();
    expect(arg.max_steps).toBe(10);
    expect(arg.max_duration_s).toBe(60);
    // Resultado visual: anel + estado final claro.
    expect(
      await screen.findByTestId('autopilot-run-detail'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-progress-ring')).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-status-badge')).toHaveTextContent(
      /Concluída/,
    );
  });

  it('condição "o resultado disser" monta terminator output_contains', async () => {
    Autopilot.run.mockResolvedValueOnce({
      ...SUCCESS_RUN,
      autopilot_run_id: 'apr-contains',
      status: 'TERMINATED',
      reason: 'terminator condition met',
      steps_ran: 1,
    });
    render(<AutopilotPage />);
    await waitForActions();
    pickAction();
    fireEvent.click(screen.getByTestId('autopilot-stop-contains'));
    fireEvent.change(screen.getByTestId('autopilot-term-contains'), {
      target: { value: 'ok' },
    });
    fireEvent.click(screen.getByTestId('autopilot-run'));
    await waitFor(() => expect(Autopilot.run).toHaveBeenCalled());
    const arg = Autopilot.run.mock.calls[0][0];
    expect(arg.terminator).toEqual({ output_contains: 'ok' });
    expect(
      await screen.findByTestId('autopilot-run-detail'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-status-badge')).toHaveTextContent(
      /Parou na condição/,
    );
  });

  it('condição "o resultado disser" sem texto bloqueia o disparo', async () => {
    render(<AutopilotPage />);
    await waitForActions();
    pickAction();
    fireEvent.click(screen.getByTestId('autopilot-stop-contains'));
    fireEvent.click(screen.getByTestId('autopilot-run'));
    expect(await screen.findByTestId('autopilot-error')).toHaveTextContent(
      /texto/i,
    );
    expect(Autopilot.run).not.toHaveBeenCalled();
  });

  it('condição "um campo for" monta terminator eq e faz parse JSON do valor', async () => {
    Autopilot.run.mockResolvedValueOnce({
      ...SUCCESS_RUN,
      autopilot_run_id: 'apr-eq',
      steps: [],
      steps_ran: 1,
    });
    render(<AutopilotPage />);
    await waitForActions();
    pickAction();
    fireEvent.click(screen.getByTestId('autopilot-stop-eq'));
    fireEvent.change(await screen.findByTestId('autopilot-term-path'), {
      target: { value: 'count' },
    });
    fireEvent.change(screen.getByTestId('autopilot-term-value'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('autopilot-run'));
    await waitFor(() => expect(Autopilot.run).toHaveBeenCalled());
    const arg = Autopilot.run.mock.calls[0][0];
    expect(arg.terminator).toEqual({
      output_eq_path: 'count',
      output_eq_value: 0,
    });
  });

  it('JSON inválido em Avançado bloqueia o disparo e abre o painel', async () => {
    render(<AutopilotPage />);
    await waitForActions();
    pickAction();
    fireEvent.click(screen.getByTestId('autopilot-advanced-toggle'));
    fireEvent.change(screen.getByTestId('autopilot-input'), {
      target: { value: '{not valid' },
    });
    fireEvent.click(screen.getByTestId('autopilot-run'));
    expect(await screen.findByTestId('autopilot-error')).toHaveTextContent(
      /JSON/i,
    );
    expect(Autopilot.run).not.toHaveBeenCalled();
  });

  it('estado final "Atingiu o limite" renderiza badge + anel de progresso', async () => {
    Autopilot.run.mockResolvedValueOnce({
      ...SUCCESS_RUN,
      autopilot_run_id: 'apr-budget',
      status: 'BUDGET_EXHAUSTED',
      reason: 'max_steps=10 reached without terminator',
      steps_ran: 10,
      elapsed_s: 0.3,
    });
    render(<AutopilotPage />);
    await waitForActions();
    pickAction();
    fireEvent.click(screen.getByTestId('autopilot-run'));
    expect(
      await screen.findByTestId('autopilot-run-detail'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-status-badge')).toHaveTextContent(
      /Atingiu o limite/,
    );
    expect(screen.getByTestId('autopilot-progress-ring')).toBeInTheDocument();
  });

  it('avisa (com link para Ações) quando não há ação automática no catálogo', async () => {
    ActionTypes.list.mockResolvedValueOnce([fakeManual]);
    render(<AutopilotPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    expect(
      await screen.findByTestId('autopilot-no-eligible'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('autopilot-no-eligible-link')).toHaveAttribute(
      'href',
      '/painel-de-controle/acoes',
    );
    // Sem ação elegível, o composer não aparece.
    expect(screen.queryByTestId('autopilot-composer')).not.toBeInTheDocument();
  });

  it('alterna para o modo Quadro (Kanban) mantendo o composer fora de cena', async () => {
    render(<AutopilotPage />);
    await waitForActions();
    expect(screen.getByTestId('autopilot-composer')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('autopilot-mode-workbench'));
    expect(screen.queryByTestId('autopilot-composer')).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Histórico persistido via Autopilot.listMine()
  // ─────────────────────────────────────────────────────────────────────────

  it('chama Autopilot.listMine() ao montar', async () => {
    render(<AutopilotPage />);
    await waitFor(() => expect(Autopilot.listMine).toHaveBeenCalledTimes(1));
  });

  it('renderiza itens do histórico com status em pt-BR', async () => {
    Autopilot.listMine.mockResolvedValueOnce([
      {
        autopilot_run_id: 'ap-archive-1',
        goal: 'varredura LPR',
        action_id: fakeAuto.id,
        action_name: fakeAuto.name,
        status: 'TERMINATED',
        reason: 'terminator hit',
        started_at: '2026-05-22T08:00:00Z',
        finished_at: '2026-05-22T08:00:05Z',
        initiated_by: 'admin',
        steps_ran: 3,
        elapsed_s: 4.5,
      },
    ]);
    render(<AutopilotPage />);
    await waitFor(() =>
      expect(
        screen.getByTestId('autopilot-archive-ap-archive-1'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('varredura LPR')).toBeInTheDocument();
  });

  it('recarrega o histórico após um disparo bem-sucedido', async () => {
    Autopilot.run.mockResolvedValueOnce(SUCCESS_RUN);
    render(<AutopilotPage />);
    await waitFor(() => expect(Autopilot.listMine).toHaveBeenCalledTimes(1));
    await waitForActions();
    pickAction();
    fireEvent.click(screen.getByTestId('autopilot-run'));
    await waitFor(() => expect(Autopilot.run).toHaveBeenCalled());
    await waitFor(() =>
      expect(Autopilot.listMine.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });
});
