/**
 * Onda L.6 — /painel-de-controle/grupos (IAM Groups) page tests.
 *
 * Cobertura:
 * - Renderiza a lista de grupos + member_count.
 * - Criar grupo chama Groups.create + recarrega.
 * - Estado vazio.
 * - Dialog de membros usa **dropdown de usuários** (select), nunca id livre.
 *   O select exclui usuários que já são membros e adiciona via Groups.members.add.
 * - Excluir grupo confirma + chama Groups.delete.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GruposPage from '@/app/painel-de-controle/grupos/page';

jest.mock('@/lib/api', () => ({
  Groups: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    members: {
      list: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
    },
  },
  Iam: {
    users: { list: jest.fn() },
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
// i18n passthrough — devolve a chave (suficiente pra asserts estruturais).
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));

const { Groups, Iam } = jest.requireMock('@/lib/api') as {
  Groups: Record<string, jest.Mock> & { members: Record<string, jest.Mock> };
  Iam: { users: Record<string, jest.Mock> };
};

const fakeGroup = {
  id: 'gggggggg-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  name: 'Plantão Noturno',
  description: 'Equipe da madrugada',
  member_count: 2,
  created_at: '2026-05-23T10:00:00Z',
  created_by: null,
};

const fakeUsers = [
  { id: 'u-1', username: 'ana', display_name: 'Ana Lima', matricula: null, unidade: '', roles: [], enabled: true },
  { id: 'u-2', username: 'bia', display_name: 'Bia Souza', matricula: null, unidade: '', roles: [], enabled: true },
];

describe('GruposPage — Onda L.6', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Groups.list.mockResolvedValue([fakeGroup]);
    Groups.create.mockResolvedValue({ ...fakeGroup, id: 'new-1', name: 'Novo' });
    Groups.delete.mockResolvedValue(undefined);
    Groups.members.list.mockResolvedValue([
      { user_id: 'u-1', username: 'ana', display_name: 'Ana Lima', added_at: '2026-05-23T11:00:00Z' },
    ]);
    Groups.members.add.mockResolvedValue({
      user_id: 'u-2', username: 'bia', display_name: 'Bia Souza', added_at: '2026-05-23T12:00:00Z',
    });
    Iam.users.list.mockResolvedValue(fakeUsers);
  });

  it('renders the group list with member count', async () => {
    render(<GruposPage />);
    expect(await screen.findByTestId('grupos-list')).toBeInTheDocument();
    expect(screen.getByText('Plantão Noturno')).toBeInTheDocument();
    expect(screen.getByTestId(`grupo-${fakeGroup.id}`)).toBeInTheDocument();
  });

  it('shows empty state when no groups', async () => {
    Groups.list.mockResolvedValue([]);
    render(<GruposPage />);
    expect(await screen.findByTestId('grupos-empty')).toBeInTheDocument();
  });

  it('creates a group via the form', async () => {
    render(<GruposPage />);
    await screen.findByTestId('grupos-list');
    fireEvent.click(screen.getByTestId('grupos-toggle-form'));
    fireEvent.change(screen.getByTestId('grupos-name'), {
      target: { value: 'Inteligência' },
    });
    fireEvent.click(screen.getByTestId('grupos-submit'));
    await waitFor(() =>
      expect(Groups.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Inteligência' }),
      ),
    );
  });

  it('manages members via a USER DROPDOWN (no free-text id)', async () => {
    render(<GruposPage />);
    await screen.findByTestId('grupos-list');
    fireEvent.click(screen.getByTestId(`grupo-manage-${fakeGroup.id}`));

    // The members dialog opens and loads members + users.
    const dialog = await screen.findByTestId('grupos-members-dialog');
    expect(dialog).toBeInTheDocument();

    // There must be a <select> (dropdown), NOT a text input for the user id.
    const select = (await screen.findByTestId('grupos-user-select')) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');

    // The dropdown excludes the user already in the group (u-1=ana) and
    // offers the non-member (u-2=bia).
    await waitFor(() => {
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toContain('u-2');
      expect(options).not.toContain('u-1');
    });

    // Select bia and add.
    fireEvent.change(select, { target: { value: 'u-2' } });
    fireEvent.click(screen.getByTestId('grupos-member-add'));
    await waitFor(() =>
      expect(Groups.members.add).toHaveBeenCalledWith(fakeGroup.id, 'u-2'),
    );
  });

  it('removes a member from the dialog', async () => {
    Groups.members.remove.mockResolvedValue(undefined);
    render(<GruposPage />);
    await screen.findByTestId('grupos-list');
    fireEvent.click(screen.getByTestId(`grupo-manage-${fakeGroup.id}`));
    await screen.findByTestId('grupos-members-dialog');
    fireEvent.click(await screen.findByTestId('grupo-member-remove-u-1'));
    await waitFor(() =>
      expect(Groups.members.remove).toHaveBeenCalledWith(fakeGroup.id, 'u-1'),
    );
  });

  it('deletes a group after confirm', async () => {
    render(<GruposPage />);
    await screen.findByTestId('grupos-list');
    fireEvent.click(screen.getByTestId(`grupo-delete-${fakeGroup.id}`));
    await waitFor(() => expect(Groups.delete).toHaveBeenCalledWith(fakeGroup.id));
  });
});
