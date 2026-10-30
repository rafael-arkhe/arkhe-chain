/**
 * Sprint L7 — Search Input widget.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

import { SearchInput } from '@/components/workshop/widgets/search-input';

type RP = Parameters<typeof SearchInput>[0];

function renderSearch(
  config: Record<string, unknown>,
  bindings: Record<string, unknown> = {},
  emit?: jest.Mock,
  setBinding?: jest.Mock,
) {
  const props = {
    config,
    variables: {},
    bindings,
    appId: 'test-app',
    setBinding: setBinding ?? jest.fn(),
    emit: emit ?? jest.fn(),
  } as unknown as RP;
  return render(<SearchInput {...props} />);
}

describe('search_input widget — Sprint L7', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders empty state when target not set', () => {
    renderSearch({});
    expect(screen.getByTestId('search-input-empty')).toBeInTheDocument();
  });

  it('renders field when target is set', () => {
    renderSearch({ target: 'q' });
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-input-field-q')).toBeInTheDocument();
  });

  it('debounces and emits search.changed with trimmed value', async () => {
    const emit = jest.fn();
    const setBinding = jest.fn();
    renderSearch(
      { target: 'q', debounce_ms: 200 },
      {},
      emit,
      setBinding,
    );
    const input = screen.getByTestId('search-input-field-q') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  alvo  ' } });
    expect(setBinding).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    await waitFor(() =>
      expect(setBinding).toHaveBeenCalledWith('q', 'alvo'),
    );
    expect(emit).toHaveBeenCalledWith('search.changed', {
      value: 'alvo',
      target: 'q',
    });
  });

  it('does NOT emit when below min_length', async () => {
    const emit = jest.fn();
    const setBinding = jest.fn();
    renderSearch(
      { target: 'q', debounce_ms: 100, min_length: 4 },
      {},
      emit,
      setBinding,
    );
    const input = screen.getByTestId('search-input-field-q');
    fireEvent.change(input, { target: { value: 'ab' } });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(setBinding).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-input-hint')).toBeInTheDocument();
  });

  it('clears value when clear button clicked', () => {
    const emit = jest.fn();
    const setBinding = jest.fn();
    renderSearch(
      { target: 'q', debounce_ms: 0 },
      { q: 'old' },
      emit,
      setBinding,
    );
    const input = screen.getByTestId('search-input-field-q') as HTMLInputElement;
    expect(input.value).toBe('old');
    fireEvent.click(screen.getByTestId('search-input-clear-q'));
    expect(setBinding).toHaveBeenCalledWith('q', '');
    expect(emit).toHaveBeenCalledWith('search.changed', {
      value: '',
      target: 'q',
    });
  });

  it('hydrates from bindings on mount', () => {
    renderSearch({ target: 'q' }, { q: 'inicial' });
    const input = screen.getByTestId('search-input-field-q') as HTMLInputElement;
    expect(input.value).toBe('inicial');
  });
});
