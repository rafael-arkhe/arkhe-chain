/**
 * Sprint L2 — /painel-de-controle/acoes Action Type catalog page.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AcoesPage from '@/app/painel-de-controle/acoes/page';

jest.mock('@/lib/api', () => ({
  ActionTypes: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
    executions: jest.fn(),
    plan: jest.fn(),
    formSchema: jest.fn(),
    validateInput: jest.fn(),
  },
  Projects: { list: jest.fn().mockResolvedValue([]) },
  Spaces: { list: jest.fn().mockResolvedValue([]) },
  OntologyNodes: { search: jest.fn().mockResolvedValue([]) },
  Ontology: { listNodeTypes: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/components/aip-assist/aip-assist-sidebar', () => ({
  AipAssistSidebar: () => <div data-testid="aip-sidebar" />,
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
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

const { ActionTypes } = jest.requireMock('@/lib/api') as {
  ActionTypes: Record<string, jest.Mock>;
};

const fakeAction = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  name: 'rede.fechar_caso',
  description: 'Fecha um caso e arquiva nós relacionados.',
  input_schema: { type: 'object' },
  output_schema: {},
  code_ref: 'app.actions.fechar_caso',
  requires_markings: ['SIGILOSO'],
  requires_clearances: [],
  timeout_seconds: 60,
  auto_approvable: false,
  version: 1,
  created_at: '2026-05-23T10:00:00Z',
};

const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify({ username: 'admin', markings: [] }), { status: 200 }),
  ) as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

describe('AcoesPage — Sprint L2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ActionTypes.list.mockResolvedValue([fakeAction]);
    ActionTypes.executions.mockResolvedValue([]);
    ActionTypes.formSchema.mockResolvedValue({
      action_id: fakeAction.id,
      action_name: fakeAction.name,
      fields: [
        {
          key: 'node_id',
          type: 'string',
          title: 'Node ID',
          description: null,
          required: false,
          enum: null,
          default: null,
          minimum: null,
          maximum: null,
          min_length: null,
          max_length: null,
          pattern: null,
          items_type: null,
          ref_node_type: null,
          placeholder: null,
          format: null,
        },
      ],
    });
    ActionTypes.validateInput.mockResolvedValue({ valid: true, errors: [] });
  });

  it('renders the action list with name + description + markings tag', async () => {
    render(<AcoesPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    expect(await screen.findByText('rede.fechar_caso')).toBeInTheDocument();
    expect(screen.getByText(/Fecha um caso/)).toBeInTheDocument();
    expect(screen.getByText(/marcações: SIGILOSO/i)).toBeInTheDocument();
  });

  it('filters the list when typing in the filter input', async () => {
    ActionTypes.list.mockResolvedValueOnce([
      fakeAction,
      { ...fakeAction, id: 'b', name: 'outra.acao', description: 'foo' },
    ]);
    render(<AcoesPage />);
    await waitFor(() => expect(ActionTypes.list).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('acoes-filter'), {
      target: { value: 'outra' },
    });
    await waitFor(() => {
      expect(screen.getByText('outra.acao')).toBeInTheDocument();
      expect(screen.queryByText('rede.fechar_caso')).not.toBeInTheDocument();
    });
  });

  it('opens the executor when the Executar button is clicked', async () => {
    render(<AcoesPage />);
    const execBtn = await screen.findByTestId(`acoes-exec-${fakeAction.id}`);
    fireEvent.click(execBtn);
    expect(screen.getByTestId('acao-executor')).toBeInTheDocument();
  });

  it('runs the action via the dynamic form (Wave H.2)', async () => {
    ActionTypes.execute.mockResolvedValueOnce({
      execution_id: 'exec-1',
      status: 'SUCCESS',
      output: { ok: true },
      duration_ms: 12,
      lineage_event_id: 'lin-1',
    });
    render(<AcoesPage />);
    const execBtn = await screen.findByTestId(`acoes-exec-${fakeAction.id}`);
    fireEvent.click(execBtn);
    // Aguarda form dinâmico renderizar do schema.
    await screen.findByTestId('acao-field-node_id');
    fireEvent.click(screen.getByTestId('acao-exec-run'));
    await waitFor(() =>
      expect(ActionTypes.execute).toHaveBeenCalledWith(
        fakeAction.id,
        expect.objectContaining({ _context: expect.any(Object) }),
        undefined,
      ),
    );
    expect(await screen.findByTestId('acao-exec-result')).toHaveTextContent(/Sucesso/);
  });

  it('renders POLICY_DENIED status with warning style', async () => {
    ActionTypes.execute.mockResolvedValueOnce({
      execution_id: 'exec-2',
      status: 'POLICY_DENIED',
      output: { denied: 'missing markings: TS' },
      duration_ms: 0,
      lineage_event_id: 'lin-2',
    });
    render(<AcoesPage />);
    const execBtn = await screen.findByTestId(`acoes-exec-${fakeAction.id}`);
    fireEvent.click(execBtn);
    await screen.findByTestId('acao-field-node_id');
    fireEvent.click(screen.getByTestId('acao-exec-run'));
    expect(await screen.findByTestId('acao-exec-result')).toHaveTextContent(/Negado/);
  });
});
