/**
 * LOTE1 ELO PAGES (#7) — as rotas /marcacoes e /marcacoes-propriedade NÃO somem
 * (honra feedback_no_deprecation_of_existing_code): viram deep-links estáveis
 * que redirecionam para a aba "Marcações" do hub Dados, preservando a sub-view
 * "Por propriedade" via querystring.
 */
import { render, screen, waitFor } from '@testing-library/react';
import MarcacoesPage from '@/app/painel-de-controle/marcacoes/page';
import MarcacoesPropriedadePage from '@/app/painel-de-controle/marcacoes-propriedade/page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));

describe('LOTE1 ELO PAGES (#7) — redirects de Marcações', () => {
  beforeEach(() => jest.clearAllMocks());

  it('/marcacoes redireciona para a aba Marcações do hub Dados (Vocabulário)', async () => {
    render(<MarcacoesPage />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/painel-de-controle/dados?aba=marcacoes'),
    );
    expect(screen.getByTestId('marcacoes-redirect')).toBeInTheDocument();
  });

  it('/marcacoes-propriedade redireciona preservando a sub-view Por propriedade', async () => {
    render(<MarcacoesPropriedadePage />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        '/painel-de-controle/dados?aba=marcacoes&sub=propriedade',
      ),
    );
    expect(screen.getByTestId('marcacoes-propriedade-redirect')).toBeInTheDocument();
  });
});
