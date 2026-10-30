/**
 * Sprint L1.10 — <DiagnosticButton /> + CpErrorState integration.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiagnosticButton } from '@/components/control-panel/diagnostic-button';
import { CpErrorState } from '@/components/control-panel/cp-skeleton';

jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

const { apiFetch } = jest.requireMock('@/lib/api/client') as {
  apiFetch: jest.Mock;
};

describe('<DiagnosticButton />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders trigger button with default label', () => {
    render(<DiagnosticButton status={500} path="/foo" />);
    expect(screen.getByTestId('diagnostic-button')).toHaveTextContent('Diagnosticar');
  });

  it('opens panel and calls aip-diagnostic on click', async () => {
    apiFetch.mockResolvedValueOnce({
      resumo: 'Erro interno no backend',
      causa_provavel: 'Falha não tratada do lado servidor.',
      acoes_sugeridas: ['Tente novamente'],
      referencias: [{ label: 'Atividade', href: '/painel-de-controle/atividade' }],
    });

    render(<DiagnosticButton status={500} method="POST" path="/foo" message="boom" />);
    fireEvent.click(screen.getByTestId('diagnostic-button'));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/platform/v23/aip-diagnostic/explain',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('diagnostic-content')).toBeInTheDocument(),
    );
    expect(screen.getByText('Erro interno no backend')).toBeInTheDocument();
    expect(screen.getByText(/Tente novamente/)).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-link')).toHaveTextContent('Atividade');
  });

  it('renders error if request fails', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network down'));
    render(<DiagnosticButton status={500} path="/foo" />);
    fireEvent.click(screen.getByTestId('diagnostic-button'));
    await waitFor(() =>
      expect(screen.getByTestId('diagnostic-error')).toHaveTextContent('network down'),
    );
  });
});

describe('<CpErrorState /> diagnostic prop', () => {
  it('does NOT render diagnostic button when diagnostic prop is absent', () => {
    render(<CpErrorState description="something failed" />);
    expect(screen.queryByTestId('diagnostic-button')).not.toBeInTheDocument();
  });

  it('renders diagnostic button when diagnostic prop is provided', () => {
    render(
      <CpErrorState
        description="something failed"
        diagnostic={{ status: 500, method: 'GET', path: '/foo' }}
      />,
    );
    expect(screen.getByTestId('diagnostic-button')).toBeInTheDocument();
  });
});
