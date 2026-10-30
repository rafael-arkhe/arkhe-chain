/**
 * Wave D.1 — /painel-de-controle/scenarios branch isolation flow.
 *
 * Cobre o fluxo de sandbox: Preview → Criar branch → Commit/Discard.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScenariosPage from '@/app/painel-de-controle/scenarios/page';

jest.mock('@/lib/api', () => ({
  OntologyNodes: { search: jest.fn() },
  Scenarios: {
    preview: jest.fn(),
    merge: jest.fn(),
    list: jest.fn(),
    listMine: jest.fn(),
    createBranch: jest.fn(),
    getBranchOntology: jest.fn(),
    commitBranch: jest.fn(),
    discardBranch: jest.fn(),
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
// useConfirm mock — auto-aprovar para simplificar tests.
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => async () => true,
}));

const { Scenarios } = jest.requireMock('@/lib/api') as {
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
};

const NODE_ID = '00000000-0000-0000-0000-000000000aaa';
const SCENARIO_ID = 's-1';
const BRANCH_ID = 'b-1';

const fakePreview = {
  scenario_id: 's-pre',
  name: 'Cenário-X',
  description: '',
  summary: '1/1 nós encontrados; 1 alterações propostas.',
  hash: 'h' + '0'.repeat(63),
  diffs: [
    {
      node_id: NODE_ID,
      found: true,
      current_name: 'Original',
      current_kind: 'Suspect',
      props_diff: [{ key: 'risk', before: 1, after: 5, op: 'update' }],
      markings_before: [],
      markings_after: ['RESTRITO'],
      name_before: 'Original',
      name_after: 'Original',
    },
  ],
};

const fakeBranch = {
  branch_id: BRANCH_ID,
  scenario_id: SCENARIO_ID,
  status: 'active',
  ghost_patches: [{ node_id: NODE_ID, name: null, markings: ['RESTRITO'], props: { risk: 5 } }],
  created_at: '2026-05-23T11:00:00Z',
  merged_at: null,
  discarded_at: null,
  created_by: 'admin',
};

const fakeOntologyView = {
  branch_id: BRANCH_ID,
  scenario_id: SCENARIO_ID,
  status: 'active',
  nodes: [
    {
      node_id: NODE_ID,
      found: true,
      name: 'Original',
      node_type: 'Suspect',
      properties: { risk: 5 },
      markings: ['RESTRITO'],
    },
  ],
};

describe('ScenariosPage — Wave D.1 branch isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Scenarios.listMine.mockResolvedValue([]);
    Scenarios.preview.mockResolvedValue(fakePreview);
    Scenarios.createBranch.mockResolvedValue(fakeBranch);
    Scenarios.getBranchOntology.mockResolvedValue(fakeOntologyView);
    Scenarios.commitBranch.mockResolvedValue({
      branch_id: BRANCH_ID,
      scenario_id: SCENARIO_ID,
      status: 'merged',
      merged: 1,
      skipped: 0,
      events: ['e-1'],
    });
    Scenarios.discardBranch.mockResolvedValue({
      branch_id: BRANCH_ID,
      scenario_id: SCENARIO_ID,
      status: 'discarded',
    });
  });

  it('renders the "Criar branch" button after preview (instead of "Aplicar (Merge)")', async () => {
    render(<ScenariosPage />);
    await waitFor(() =>
      expect(screen.getByTestId('scenarios-page')).toBeInTheDocument(),
    );
    // node_id manual
    fireEvent.change(screen.getByTestId(/^patch-node-id-/), {
      target: { value: NODE_ID },
    });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    expect(
      screen.getByTestId('scenarios-create-branch-btn'),
    ).toBeInTheDocument();
    // Botão antigo de merge não existe mais
    expect(screen.queryByTestId('scenarios-merge-btn')).not.toBeInTheDocument();
  });

  it('creates a branch and loads the simulated ontology', async () => {
    render(<ScenariosPage />);
    await waitFor(() =>
      expect(screen.getByTestId('scenarios-page')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId(/^patch-node-id-/), {
      target: { value: NODE_ID },
    });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('scenarios-create-branch-btn'));
    await waitFor(() =>
      expect(Scenarios.createBranch).toHaveBeenCalled(),
    );
    expect(Scenarios.createBranch.mock.calls[0][0]).toBe('draft');
    await waitFor(() =>
      expect(Scenarios.getBranchOntology).toHaveBeenCalledWith(
        SCENARIO_ID,
        BRANCH_ID,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('branch-ontology')).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`branch-node-${NODE_ID}`)).toBeInTheDocument();
  });

  it('shows Commit + Discard buttons in the right panel while branch is active', async () => {
    render(<ScenariosPage />);
    await waitFor(() =>
      expect(screen.getByTestId('scenarios-page')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId(/^patch-node-id-/), {
      target: { value: NODE_ID },
    });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('scenarios-create-branch-btn'));
    await waitFor(() =>
      expect(Scenarios.getBranchOntology).toHaveBeenCalled(),
    );
    expect(screen.getByTestId('branch-commit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('branch-discard-btn')).toBeInTheDocument();
  });

  it('calls Scenarios.commitBranch when Commit is clicked', async () => {
    render(<ScenariosPage />);
    await waitFor(() =>
      expect(screen.getByTestId('scenarios-page')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId(/^patch-node-id-/), {
      target: { value: NODE_ID },
    });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('scenarios-create-branch-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('branch-commit-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('branch-commit-btn'));
    await waitFor(() =>
      expect(Scenarios.commitBranch).toHaveBeenCalledWith(
        SCENARIO_ID,
        BRANCH_ID,
      ),
    );
  });

  it('calls Scenarios.discardBranch when Discard is clicked', async () => {
    render(<ScenariosPage />);
    await waitFor(() =>
      expect(screen.getByTestId('scenarios-page')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId(/^patch-node-id-/), {
      target: { value: NODE_ID },
    });
    fireEvent.click(screen.getByTestId('scenarios-preview-btn'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('scenarios-create-branch-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('branch-discard-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('branch-discard-btn'));
    await waitFor(() =>
      expect(Scenarios.discardBranch).toHaveBeenCalledWith(
        SCENARIO_ID,
        BRANCH_ID,
      ),
    );
  });
});
