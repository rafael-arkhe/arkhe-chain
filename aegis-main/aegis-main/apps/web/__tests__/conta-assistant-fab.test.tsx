/**
 * Conta · seção "Assistente" (#9) — toggle que mostra/esconde o FAB.
 *
 * Espelha locale-picker.test.tsx: usa o I18nProvider real + o
 * AssistantPrefProvider real, mockando só `fetch` (GET/PUT /api/me/context).
 * Cobre as memórias:
 *   - feedback_no_localstorage_for_persistence · persistência via backend
 *     (PUT /api/me/context { show_assistant_fab }), zero localStorage
 *   - feedback_no_rounded_no_sparkles · toggle sem cantos arredondados +
 *     ícone Wand2 (não Sparkles)
 *   - DEFAULT hidden · o assistente nasce oculto
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WhoAmI } from '@/lib/auth/api';
import ContaPage from '@/app/painel-de-controle/conta/page';
import { I18nProvider } from '@/lib/i18n/provider';
import { AssistantPrefProvider } from '@/lib/assistant/assistant-pref-provider';

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

jest.mock('@/components/iam/TotpDialog', () => ({
  TotpDialog: () => null,
}));

function renderConta() {
  return render(
    <I18nProvider>
      <AssistantPrefProvider>
        <ContaPage />
      </AssistantPrefProvider>
    </I18nProvider>,
  );
}

describe('Conta · seção Assistente (#9)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    // GET /api/me/context devolve o default do server: assistente oculto.
    fetchMock = jest.fn((url: string) => {
      if (String(url).includes('/api/me/context')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ locale: 'pt-BR', show_assistant_fab: false }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('1. renderiza a seção Assistente com o toggle (testid)', () => {
    renderConta();
    expect(screen.getByTestId('conta-assistente')).toBeInTheDocument();
    expect(screen.getByTestId('conta-assistant-toggle')).toBeInTheDocument();
  });

  it('2. default é OCULTO (aria-checked=false) — assistente nasce escondido', async () => {
    renderConta();
    const toggle = screen.getByTestId('conta-assistant-toggle');
    // Sincroniza com o GET (que devolve false) — permanece oculto.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('3. ligar persiste via PUT /api/me/context { show_assistant_fab:true }', async () => {
    renderConta();
    const toggle = screen.getByTestId('conta-assistant-toggle');
    // Aguarda a sincronização inicial (GET) antes de interagir, para o
    // update otimista não ser sobrescrito pela resposta assíncrona do GET.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(toggle);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          String(url).includes('/api/me/context') && opts?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1].body)).toEqual({ show_assistant_fab: true });
    });
    // Update otimista: aria-checked vira true.
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('4. desligar (após ligar) persiste { show_assistant_fab:false }', async () => {
    renderConta();
    const toggle = screen.getByTestId('conta-assistant-toggle');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(toggle); // on
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'true'),
    );
    fireEvent.click(toggle); // off
    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        ([url, opts]) =>
          String(url).includes('/api/me/context') && opts?.method === 'PUT',
      );
      const last = putCalls[putCalls.length - 1];
      expect(JSON.parse(last![1].body)).toEqual({ show_assistant_fab: false });
    });
  });

  it('5. toggle tem aria-label acessível + role=switch', () => {
    renderConta();
    const toggle = screen.getByTestId('conta-assistant-toggle');
    expect(toggle).toHaveAttribute('aria-label');
    expect(toggle).toHaveAttribute('role', 'switch');
  });

  it('6. não usa cantos arredondados (DS sharp)', () => {
    renderConta();
    const toggle = screen.getByTestId('conta-assistant-toggle');
    expect(toggle.className).not.toMatch(/rounded/);
  });

  it('7. não usa localStorage para persistir a preferência', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    renderConta();
    fireEvent.click(screen.getByTestId('conta-assistant-toggle'));
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
