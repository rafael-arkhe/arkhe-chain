/**
 * Onda L.7 — /painel-de-controle/operacoes · "Revalidar marcações".
 *
 * Cobertura:
 * - O botão "Revalidar marcações" só aparece quando o modo != 'none'.
 * - Clicar chama Projects.constraints.revalidate(id).
 * - Relatório limpo (0 violações) mostra o resumo de "sem violações".
 * - Relatório com violações lista cada marcação (display_name + slug + tipo
 *   de violação + recurso) — estrutura por seletores, ZERO texto-livre.
 * - Revalidate NÃO chama clear/delete (report-only).
 * - Gate de permissão: sem `project.constraints.revalidate` o botão some.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import OperacoesPage from '@/app/painel-de-controle/operacoes/page';

jest.mock('@/lib/api', () => ({
  Markings: { list: jest.fn() },
  Projects: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    workspaces: jest.fn(),
    constraints: {
      get: jest.fn(),
      put: jest.fn(),
      clear: jest.fn(),
      revalidate: jest.fn(),
    },
  },
}));

// useCan default = true (governance/admin). Overridden per-test where needed.
// `mock`-prefixed name is allowed inside the (hoisted) jest.mock factory.
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin', roles: ['admin'] }, loading: false }),
  useCan: jest.fn(() => true),
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
  useI18n: () => ({ locale: 'pt-BR', setLocale: jest.fn(), t: (k: string) => k }),
}));

const { Markings, Projects } = jest.requireMock('@/lib/api') as {
  Markings: { list: jest.Mock };
  Projects: {
    list: jest.Mock;
    workspaces: jest.Mock;
    constraints: {
      get: jest.Mock;
      revalidate: jest.Mock;
      clear: jest.Mock;
    };
  };
};

const { useCan: canMock } = jest.requireMock('@/lib/auth/useAuth') as {
  useCan: jest.Mock;
};

const fakeProject = {
  id: 'p-1',
  tenant_id: 't-1',
  slug: 'aurora',
  display_name: 'Operação Aurora',
  description: null,
  required_clearances: [],
  features: [],
  active: true,
  created_at: '2026-05-23T10:00:00Z',
};

const fakeMarkings = [
  {
    id: 'm-pii',
    tenant_id: 't-1',
    slug: 'pii',
    display_name: 'PII',
    description: null,
    category_id: null,
    active: true,
    created_at: '',
  },
  {
    id: 'm-sig',
    tenant_id: 't-1',
    slug: 'sigiloso',
    display_name: 'SIGILOSO',
    description: null,
    category_id: null,
    active: true,
    created_at: '',
  },
];

async function openDialogInAllowedMode() {
  render(<OperacoesPage />);
  // wait for the list, then open the constraints dialog.
  await screen.findByTestId('operacao-aurora');
  fireEvent.click(screen.getByTestId('operacao-restricoes-aurora'));
  // dialog loads constraints (mode='allowed' from the mocked get).
  await screen.findByTestId('restricoes-dialog');
  await screen.findByTestId('restricoes-mode');
}

describe('OperacoesPage · Revalidar marcações (Onda L.7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canMock.mockReturnValue(true);
    Projects.list.mockResolvedValue([fakeProject]);
    Markings.list.mockResolvedValue(fakeMarkings);
    Projects.workspaces.mockResolvedValue([]);
    Projects.constraints.get.mockResolvedValue({
      project_id: 'p-1',
      mode: 'allowed',
      markings: ['m-pii'],
      classification_ceiling: null,
      updated_at: '',
    });
  });

  it('mostra o botão revalidar quando modo != none e some quando none', async () => {
    await openDialogInAllowedMode();
    expect(screen.getByTestId('restricoes-revalidate')).toBeInTheDocument();

    // troca para 'none' → botão desaparece.
    fireEvent.change(screen.getByTestId('restricoes-mode'), {
      target: { value: 'none' },
    });
    await waitFor(() =>
      expect(screen.queryByTestId('restricoes-revalidate')).not.toBeInTheDocument(),
    );
  });

  it('relatório limpo mostra resumo de zero violações', async () => {
    Projects.constraints.revalidate.mockResolvedValue({
      project_id: 'p-1',
      mode: 'allowed',
      total_checked: 2,
      violation_count: 0,
      violations: [],
    });
    await openDialogInAllowedMode();
    fireEvent.click(screen.getByTestId('restricoes-revalidate'));

    await screen.findByTestId('restricoes-revalidate-clean');
    expect(Projects.constraints.revalidate).toHaveBeenCalledWith('p-1');
    // report-only: jamais limpa/deleta.
    expect(Projects.constraints.clear).not.toHaveBeenCalled();
  });

  it('relatório com violações lista cada marcação por estrutura (sem texto-livre)', async () => {
    Projects.constraints.revalidate.mockResolvedValue({
      project_id: 'p-1',
      mode: 'allowed',
      total_checked: 2,
      violation_count: 1,
      violations: [
        {
          resource_kind: 'data_asset',
          resource_id: 'a-1',
          marking_id: 'm-sig',
          marking_slug: 'sigiloso',
          marking_display_name: 'SIGILOSO',
          violation: 'not_allowed',
        },
      ],
    });
    await openDialogInAllowedMode();
    fireEvent.click(screen.getByTestId('restricoes-revalidate'));

    const panel = await screen.findByTestId('restricoes-revalidate-violations');
    const row = within(panel).getByTestId('restricoes-violation-sigiloso');
    // display_name da marcação + slug aparecem (rótulos de catálogo, não livre)
    expect(within(row).getByText('SIGILOSO')).toBeInTheDocument();
    expect(within(row).getByText('sigiloso')).toBeInTheDocument();
    // tipo de violação + recurso vêm de chaves i18n (mockadas como a própria chave)
    expect(within(row).getByText('operacoes.violationNotAllowed')).toBeInTheDocument();
    expect(within(row).getByText('operacoes.violationOnAsset')).toBeInTheDocument();
  });

  it('esconde o botão quando o usuário não tem a permissão de revalidar', async () => {
    canMock.mockImplementation((key: string) => key !== 'project.constraints.revalidate');
    await openDialogInAllowedMode();
    expect(screen.queryByTestId('restricoes-revalidate')).not.toBeInTheDocument();
  });
});
