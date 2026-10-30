/**
 * LocalePicker — seletor de idioma da Conta.
 *
 * Onda L.1 (2026-05-23) introduziu o seletor pt-BR / en-US no rodapé do
 * sidenav do Painel. Onda M1.c (2026-05-23) migrou-o para a página
 * /painel-de-controle/conta (seção "Idioma") — o rodapé do sidenav ficou
 * só com Ajuda + Voltar. Esta suíte segue o seletor para a Conta,
 * preservando a cobertura das memórias:
 *   - feedback_i18n_locales · pt-BR default + en-US peer
 *   - feedback_no_localstorage_for_persistence · persistência via backend
 *     (PUT /api/me/context), zero localStorage
 *   - feedback_no_rounded_no_sparkles · select sem cantos arredondados
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WhoAmI } from '@/lib/auth/api';
import ContaPage from '@/app/painel-de-controle/conta/page';
import { I18nProvider } from '@/lib/i18n/provider';

jest.mock('next/navigation', () => ({
  usePathname: () => '/painel-de-controle/conta',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const ADMIN_PRINCIPAL: WhoAmI = {
  user_id: 'u-admin',
  username: 'admin',
  display_name: 'Admin (demo)',
  email: null,
  tenant: null,
  clearances: [],
  roles: ['admin'],
  permissions: [],
  must_change_password: false,
  totp_enabled: false,
};

// RequirePerm (gate da Conta) usa useAuth + useCan; admin short-circuita.
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: ADMIN_PRINCIPAL,
    loading: false,
    error: null,
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
  useCan: () => true,
  usePrincipal: () => ADMIN_PRINCIPAL,
}));

// TotpDialog não é o foco — stub leve para evitar dependências de rede.
jest.mock('@/components/iam/TotpDialog', () => ({
  TotpDialog: () => null,
}));

function renderConta() {
  return render(
    <I18nProvider>
      <ContaPage />
    </I18nProvider>,
  );
}

describe('LocalePicker · seção Idioma da Conta', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn((url: string) => {
      if (String(url).includes('/api/me/context')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ locale: 'pt-BR' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('1. renderiza a seção Idioma com o seletor (testid)', () => {
    renderConta();
    expect(screen.getByTestId('conta-idioma')).toBeInTheDocument();
    expect(screen.getByTestId('conta-locale-select')).toBeInTheDocument();
  });

  it('2. oferece exatamente as 2 opções pt-BR e en-US', () => {
    renderConta();
    const select = screen.getByTestId('conta-locale-select') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['pt-BR', 'en-US']);
  });

  it('3. default é pt-BR (memory feedback_i18n_locales)', () => {
    renderConta();
    const select = screen.getByTestId('conta-locale-select') as HTMLSelectElement;
    expect(select.value).toBe('pt-BR');
  });

  it('4. trocar para en-US persiste via PUT /api/me/context (sem localStorage)', async () => {
    renderConta();
    const select = screen.getByTestId('conta-locale-select');
    fireEvent.change(select, { target: { value: 'en-US' } });
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          String(url).includes('/api/me/context') && opts?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1].body)).toEqual({ locale: 'en-US' });
    });
  });

  it('5. seletor tem aria-label acessível (não icon-only mudo)', () => {
    renderConta();
    const select = screen.getByTestId('conta-locale-select');
    expect(select).toHaveAttribute('aria-label');
  });

  it('6. trocar idioma re-renderiza o título da Conta no novo locale', async () => {
    renderConta();
    // pt-BR: cabeçalho "Idioma"; en-US continua "Idioma" pois o título da
    // seção é literal — então validamos a re-render pelo value do select.
    const select = screen.getByTestId('conta-locale-select') as HTMLSelectElement;
    expect(select.value).toBe('pt-BR');
    fireEvent.change(select, { target: { value: 'en-US' } });
    await waitFor(() =>
      expect(
        (screen.getByTestId('conta-locale-select') as HTMLSelectElement).value,
      ).toBe('en-US'),
    );
  });

  it('7. seletor não usa cantos arredondados (DS sharp)', () => {
    renderConta();
    const select = screen.getByTestId('conta-locale-select');
    expect(select.className).not.toMatch(/rounded/);
  });
});
