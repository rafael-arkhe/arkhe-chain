/**
 * Wave H.1 (2026-05-23) — Tours page UX operacional clara.
 * Status badges · view counts · "Aparece em…" inline · Pré-visualizar
 * button · wizard 3 passos · audience filter · trigger dates.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ToursPage from '@/app/painel-de-controle/tours/page';

const mockSalas = [
  {
    id: 'ws-aurora',
    slug: 'aurora',
    display_name: 'Sala Aurora',
    description: null,
    version: 1,
    signed_hash: '',
    config: {},
    tenant_id: 't1',
    project_id: 'p1',
  },
];

const mockTours = [
  {
    id: 'tour-1',
    workspace_id: 'ws-aurora',
    title: 'Onboarding Aurora',
    summary: 'Como navegar na nova Sala',
    ordering: 0,
    status: 'active',
    created_at: '2026-05-20T10:00:00Z',
    archived_at: null,
    pages: [
      {
        id: 'p1',
        workspace_update_id: 'tour-1',
        ordering: 0,
        title: 'Bem-vindo',
        description: 'Texto',
        media_url: null,
        documentation_url: null,
        target_selector: null,
      },
    ],
    audience: null,
    trigger: {
      target_pages: ['/sala/aurora'],
      start_at: '2026-05-23T00:00:00Z',
      end_at: '2026-05-30T23:59:00Z',
    },
  },
  {
    id: 'tour-draft',
    workspace_id: 'ws-aurora',
    title: 'Rascunho sem páginas',
    summary: null,
    ordering: 1,
    status: 'active',
    created_at: '2026-05-21T10:00:00Z',
    archived_at: null,
    pages: [],
    audience: null,
    trigger: null,
  },
  {
    id: 'tour-arch',
    workspace_id: 'ws-aurora',
    title: 'Tour antigo',
    summary: null,
    ordering: 2,
    status: 'archived',
    created_at: '2026-05-01T10:00:00Z',
    archived_at: '2026-05-15T10:00:00Z',
    pages: [
      {
        id: 'p-arch',
        workspace_update_id: 'tour-arch',
        ordering: 0,
        title: 'Slide A',
        description: '',
        media_url: null,
        documentation_url: null,
        target_selector: null,
      },
    ],
    audience: null,
    trigger: null,
  },
];

const mockViewCounts: Record<string, { viewed: number; total_eligible: number }> = {
  'tour-1': { viewed: 12, total_eligible: 45 },
  'tour-draft': { viewed: 0, total_eligible: 45 },
  'tour-arch': { viewed: 45, total_eligible: 45 },
};

const mockEligibleUsers = [
  {
    id: 'u1',
    username: 'admin',
    display_name: 'Admin',
    viewed: true,
    viewed_at: '2026-05-22T10:00:00Z',
  },
  {
    id: 'u2',
    username: 'operador1',
    display_name: 'Operador 1',
    viewed: false,
    viewed_at: null,
  },
];

jest.mock('@/lib/api', () => ({
  Workspaces: {
    list: jest.fn(() => Promise.resolve(mockSalas)),
  },
  // Onda L.6: o seletor de Grupos da audiência popula de Groups.list().
  Groups: {
    list: jest.fn(() =>
      Promise.resolve([
        {
          id: 'grp-1',
          tenant_id: 't-1',
          name: 'Plantão Noturno',
          description: '',
          member_count: 3,
          created_at: '2026-05-23T00:00:00Z',
          created_by: null,
        },
      ]),
    ),
  },
  WorkspaceUpdates: {
    list: jest.fn(() => Promise.resolve(mockTours)),
    create: jest.fn((_wsId, body) =>
      Promise.resolve({ ...mockTours[0], ...body, id: 'new-tour' }),
    ),
    patch: jest.fn((_wsId, _id, body) =>
      Promise.resolve({ ...mockTours[0], ...body }),
    ),
    archive: jest.fn(),
    delete: jest.fn(),
    viewCount: jest.fn((_wsId, updateId) =>
      Promise.resolve(mockViewCounts[updateId] ?? { viewed: 0, total_eligible: 0 }),
    ),
    eligibleUsers: jest.fn(() => Promise.resolve(mockEligibleUsers)),
  },
}));

jest.mock('@/components/control-panel/cp-hub-subnav', () => ({
  CpHubSubnav: () => null,
}));
jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

jest.mock('@/components/dialog/confirm-dialog', () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

jest.mock('@/components/ui/toast', () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

// Mock TourPreview to avoid testing it transitively here.
jest.mock('@/components/tours/tour-preview', () => ({
  TourPreview: ({ title }: { title: string }) => (
    <div data-testid="mock-tour-preview">Preview: {title}</div>
  ),
}));

const { WorkspaceUpdates } = jest.requireMock('@/lib/api') as {
  WorkspaceUpdates: {
    list: jest.Mock;
    create: jest.Mock;
    patch: jest.Mock;
    archive: jest.Mock;
    delete: jest.Mock;
    viewCount: jest.Mock;
    eligibleUsers: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderTours(includeArchived = false) {
  render(<ToursPage />);
  await waitFor(() => expect(screen.getByTestId('tour-tour-1')).toBeInTheDocument());
  if (includeArchived) {
    fireEvent.click(screen.getByTestId('tours-include-archived'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-tour-arch')).toBeInTheDocument(),
    );
  }
}

describe('Wave H.1 · Tours page UX operacional', () => {
  it('1. Status badge "Ativo" aparece em tour com páginas + status=active', async () => {
    await renderTours();
    expect(screen.getByTestId('tour-status-tour-1')).toHaveTextContent(/ativo/i);
  });

  it('2. Status badge "Em rascunho" aparece em tour sem páginas', async () => {
    await renderTours();
    expect(screen.getByTestId('tour-status-tour-draft')).toHaveTextContent(/rascunho/i);
  });

  it('3. Status badge "Arquivado" aparece em tour archived', async () => {
    await renderTours(true);
    expect(screen.getByTestId('tour-status-tour-arch')).toHaveTextContent(/arquivado/i);
  });

  it('4. View counts "N / M operadores viram" aparecem no card', async () => {
    await renderTours();
    const counts = screen.getByTestId('tour-view-counts-tour-1');
    expect(counts).toHaveTextContent('12 / 45 operadores viram');
  });

  it('5. Click em view counts abre dialog Quem viu com lista', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-view-counts-tour-1'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-eligible-dialog')).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('tour-eligible-admin')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('tour-eligible-operador1')).toBeInTheDocument();
  });

  it('6. Visibility inline mostra "/sala/aurora" + datas formatadas', async () => {
    await renderTours();
    const vis = screen.getByTestId('tour-visibility-tour-1');
    expect(vis).toHaveTextContent('/sala/aurora');
    // Datas em pt-BR
    expect(vis.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('7. Click em "Pré-visualizar" abre TourPreview', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-preview-tour-1'));
    await waitFor(() =>
      expect(screen.getByTestId('mock-tour-preview')).toBeInTheDocument(),
    );
  });

  it('8. Wizard editor abre com 3 passos visíveis', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-edit-tour-1'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-wizard-steps')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('tour-wizard-step-pages')).toBeInTheDocument();
    expect(screen.getByTestId('tour-wizard-step-content')).toBeInTheDocument();
    expect(screen.getByTestId('tour-wizard-step-trigger')).toBeInTheDocument();
  });

  it('9. Navegação entre passos do wizard funciona', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-edit-tour-1'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-wizard-pages-panel')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('tour-wizard-next'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-wizard-content-panel')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('tour-wizard-next'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-wizard-trigger-panel')).toBeInTheDocument(),
    );
  });

  it('10. Passo Trigger: target_pages textarea + start/end + audience mode', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-edit-tour-1'));
    await waitFor(() => screen.getByTestId('tour-wizard-pages-panel'));
    fireEvent.click(screen.getByTestId('tour-wizard-step-trigger'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-wizard-trigger-panel')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('tour-trigger-start')).toBeInTheDocument();
    expect(screen.getByTestId('tour-trigger-end')).toBeInTheDocument();
    expect(screen.getByTestId('tour-trigger-target-pages')).toBeInTheDocument();
    expect(screen.getByTestId('tour-audience-mode')).toBeInTheDocument();
  });

  it('11. Audience filter ativa input de roles quando "filtered" escolhido', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-edit-tour-1'));
    await waitFor(() => screen.getByTestId('tour-wizard-pages-panel'));
    fireEvent.click(screen.getByTestId('tour-wizard-step-trigger'));
    await waitFor(() => screen.getByTestId('tour-wizard-trigger-panel'));
    fireEvent.change(screen.getByTestId('tour-audience-mode'), {
      target: { value: 'filtered' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('tour-audience-roles')).toBeInTheDocument(),
    );
    // Onda L.6: o seletor de Grupos popula async de Groups.list() (dropdown
    // por checkbox-list, não texto-livre) — findByTestId aguarda o fetch.
    expect(await screen.findByTestId('tour-audience-groups')).toBeInTheDocument();
  });

  it('12. Botão "Testar agora" no editor abre preview', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-edit-tour-1'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-editor-test-now')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('tour-editor-test-now'));
    await waitFor(() =>
      expect(screen.getByTestId('mock-tour-preview')).toBeInTheDocument(),
    );
  });

  it('13. Page form ganha campo target_selector (CSS)', async () => {
    await renderTours();
    fireEvent.click(screen.getByTestId('tour-edit-tour-1'));
    await waitFor(() =>
      expect(screen.getByTestId('tour-page-0-target')).toBeInTheDocument(),
    );
  });
});
