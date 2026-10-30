/**
 * M5-10 — /painel-de-controle/lineage vira deep-link estável.
 *
 * A rota NÃO some (feedback_no_deprecation_of_existing_code): redireciona
 * para a aba "Eventos" da página unificada `/painel-de-controle/grafo`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import LineagePage from '@/app/painel-de-controle/lineage/page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

describe('LineagePage (deep-link redirect)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redirects to the Eventos tab of the unified Mapa do Workflow', async () => {
    render(<LineagePage />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        '/painel-de-controle/grafo?aba=eventos',
      ),
    );
  });

  it('renders a loading placeholder while redirecting', () => {
    render(<LineagePage />);
    expect(screen.getByTestId('lineage-redirect')).toBeInTheDocument();
  });
});
