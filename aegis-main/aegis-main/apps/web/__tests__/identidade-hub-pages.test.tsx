/**
 * LOTE1 ELO PAGES (#4) — a barra de abas do hub IAM aparece nas pages
 * /painel-de-controle/grupos e /painel-de-controle/acessos-publicos.
 *
 * Essas rotas viraram abas do hub IAM, mas NÃO são servidas por app/iam/layout
 * (só /iam/* são). Cada page monta a MESMA barra (CpHubSubnav) — assim a
 * navegação por abas fica bidirecional. Aqui provamos que a barra (group +
 * 6 abas) renderiza em ambas as pages, sem mover as rotas.
 *
 * FIX ELO IAM (#2, 2026-06-28): o group do hub passou a ser o conciso
 * "Identidade" (sem duplicar o item de sidenav) → testid `cp-hub-subnav-identidade`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import GruposPage from '@/app/painel-de-controle/grupos/page';
import AcessosPublicosPage from '@/app/painel-de-controle/acessos-publicos/page';

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'], permissions: [] },
    loading: false,
  }),
  useCan: () => true,
}));
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
  confirmModal: () => Promise.resolve(true),
}));
jest.mock('@/lib/api', () => ({
  Groups: {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    members: { list: jest.fn(), add: jest.fn(), remove: jest.fn() },
    roles: { list: jest.fn(), replace: jest.fn() },
  },
  Iam: { users: { list: jest.fn().mockResolvedValue([]) } },
  GuestTokens: { list: jest.fn().mockResolvedValue([]), issue: jest.fn(), revoke: jest.fn() },
  ActionTypes: { list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

const SUBNAV = 'cp-hub-subnav-identidade';
const TAB_IDS = [
  'cp-hub-tab-equipe',
  'cp-hub-tab-grupos',
  'cp-hub-tab-papeis',
  'cp-hub-tab-permissoes',
  'cp-hub-tab-acessos-publicos',
  'cp-hub-tab-auditoria',
];

describe('LOTE1 ELO PAGES (#4) — barra do hub "Identidade" nas pages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Grupos monta a subnav do hub com as 6 abas', async () => {
    render(<GruposPage />);
    expect(await screen.findByTestId(SUBNAV)).toBeInTheDocument();
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // flush do carregamento assíncrono da lista
    const { Groups } = jest.requireMock('@/lib/api') as { Groups: { list: jest.Mock } };
    await waitFor(() => expect(Groups.list).toHaveBeenCalled());
  });

  it('Acessos públicos monta a subnav do hub com as 6 abas', async () => {
    render(<AcessosPublicosPage />);
    expect(await screen.findByTestId(SUBNAV)).toBeInTheDocument();
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    const { GuestTokens } = jest.requireMock('@/lib/api') as {
      GuestTokens: { list: jest.Mock };
    };
    await waitFor(() => expect(GuestTokens.list).toHaveBeenCalled());
  });
});
