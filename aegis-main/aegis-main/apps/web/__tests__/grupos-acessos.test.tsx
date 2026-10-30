/**
 * W6 — "Grupo concede acesso" (RolesDialog + toggles por experiência).
 *
 * Cobertura:
 * - O botão "Acessos" por grupo abre o RolesDialog.
 * - Toggle por experiência (AIP / Agentes / Soluções) → Groups.roles.replace
 *   com o id do papel `acesso_*` correto (nunca slug digitado).
 * - Checklist de papéis (rolesApi.list) atribui papéis ao grupo via
 *   Groups.roles.replace; os papéis `acesso_*` NÃO aparecem na checklist
 *   (ficam nos toggles).
 *
 * SEGURANÇA (memory): granularidade real é no backend (require_permission); a
 * UI só compõe a chamada PUT — aqui validamos o gesto/contrato do front.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GruposPage from '@/app/painel-de-controle/grupos/page';

jest.mock('@/lib/api', () => ({
  Groups: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    members: { list: jest.fn(), add: jest.fn(), remove: jest.fn() },
    roles: { list: jest.fn(), replace: jest.fn() },
  },
  Iam: { users: { list: jest.fn() } },
}));
jest.mock('@/lib/iam/api', () => ({
  rolesApi: { list: jest.fn() },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'gestor', roles: ['supervisor'] }, loading: false }),
  useCan: () => true,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));

const { Groups } = jest.requireMock('@/lib/api') as {
  Groups: Record<string, jest.Mock> & { roles: Record<string, jest.Mock> };
};
const { rolesApi } = jest.requireMock('@/lib/iam/api') as {
  rolesApi: Record<string, jest.Mock>;
};

const fakeGroup = {
  id: 'gggggggg-0000-0000-0000-000000000001',
  tenant_id: 'tenant-1',
  name: 'Plantão Noturno',
  description: 'Equipe da madrugada',
  member_count: 2,
  created_at: '2026-06-28T10:00:00Z',
  created_by: null,
};

const role = (id: string, key: string, name: string, is_system = false) => ({
  id,
  tenant_id: is_system ? null : 'tenant-1',
  key,
  name,
  description: '',
  is_system,
  priority: is_system ? 60 : 100,
  permission_keys: [],
  parent_role_ids: [],
});

const fakeRoles = [
  role('r-aip', 'acesso_aip', 'Acesso · AIP Chat', true),
  role('r-agents', 'acesso_agents', 'Acesso · Agentes', true),
  role('r-sol', 'acesso_solutions', 'Acesso · Desenho da Operação', true),
  role('r-analyst', 'analista', 'Analista'),
  role('r-op', 'operator', 'Operador', true),
];

describe('GruposPage — W6 Acessos (Grupo concede acesso)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Groups.list.mockResolvedValue([fakeGroup]);
    rolesApi.list.mockResolvedValue(fakeRoles);
    Groups.roles.list.mockResolvedValue([]); // nenhum papel concedido ainda
    Groups.roles.replace.mockImplementation((_gid: string, ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({
          role_id: id,
          key: 'x',
          name: 'x',
          description: '',
          is_system: false,
          priority: 100,
        })),
      ),
    );
  });

  async function openRolesDialog() {
    render(<GruposPage />);
    await screen.findByTestId('grupos-list');
    fireEvent.click(screen.getByTestId(`grupo-roles-open-${fakeGroup.id}`));
    await screen.findByTestId('grupos-roles-dialog');
    // espera os papéis carregarem (toggles aparecem)
    await screen.findByTestId('grupo-access-aip');
  }

  it('opens the access dialog from the group row', async () => {
    await openRolesDialog();
    expect(screen.getByTestId('grupo-access-aip')).toBeInTheDocument();
    expect(screen.getByTestId('grupo-access-agents')).toBeInTheDocument();
    expect(screen.getByTestId('grupo-access-solutions')).toBeInTheDocument();
  });

  it('toggling AIP grants the acesso_aip role via roles.replace', async () => {
    await openRolesDialog();
    fireEvent.click(screen.getByTestId('grupo-access-aip'));
    await waitFor(() =>
      expect(Groups.roles.replace).toHaveBeenCalledWith(fakeGroup.id, ['r-aip']),
    );
  });

  it('toggling Agents grants the acesso_agents role', async () => {
    await openRolesDialog();
    fireEvent.click(screen.getByTestId('grupo-access-agents'));
    await waitFor(() =>
      expect(Groups.roles.replace).toHaveBeenCalledWith(fakeGroup.id, ['r-agents']),
    );
  });

  it('toggling Solutions grants the acesso_solutions role', async () => {
    await openRolesDialog();
    fireEvent.click(screen.getByTestId('grupo-access-solutions'));
    await waitFor(() =>
      expect(Groups.roles.replace).toHaveBeenCalledWith(fakeGroup.id, ['r-sol']),
    );
  });

  it('assigns a non-experience role from the checklist via roles.replace', async () => {
    await openRolesDialog();
    // a checklist mostra papéis que NÃO são experiências
    expect(screen.getByTestId('grupo-role-analista')).toBeInTheDocument();
    expect(screen.getByTestId('grupo-role-operator')).toBeInTheDocument();
    // experiências NÃO aparecem na checklist (vivem nos toggles)
    expect(screen.queryByTestId('grupo-role-acesso_aip')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('grupo-role-analista'));
    await waitFor(() =>
      expect(Groups.roles.replace).toHaveBeenCalledWith(fakeGroup.id, ['r-analyst']),
    );
  });

  it('reflects already-granted roles as checked (read from roles.list)', async () => {
    Groups.roles.list.mockResolvedValue([
      { role_id: 'r-aip', key: 'acesso_aip', name: 'Acesso · AIP Chat', description: '', is_system: true, priority: 60 },
    ]);
    await openRolesDialog();
    // desligar quando já concedido → replace com conjunto vazio
    fireEvent.click(screen.getByTestId('grupo-access-aip'));
    await waitFor(() =>
      expect(Groups.roles.replace).toHaveBeenCalledWith(fakeGroup.id, []),
    );
  });
});
