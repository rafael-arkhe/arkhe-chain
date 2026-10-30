/**
 * Conta · seção "Dev (Safe Core)" (M3).
 *
 * Cobre só a seção nova; as seções Idioma/Identidade/Segurança não são
 * tocadas pela M3 (preservadas).
 *
 *  1. Render mostra status Inativo + input de senha quando dev-mode off.
 *  2. Ativar chama MeContextApi.enableDevMode(senha) + refresh().
 *  3. Senha errada (rejeição da API) mostra erro, não persiste senha.
 *  4. Com dev-mode ativo: mostra Ativo + TTL + botão Desativar.
 *  5. Desativar chama MeContextApi.disableDevMode() + refresh().
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContaPage from '@/app/painel-de-controle/conta/page';
import type { WhoAmI } from '@/lib/auth/api';

jest.mock('@/lib/api', () => ({
  MeContextApi: {
    enableDevMode: jest.fn(),
    disableDevMode: jest.fn(),
  },
}));

jest.mock('@/lib/auth/useAuth', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  return {
    __refresh: refresh,
    __setPrincipal: (p: unknown) => {
      (globalThis as Record<string, unknown>).__contaPrincipal = p;
    },
    useAuth: () => ({
      principal: (globalThis as Record<string, unknown>).__contaPrincipal,
      loading: false,
      refresh,
    }),
    useCan: () => true,
  };
});

const { MeContextApi } = jest.requireMock('@/lib/api') as {
  MeContextApi: { enableDevMode: jest.Mock; disableDevMode: jest.Mock };
};
const enableDevMode = MeContextApi.enableDevMode;
const disableDevMode = MeContextApi.disableDevMode;
const authMock = jest.requireMock('@/lib/auth/useAuth') as {
  __refresh: jest.Mock;
  __setPrincipal: (p: WhoAmI) => void;
};
const refresh = authMock.__refresh;
function setMockPrincipal(p: WhoAmI) {
  authMock.__setPrincipal(p);
}

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn() }),
}));

jest.mock('@/components/iam/TotpDialog', () => ({
  TotpDialog: () => null,
}));

function principal(overrides: Partial<WhoAmI> = {}): WhoAmI {
  return {
    user_id: 'u-1',
    username: 'vendoruser',
    display_name: 'Vendor',
    email: null,
    tenant: null,
    clearances: [],
    roles: ['vendor'],
    permissions: ['vendor.dev_mode'],
    must_change_password: false,
    totp_enabled: false,
    dev_mode: null,
    ...overrides,
  };
}

beforeEach(() => {
  enableDevMode.mockReset().mockResolvedValue({ enabled: true, until: '2999-01-01T00:00:00+00:00' });
  disableDevMode.mockReset().mockResolvedValue({ enabled: false, until: null });
  refresh.mockClear();
  setMockPrincipal(principal());
});

describe('Conta · seção Dev (Safe Core)', () => {
  it('mostra a seção Dev com status Inativo + input de senha', () => {
    render(<ContaPage />);
    expect(screen.getByTestId('conta-dev')).toBeInTheDocument();
    expect(screen.getByTestId('conta-dev-status')).toHaveTextContent('dev.statusOff');
    expect(screen.getByTestId('conta-dev-password')).toBeInTheDocument();
    expect(screen.getByTestId('conta-dev-activate')).toBeInTheDocument();
  });

  it('preserva as seções Idioma/Identidade/Segurança (não tocadas pela M3)', () => {
    render(<ContaPage />);
    expect(screen.getByTestId('conta-idioma')).toBeInTheDocument();
    expect(screen.getByTestId('conta-identidade')).toBeInTheDocument();
    expect(screen.getByTestId('conta-seguranca')).toBeInTheDocument();
  });

  it('ativar chama enableDevMode(senha) e refresh()', async () => {
    render(<ContaPage />);
    fireEvent.change(screen.getByTestId('conta-dev-password'), {
      target: { value: 'sekret' },
    });
    fireEvent.click(screen.getByTestId('conta-dev-activate'));
    await waitFor(() => expect(enableDevMode).toHaveBeenCalledWith('sekret'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('senha errada mostra erro e não quebra a UI', async () => {
    enableDevMode.mockRejectedValueOnce(new Error('403'));
    render(<ContaPage />);
    fireEvent.change(screen.getByTestId('conta-dev-password'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByTestId('conta-dev-activate'));
    await waitFor(() =>
      expect(screen.getByTestId('conta-dev-error')).toHaveTextContent('dev.badPassword'),
    );
  });

  it('com dev-mode ativo mostra status Ativo + botão Desativar', () => {
    setMockPrincipal(
      principal({ dev_mode: { enabled: true, until: '2999-01-01T00:00:00+00:00' } }),
    );
    render(<ContaPage />);
    expect(screen.getByTestId('conta-dev-status')).toHaveTextContent('dev.statusOn');
    expect(screen.getByTestId('conta-dev-deactivate')).toBeInTheDocument();
    // input de senha some quando já ativo.
    expect(screen.queryByTestId('conta-dev-password')).toBeNull();
  });

  it('desativar chama disableDevMode() e refresh()', async () => {
    setMockPrincipal(
      principal({ dev_mode: { enabled: true, until: '2999-01-01T00:00:00+00:00' } }),
    );
    render(<ContaPage />);
    fireEvent.click(screen.getByTestId('conta-dev-deactivate'));
    await waitFor(() => expect(disableDevMode).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
