/**
 * Sprint L7 — Query Result widget.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { QueryResult } from '@/components/workshop/widgets/query-result';
import { AipLogic } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  AipLogic: {
    invoke: jest.fn(),
  },
}));

type RP = Parameters<typeof QueryResult>[0];

function renderQr(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
  emit?: jest.Mock,
  setBinding?: jest.Mock,
) {
  const props = {
    config,
    variables,
    bindings: {},
    appId: 'test-app',
    setBinding: setBinding ?? jest.fn(),
    emit: emit ?? jest.fn(),
  } as unknown as RP;
  return render(<QueryResult {...props} />);
}

describe('query_result widget — Sprint L7', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when function_id is missing', () => {
    renderQr({});
    expect(screen.getByTestId('query-result-empty')).toBeInTheDocument();
  });

  it('auto-runs on mount when function_id set and auto_run=true', async () => {
    const invoke = AipLogic.invoke as jest.Mock;
    invoke.mockResolvedValueOnce({
      function_id: 'fn-1',
      output: 'risk:high',
      version: 3,
      few_shot_count: 0,
    });
    renderQr({ function_id: 'fn-1', auto_run: true });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('fn-1', {}));
    await waitFor(() =>
      expect(screen.getByTestId('query-result-output')).toHaveTextContent(
        'risk:high',
      ),
    );
  });

  it('does NOT auto-run when auto_run=false', () => {
    const invoke = AipLogic.invoke as jest.Mock;
    renderQr({ function_id: 'fn-1', auto_run: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('runs when user clicks the play button', async () => {
    const invoke = AipLogic.invoke as jest.Mock;
    invoke.mockResolvedValueOnce({
      function_id: 'fn-2',
      output: 'classified',
      version: 1,
      few_shot_count: 0,
    });
    renderQr({ function_id: 'fn-2', auto_run: false });
    fireEvent.click(screen.getByTestId('query-result-run'));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
  });

  it('resolves inputs from inputs_source variable', async () => {
    const invoke = AipLogic.invoke as jest.Mock;
    invoke.mockResolvedValueOnce({
      function_id: 'fn-3',
      output: 'ok',
      version: 1,
      few_shot_count: 0,
    });
    renderQr(
      { function_id: 'fn-3', auto_run: true, inputs_source: 'payload' },
      { payload: { q: 'incêndio', region: 'SP' } },
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('fn-3', {
        q: 'incêndio',
        region: 'SP',
      }),
    );
  });

  it('renders error state on rejection', async () => {
    const invoke = AipLogic.invoke as jest.Mock;
    invoke.mockRejectedValueOnce(new Error('500 server error'));
    renderQr({ function_id: 'fn-x', auto_run: true });
    await waitFor(() =>
      expect(screen.getByTestId('query-result-error')).toHaveTextContent(
        /500 server error/,
      ),
    );
  });

  it('writes result_target binding when configured', async () => {
    const setBinding = jest.fn();
    const invoke = AipLogic.invoke as jest.Mock;
    invoke.mockResolvedValueOnce({
      function_id: 'fn-r',
      output: 'predicted',
      version: 2,
      few_shot_count: 0,
    });
    renderQr(
      { function_id: 'fn-r', auto_run: true, result_target: 'pred' },
      {},
      undefined,
      setBinding,
    );
    await waitFor(() =>
      expect(setBinding).toHaveBeenCalledWith('pred', 'predicted'),
    );
  });
});
