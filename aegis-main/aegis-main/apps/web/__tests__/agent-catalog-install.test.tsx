/**
 * Missão #6 — Instalar agente do catálogo.
 *
 * Regressões cobertas (o backend retornava 422 antes do fix):
 *  1. O corpo do install precisa usar `template_slug` (não `template`).
 *  2. O objeto `params` precisa ser chaveado pelo `key` real de cada
 *     parâmetro — antes o código usava `p.name` (inexistente), gerando
 *     `{ "undefined": 3 }`.
 *  3. Campos obrigatórios vazios são barrados no client; nenhum corpo
 *     malformado chega ao backend (operador nunca vê 422 cru).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AgentCatalogPage from '@/app/agentes/catalog/page';
import type { AgentTemplateOut } from '@/lib/api/agentes';

jest.mock('@/lib/api/agentes', () => ({
  Agentes: {
    catalog: jest.fn(),
    install: jest.fn(),
    uninstall: jest.fn(),
  },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin' }, loading: false }),
  useCan: () => true,
}));

// Toast — espiona success/error sem precisar montar <Toaster />.
jest.mock('@/components/ui/toast', () => {
  const toast = Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  });
  return { toast, Toaster: () => null };
});

const { Agentes } = jest.requireMock('@/lib/api/agentes') as {
  Agentes: { catalog: jest.Mock; install: jest.Mock; uninstall: jest.Mock };
};
const { toast } = jest.requireMock('@/components/ui/toast') as {
  toast: jest.Mock & { success: jest.Mock; error: jest.Mock };
};

// Espelha o template `x-monitor` do backend: params chaveados por `key`,
// com `count` (number, default=3, opcional) e `handle` (obrigatório).
const X_MONITOR: AgentTemplateOut = {
  slug: 'x-monitor',
  title: 'Coletor X — pessoa pública',
  description: 'Monitora os posts de uma conta do X.',
  kind: 'worker',
  icon: 'Hash',
  can_install: true,
  prereqs: [{ ok: true, message: 'Sessão ativa' }],
  params: [
    { key: 'handle', label: 'Handle no X (sem @)', type: 'text', required: true },
    { key: 'label', label: 'Rótulo curto (opcional)', type: 'text', default: '', required: false },
    { key: 'count', label: 'Posts por execução', type: 'number', default: 3, required: false },
  ],
};

async function openInstallModal() {
  render(<AgentCatalogPage />);
  await waitFor(() =>
    expect(screen.getByTestId('agente-install-x-monitor')).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByTestId('agente-install-x-monitor'));
  await waitFor(() =>
    expect(screen.getByTestId('agente-install-modal')).toBeInTheDocument(),
  );
}

describe('Missão #6 — install body shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Agentes.catalog.mockResolvedValue([X_MONITOR]);
    Agentes.install.mockResolvedValue({
      agent_id: 'a1',
      agent_slug: 'worker-x-test',
      display_name: 'X · test',
      status: 'inactive',
    });
  });

  it('envia template_slug + params chaveados pelo key real (não "undefined")', async () => {
    await openInstallModal();

    // Preenche o campo obrigatório `handle` — primeiro textbox do modal.
    const modal = screen.getByTestId('agente-install-modal');
    const textboxes = modal.querySelectorAll<HTMLInputElement>(
      'input[type="text"]',
    );
    fireEvent.change(textboxes[0], { target: { value: 'fulano' } });

    fireEvent.click(screen.getByTestId('agente-install-confirm'));

    await waitFor(() => expect(Agentes.install).toHaveBeenCalledTimes(1));

    const [slugArg, paramsArg] = Agentes.install.mock.calls[0];
    expect(slugArg).toBe('x-monitor');

    // O bug original produzia `{ undefined: 3 }`.
    expect(paramsArg).not.toHaveProperty('undefined');
    expect(paramsArg).toHaveProperty('handle', 'fulano');
    expect(paramsArg).toHaveProperty('count', 3);
    expect(paramsArg).toHaveProperty('label', '');
  });

  it('barra submit quando obrigatório está vazio — não chama o backend', async () => {
    await openInstallModal();

    // Sem preencher `handle` (obrigatório).
    fireEvent.click(screen.getByTestId('agente-install-confirm'));

    await waitFor(() =>
      expect(screen.getByText(/campos obrigatórios|required fields/i)).toBeInTheDocument(),
    );
    expect(Agentes.install).not.toHaveBeenCalled();
  });
});

describe('Missão #6 — install client request body', () => {
  it('serializa { template_slug, params } no fetch (não { template })', async () => {
    // Testa o cliente real (sem mock) inspecionando o corpo enviado.
    // Duck-type de Response: só precisamos de ok/status/json p/ o apiFetch.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ agent_id: 'x' }),
      text: async () => '',
    });
    const realFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { Agentes: RealAgentes } = jest.requireActual(
        '@/lib/api/agentes',
      ) as typeof import('@/lib/api/agentes');

      await RealAgentes.install('x-monitor', { handle: 'fulano', count: 3 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        template_slug: 'x-monitor',
        params: { handle: 'fulano', count: 3 },
      });
      expect(body).not.toHaveProperty('template');
    } finally {
      global.fetch = realFetch;
    }
  });
});

// Fix #1 — toast de sucesso/erro após instalar.
describe('Catálogo de agentes — toast no install', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Agentes.catalog.mockResolvedValue([X_MONITOR]);
  });

  it('dispara toast.success quando o install retorna 200', async () => {
    Agentes.install.mockResolvedValue({
      agent_id: 'a1',
      agent_slug: 'worker-x-test',
      display_name: 'X · test',
      status: 'inactive',
    });
    await openInstallModal();

    const modal = screen.getByTestId('agente-install-modal');
    const textboxes = modal.querySelectorAll<HTMLInputElement>('input[type="text"]');
    fireEvent.change(textboxes[0], { target: { value: 'fulano' } });
    fireEvent.click(screen.getByTestId('agente-install-confirm'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('Agente instalado.');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('dispara toast.error quando o install falha', async () => {
    Agentes.install.mockRejectedValue(new Error('boom'));
    await openInstallModal();

    const modal = screen.getByTestId('agente-install-modal');
    const textboxes = modal.querySelectorAll<HTMLInputElement>('input[type="text"]');
    fireEvent.change(textboxes[0], { target: { value: 'fulano' } });
    fireEvent.click(screen.getByTestId('agente-install-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect((toast.error as jest.Mock).mock.calls[0][0]).toContain('Falha ao instalar');
    expect(toast.success).not.toHaveBeenCalled();
  });
});

// Fix #3 — estado instalado: badge alinhado + fallback do prereq (sem check solto).
describe('Catálogo de agentes — estado instalado', () => {
  const X_INSTALLED: AgentTemplateOut = {
    ...X_MONITOR,
    already_installed: true,
    installed_agent_ids: ['agent-1', 'agent-2'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Agentes.catalog.mockResolvedValue([X_INSTALLED]);
  });

  it('mostra a pill "Instalado" e esconde o botão instalar', async () => {
    render(<AgentCatalogPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agente-installed-x-monitor')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('agente-installed-x-monitor')).toHaveTextContent(
      'Instalado',
    );
    // Botão de instalar não existe mais no card instalado.
    expect(screen.queryByTestId('agente-install-x-monitor')).not.toBeInTheDocument();
    // Botão Remover presente.
    expect(screen.getByTestId('agente-remove-x-monitor')).toBeInTheDocument();
  });

  it('renderiza a mensagem do prereq (não deixa o check solto)', async () => {
    render(<AgentCatalogPage />);
    // X_MONITOR.prereqs[0].message === 'Sessão ativa' (sem campo `label`).
    await waitFor(() =>
      expect(screen.getByText('Sessão ativa')).toBeInTheDocument(),
    );
  });

  it('Remover pede confirmação e chama uninstall para cada instância', async () => {
    Agentes.uninstall.mockResolvedValue(undefined);
    render(<AgentCatalogPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agente-remove-x-monitor')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('agente-remove-x-monitor'));

    // Dialog sharp (ConfirmProvider local) aparece.
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByTestId('confirm-ok'));

    await waitFor(() => expect(Agentes.uninstall).toHaveBeenCalledTimes(2));
    expect(Agentes.uninstall).toHaveBeenCalledWith('agent-1');
    expect(Agentes.uninstall).toHaveBeenCalledWith('agent-2');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Agente removido.'));
  });

  it('cancelar a confirmação não chama uninstall', async () => {
    render(<AgentCatalogPage />);
    await waitFor(() =>
      expect(screen.getByTestId('agente-remove-x-monitor')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('agente-remove-x-monitor'));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByTestId('confirm-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument(),
    );
    expect(Agentes.uninstall).not.toHaveBeenCalled();
  });
});

// uninstall client — corpo/método correto (DELETE no agent id).
describe('Agentes client — uninstall request', () => {
  it('faz DELETE em /campaign/agents/{id}', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined,
      text: async () => '',
    });
    const realFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { Agentes: RealAgentes } = jest.requireActual(
        '@/lib/api/agentes',
      ) as typeof import('@/lib/api/agentes');
      await RealAgentes.uninstall('abc-123');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/campaign/agents/abc-123');
      expect((init as RequestInit).method).toBe('DELETE');
    } finally {
      global.fetch = realFetch;
    }
  });
});
