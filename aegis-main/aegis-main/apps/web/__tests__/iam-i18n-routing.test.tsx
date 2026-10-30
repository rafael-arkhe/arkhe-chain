/**
 * W7 (GAP E) — dívida i18n dos painéis IAM zerada.
 *
 * RolesPanel, PermissionsPanel (e os fallbacks de erro de Grupos) NÃO podem ter
 * strings de UI hardcoded em pt-BR. Com useT() mockado para devolver a PRÓPRIA
 * chave, a tela renderiza as CHAVES de i18n — provando que cada rótulo passa por
 * t(). Asserções negativas garantem que o pt-BR cru sumiu.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { RolesPanel } from '@/components/iam/RolesPanel';
import { PermissionsPanel } from '@/components/iam/PermissionsPanel';

jest.mock('@/lib/iam/api', () => ({
  rolesApi: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    replacePermissions: jest.fn(),
    replaceParents: jest.fn(),
  },
  permissionsApi: {
    list: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(() => Promise.resolve(true)),
}));
// useT devolve a própria chave → o texto renderizado É a chave de i18n.
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));

const { rolesApi, permissionsApi } = jest.requireMock('@/lib/iam/api') as {
  rolesApi: Record<string, jest.Mock>;
  permissionsApi: Record<string, jest.Mock>;
};

const SYSTEM_ROLE = {
  id: 'r-sys',
  tenant_id: 't1',
  key: 'plantao',
  name: 'Plantão',
  description: '',
  is_system: true,
  priority: 100,
  permission_keys: [],
  parent_role_ids: [],
};

describe('GAP E — RolesPanel roteia rótulos por useT (sem pt-BR cru)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rolesApi.list.mockResolvedValue([SYSTEM_ROLE]);
    permissionsApi.list.mockResolvedValue([]);
    rolesApi.get.mockResolvedValue(SYSTEM_ROLE);
  });

  it('cabeçalho e colunas vêm de chaves i18n', async () => {
    render(<RolesPanel />);
    // espera a linha (dado async) antes de checar — o cabeçalho renderiza antes.
    await screen.findByTestId('role-edit-plantao');
    expect(screen.getByText('iam.roles.title')).toBeInTheDocument();
    expect(screen.getByText('iam.common.colIdentifier')).toBeInTheDocument();
    expect(screen.getByText('iam.roles.colName')).toBeInTheDocument();
    expect(screen.getByText('iam.roles.colPermissions')).toBeInTheDocument();
    expect(screen.getByText('iam.roles.colInherits')).toBeInTheDocument();
    expect(screen.getByText('iam.common.colType')).toBeInTheDocument();
    expect(screen.getByText('iam.common.edit')).toBeInTheDocument();
    expect(screen.getByText('iam.common.system')).toBeInTheDocument();
    // pt-BR cru NÃO aparece mais
    expect(screen.queryByText('Papéis')).not.toBeInTheDocument();
    expect(screen.queryByText('Identificador')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
  });

  it('EditRoleDialog roteia rótulos (inclui aviso de papel do sistema)', async () => {
    render(<RolesPanel />);
    fireEvent.click(await screen.findByTestId('role-edit-plantao'));
    await screen.findByText('iam.roles.displayNameLabel');
    expect(screen.getByText('iam.roles.systemReadonly')).toBeInTheDocument();
    expect(screen.getByText('iam.roles.permissionsLabel')).toBeInTheDocument();
    expect(screen.getByText('iam.roles.inheritsFromLabel')).toBeInTheDocument();
    expect(screen.getByText('iam.common.close')).toBeInTheDocument();
    // pt-BR cru ausente
    expect(screen.queryByText('Nome de exibição')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Papel padrão do sistema/),
    ).not.toBeInTheDocument();
  });
});

describe('GAP E — PermissionsPanel roteia rótulos por useT (sem pt-BR cru)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permissionsApi.list.mockResolvedValue([
      {
        id: 'p1',
        key: 'security.relatorios.export',
        resource: 'security.relatorios',
        action: 'export',
        description: 'desc',
        is_system: false,
      },
    ]);
  });

  it('título, colunas, selo e ação vêm de chaves i18n', async () => {
    render(<PermissionsPanel />);
    await screen.findByTestId('perm-row-security.relatorios.export');
    // título com contagem: "iam.perms.title (1)"
    expect(screen.getByText(/iam\.perms\.title/)).toBeInTheDocument();
    expect(screen.getByText('iam.common.colIdentifier')).toBeInTheDocument();
    expect(screen.getByText('iam.perms.resourceLabel')).toBeInTheDocument();
    expect(screen.getByText('iam.perms.actionLabel')).toBeInTheDocument();
    expect(screen.getByText('iam.perms.descriptionLabel')).toBeInTheDocument();
    expect(screen.getByText('iam.common.colType')).toBeInTheDocument();
    expect(screen.getByText('iam.perms.custom')).toBeInTheDocument();
    expect(screen.getByText('iam.common.delete')).toBeInTheDocument();
    // pt-BR cru ausente
    expect(screen.queryByText('Recurso')).not.toBeInTheDocument();
    expect(screen.queryByText('Descrição')).not.toBeInTheDocument();
    expect(screen.queryByText('customizada')).not.toBeInTheDocument();
    expect(screen.queryByText('Apagar')).not.toBeInTheDocument();
  });
});
