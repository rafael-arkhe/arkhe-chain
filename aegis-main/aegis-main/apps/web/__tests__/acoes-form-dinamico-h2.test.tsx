/**
 * Wave H.2 — /painel-de-controle/acoes
 *
 * Cobre o form dinâmico do ActionExecutor:
 *   - cada tipo de field renderiza o controle correto (string/number/boolean/enum/array/date/object_ref)
 *   - validação inline (required)
 *   - dropdowns Operação + Espaço
 *   - bloco Marcações exigidas
 *   - botão "Pedir ajuda ao AIP" abre sidebar
 *   - switch dry-run usa /plan
 *   - dialog histórico expande input/output
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  Projects: { list: jest.fn() },
  Spaces: { list: jest.fn() },
  OntologyNodes: { search: jest.fn() },
  Ontology: { listNodeTypes: jest.fn().mockResolvedValue([]) },
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
jest.mock('@/components/aip-assist/aip-assist-sidebar', () => ({
  AipAssistSidebar: ({ scope, resourceId }: { scope: string; resourceId?: string }) => (
    <div data-testid="aip-sidebar" data-scope={scope} data-resource={resourceId || ''}>
      AIP Mock
    </div>
  ),
}));

// Fetch mock pra /api/whoami
const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('/api/whoami')) {
      return new Response(
        JSON.stringify({ username: 'admin', markings: ['SIGILOSO'] }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

const api = jest.requireMock('@/lib/api') as {
  ActionTypes: Record<string, jest.Mock>;
  Projects: { list: jest.Mock };
  Spaces: { list: jest.Mock };
  OntologyNodes: { search: jest.Mock };
};

const ACTION = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  name: 'investigate_plate',
  description: 'Investiga placa em rondas suspeitas.',
  input_schema: {
    properties: {
      placa: { type: 'string', title: 'Placa', description: 'Placa do veículo' },
      motivo: { type: 'string', title: 'Motivo' },
      urgencia: { type: 'string', enum: ['baixa', 'media', 'alta'] },
      ativo: { type: 'boolean', title: 'Ativo' },
      raio_km: { type: 'integer', title: 'Raio (km)', minimum: 1, maximum: 50 },
      data: { type: 'string', format: 'date', title: 'Data' },
      tags: { type: 'array', items: { type: 'string' }, title: 'Tags' },
      alvo: {
        type: 'string',
        title: 'Alvo',
        'x-ref-node-type': 'pessoa',
      },
    },
    required: ['placa', 'motivo'],
  },
  output_schema: {},
  code_ref: 'app.actions.investigate_plate',
  requires_markings: ['SIGILOSO'],
  requires_clearances: [],
  timeout_seconds: 60,
  auto_approvable: true,
  version: 1,
  created_at: '2026-05-23T10:00:00Z',
};

const SCHEMA = {
  action_id: ACTION.id,
  action_name: ACTION.name,
  fields: [
    {
      key: 'placa',
      type: 'string',
      title: 'Placa',
      description: 'Placa do veículo',
      required: true,
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
    {
      key: 'motivo',
      type: 'string',
      title: 'Motivo',
      description: null,
      required: true,
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
    {
      key: 'urgencia',
      type: 'enum',
      title: 'Urgencia',
      description: null,
      required: false,
      enum: ['baixa', 'media', 'alta'],
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
    {
      key: 'ativo',
      type: 'boolean',
      title: 'Ativo',
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
    {
      key: 'raio_km',
      type: 'integer',
      title: 'Raio (km)',
      description: null,
      required: false,
      enum: null,
      default: null,
      minimum: 1,
      maximum: 50,
      min_length: null,
      max_length: null,
      pattern: null,
      items_type: null,
      ref_node_type: null,
      placeholder: null,
      format: null,
    },
    {
      key: 'data',
      type: 'date',
      title: 'Data',
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
      format: 'date',
    },
    {
      key: 'tags',
      type: 'array',
      title: 'Tags',
      description: null,
      required: false,
      enum: null,
      default: null,
      minimum: null,
      maximum: null,
      min_length: null,
      max_length: null,
      pattern: null,
      items_type: 'string',
      ref_node_type: null,
      placeholder: null,
      format: null,
    },
    {
      key: 'alvo',
      type: 'object_ref',
      title: 'Alvo',
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
      ref_node_type: 'pessoa',
      placeholder: null,
      format: null,
    },
  ],
};

const SPACES = [{ id: 'sp-1', slug: 'investigacao', display_name: 'Investigação' }];
const PROJECTS = [
  {
    id: 'pj-1',
    tenant_id: 't',
    slug: 'aurora-2',
    display_name: 'Aurora-2',
    description: null,
    active: true,
    created_at: '',
  },
];

function defaultMocks() {
  api.ActionTypes.list.mockResolvedValue([ACTION]);
  api.ActionTypes.executions.mockResolvedValue([]);
  api.ActionTypes.formSchema.mockResolvedValue(SCHEMA);
  api.ActionTypes.validateInput.mockResolvedValue({ valid: true, errors: [] });
  api.ActionTypes.plan.mockResolvedValue({
    steps: [
      {
        action_id: ACTION.id,
        action_name: ACTION.name,
        will_execute: true,
        will_request_approval: false,
        deny_reason: null,
        requires_markings: ['SIGILOSO'],
        auto_approvable: true,
        input: {},
      },
    ],
    total: 1,
    will_execute: 1,
    will_request_approval: 0,
    will_deny: 0,
  });
  api.ActionTypes.execute.mockResolvedValue({
    execution_id: 'ex-1',
    status: 'SUCCESS',
    output: { ok: true },
    duration_ms: 12,
    lineage_event_id: 'lin-1',
  });
  api.Projects.list.mockResolvedValue(PROJECTS);
  api.Spaces.list.mockResolvedValue(SPACES);
  api.OntologyNodes.search.mockResolvedValue([
    { id: 'n-1', name: 'Aurora Pessoa', node_type: 'pessoa', description: null, property_keys: [] },
  ]);
}

async function openExecutor() {
  render(<AcoesPage />);
  await waitFor(() => expect(api.ActionTypes.list).toHaveBeenCalled());
  fireEvent.click(await screen.findByTestId(`acoes-exec-${ACTION.id}`));
  await waitFor(() => expect(api.ActionTypes.formSchema).toHaveBeenCalledWith(ACTION.id));
  // Wait for schema-driven form to actually render its first field.
  await screen.findByTestId('acao-field-placa');
}

describe('AcoesPage — Wave H.2 form dinâmico', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultMocks();
  });

  it('abre executor e busca form schema do backend', async () => {
    await openExecutor();
    expect(await screen.findByTestId('acao-form')).toBeInTheDocument();
  });

  it('renderiza field string com input text', async () => {
    await openExecutor();
    const field = await screen.findByTestId('acao-field-placa');
    expect(within(field).getByRole('textbox')).toBeInTheDocument();
    expect(field).toHaveTextContent(/Placa \*/);
  });

  it('renderiza field enum como select com options', async () => {
    await openExecutor();
    const field = await screen.findByTestId('acao-field-urgencia');
    const select = within(field).getByRole('combobox');
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'alta' } });
    expect((select as HTMLSelectElement).value).toBe('alta');
  });

  it('renderiza field boolean como checkbox', async () => {
    await openExecutor();
    const field = await screen.findByTestId('acao-field-ativo');
    expect(within(field).getByRole('checkbox')).toBeInTheDocument();
  });

  it('renderiza field integer com input type=number e min/max', async () => {
    await openExecutor();
    const field = await screen.findByTestId('acao-field-raio_km');
    const input = within(field).getByRole('spinbutton') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('1');
    expect(input.max).toBe('50');
  });

  it('renderiza field date com input type=date', async () => {
    await openExecutor();
    const field = await screen.findByTestId('acao-field-data');
    const input = field.querySelector('input[type=date]');
    expect(input).not.toBeNull();
  });

  it('renderiza field array como tags input com Enter para adicionar', async () => {
    await openExecutor();
    const field = await screen.findByTestId('acao-field-tags');
    const input = within(field).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(field).getByText('foo')).toBeInTheDocument();
  });

  it('renderiza field object_ref e abre dialog de busca quando clicado', async () => {
    await openExecutor();
    const field = await screen.findByTestId('acao-field-alvo');
    const btn = within(field).getByTestId('acao-field-alvo-input-open');
    fireEvent.click(btn);
    const search = await screen.findByTestId('acao-field-alvo-input-search');
    fireEvent.change(search, { target: { value: 'aur' } });
    await waitFor(() => expect(api.OntologyNodes.search).toHaveBeenCalled());
  });

  it('bloqueia submit e mostra erros quando validate-input volta inválido', async () => {
    api.ActionTypes.validateInput.mockResolvedValueOnce({
      valid: false,
      errors: [{ key: 'placa', message: 'Campo obrigatório.' }],
    });
    await openExecutor();
    fireEvent.click(await screen.findByTestId('acao-exec-run'));
    expect(await screen.findByTestId('acao-form-errors')).toBeInTheDocument();
    expect(api.ActionTypes.execute).not.toHaveBeenCalled();
    expect(screen.getByTestId('acao-field-placa-err')).toHaveTextContent(/Campo obrigatório/);
  });

  it('mostra dropdowns Espaço e Operação carregados', async () => {
    await openExecutor();
    expect(await screen.findByTestId('acao-context')).toBeInTheDocument();
    expect(screen.getByTestId('acao-space')).toBeInTheDocument();
    expect(screen.getByTestId('acao-project')).toBeInTheDocument();
    // Spaces e Projects vieram via dropdown
    expect(screen.getByText('Investigação')).toBeInTheDocument();
    expect(screen.getByText('Aurora-2')).toBeInTheDocument();
  });

  it('mostra bloco "Marcações exigidas" com checkmark quando atendidas', async () => {
    await openExecutor();
    const block = await screen.findByTestId('acao-markings');
    expect(within(block).getByTestId('acao-marking-SIGILOSO')).toHaveTextContent(/atendida/);
  });

  it('botão "Pedir ajuda ao AIP" abre o AipAssistSidebar com scope+resource', async () => {
    await openExecutor();
    fireEvent.click(await screen.findByTestId('acao-aip-open'));
    const sb = await screen.findByTestId('aip-sidebar');
    expect(sb).toHaveAttribute('data-scope', 'workshop');
    expect(sb).toHaveAttribute('data-resource', ACTION.id);
  });

  it('switch dry-run troca o botão para Plan e usa ActionTypes.plan', async () => {
    await openExecutor();
    fireEvent.click(await screen.findByTestId('acao-dryrun-toggle'));
    // Botão exec mudou para "Plan (dry-run)"
    expect(screen.getByTestId('acao-exec-plan')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('acao-exec-plan'));
    await waitFor(() => expect(api.ActionTypes.plan).toHaveBeenCalled());
    expect(await screen.findByTestId('acao-plan-result')).toBeInTheDocument();
  });

  it('executa a action via ActionTypes.execute quando dry-run desligado', async () => {
    await openExecutor();
    // Preencher campos required (não chamamos validate real)
    const placa = within(screen.getByTestId('acao-field-placa')).getByRole('textbox');
    fireEvent.change(placa, { target: { value: 'ABC-1234' } });
    const motivo = within(screen.getByTestId('acao-field-motivo')).getByRole('textbox');
    fireEvent.change(motivo, { target: { value: 'ronda' } });
    fireEvent.click(screen.getByTestId('acao-exec-run'));
    await waitFor(() => expect(api.ActionTypes.execute).toHaveBeenCalled());
    expect(await screen.findByTestId('acao-exec-result')).toHaveTextContent(/Sucesso/);
  });

  it('histórico abre dialog tabular com filtros + expand', async () => {
    api.ActionTypes.executions.mockResolvedValueOnce([
      {
        id: 'exec-1',
        status: 'SUCCESS',
        initiated_by: 'admin',
        duration_ms: 100,
        started_at: '2026-05-23T10:00:00Z',
        finished_at: '2026-05-23T10:00:01Z',
        input_payload: { placa: 'ABC-1234' },
        output_payload: { ok: true },
        lineage_event_id: 'lin-1',
      },
    ]);
    render(<AcoesPage />);
    await waitFor(() => expect(api.ActionTypes.list).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId(`acoes-history-${ACTION.id}`));
    expect(await screen.findByTestId('acao-history-table')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('acao-history-row-exec-1'));
    expect(await screen.findByTestId('acao-history-expand-exec-1')).toHaveTextContent(/ABC-1234/);
  });
});
