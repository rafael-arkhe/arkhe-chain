/**
 * Sprint L4 — <AipAssistSidebar /> + <AipAssistTrigger />.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AipAssistSidebar } from '@/components/aip-assist/aip-assist-sidebar';
import { AipAssistTrigger } from '@/components/aip-assist/aip-assist-trigger';

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

// #9 — o FAB agora lê useAssistantPref().showFab. Mockamos o provider para
// controlar showFab por teste (hidden por default; shown quando ligado).
jest.mock('@/lib/assistant/assistant-pref-provider', () => ({
  useAssistantPref: jest.fn(() => ({
    showFab: false,
    setShowFab: jest.fn(),
    ready: true,
  })),
}));

const { apiFetch } = jest.requireMock('@/lib/api/client') as {
  apiFetch: jest.Mock;
};
const { useAssistantPref } = jest.requireMock(
  '@/lib/assistant/assistant-pref-provider',
) as { useAssistantPref: jest.Mock };

function setShowFab(showFab: boolean) {
  useAssistantPref.mockReturnValue({
    showFab,
    setShowFab: jest.fn(),
    ready: true,
  });
}

const fakeCtx = {
  id: 'c1',
  scope: 'workshop' as const,
  resource_id: null,
  title: 'Regras LAI',
  body: 'Validar classificação antes de exportar.',
  pinned: true,
  markings: [],
  created_at: '2026-05-23T10:00:00Z',
};

describe('<AipAssistSidebar />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockResolvedValue([fakeCtx]);
  });

  it('renders sidebar + scope label + ctx list', async () => {
    render(<AipAssistSidebar scope="workshop" onClose={() => undefined} />);
    expect(screen.getByTestId('aip-assist-sidebar')).toBeInTheDocument();
    expect(screen.getByText(/Workshop/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Regras LAI')).toBeInTheDocument(),
    );
  });

  it('asks via /suggest and renders answer', async () => {
    apiFetch
      .mockResolvedValueOnce([fakeCtx]) // initial list
      .mockResolvedValueOnce({
        scope: 'workshop',
        resource_id: null,
        question: 'O que fazer aqui?',
        context_used: ['c1'],
        answer: '[assist:workshop] O que fazer aqui?',
      });
    render(<AipAssistSidebar scope="workshop" onClose={() => undefined} />);
    fireEvent.change(screen.getByTestId('aip-assist-question'), {
      target: { value: 'O que fazer aqui?' },
    });
    fireEvent.click(screen.getByTestId('aip-assist-ask'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('aip-assist-answer')).toHaveTextContent(
      /assist:workshop/,
    );
  });

  it('adds a new pinned context', async () => {
    apiFetch
      .mockResolvedValueOnce([fakeCtx]) // initial
      .mockResolvedValueOnce({ ...fakeCtx, id: 'c2', title: 'novo' }) // create
      .mockResolvedValueOnce([fakeCtx, { ...fakeCtx, id: 'c2', title: 'novo' }]); // refresh
    render(<AipAssistSidebar scope="workshop" onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('aip-assist-toggle-add'));
    fireEvent.change(screen.getByTestId('aip-assist-new-title'), {
      target: { value: 'novo' },
    });
    fireEvent.change(screen.getByTestId('aip-assist-new-body'), {
      target: { value: 'corpo do contexto' },
    });
    fireEvent.click(screen.getByTestId('aip-assist-new-save'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/platform/v23/aip-assist',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('close button calls onClose', () => {
    const onClose = jest.fn();
    render(<AipAssistSidebar scope="global" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('aip-assist-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('<AipAssistTrigger />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockResolvedValue([]);
    setShowFab(true); // padrão dos testes de interação: FAB visível
  });

  it('#9 — hidden by default (showFab=false → FAB não renderiza)', () => {
    setShowFab(false);
    render(<AipAssistTrigger />);
    expect(screen.queryByTestId('aip-assist-trigger')).not.toBeInTheDocument();
  });

  it('#9 — shown when preference is on (showFab=true)', () => {
    setShowFab(true);
    render(<AipAssistTrigger />);
    expect(screen.getByTestId('aip-assist-trigger')).toBeInTheDocument();
  });

  it('renders FAB trigger', () => {
    render(<AipAssistTrigger />);
    expect(screen.getByTestId('aip-assist-trigger')).toBeInTheDocument();
  });

  it('opens sidebar on click', () => {
    render(<AipAssistTrigger />);
    expect(screen.queryByTestId('aip-assist-sidebar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('aip-assist-trigger'));
    expect(screen.getByTestId('aip-assist-sidebar')).toBeInTheDocument();
  });
});
