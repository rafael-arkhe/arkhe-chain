/**
 * Wave H.1 (2026-05-23) — TourRunner + isTourEligible predicate.
 *
 * Runtime de Tours montado no AuthShell:
 *   - resolve workspaceId via pathname /sala/{slug}
 *   - busca unseen tours
 *   - aplica filtros de trigger (target_pages prefix match + datas)
 *   - dispara TourPreview com preview-mode-OFF + markSeen
 */
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import { TourRunner, isTourEligible } from '@/components/tours/tour-runner';
import type { WorkspaceUpdate } from '@/lib/api';

let mockPath = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
}));

const tour: WorkspaceUpdate = {
  id: 'tour-1',
  workspace_id: 'ws-aurora',
  title: 'Tour de boas-vindas',
  summary: null,
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
  trigger: null,
};

jest.mock('@/lib/api', () => ({
  Workspaces: {
    list: jest.fn(() =>
      Promise.resolve([
        { id: 'ws-aurora', slug: 'aurora', display_name: 'Sala Aurora' },
      ]),
    ),
  },
  WorkspaceUpdates: {
    listUnseen: jest.fn(() => Promise.resolve([tour])),
    markSeen: jest.fn(() => Promise.resolve()),
  },
}));

const { WorkspaceUpdates } = jest.requireMock('@/lib/api') as {
  WorkspaceUpdates: {
    listUnseen: jest.Mock;
    markSeen: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/';
});

describe('Wave H.1 · isTourEligible predicate', () => {
  it('1. Tour archived nunca é elegível', () => {
    const t = { ...tour, status: 'archived' as const };
    expect(isTourEligible(t, '/sala/aurora', new Date('2026-05-23'))).toBe(false);
  });

  it('2. Trigger sem target_pages = sempre elegível', () => {
    expect(isTourEligible(tour, '/qualquer/path', new Date('2026-05-23'))).toBe(true);
  });

  it('3. target_pages com prefix match passa', () => {
    const t: WorkspaceUpdate = {
      ...tour,
      trigger: { target_pages: ['/sala/aurora'] },
    };
    expect(isTourEligible(t, '/sala/aurora', new Date('2026-05-23'))).toBe(true);
    expect(isTourEligible(t, '/sala/aurora/briefing', new Date('2026-05-23'))).toBe(true);
  });

  it('4. target_pages sem match = não elegível', () => {
    const t: WorkspaceUpdate = {
      ...tour,
      trigger: { target_pages: ['/sala/aurora'] },
    };
    expect(isTourEligible(t, '/sala/outra', new Date('2026-05-23'))).toBe(false);
  });

  it('5. start_at no futuro = não elegível ainda', () => {
    const t: WorkspaceUpdate = {
      ...tour,
      trigger: { start_at: '2026-06-01T00:00:00Z' },
    };
    expect(isTourEligible(t, '/sala/aurora', new Date('2026-05-23'))).toBe(false);
  });

  it('6. end_at no passado = expirado', () => {
    const t: WorkspaceUpdate = {
      ...tour,
      trigger: { end_at: '2026-05-01T00:00:00Z' },
    };
    expect(isTourEligible(t, '/sala/aurora', new Date('2026-05-23'))).toBe(false);
  });

  it('7. Janela ativa (start <= now < end) = elegível', () => {
    const t: WorkspaceUpdate = {
      ...tour,
      trigger: {
        start_at: '2026-05-20T00:00:00Z',
        end_at: '2026-06-01T00:00:00Z',
      },
    };
    expect(isTourEligible(t, '/sala/aurora', new Date('2026-05-23'))).toBe(true);
  });
});

describe('Wave H.1 · TourRunner runtime', () => {
  it('8. Sem pathname /sala/* + sem workspaceId prop = não renderiza nada', async () => {
    mockPath = '/painel-de-controle';
    const { container } = render(<TourRunner />);
    await waitFor(() =>
      expect(container.querySelector('[data-testid="tour-runner-active"]')).toBeNull(),
    );
  });

  it('9. Com workspaceId prop + unseen tour = renderiza overlay', async () => {
    mockPath = '/sala/aurora';
    render(<TourRunner workspaceId="ws-aurora" />);
    await waitFor(() =>
      expect(screen.getByTestId('tour-runner-active')).toBeInTheDocument(),
    );
    expect(WorkspaceUpdates.listUnseen).toHaveBeenCalledWith('ws-aurora');
  });

  it('10. disabled=true não chama listUnseen', async () => {
    mockPath = '/sala/aurora';
    render(<TourRunner workspaceId="ws-aurora" disabled />);
    // Aguarda um tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(WorkspaceUpdates.listUnseen).not.toHaveBeenCalled();
  });

  it('11. Sair (X) marca dismissed=true', async () => {
    mockPath = '/sala/aurora';
    render(<TourRunner workspaceId="ws-aurora" />);
    await waitFor(() => screen.getByTestId('tour-runner-active'));
    fireEvent.click(screen.getByTestId('tour-preview-exit'));
    await waitFor(() =>
      expect(WorkspaceUpdates.markSeen).toHaveBeenCalledWith(
        'ws-aurora',
        'tour-1',
        { dismissed: true },
      ),
    );
  });

  it('12. Concluir marca dismissed=false (visto naturalmente)', async () => {
    mockPath = '/sala/aurora';
    render(<TourRunner workspaceId="ws-aurora" />);
    await waitFor(() => screen.getByTestId('tour-runner-active'));
    fireEvent.click(screen.getByTestId('tour-preview-next'));
    await waitFor(() =>
      expect(WorkspaceUpdates.markSeen).toHaveBeenCalledWith(
        'ws-aurora',
        'tour-1',
        { dismissed: false },
      ),
    );
  });
});
