/**
 * Análises — redesign visual (2026-05-24).
 *
 * Modo Simples (default): frase montável (resumo + filtros) → resultado grande.
 * Modo Avançado: editor 3-painéis completo (paleta · canvas · pré-visualização).
 * Ambos editam o mesmo programa (signature.blocks) e a mesma engine.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LogicEditorPage from '@/app/painel-de-controle/logic-editor/page';

jest.mock('@/lib/api', () => ({
  AIPLogicFunctions: {
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
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

const { AIPLogicFunctions } = jest.requireMock('@/lib/api') as {
  AIPLogicFunctions: Record<string, jest.Mock>;
};

const fakeFn = {
  id: 'fn-1',
  slug: 'triage.security',
  display_name: 'Triagem · security',
  description: 'descricao',
  prompt: 'Resposta JSON: {{input}}',
  // Programa simples-representável: 1 filtro, sem resumo.
  signature: {
    blocks: [{ type: 'filter', path: 'kind', op: 'eq', value: 'alpha' }],
  },
  markings: [],
  version: 1,
  active: true,
  project_id: null,
  created_at: '2026-05-23T10:00:00Z',
  updated_at: null,
};

function switchToAdvanced() {
  fireEvent.click(screen.getByTestId('analises-mode-avancado'));
}

describe('AnálisesPage — redesign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AIPLogicFunctions.list.mockResolvedValue([fakeFn]);
    AIPLogicFunctions.get.mockResolvedValue(fakeFn);
    AIPLogicFunctions.update.mockResolvedValue(fakeFn);
  });

  // ─────────────────── Modo Simples (default) ───────────────────
  it('renders the simple sentence builder by default', async () => {
    render(<LogicEditorPage />);
    expect(screen.getByTestId('logic-editor-page')).toBeInTheDocument();
    expect(screen.getByTestId('analise-builder')).toBeInTheDocument();
    expect(screen.getByTestId('analise-summary')).toBeInTheDocument();
    await waitFor(() => expect(AIPLogicFunctions.list).toHaveBeenCalled());
  });

  it('counts all sample records via the "Contar tudo" template', async () => {
    render(<LogicEditorPage />);
    fireEvent.click(screen.getByTestId('analise-template-contar-tudo'));
    fireEvent.click(screen.getByTestId('analise-run'));
    await waitFor(() =>
      expect(screen.getByTestId('analise-result-value')).toHaveTextContent('3'),
    );
  });

  it('adds a filter and counts only matching records', async () => {
    render(<LogicEditorPage />);
    fireEvent.click(screen.getByTestId('analise-template-contar-tudo'));
    fireEvent.click(screen.getByTestId('analise-add-filter'));
    fireEvent.change(screen.getByTestId('analise-filter-0-campo'), {
      target: { value: 'kind' },
    });
    fireEvent.change(screen.getByTestId('analise-filter-0-valor'), {
      target: { value: 'alpha' },
    });
    fireEvent.click(screen.getByTestId('analise-run'));
    await waitFor(() =>
      expect(screen.getByTestId('analise-result-value')).toHaveTextContent('2'),
    );
  });

  it('sums a numeric field across the sample', async () => {
    render(<LogicEditorPage />);
    fireEvent.click(screen.getByTestId('analise-template-somar-campo'));
    fireEvent.change(screen.getByTestId('analise-field'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByTestId('analise-run'));
    // x = 1 + 2 + 3 = 6
    await waitFor(() =>
      expect(screen.getByTestId('analise-result-value')).toHaveTextContent('6'),
    );
  });

  it('shows an error when the sample data is invalid JSON', async () => {
    render(<LogicEditorPage />);
    fireEvent.click(screen.getByTestId('analise-template-contar-tudo'));
    fireEvent.change(screen.getByTestId('analise-sample'), {
      target: { value: 'not valid json' },
    });
    fireEvent.click(screen.getByTestId('analise-run'));
    await waitFor(() =>
      expect(screen.getByTestId('analise-run-error')).toBeInTheDocument(),
    );
  });

  it('loads a simple-representable analysis into the simple builder', async () => {
    render(<LogicEditorPage />);
    await waitFor(() => expect(AIPLogicFunctions.list).toHaveBeenCalled());
    await act(async () => {
      fireEvent.change(screen.getByTestId('logic-editor-fn-select'), {
        target: { value: fakeFn.id },
      });
    });
    await waitFor(() => expect(AIPLogicFunctions.get).toHaveBeenCalledWith(fakeFn.id));
    await waitFor(() =>
      expect(screen.getByTestId('analise-filter-0-campo')).toBeInTheDocument(),
    );
    expect(
      (screen.getByTestId('analise-filter-0-campo') as HTMLInputElement).value,
    ).toBe('kind');
  });

  it('saves the program back into signature.blocks via PUT', async () => {
    render(<LogicEditorPage />);
    await waitFor(() => expect(AIPLogicFunctions.list).toHaveBeenCalled());
    await act(async () => {
      fireEvent.change(screen.getByTestId('logic-editor-fn-select'), {
        target: { value: fakeFn.id },
      });
    });
    await waitFor(() => expect(AIPLogicFunctions.get).toHaveBeenCalled());
    // fakeFn carrega no modo simples (1 filtro) — adiciona outro e salva.
    fireEvent.click(screen.getByTestId('analise-add-filter'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('logic-editor-save'));
    });
    await waitFor(() => expect(AIPLogicFunctions.update).toHaveBeenCalled());
    const updateCall = AIPLogicFunctions.update.mock.calls[0];
    expect(updateCall[0]).toBe(fakeFn.id);
    expect(
      (updateCall[1].signature as { blocks: { type: string }[] }).blocks.length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('logic-editor-save-ok')).toBeInTheDocument();
  });

  // ─────────────────── Modo Avançado ───────────────────
  it('switches to the advanced 3-pane editor with all 4 palette steps', () => {
    render(<LogicEditorPage />);
    switchToAdvanced();
    expect(screen.getByTestId('logic-editor-palette')).toBeInTheDocument();
    expect(screen.getByTestId('logic-editor-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('logic-editor-inspector')).toBeInTheDocument();
    expect(screen.getByTestId('palette-filter')).toBeInTheDocument();
    expect(screen.getByTestId('palette-map')).toBeInTheDocument();
    expect(screen.getByTestId('palette-aggregate')).toBeInTheDocument();
    expect(screen.getByTestId('palette-branch')).toBeInTheDocument();
  });

  it('adds Filter + Aggregate in advanced and runs producing output=2', async () => {
    render(<LogicEditorPage />);
    switchToAdvanced();
    fireEvent.click(screen.getByTestId('palette-add-filter'));
    fireEvent.change(screen.getByTestId('block-0-path'), { target: { value: 'kind' } });
    fireEvent.change(screen.getByTestId('block-0-value'), { target: { value: 'alpha' } });
    fireEvent.click(screen.getByTestId('palette-add-aggregate'));
    fireEvent.click(screen.getByTestId('logic-editor-run'));
    await waitFor(() =>
      expect(screen.getByTestId('logic-editor-output')).toHaveTextContent('2'),
    );
    expect(screen.getByTestId('trace-0')).toBeInTheDocument();
    expect(screen.getByTestId('trace-1')).toBeInTheDocument();
  });

  it('removes a block in advanced', async () => {
    render(<LogicEditorPage />);
    switchToAdvanced();
    fireEvent.click(screen.getByTestId('palette-add-map'));
    await screen.findByTestId('block-0');
    fireEvent.click(screen.getByTestId('block-remove-0'));
    expect(screen.queryByTestId('block-0')).not.toBeInTheDocument();
  });

  it('reorders blocks via up/down in advanced (readable labels)', () => {
    render(<LogicEditorPage />);
    switchToAdvanced();
    fireEvent.click(screen.getByTestId('palette-add-filter'));
    fireEvent.click(screen.getByTestId('palette-add-map'));
    expect(screen.getByTestId('block-0')).toHaveTextContent('Manter apenas');
    expect(screen.getByTestId('block-1')).toHaveTextContent('Extrair');
    fireEvent.click(screen.getByTestId('block-down-0'));
    expect(screen.getByTestId('block-0')).toHaveTextContent('Extrair');
    expect(screen.getByTestId('block-1')).toHaveTextContent('Manter apenas');
  });

  it('renders then-arm + else-arm sub-canvas inside a Branch in advanced', async () => {
    render(<LogicEditorPage />);
    switchToAdvanced();
    fireEvent.click(screen.getByTestId('palette-add-branch'));
    await screen.findByTestId('block-0');
    expect(screen.getByTestId('block-0-then')).toBeInTheDocument();
    expect(screen.getByTestId('block-0-else')).toBeInTheDocument();
  });

  it('allows adding a nested Filter inside the then-arm and running it', async () => {
    render(<LogicEditorPage />);
    switchToAdvanced();
    fireEvent.click(screen.getByTestId('palette-add-branch'));
    await screen.findByTestId('block-0-then');

    const pathInputs = screen.getAllByTestId(/^block-\d+-path$/);
    fireEvent.change(pathInputs[0], { target: { value: 'length' } });
    const opSelects = screen.getAllByTestId(/^block-\d+-op$/);
    fireEvent.change(opSelects[0], { target: { value: 'gt' } });
    const valueInputs = screen.getAllByTestId(/^block-\d+-value$/);
    fireEvent.change(valueInputs[0], { target: { value: '0' } });

    fireEvent.click(screen.getByTestId('block-0-then-add-filter'));
    await screen.findByTestId('block-0-then-block-0');

    const nestedBlock = screen.getByTestId('block-0-then-block-0');
    const nestedPath = nestedBlock.querySelector('[data-testid$="-path"]') as HTMLInputElement;
    const nestedOp = nestedBlock.querySelector('[data-testid$="-op"]') as HTMLSelectElement;
    const nestedValue = nestedBlock.querySelector('[data-testid$="-value"]') as HTMLInputElement;
    fireEvent.change(nestedPath, { target: { value: 'kind' } });
    fireEvent.change(nestedOp, { target: { value: 'eq' } });
    fireEvent.change(nestedValue, { target: { value: 'alpha' } });

    fireEvent.click(screen.getByTestId('logic-editor-run'));
    await waitFor(() => {
      const out = screen.getByTestId('logic-editor-output');
      expect(out.textContent || '').toContain('alpha');
      expect(out.textContent || '').not.toContain('beta');
    });
  });
});
