/**
 * W6 — Fim do input técnico manual na autoria de IAM.
 *
 * - RolesPanel/CreateRoleDialog: pede apenas o NOME; NÃO há campo de
 *   identificador (slug). O backend gera o slug a partir do nome — o submit
 *   chama rolesApi.create({ name }) SEM `key`.
 * - PermissionsPanel/CreatePermDialog: o identificador é COMPOSTO por dois
 *   dropdowns (recurso do catálogo + ação padrão); NÃO há texto livre da key.
 *   O submit chama permissionsApi.create com key="recurso.ação".
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));

const { rolesApi, permissionsApi } = jest.requireMock('@/lib/iam/api') as {
  rolesApi: Record<string, jest.Mock>;
  permissionsApi: Record<string, jest.Mock>;
};

describe('CreateRoleDialog — autoria de papel por NOME (sem slug)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rolesApi.list.mockResolvedValue([]);
    permissionsApi.list.mockResolvedValue([]);
    rolesApi.create.mockResolvedValue({
      id: 'r-new',
      tenant_id: 't1',
      key: 'plantao_noturno',
      name: 'Plantão Noturno',
      description: '',
      is_system: false,
      priority: 100,
      permission_keys: [],
      parent_role_ids: [],
    });
  });

  it('has NO key/identifier field — only a name', async () => {
    render(<RolesPanel />);
    fireEvent.click(await screen.findByTestId('role-create-button'));
    await screen.findByTestId('role-create-name');
    expect(screen.queryByTestId('role-create-key')).not.toBeInTheDocument();
  });

  it('creates the role with name only (slug generated server-side)', async () => {
    render(<RolesPanel />);
    fireEvent.click(await screen.findByTestId('role-create-button'));
    fireEvent.change(await screen.findByTestId('role-create-name'), {
      target: { value: 'Plantão Noturno' },
    });
    fireEvent.click(screen.getByTestId('role-create-submit'));
    await waitFor(() => expect(rolesApi.create).toHaveBeenCalledTimes(1));
    const arg = rolesApi.create.mock.calls[0][0];
    expect(arg).toEqual({ name: 'Plantão Noturno' });
    expect(arg).not.toHaveProperty('key');
  });
});

describe('CreatePermDialog — composição por dropdowns (sem texto livre)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permissionsApi.list.mockResolvedValue([
      {
        id: 'p1',
        key: 'security.relatorios.read',
        resource: 'security.relatorios',
        action: 'read',
        description: 'ler relatórios',
        is_system: true,
      },
    ]);
    permissionsApi.create.mockResolvedValue({
      id: 'p2',
      key: 'security.relatorios.export',
      resource: 'security.relatorios',
      action: 'export',
      description: '',
      is_system: false,
    });
  });

  it('uses resource + action dropdowns and has NO free-text key input', async () => {
    render(<PermissionsPanel />);
    await screen.findByTestId('perm-row-security.relatorios.read');
    fireEvent.click(screen.getByTestId('perm-create-button'));

    const resource = (await screen.findByTestId('perm-create-resource')) as HTMLSelectElement;
    const action = (await screen.findByTestId('perm-create-action')) as HTMLSelectElement;
    expect(resource.tagName).toBe('SELECT');
    expect(action.tagName).toBe('SELECT');
    // NÃO existe mais campo de texto da key
    expect(screen.queryByTestId('perm-create-key')).not.toBeInTheDocument();
    // recurso vem do catálogo
    expect(Array.from(resource.options).map((o) => o.value)).toContain(
      'security.relatorios',
    );
  });

  it('composes key="recurso.ação" on submit', async () => {
    render(<PermissionsPanel />);
    await screen.findByTestId('perm-row-security.relatorios.read');
    fireEvent.click(screen.getByTestId('perm-create-button'));

    fireEvent.change(await screen.findByTestId('perm-create-resource'), {
      target: { value: 'security.relatorios' },
    });
    fireEvent.change(screen.getByTestId('perm-create-action'), {
      target: { value: 'export' },
    });
    fireEvent.click(screen.getByTestId('perm-create-submit'));

    await waitFor(() => expect(permissionsApi.create).toHaveBeenCalledTimes(1));
    expect(permissionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'security.relatorios.export' }),
    );
  });
});
