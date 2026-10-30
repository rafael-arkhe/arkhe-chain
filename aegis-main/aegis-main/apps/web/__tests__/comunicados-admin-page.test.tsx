/**
 * Onda I.5 (2026-05-23) — /painel-de-controle/comunicados (CRUD admin).
 *
 * Cobertura (>= 12):
 *  1. Skeleton enquanto carrega.
 *  2. Lista carrega via Comunicados.list e popula rows.
 *  3. Empty-state do editor quando nada selecionado.
 *  4. "Novo Comunicado" abre o form 3-col + preview vivo.
 *  5. Preview reflete kind=warning ao trocar tipo.
 *  6. Criar comunicado chama Comunicados.create com o payload do form.
 *  7. Agendar (schedule_start futuro) muda o rótulo do botão pra "Agendar".
 *  8. Editar row hidrata o form + troca kind atualiza preview.
 *  9. Salvar edição chama Comunicados.patch.
 * 10. Excluir abre ConfirmDialog requireConfirmText="excluir" → delete.
 * 11. Duplicar chama Comunicados.create com título "(cópia)".
 * 12. Validação: título vazio bloqueia save + mostra erro.
 * 13. Erro de backend no load mostra CpErrorState.
 * 14. DS audit: zero rounded-*, zero Sparkles.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
// Backlog #6b: a page migrou para o route group do hub "Comunicação
// operacional" (parênteses ignorados na URL — rota /comunicados preservada).
import ComunicadosAdminPage from '@/app/painel-de-controle/(comunicacao-operacional)/comunicados/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/painel-de-controle/comunicados',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  Comunicados: {
    list: jest.fn(),
    create: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  Iam: {
    roles: { list: jest.fn() },
    permissions: { list: jest.fn() },
  },
  // Onda L.6: AudienceEditor agora popula Grupos de Groups.list().
  Groups: {
    list: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'], permissions: ['app_shell.manage'] },
    loading: false,
  }),
  useCan: () => true,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ui/toast', () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const { Comunicados, Iam } = jest.requireMock('@/lib/api') as {
  Comunicados: {
    list: jest.Mock;
    create: jest.Mock;
    patch: jest.Mock;
    delete: jest.Mock;
  };
  Iam: {
    roles: { list: jest.Mock };
    permissions: { list: jest.Mock };
  };
};

function makeComunicado(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c-1',
    tenant_id: 't-1',
    kind: 'info',
    title: 'Manutenção programada',
    body: 'Sistema indisponível das 23h às 01h.',
    icon: null,
    closable: true,
    duration_s: 0,
    audience_roles: null,
    audience_iam_perms: null,
    schedule_start: null,
    schedule_end: null,
    schedule_days_of_week: null,
    cta_label: null,
    cta_href: null,
    created_at: '2026-05-23T10:00:00Z',
    created_by_user_id: null,
    deleted_at: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Comunicados.list.mockResolvedValue([makeComunicado()]);
  Comunicados.create.mockImplementation(async (body) => ({
    ...makeComunicado(),
    id: 'c-new',
    ...body,
  }));
  Comunicados.patch.mockImplementation(async (id, body) => ({
    ...makeComunicado({ id }),
    ...body,
  }));
  Comunicados.delete.mockResolvedValue(undefined);
  Iam.roles.list.mockResolvedValue([]);
  Iam.permissions.list.mockResolvedValue([]);
});

// 1.
test('mostra skeleton enquanto carrega', () => {
  Comunicados.list.mockReturnValue(new Promise(() => {}));
  render(<ComunicadosAdminPage />);
  expect(screen.getByTestId('comunicados-admin-loading')).toBeInTheDocument();
});

// 2.
test('lista carrega via Comunicados.list e popula rows', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() =>
    expect(screen.getByTestId('comunicados-list')).toBeInTheDocument(),
  );
  expect(Comunicados.list).toHaveBeenCalledWith({ status_temporal: 'all' });
  expect(screen.getByTestId('comunicado-row-c-1')).toHaveTextContent(
    'Manutenção programada',
  );
});

// 3.
test('editor mostra empty-state quando nada selecionado', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicados-list'));
  expect(
    screen.getByTestId('comunicados-admin-empty-editor'),
  ).toBeInTheDocument();
  expect(
    screen.getByTestId('comunicados-admin-preview-empty'),
  ).toBeInTheDocument();
});

// 4.
test('"Novo Comunicado" abre form 3-col + preview vivo', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicados-admin-new'));
  fireEvent.click(screen.getByTestId('comunicados-admin-new'));
  expect(await screen.findByTestId('comunicado-form')).toBeInTheDocument();
  // preview pane mostra o ComunicadoPreview (não mais o empty).
  expect(screen.getByTestId('comunicado-preview')).toBeInTheDocument();
  expect(
    screen.queryByTestId('comunicados-admin-preview-empty'),
  ).not.toBeInTheDocument();
});

// 5.
test('preview reflete kind=warning ao trocar tipo', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicados-admin-new'));
  fireEvent.click(screen.getByTestId('comunicados-admin-new'));
  await screen.findByTestId('comunicado-form');
  fireEvent.click(screen.getByTestId('comunicado-form-kind-warning'));
  await waitFor(() =>
    expect(screen.getByTestId('comunicado-preview')).toHaveAttribute(
      'data-kind',
      'warning',
    ),
  );
});

// 6.
test('criar comunicado chama Comunicados.create com o payload', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicados-admin-new'));
  fireEvent.click(screen.getByTestId('comunicados-admin-new'));
  await screen.findByTestId('comunicado-form');
  fireEvent.change(screen.getByTestId('comunicado-form-title'), {
    target: { value: 'Aviso de operação' },
  });
  fireEvent.click(screen.getByTestId('comunicado-form-kind-danger'));
  fireEvent.click(screen.getByTestId('comunicados-admin-save'));
  await waitFor(() => expect(Comunicados.create).toHaveBeenCalled());
  const payload = Comunicados.create.mock.calls[0][0];
  expect(payload.title).toBe('Aviso de operação');
  expect(payload.kind).toBe('danger');
});

// 7.
test('schedule_start futuro muda o rótulo do botão para "Agendar"', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicados-admin-new'));
  fireEvent.click(screen.getByTestId('comunicados-admin-new'));
  await screen.findByTestId('comunicado-form');
  fireEvent.change(screen.getByTestId('comunicado-form-title'), {
    target: { value: 'Janela futura' },
  });
  // datetime-local no futuro.
  fireEvent.change(screen.getByTestId('schedule-start-input'), {
    target: { value: '2099-01-01T08:00' },
  });
  await waitFor(() =>
    expect(screen.getByTestId('comunicados-admin-save')).toHaveTextContent(
      /Agendar/i,
    ),
  );
  fireEvent.click(screen.getByTestId('comunicados-admin-save'));
  await waitFor(() => expect(Comunicados.create).toHaveBeenCalled());
  const payload = Comunicados.create.mock.calls[0][0];
  expect(payload.schedule_start).not.toBeNull();
});

// 8.
test('editar row hidrata o form + troca kind atualiza preview', async () => {
  Comunicados.list.mockResolvedValue([
    makeComunicado({ id: 'c-1', kind: 'info', title: 'Editar me' }),
  ]);
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicado-row-c-1'));
  fireEvent.click(screen.getByTestId('comunicado-row-c-1-select'));
  const titleInput = (await screen.findByTestId(
    'comunicado-form-title',
  )) as HTMLInputElement;
  expect(titleInput.value).toBe('Editar me');
  fireEvent.click(screen.getByTestId('comunicado-form-kind-success'));
  await waitFor(() =>
    expect(screen.getByTestId('comunicado-preview')).toHaveAttribute(
      'data-kind',
      'success',
    ),
  );
});

// 9.
test('salvar edição chama Comunicados.patch', async () => {
  Comunicados.list.mockResolvedValue([
    makeComunicado({ id: 'c-9', title: 'Patch me' }),
  ]);
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicado-row-c-9'));
  fireEvent.click(screen.getByTestId('comunicado-row-c-9-select'));
  await screen.findByTestId('comunicado-form');
  fireEvent.change(screen.getByTestId('comunicado-form-title'), {
    target: { value: 'Patch me editado' },
  });
  fireEvent.click(screen.getByTestId('comunicados-admin-save'));
  await waitFor(() => expect(Comunicados.patch).toHaveBeenCalled());
  expect(Comunicados.patch.mock.calls[0][0]).toBe('c-9');
  expect(Comunicados.patch.mock.calls[0][1].title).toBe('Patch me editado');
});

// 10.
test('excluir abre ConfirmDialog requireConfirmText="excluir" → delete', async () => {
  Comunicados.list.mockResolvedValue([
    makeComunicado({ id: 'c-del', title: 'Apagar' }),
  ]);
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicado-row-c-del'));
  fireEvent.click(screen.getByTestId('comunicado-row-c-del-delete'));
  // ConfirmDialog: digitar "excluir" libera o confirm.
  const confirmInput = await screen.findByTestId('confirm-text-input');
  fireEvent.change(confirmInput, { target: { value: 'excluir' } });
  fireEvent.click(screen.getByTestId('confirm-ok'));
  await waitFor(() => expect(Comunicados.delete).toHaveBeenCalledWith('c-del'));
});

// 11.
test('duplicar chama Comunicados.create com título "(cópia)"', async () => {
  Comunicados.list.mockResolvedValue([
    makeComunicado({ id: 'c-dup', title: 'Original' }),
  ]);
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicado-row-c-dup'));
  fireEvent.click(screen.getByTestId('comunicado-row-c-dup-duplicate'));
  await waitFor(() => expect(Comunicados.create).toHaveBeenCalled());
  expect(Comunicados.create.mock.calls[0][0].title).toBe('Original (cópia)');
});

// 12.
test('validação: título vazio bloqueia save + mostra erro', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicados-admin-new'));
  fireEvent.click(screen.getByTestId('comunicados-admin-new'));
  await screen.findByTestId('comunicado-form');
  // título permanece vazio.
  fireEvent.click(screen.getByTestId('comunicados-admin-save'));
  expect(
    await screen.findByTestId('comunicados-admin-save-error'),
  ).toHaveTextContent(/Título é obrigatório/i);
  expect(Comunicados.create).not.toHaveBeenCalled();
});

// 13.
test('erro de backend no load mostra CpErrorState', async () => {
  Comunicados.list.mockRejectedValue(new Error('500 boom'));
  render(<ComunicadosAdminPage />);
  await waitFor(() =>
    expect(screen.getByTestId('cp-error-state')).toBeInTheDocument(),
  );
  expect(screen.getByTestId('cp-error-detail')).toHaveTextContent('500 boom');
});

// 14. DS audit.
test('DS audit: zero rounded-* não-none, zero Sparkles', async () => {
  render(<ComunicadosAdminPage />);
  await waitFor(() => screen.getByTestId('comunicados-admin-new'));
  fireEvent.click(screen.getByTestId('comunicados-admin-new'));
  await screen.findByTestId('comunicado-form');
  const html = document.body.innerHTML;
  expect(html).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/);
  expect(html).not.toMatch(/lucide-sparkles/i);
});
