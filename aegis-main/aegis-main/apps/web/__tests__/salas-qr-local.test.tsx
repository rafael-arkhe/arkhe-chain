/**
 * Onda L.1 (2026-05-23) — QR do kiosk gerado LOCALMENTE (lib `qrcode`).
 *
 * Antes a Sala montava o QR via `api.qrserver.com` (rede externa), o que
 * quebrava em deploy air-gapped. Agora gera client-side como dataURL.
 * Zero dependência de rede externa.
 */
import * as fs from 'fs';
import * as path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SalasPage from '@/app/painel-de-controle/salas/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/painel-de-controle/salas',
}));
jest.mock('@/components/control-panel/cp-hub-subnav', () => ({ CpHubSubnav: () => null }));

// Mock qrcode → dataURL determinística, evita custo de cálculo no teste.
const FAKE_QR = 'data:image/png;base64,FAKEQRDATA';
jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn(() => Promise.resolve(FAKE_QR)) },
}));

const mockWorkspaces = [
  {
    id: 'ws-aurora',
    slug: 'aurora',
    display_name: 'Sala Aurora',
    description: 'Sala de teste',
    version: 1,
    signed_hash: 'abc123',
    config: {},
    tenant_id: 't1',
    project_id: 'p1',
  },
];

jest.mock('@/lib/api', () => ({
  Workspaces: {
    list: jest.fn(() => Promise.resolve(mockWorkspaces)),
    create: jest.fn(),
    publish: jest.fn(),
    delete: jest.fn(),
    versions: { list: jest.fn(() => Promise.resolve([])), republish: jest.fn() },
  },
  WorkspaceKiosk: {
    get: jest.fn(() =>
      Promise.resolve({
        workspace_id: 'ws-aurora',
        hide_chrome: true,
        allow_exit: true,
        auto_fullscreen: true,
        allow_read_interaction: true,
        slide_loop: false,
        slide_interval_seconds: 30,
        version: 1,
        active_sessions_count: 0,
      }),
    ),
    set: jest.fn(),
    listSessions: jest.fn(() => Promise.resolve([])),
    startSession: jest.fn(),
    endSession: jest.fn(),
    endAllSessions: jest.fn(),
  },
  WorkspacePromotions: {
    list: jest.fn(() => Promise.resolve([])),
    promote: jest.fn(),
    unpromote: jest.fn(),
  },
  Organizations: { list: jest.fn(() => Promise.resolve([])) },
  Projects: { list: jest.fn(() => Promise.resolve([])) },
  WorkspaceNavigation: { get: jest.fn(), set: jest.fn() },
  WorkspaceUpdates: {},
  KNOWN_APPLICATIONS: [],
  deriveKnownApplications: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ title }: { title: React.ReactNode }) => <h1>{title}</h1>,
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

const qrcode = jest.requireMock('qrcode') as {
  default: { toDataURL: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn(() => Promise.resolve()) },
  });
  Object.defineProperty(window, 'open', { value: jest.fn(), writable: true });
});

async function openUrlTab() {
  render(<SalasPage />);
  await waitFor(() => expect(screen.getByTestId('sala-aurora')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('sala-more-aurora-trigger'));
  const urlItem = await screen.findByTestId('sala-more-aurora-apresentacao-url');
  fireEvent.click(urlItem);
  await waitFor(() =>
    expect(screen.getByTestId('sala-kiosk-url-tab')).toBeInTheDocument(),
  );
}

describe('Onda L.1 · QR local no kiosk (sem rede externa)', () => {
  it('1. gera o QR via lib qrcode (toDataURL), não via URL remota', async () => {
    await openUrlTab();
    await waitFor(() => expect(qrcode.default.toDataURL).toHaveBeenCalled());
    const [arg] = qrcode.default.toDataURL.mock.calls[0];
    expect(String(arg)).toContain('/sala/aurora?kiosk=1');
  });

  it('2. <img> do QR recebe um data: URL local (não http)', async () => {
    await openUrlTab();
    await waitFor(() => {
      const img = screen.getByTestId('sala-kiosk-url-qr') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe(FAKE_QR);
    });
    const img = screen.getByTestId('sala-kiosk-url-qr') as HTMLImageElement;
    expect(img.getAttribute('src')).toMatch(/^data:image\//);
    expect(img.getAttribute('src')).not.toMatch(/^https?:/);
  });

  it('3. a página NÃO referencia api.qrserver.com nem URL de QR externa', () => {
    const file = path.join(
      __dirname,
      '..',
      'app',
      'painel-de-controle',
      'salas',
      'page.tsx',
    );
    const src = fs.readFileSync(file, 'utf8');
    expect(src).not.toMatch(/qrserver\.com/);
    expect(src).not.toMatch(/create-qr-code/);
    // E confirma que importa a lib local.
    expect(src).toMatch(/from ['"]qrcode['"]/);
  });
});
