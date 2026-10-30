/**
 * Sprint L7 — Object Action Button widget.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ObjectActionButton } from '@/components/workshop/widgets/object-action-button';
import { ActionTypes } from '@/lib/api';

// Mock ActionTypes do api/index — execute + plan
jest.mock('@/lib/api', () => ({
  ActionTypes: {
    execute: jest.fn(),
    plan: jest.fn(),
  },
}));

type RP = Parameters<typeof ObjectActionButton>[0];

function renderBtn(
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
  return render(<ObjectActionButton {...props} />);
}

describe('object_action_button widget — Sprint L7', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when action_id not set', () => {
    renderBtn({});
    expect(
      screen.getByTestId('object-action-button-empty'),
    ).toBeInTheDocument();
  });

  it('renders button with label when action_id set', () => {
    renderBtn({ action_id: 'a-1', label: 'Aprovar caso' });
    expect(
      screen.getByTestId('object-action-button-trigger'),
    ).toHaveTextContent('Aprovar caso');
  });

  it('calls ActionTypes.execute without confirm and emits success', async () => {
    const emit = jest.fn();
    const exec = ActionTypes.execute as jest.Mock;
    exec.mockResolvedValueOnce({
      execution_id: 'ex-1',
      status: 'SUCCESS',
      output: { ok: true },
      duration_ms: 42,
      lineage_event_id: 'le-1',
    });
    renderBtn(
      { action_id: 'a-1', label: 'Go', input: { foo: 'bar' } },
      {},
      emit,
    );
    fireEvent.click(screen.getByTestId('object-action-button-trigger'));
    await waitFor(() =>
      expect(exec).toHaveBeenCalledWith('a-1', { foo: 'bar' }, undefined),
    );
    await waitFor(() =>
      expect(emit).toHaveBeenCalledWith(
        'action.execute.success',
        expect.objectContaining({ action_id: 'a-1', execution_id: 'ex-1' }),
      ),
    );
  });

  it('resolves input from variables when input_source is set', async () => {
    const exec = ActionTypes.execute as jest.Mock;
    exec.mockResolvedValueOnce({
      execution_id: 'ex-2',
      status: 'SUCCESS',
      output: {},
      duration_ms: 1,
      lineage_event_id: null,
    });
    renderBtn(
      { action_id: 'a-2', input_source: 'payload' },
      { payload: { x: 1, y: 2 } },
    );
    fireEvent.click(screen.getByTestId('object-action-button-trigger'));
    await waitFor(() =>
      expect(exec).toHaveBeenCalledWith('a-2', { x: 1, y: 2 }, undefined),
    );
  });

  it('shows plan preview when confirm=true', async () => {
    const plan = ActionTypes.plan as jest.Mock;
    plan.mockResolvedValueOnce({
      steps: [
        {
          action_id: 'a-1',
          action_name: 'Aprovar',
          will_execute: true,
          will_request_approval: false,
          deny_reason: null,
          requires_markings: [],
          auto_approvable: true,
          input: {},
        },
      ],
      total: 1,
      will_execute: 1,
      will_request_approval: 0,
      will_deny: 0,
    });
    renderBtn({ action_id: 'a-1', confirm: true });
    fireEvent.click(screen.getByTestId('object-action-button-trigger'));
    await waitFor(() =>
      expect(screen.getByTestId('object-action-button-plan')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('object-action-button-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('object-action-button-cancel')).toBeInTheDocument();
  });

  it('emits error on failure', async () => {
    const emit = jest.fn();
    const exec = ActionTypes.execute as jest.Mock;
    exec.mockRejectedValueOnce(new Error('boom'));
    renderBtn({ action_id: 'a-1' }, {}, emit);
    fireEvent.click(screen.getByTestId('object-action-button-trigger'));
    await waitFor(() =>
      expect(screen.getByTestId('object-action-button-error')).toHaveTextContent(
        /boom/,
      ),
    );
    expect(emit).toHaveBeenCalledWith(
      'action.execute.error',
      expect.objectContaining({ action_id: 'a-1' }),
    );
  });

  it('writes result_target binding when configured', async () => {
    const setBinding = jest.fn();
    const exec = ActionTypes.execute as jest.Mock;
    exec.mockResolvedValueOnce({
      execution_id: 'ex-3',
      status: 'SUCCESS',
      output: { winner: 'A' },
      duration_ms: 1,
      lineage_event_id: null,
    });
    renderBtn(
      { action_id: 'a-3', result_target: 'last_output' },
      {},
      undefined,
      setBinding,
    );
    fireEvent.click(screen.getByTestId('object-action-button-trigger'));
    await waitFor(() =>
      expect(setBinding).toHaveBeenCalledWith('last_output', { winner: 'A' }),
    );
  });
});
