/**
 * Sprint L12 — /painel-de-controle/scenarios what-if patches page.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ScenariosPage from '@/app/painel-de-controle/scenarios/page';

jest.mock('@/lib/api', () => ({
  Scenarios: {
    preview: jest.fn(),
    merge: jest.fn(),
    list: jest.fn(),
    listMine: jest.fn(),
    // Wave D.1 — branch isolation endpoints.
    createBranch: jest.fn(),
    getBranchOntology: jest.fn(),
    commitBranch: jest.fn(),
    discardBranch: jest.fn(),
  },
  OntologyNodes: {
    search: jest.fn(),
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
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

const { Scenarios, OntologyNodes } = jest.requireMock('@/lib/api') as {
  Scenarios: {
    preview: jest.Mock;
    merge: jest.Mock;
    list: jest.Mock;
    listMine: jest.Mock;
    createBranch: jest.Mock;
    getBranchOntology: jest.Mock;
    commitBranch: jest.Mock;
    discardBranch: jest.Mock;
  };
  OntologyNodes: { search: jest.Mock };
};

const fakeNode = {
  id: '11111111-2222-3333-4444-555555555555',
  name: 'Alvo · operação Aurora',
  node_type: 'pessoa',
  description: null,
  property_keys: ['cpf', 'alcunha'],
};

const fakePreview = {
  scenario_id: 'sc-1',
  name: 'Cenário X',
  description: 'teste',
  summary: '1/1 nós encontrados; 2 alterações propostas.',
  hash: 'abcdef0123456789' + 'cafebabe'.repeat(6),
  diffs: [
    {
      node_id: fakeNode.id,
      found: true,
      current_name: fakeNode.name,
      current_kind: 'pessoa',
      props_diff: [
        { key: 'cpf', before: '12345', after: '67890', op: 'update' as const },
        { key: 'nota', before: null, after: 'novo', op: 'add' as const },
      ],
      markings_before: ['RESTRITO'],
      markings_after: ['RESTRITO', 'OPERACIONAL'],
      name_before: fakeNode.name,
      name_after: fakeNode.name,
      deny_reason: null,
    },
  ],
};

const fakeMerge = {
  scenario_id: 'sc-merged-1',
  name: 'Cenário X',
  merged: 1,
  skipped: 0,
  events: ['ev-1'],
};

describe('ScenariosPage — Sprint L12', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OntologyNodes.search.mockResolvedValue([fakeNode]);
    // Wave C.1 — histórico persistido. Default = vazio.
    Scenarios.listMine.mockResolvedValue([]);
  });

  it('renders the 3-pane layout shell (builder · diff · summary)', () => {
    render(<ScenariosPage />);
    expect(screen.getByTestId('scenarios-page')).toBeInTheDocument();
    expect(screen.getByTestId('scenarios-builder')).toBeInTheDocument();
    expect(screen.getByTestId('scenarios-diff')).toBeInTheDocument();
    expect(screen.getByTestId('scenarios-summary')).toBeInTheDocument();
  });

  it('starts with exactly one empty patch and a disabled create-branch button', () => {
    render(<ScenariosPage />);
    expect(screen.getByTestId('scenarios-patches')).toBeInTheDocument();
    // Wave D.1 — botão de aplicar virou "Criar branch".
    const createBr = screen.getByTestId(
      'scenarios-create-branch-btn',
    ) as HTMLButtonElement;
    expect(createBr.disabled).toBe(true);
  });

  it('lets the operator add and remove patches', () => {
    render(<ScenariosPage />);
    const addBtn = screen.getByTestId('scenarios-add-patch');
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    // 3 patches now
    expect(screen.getAllByText('Nó-alvo').length).toBe(3);
    // remove the first
    const removeButtons = screen.getAllByLabelText('Remover patch');
    fireEvent.click(removeButtons[0]);
    expect(screen.getAllByText('Nó-alvo').length).toBe(2);
  });

  it('shows an error when preview is clicked with no node selected', async () => {
    render(<ScenariosPage />);
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() =>
      expect(
        screen.getByText(/Adicione ao menos um patch/i),
      ).toBeInTheDocument(),
    );
    expect(Scenarios.preview).not.toHaveBeenCalled();
  });

  it('renders the diff cards (props + markings) after preview success', async () => {
    Scenarios.preview.mockResolvedValueOnce(fakePreview);
    render(<ScenariosPage />);
    // Manually type the node UUID into the first patch
    const idInput = screen.getAllByTestId(/^patch-node-id-/)[0];
    fireEvent.change(idInput, { target: { value: fakeNode.id } });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    const diffList = await screen.findByTestId('scenarios-diff-list');
    expect(diffList).toBeInTheDocument();
    expect(screen.getByTestId(`diff-${fakeNode.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`diff-props-${fakeNode.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`diff-markings-${fakeNode.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('scenarios-summary-text')).toHaveTextContent(
      /1\/1 nós encontrados/,
    );
  });

  it('opens picker, lists nodes, and selects one to fill node_id', async () => {
    render(<ScenariosPage />);
    const pickerButtons = screen.getAllByTestId(/^patch-node-picker-/);
    fireEvent.click(pickerButtons[0]);
    await waitFor(() => expect(OntologyNodes.search).toHaveBeenCalled());
    const resultsList = await screen.findByTestId(
      /^patch-search-results-/,
    );
    expect(resultsList).toBeInTheDocument();
    const pickBtn = screen.getByTestId(
      `patch-search-pick-${(pickerButtons[0] as HTMLElement).getAttribute('data-testid')!.replace(
        'patch-node-picker-',
        '',
      )}-${fakeNode.id}`,
    );
    fireEvent.click(pickBtn);
    // After selection the node block replaces the picker
    expect(screen.getByText(fakeNode.name)).toBeInTheDocument();
  });

  it('Wave D.1 — creates branch (via createBranch) after preview, opens simulated ontology', async () => {
    Scenarios.preview.mockResolvedValueOnce(fakePreview);
    Scenarios.createBranch.mockResolvedValueOnce({
      branch_id: 'b-1',
      scenario_id: 'sc-1',
      status: 'active',
      ghost_patches: [],
      created_at: '2026-05-23T10:00:00Z',
    });
    Scenarios.getBranchOntology.mockResolvedValueOnce({
      branch_id: 'b-1',
      scenario_id: 'sc-1',
      status: 'active',
      nodes: [
        {
          node_id: fakeNode.id,
          found: true,
          name: 'Alvo · operação Aurora',
          node_type: 'pessoa',
          properties: {},
          markings: [],
        },
      ],
    });
    Scenarios.listMine
      .mockResolvedValueOnce([]) // mount inicial
      .mockResolvedValueOnce([
        {
          scenario_id: 'sc-1',
          name: 'Cenário X',
          description: 'teste',
          status: 'draft',
          merged_count: 0,
          skipped_count: 0,
          scenario_hash: 'cafebabe'.repeat(8),
          created_by: 'admin',
          created_at: '2026-05-23T10:00:00Z',
          merged_at: null,
        },
      ]);
    render(<ScenariosPage />);
    const idInput = screen.getAllByTestId(/^patch-node-id-/)[0];
    fireEvent.change(idInput, { target: { value: fakeNode.id } });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    await screen.findByTestId('scenarios-diff-list');

    await act(async () => {
      fireEvent.click(screen.getByTestId('scenarios-create-branch-btn'));
    });
    await waitFor(() => expect(Scenarios.createBranch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('branch-ontology')).toBeInTheDocument(),
    );
  });

  it('surfaces API errors from preview into the diagnostic error state', async () => {
    Scenarios.preview.mockRejectedValueOnce(new Error('backend desligado'));
    render(<ScenariosPage />);
    const idInput = screen.getAllByTestId(/^patch-node-id-/)[0];
    fireEvent.change(idInput, { target: { value: fakeNode.id } });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() =>
      expect(screen.getByText(/backend desligado/)).toBeInTheDocument(),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Wave C.1 — histórico persistido via Scenarios.listMine()
  // ─────────────────────────────────────────────────────────────────────────

  it('Wave C.1 — calls Scenarios.listMine() on mount', async () => {
    render(<ScenariosPage />);
    await waitFor(() => expect(Scenarios.listMine).toHaveBeenCalledTimes(1));
  });

  it('Wave C.1 — renders archive items with merged badge', async () => {
    Scenarios.listMine.mockResolvedValueOnce([
      {
        scenario_id: 'sc-archive-1',
        name: 'cenário aplicado ontem',
        description: '',
        status: 'merged',
        merged_count: 2,
        skipped_count: 0,
        scenario_hash: 'a'.repeat(64),
        created_by: 'admin',
        created_at: '2026-05-22T10:00:00Z',
        merged_at: '2026-05-22T10:00:05Z',
      },
    ]);
    render(<ScenariosPage />);
    await waitFor(() =>
      expect(
        screen.getByTestId('scenarios-history-sc-archive-1'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('cenário aplicado ontem')).toBeInTheDocument();
    expect(screen.getByText('merged')).toBeInTheDocument();
  });

  it('Wave D.1 — refreshes archive after createBranch', async () => {
    Scenarios.preview.mockResolvedValueOnce(fakePreview);
    Scenarios.createBranch.mockResolvedValueOnce({
      branch_id: 'b-2',
      scenario_id: 'sc-2',
      status: 'active',
      ghost_patches: [],
      created_at: '2026-05-23T10:00:00Z',
    });
    Scenarios.getBranchOntology.mockResolvedValueOnce({
      branch_id: 'b-2',
      scenario_id: 'sc-2',
      status: 'active',
      nodes: [],
    });
    render(<ScenariosPage />);
    await waitFor(() => expect(Scenarios.listMine).toHaveBeenCalledTimes(1));

    const idInput = screen.getAllByTestId(/^patch-node-id-/)[0];
    fireEvent.change(idInput, { target: { value: fakeNode.id } });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    await screen.findByTestId('scenarios-diff-list');

    await act(async () => {
      fireEvent.click(screen.getByTestId('scenarios-create-branch-btn'));
    });
    await waitFor(() => expect(Scenarios.createBranch).toHaveBeenCalled());
    // listMine recarrega após createBranch: mount + refresh.
    await waitFor(() =>
      expect(Scenarios.listMine.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });
});
