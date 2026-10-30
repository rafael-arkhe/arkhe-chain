/**
 * Wave G.2 — Changelog panel tests (2026-05-23).
 *
 * /painel-de-controle/changelog/[workspace_id] — lista LineageEvents
 * filtrados por workspace via metadata.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ChangelogPage from '@/app/painel-de-controle/changelog/[workspace_id]/page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ workspace_id: 'app-xyz' }),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    Lineage: {
      listEvents: jest.fn(),
      getEvent: jest.fn(),
    },
  };
});

jest.mock('@/lib/workshop/client', () => ({
  Workshop: { get: jest.fn() },
}));

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { Lineage } = jest.requireMock('@/lib/api') as {
  Lineage: { listEvents: jest.Mock };
};
const { Workshop } = jest.requireMock('@/lib/workshop/client') as {
  Workshop: { get: jest.Mock };
};

const fakeEvents = [
  {
    id: 'e1',
    event_type: 'workshop.app.update',
    actor: 'alice',
    status: 'committed',
    metadata_: { app_id: 'app-xyz', diff: { added: 1 } },
    timestamp: '2026-05-23T10:00:00Z',
    tenant_id: 't',
  },
  {
    id: 'e2',
    event_type: 'workshop.app.publish',
    actor: 'bob',
    status: 'failed',
    metadata_: { app_id: 'app-xyz', reason: 'invalid' },
    timestamp: '2026-05-23T11:00:00Z',
    tenant_id: 't',
  },
  {
    id: 'e3',
    event_type: 'workshop.app.update',
    actor: 'carol',
    status: 'committed',
    metadata_: { app_id: 'other-app' },
    timestamp: '2026-05-23T12:00:00Z',
    tenant_id: 't',
  },
];

describe('ChangelogPage — Wave G.2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Workshop.get.mockResolvedValue({
      id: 'app-xyz',
      display: 'Painel XYZ',
      schema_version: 2,
      variables: [],
      layout: { columns: 20, root: [] },
    });
  });

  it('renderiza shell + chama Lineage.listEvents', async () => {
    Lineage.listEvents.mockResolvedValue(fakeEvents);
    render(<ChangelogPage />);
    expect(await screen.findByTestId('changelog-page')).toBeInTheDocument();
    await waitFor(() => expect(Lineage.listEvents).toHaveBeenCalled());
  });

  it('filtra eventos por app_id no metadata (apenas 2 visíveis)', async () => {
    Lineage.listEvents.mockResolvedValue(fakeEvents);
    render(<ChangelogPage />);
    await screen.findByTestId('changelog-event-e1');
    expect(screen.getByTestId('changelog-event-e2')).toBeInTheDocument();
    expect(screen.queryByTestId('changelog-event-e3')).toBeNull();
    const count = screen.getByTestId('changelog-count');
    expect(count.textContent).toContain('2/3');
  });

  it('filtra por status committed via chip', async () => {
    Lineage.listEvents.mockResolvedValue(fakeEvents);
    render(<ChangelogPage />);
    await screen.findByTestId('changelog-event-e1');
    fireEvent.click(screen.getByTestId('changelog-status-committed'));
    await waitFor(() =>
      expect(screen.queryByTestId('changelog-event-e2')).toBeNull(),
    );
    expect(screen.getByTestId('changelog-event-e1')).toBeInTheDocument();
  });

  it('filtra por actor (substring case-insensitive)', async () => {
    Lineage.listEvents.mockResolvedValue(fakeEvents);
    render(<ChangelogPage />);
    await screen.findByTestId('changelog-event-e1');
    const input = screen.getByTestId('changelog-filter-actor');
    fireEvent.change(input, { target: { value: 'BO' } });
    await waitFor(() =>
      expect(screen.queryByTestId('changelog-event-e1')).toBeNull(),
    );
    expect(screen.getByTestId('changelog-event-e2')).toBeInTheDocument();
  });

  it('expande metadata via toggle', async () => {
    Lineage.listEvents.mockResolvedValue(fakeEvents);
    render(<ChangelogPage />);
    const btn = await screen.findByTestId('changelog-event-toggle-e1');
    fireEvent.click(btn);
    expect(screen.getByTestId('changelog-event-meta-e1')).toBeInTheDocument();
    expect(
      screen.getByTestId('changelog-event-meta-e1').textContent,
    ).toContain('app-xyz');
  });

  it('mostra estado vazio quando nenhum evento bate com filtros', async () => {
    Lineage.listEvents.mockResolvedValue([
      {
        id: 'e9',
        event_type: 'foo',
        actor: 'x',
        status: 'committed',
        metadata_: { app_id: 'unrelated' },
        timestamp: '2026-05-23T10:00:00Z',
        tenant_id: 't',
      },
    ]);
    render(<ChangelogPage />);
    await waitFor(() =>
      expect(screen.getByTestId('changelog-clear-filters')).toBeInTheDocument(),
    );
  });

  it('mostra erro quando Lineage.listEvents falha', async () => {
    Lineage.listEvents.mockRejectedValue(new Error('boom'));
    render(<ChangelogPage />);
    await waitFor(() =>
      expect(screen.getByTestId('changelog-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('changelog-error').textContent).toContain('boom');
  });
});
