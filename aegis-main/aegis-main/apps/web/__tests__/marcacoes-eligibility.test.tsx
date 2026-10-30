/**
 * Onda R.1 — /painel-de-controle/marcacoes eligibility management tests.
 *
 * Cobertura:
 * - Cada marcação tem um botão "Elegibilidade" que abre o dialog.
 * - O dialog lista elegibilidade existente (Usuários E Grupos) em seções.
 * - O sujeito é escolhido por **dropdown** (select), NUNCA id em texto livre:
 *   toggle Usuário/Grupo troca a fonte do select (Iam.users / Groups.list).
 * - Conceder via GRUPO chama Markings.eligibility.grant com { group_id }.
 * - Conceder via USUÁRIO chama grant com { user_id }.
 * - Remover usuário/grupo chama revoke / revokeGroup.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// LOTE1 ELO PAGES (#7): a page virou redirect; o conteúdo (Vocabulário) foi
// extraído para este componente reusável, embutido na aba "Marcações" de /dados.
import { MarcacoesVocabWorkspace as MarcacoesPage } from '@/components/markings/marcacoes-vocab-workspace';

jest.mock('@/lib/api', () => ({
  Markings: {
    list: jest.fn(),
    usage: jest.fn(),
    categories: { list: jest.fn() },
    eligibility: {
      list: jest.fn(),
      grant: jest.fn(),
      revoke: jest.fn(),
      revokeGroup: jest.fn(),
    },
  },
  Iam: { users: { list: jest.fn() } },
  Groups: { list: jest.fn() },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));

const { Markings, Iam, Groups } = jest.requireMock('@/lib/api') as {
  Markings: Record<string, jest.Mock> & {
    categories: Record<string, jest.Mock>;
    eligibility: Record<string, jest.Mock>;
  };
  Iam: { users: Record<string, jest.Mock> };
  Groups: Record<string, jest.Mock>;
};

const marking = {
  id: 'mark-1',
  tenant_id: 't',
  slug: 'sigiloso',
  display_name: 'SIGILOSO',
  description: null,
  category_id: null,
  active: true,
  created_at: '',
};

const users = [
  { id: 'u-1', username: 'ana', display_name: 'Ana Lima', matricula: null, unidade: '', roles: [], enabled: true },
  { id: 'u-2', username: 'bia', display_name: 'Bia Souza', matricula: null, unidade: '', roles: [], enabled: true },
];

const groups = [
  { id: 'g-1', tenant_id: 't', name: 'Inteligência', description: '', member_count: 3, created_at: '', created_by: null },
  { id: 'g-2', tenant_id: 't', name: 'Plantão', description: '', member_count: 1, created_at: '', created_by: null },
];

describe('MarcacoesPage — eligibility (Onda R.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Markings.list.mockResolvedValue([marking]);
    Markings.usage.mockResolvedValue({ marking_id: 'mark-1', applied_count: 0 });
    Markings.categories.list.mockResolvedValue([]);
    // Existing eligibility: u-1 (user) + g-1 (group).
    Markings.eligibility.list.mockResolvedValue([
      { id: 'e-1', marking_id: 'mark-1', user_id: 'u-1', group_id: null, can_apply: true, granted_at: '' },
      { id: 'e-2', marking_id: 'mark-1', user_id: null, group_id: 'g-1', can_apply: false, granted_at: '' },
    ]);
    Markings.eligibility.grant.mockResolvedValue({});
    Markings.eligibility.revoke.mockResolvedValue(undefined);
    Markings.eligibility.revokeGroup.mockResolvedValue(undefined);
    Iam.users.list.mockResolvedValue(users);
    Groups.list.mockResolvedValue(groups);
  });

  const openDialog = async () => {
    render(<MarcacoesPage />);
    await screen.findByTestId('marcacoes-list');
    fireEvent.click(screen.getByTestId('marcacao-eligibility-sigiloso'));
    return screen.findByTestId('marcacoes-eligibility-dialog');
  };

  it('opens the eligibility dialog from the marking row', async () => {
    const dialog = await openDialog();
    expect(dialog).toBeInTheDocument();
  });

  it('lists existing user and group eligibilities in separate sections', async () => {
    await openDialog();
    expect(await screen.findByTestId('marcacoes-eligibility-user-u-1')).toBeInTheDocument();
    expect(await screen.findByTestId('marcacoes-eligibility-group-g-1')).toBeInTheDocument();
  });

  it('selects subject via a DROPDOWN (no free-text id) for both user and group', async () => {
    await openDialog();
    const select = (await screen.findByTestId('marcacoes-eligibility-select')) as HTMLSelectElement;
    // Must be a <select>, not a text input.
    expect(select.tagName).toBe('SELECT');

    // Default kind = user → candidates exclude the already-eligible u-1, offer u-2.
    await waitFor(() => {
      const opts = Array.from(select.options).map((o) => o.value);
      expect(opts).toContain('u-2');
      expect(opts).not.toContain('u-1');
    });

    // Toggle to group → candidates exclude already-eligible g-1, offer g-2.
    fireEvent.click(screen.getByTestId('marcacoes-eligibility-kind-group'));
    await waitFor(() => {
      const opts = Array.from(
        (screen.getByTestId('marcacoes-eligibility-select') as HTMLSelectElement).options,
      ).map((o) => o.value);
      expect(opts).toContain('g-2');
      expect(opts).not.toContain('g-1');
    });
  });

  it('grants eligibility to a GROUP via the dropdown', async () => {
    await openDialog();
    fireEvent.click(screen.getByTestId('marcacoes-eligibility-kind-group'));
    const select = screen.getByTestId('marcacoes-eligibility-select') as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(select.options).map((o) => o.value)).toContain('g-2'),
    );
    fireEvent.change(select, { target: { value: 'g-2' } });
    fireEvent.click(screen.getByTestId('marcacoes-eligibility-grant'));
    await waitFor(() =>
      expect(Markings.eligibility.grant).toHaveBeenCalledWith(
        'mark-1',
        expect.objectContaining({ group_id: 'g-2' }),
      ),
    );
    // group grant must NOT smuggle a user_id.
    expect(Markings.eligibility.grant.mock.calls[0][1]).not.toHaveProperty('user_id');
  });

  it('grants eligibility to a USER via the dropdown (with can_apply)', async () => {
    await openDialog();
    const select = (await screen.findByTestId('marcacoes-eligibility-select')) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(select.options).map((o) => o.value)).toContain('u-2'),
    );
    fireEvent.change(select, { target: { value: 'u-2' } });
    fireEvent.click(screen.getByTestId('marcacoes-eligibility-can-apply'));
    fireEvent.click(screen.getByTestId('marcacoes-eligibility-grant'));
    await waitFor(() =>
      expect(Markings.eligibility.grant).toHaveBeenCalledWith('mark-1', {
        user_id: 'u-2',
        can_apply: true,
      }),
    );
  });

  it('removes a user and a group eligibility', async () => {
    await openDialog();
    fireEvent.click(await screen.findByTestId('marcacoes-eligibility-user-remove-u-1'));
    await waitFor(() =>
      expect(Markings.eligibility.revoke).toHaveBeenCalledWith('mark-1', 'u-1'),
    );
    fireEvent.click(await screen.findByTestId('marcacoes-eligibility-group-remove-g-1'));
    await waitFor(() =>
      expect(Markings.eligibility.revokeGroup).toHaveBeenCalledWith('mark-1', 'g-1'),
    );
  });

  it('resolves subject display names from the loaded lists', async () => {
    await openDialog();
    const userRow = await screen.findByTestId('marcacoes-eligibility-user-u-1');
    expect(within(userRow).getByText('Ana Lima')).toBeInTheDocument();
    const groupRow = await screen.findByTestId('marcacoes-eligibility-group-g-1');
    expect(within(groupRow).getByText('Inteligência')).toBeInTheDocument();
  });
});
