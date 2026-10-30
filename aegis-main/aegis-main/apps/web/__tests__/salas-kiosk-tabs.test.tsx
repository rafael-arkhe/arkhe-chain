/**
 * Wave H.1 (2026-05-23) — Salas KioskDialog ganha 4 tabs + ação primária
 * de Iniciar Apresentação no card. Operador disse "UX está pessimo, não
 * está claro o uso" → refazimento com URL/Sessões ativas/Configuração/
 * Histórico.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SalasPage from '@/app/painel-de-controle/salas/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/painel-de-controle/salas',
}));
jest.mock('@/components/control-panel/cp-hub-subnav', () => ({ CpHubSubnav: () => null }));

const mockWorkspaces = [
  {
    id: 'ws-aurora',
    slug: 'aurora',
    display_name: 'Sala Aurora',
    description: 'Sala de teste',
    version: 1,
    signed_hash: 'abc123def456',
    config: {},
    tenant_id: 't1',
    project_id: 'p1',
  },
];

const mockKioskCfg = {
  workspace_id: 'ws-aurora',
  hide_chrome: true,
  allow_exit: true,
  auto_fullscreen: true,
  allow_read_interaction: true,
  slide_loop: false,
  slide_interval_seconds: 30,
  version: 1,
  active_sessions_count: 2,
};

const mockActiveSessions = [
  {
    id: 'sess-1',
    workspace_id: 'ws-aurora',
    user_id: 'u1',
    started_at: '2026-05-23T10:00:00Z',
    ended_at: null,
    client_info: {
      browser: 'Chrome',
      os: 'macOS',
      label: 'Chrome em macOS',
      ip: '10.0.0.5',
      started_by: 'admin',
    },
  },
  {
    id: 'sess-2',
    workspace_id: 'ws-aurora',
    user_id: 'u1',
    started_at: '2026-05-23T10:30:00Z',
    ended_at: null,
    client_info: { browser: 'Firefox', label: 'Firefox em Windows' },
  },
];

const mockHistorySessions = [
  ...mockActiveSessions,
  {
    id: 'sess-3',
    workspace_id: 'ws-aurora',
    user_id: 'u1',
    started_at: '2026-05-22T08:00:00Z',
    ended_at: '2026-05-22T11:30:00Z',
    duration_seconds: 12600,
    client_info: { browser: 'Edge', label: 'Edge em Windows' },
  },
];

jest.mock('@/lib/api', () => ({
  Workspaces: {
    list: jest.fn(() => Promise.resolve(mockWorkspaces)),
    create: jest.fn(),
    publish: jest.fn(),
    versions: { list: jest.fn(() => Promise.resolve([])), republish: jest.fn() },
  },
  WorkspaceKiosk: {
    get: jest.fn(() => Promise.resolve(mockKioskCfg)),
    set: jest.fn(() => Promise.resolve(mockKioskCfg)),
    listSessions: jest.fn((wsId, opts) =>
      Promise.resolve(opts?.active_only ? mockActiveSessions : mockHistorySessions),
    ),
    startSession: jest.fn(() => Promise.resolve(mockActiveSessions[0])),
    endSession: jest.fn(),
    endAllSessions: jest.fn(() => Promise.resolve({ ended: 2 })),
  },
  WorkspacePromotions: {
    list: jest.fn(() => Promise.resolve([])),
    promote: jest.fn(),
    unpromote: jest.fn(),
  },
  Organizations: { list: jest.fn(() => Promise.resolve([])) },
  Projects: { list: jest.fn(() => Promise.resolve([])) },
  WorkspaceNavigation: { get: jest.fn(), set: jest.fn() },
  KNOWN_APPLICATIONS: [],
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header data-testid="cp-header">
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

jest.mock('@/components/control-panel/cp-empty-state', () => ({
  CpEmptyState: () => null,
}));

jest.mock('@/components/control-panel/cp-skeleton', () => ({
  CpSkeleton: () => <div data-testid="loading">…</div>,
  CpErrorState: ({ title }: { title: string }) => <p>{title}</p>,
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

const { WorkspaceKiosk } = jest.requireMock('@/lib/api') as {
  WorkspaceKiosk: {
    get: jest.Mock;
    set: jest.Mock;
    listSessions: jest.Mock;
    startSession: jest.Mock;
    endSession: jest.Mock;
    endAllSessions: jest.Mock;
  };
};

// Mock window.open + clipboard.
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn(() => Promise.resolve()) },
  });
  Object.defineProperty(window, 'open', { value: jest.fn(), writable: true });
});

async function openKioskDialog(initialTab: 'url' | 'sessions') {
  render(<SalasPage />);
  await waitFor(() => expect(screen.getByTestId('sala-aurora')).toBeInTheDocument());
  if (initialTab === 'sessions') {
    // Wave I.4 — botão "Em apresentação · N displays" continua inline.
    await waitFor(() =>
      expect(screen.getByTestId('sala-live-badge-aurora')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('sala-live-badge-aurora'));
  } else {
    // Wave I.4 — URL agora vive no OverflowMenu (`...`).
    await waitFor(() =>
      expect(screen.getByTestId('sala-more-aurora-trigger')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('sala-more-aurora-trigger'));
    const urlItem = await screen.findByTestId('sala-more-aurora-apresentacao-url');
    fireEvent.click(urlItem);
  }
  const initialPanelTestId =
    initialTab === 'url' ? 'sala-kiosk-url-tab' : 'sala-kiosk-sessions-tab';
  await waitFor(() =>
    expect(screen.getByTestId(initialPanelTestId)).toBeInTheDocument(),
  );
}

describe('Wave H.1 · Salas KioskDialog tabs', () => {
  it('1. Card mostra badge "Em apresentação · N displays" quando há sessões', async () => {
    render(<SalasPage />);
    await waitFor(() =>
      expect(screen.getByTestId('sala-live-badge-aurora')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('sala-live-badge-aurora')).toHaveTextContent(
      /Em apresentação · 2 displays/,
    );
  });

  it('2. Card mostra botão dedicado "Iniciar Apresentação"', async () => {
    render(<SalasPage />);
    await waitFor(() =>
      expect(
        screen.getByTestId('sala-start-presentation-aurora'),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('sala-start-presentation-aurora'));
    await waitFor(() => expect(WorkspaceKiosk.startSession).toHaveBeenCalled());
  });

  it('3. Tab "URL de kiosk" renderiza link compartilhável + QR + buttons', async () => {
    await openKioskDialog('url');
    fireEvent.click(screen.getByTestId('sala-kiosk-tab-url'));
    expect(screen.getByTestId('sala-kiosk-url-tab')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-url-value')).toHaveTextContent('/sala/aurora');
    expect(screen.getByTestId('sala-kiosk-url-qr')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-url-copy')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-open-window')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-open-fullscreen')).toBeInTheDocument();
  });

  it('4. URL Copy button copia link', async () => {
    await openKioskDialog('url');
    fireEvent.click(screen.getByTestId('sala-kiosk-url-copy'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/sala/aurora?kiosk=1'),
      ),
    );
  });

  it('5. Tab "Sessões ativas" lista sessões com device/browser/IP/started_by', async () => {
    await openKioskDialog('sessions');
    expect(screen.getByTestId('sala-kiosk-sessions-tab')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-session-sess-1')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-session-sess-1')).toHaveTextContent(
      'Chrome em macOS',
    );
    expect(screen.getByTestId('sala-kiosk-session-sess-1')).toHaveTextContent('10.0.0.5');
    expect(screen.getByTestId('sala-kiosk-session-sess-1')).toHaveTextContent('admin');
  });

  it('6. Encerrar uma sessão dispara endSession', async () => {
    await openKioskDialog('sessions');
    fireEvent.click(screen.getByTestId('sala-kiosk-end-sess-1'));
    await waitFor(() =>
      expect(WorkspaceKiosk.endSession).toHaveBeenCalledWith('ws-aurora', 'sess-1'),
    );
  });

  it('7. Encerrar todas dispara endAllSessions', async () => {
    await openKioskDialog('sessions');
    fireEvent.click(screen.getByTestId('sala-kiosk-end-all'));
    await waitFor(() => expect(WorkspaceKiosk.endAllSessions).toHaveBeenCalled());
  });

  it('8. Tab "Configuração" tem todos os toggles (3 antigos + 3 novos)', async () => {
    await openKioskDialog('url');
    fireEvent.click(screen.getByTestId('sala-kiosk-tab-config'));
    expect(screen.getByTestId('sala-kiosk-config-tab')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-hide-chrome')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-allow-exit')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-auto-fullscreen')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-allow-read-interaction')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-slide-loop')).toBeInTheDocument();
    expect(screen.getByTestId('sala-kiosk-slide-interval')).toBeInTheDocument();
  });

  it('9. Salvar configuração envia novos campos', async () => {
    await openKioskDialog('url');
    fireEvent.click(screen.getByTestId('sala-kiosk-tab-config'));
    fireEvent.click(screen.getByTestId('sala-kiosk-slide-loop'));
    fireEvent.click(screen.getByTestId('sala-kiosk-save'));
    await waitFor(() =>
      expect(WorkspaceKiosk.set).toHaveBeenCalledWith(
        'ws-aurora',
        expect.objectContaining({
          allow_read_interaction: true,
          slide_loop: true,
          slide_interval_seconds: 30,
        }),
      ),
    );
  });

  it('10. Tab "Histórico" mostra sessões encerradas com duration', async () => {
    await openKioskDialog('url');
    fireEvent.click(screen.getByTestId('sala-kiosk-tab-history'));
    expect(screen.getByTestId('sala-kiosk-history-tab')).toBeInTheDocument();
    // Apenas a sessão sess-3 (com ended_at) deve aparecer.
    expect(screen.getByTestId('sala-kiosk-history-sess-3')).toBeInTheDocument();
    expect(screen.queryByTestId('sala-kiosk-history-sess-1')).toBeNull();
  });
});
