/**
 * Wave H.3 — Scenario Wizard "Modo Guiado" (4 passos).
 *
 * Cobre o wrapper UX que envelopa Scenarios.preview / createBranch /
 * commitBranch. Os endpoints REST são os mesmos do modo Avançado.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ScenariosPage from '@/app/painel-de-controle/scenarios/page';

jest.mock('@/lib/api', () => ({
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
    listMine: jest.Mock;
    createBranch: jest.Mock;
    commitBranch: jest.Mock;
  };
  OntologyNodes: { search: jest.Mock };
};

const fakeNode = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Alvo · operação Aurora',
  node_type: 'pessoa',
  description: null,
  property_keys: ['cpf'],
};

const fakePreview = {
  scenario_id: 'sc-wiz-1',
  name: 'Cenário Guiado',
  description: '',
  summary: '1/1 nós encontrados; 1 alteração proposta.',
  hash: 'abcdef0123456789' + 'cafebabe'.repeat(6),
  diffs: [
    {
      node_id: fakeNode.id,
      found: true,
      current_name: fakeNode.name,
      current_kind: 'pessoa',
      props_diff: [],
      markings_before: [],
      markings_after: ['RESTRITO'],
      name_before: fakeNode.name,
      name_after: fakeNode.name,
      deny_reason: null,
    },
  ],
};

function switchToWizard() {
  fireEvent.click(screen.getByTestId('scenarios-mode-wizard'));
}

describe('Wave H.3 — Scenarios Wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OntologyNodes.search.mockResolvedValue([fakeNode]);
    Scenarios.listMine.mockResolvedValue([]);
    Scenarios.preview.mockResolvedValue(fakePreview);
    Scenarios.createBranch.mockResolvedValue({
      branch_id: 'br-1',
      scenario_id: 'sc-wiz-1',
      status: 'active',
      ghost_patches: [],
      created_at: new Date().toISOString(),
    });
    Scenarios.commitBranch.mockResolvedValue({
      branch_id: 'br-1',
      scenario_id: 'sc-wiz-1',
      status: 'merged',
      merged: 1,
      skipped: 0,
      events: ['ev-1'],
    });
  });

  it('renders the mode toggle with two tabs', () => {
    render(<ScenariosPage />);
    expect(screen.getByTestId('scenarios-mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('scenarios-mode-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('scenarios-mode-advanced')).toBeInTheDocument();
  });

  it('switches to wizard and shows the 4-step stepper', () => {
    render(<ScenariosPage />);
    switchToWizard();
    expect(screen.getByTestId('scenario-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-stepper')).toBeInTheDocument();
    // 4 step pills
    expect(screen.getByTestId('wizard-step-1-pill')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-2-pill')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-3-pill')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-4-pill')).toBeInTheDocument();
  });

  it('step 1 starts active; back is disabled, next is disabled when no target', () => {
    render(<ScenariosPage />);
    switchToWizard();
    const step1 = screen.getByTestId('wizard-step-1-pill');
    expect(step1.getAttribute('data-active')).toBe('true');
    const back = screen.getByTestId('wizard-back') as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    const next = screen.getByTestId('wizard-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('searches and picks a target, then advances to step 2', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await waitFor(() => expect(OntologyNodes.search).toHaveBeenCalled());
    const pick = await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(pick);
    expect(screen.getByTestId(`wizard-target-${fakeNode.id}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-2-pill').getAttribute('data-active')).toBe('true');
  });

  it('shows the bulk template dropdown on step 2 with all 4 templates', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(screen.getByTestId(`wizard-target-pick-${fakeNode.id}`));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const sel = screen.getByTestId('wizard-bulk-template') as HTMLSelectElement;
    const opts = Array.from(sel.options).map((o) => o.value);
    expect(opts).toContain('elevar-restrito');
    expect(opts).toContain('marcar-operacional');
    expect(opts).toContain('reduzir-confianca');
    expect(opts).toContain('limpar-marcacoes');
  });

  it('applies a bulk template to all targets', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(screen.getByTestId(`wizard-target-pick-${fakeNode.id}`));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const sel = screen.getByTestId('wizard-bulk-template') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'elevar-restrito' } });
    fireEvent.click(screen.getByTestId('wizard-bulk-apply'));
    const mInput = screen.getByTestId(`wizard-markings-${fakeNode.id}`) as HTMLInputElement;
    expect(mInput.value).toBe('RESTRITO');
  });

  it('jumps to preview step and auto-computes the preview', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(screen.getByTestId(`wizard-target-pick-${fakeNode.id}`));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    expect(await screen.findByTestId('wizard-preview-list')).toBeInTheDocument();
    expect(screen.getByTestId(`wizard-diff-${fakeNode.id}`)).toBeInTheDocument();
  });

  it('shows the apply step gate with the danger button', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(screen.getByTestId(`wizard-target-pick-${fakeNode.id}`));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('wizard-go-apply'));
    expect(screen.getByTestId('wizard-step-apply')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-confirm-apply')).toBeInTheDocument();
  });

  it('calls createBranch + commitBranch when operator confirms', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(screen.getByTestId(`wizard-target-pick-${fakeNode.id}`));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(Scenarios.preview).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('wizard-go-apply'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-confirm-apply'));
      await Promise.resolve();
    });
    await waitFor(() => expect(Scenarios.createBranch).toHaveBeenCalled());
    await waitFor(() => expect(Scenarios.commitBranch).toHaveBeenCalled());
    expect(await screen.findByTestId('wizard-applied-banner')).toBeInTheDocument();
  });

  it('allows back navigation from step 2 to step 1', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(screen.getByTestId(`wizard-target-pick-${fakeNode.id}`));
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-2-pill').getAttribute('data-active')).toBe('true');
    fireEvent.click(screen.getByTestId('wizard-back'));
    expect(screen.getByTestId('wizard-step-1-pill').getAttribute('data-active')).toBe('true');
  });

  it('shows the persisted archive panel in wizard mode', async () => {
    Scenarios.listMine.mockResolvedValueOnce([
      {
        scenario_id: 'sc-old',
        name: 'Cenário velho',
        description: '',
        status: 'merged',
        merged_count: 1,
        skipped_count: 0,
        scenario_hash: 'h'.repeat(64),
        created_by: 'admin',
        created_at: new Date().toISOString(),
        merged_at: new Date().toISOString(),
      },
    ]);
    render(<ScenariosPage />);
    switchToWizard();
    await waitFor(() => expect(Scenarios.listMine).toHaveBeenCalled());
    expect(await screen.findByTestId('scenarios-wizard-history')).toBeInTheDocument();
    expect(screen.getByText('Cenário velho')).toBeInTheDocument();
  });

  it('lets operator return to advanced mode without losing archive state', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    expect(screen.getByTestId('scenario-wizard')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('scenarios-mode-advanced'));
    expect(screen.queryByTestId('scenario-wizard')).not.toBeInTheDocument();
    expect(screen.getByTestId('scenarios-builder')).toBeInTheDocument();
  });

  it('templates dropdown applies per-target template independently', async () => {
    render(<ScenariosPage />);
    switchToWizard();
    fireEvent.click(screen.getByTestId('wizard-target-search-btn'));
    await screen.findByTestId(`wizard-target-pick-${fakeNode.id}`);
    fireEvent.click(screen.getByTestId(`wizard-target-pick-${fakeNode.id}`));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const sel = screen.getByTestId(`wizard-template-${fakeNode.id}`) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'marcar-operacional' } });
    const m = screen.getByTestId(`wizard-markings-${fakeNode.id}`) as HTMLInputElement;
    expect(m.value).toBe('OPERACIONAL');
  });
});
