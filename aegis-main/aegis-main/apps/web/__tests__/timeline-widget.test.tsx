/**
 * Sprint L17 — Timeline widget.
 */
import { render, screen } from '@testing-library/react';
import { Timeline } from '@/components/workshop/widgets/timeline';

type RP = Parameters<typeof Timeline>[0];
function renderTimeline(config: Record<string, unknown>, variables: Record<string, unknown>) {
  const props = { config, variables, app: null, widget: null } as unknown as RP;
  return render(<Timeline {...props} />);
}

const events = [
  {
    timestamp: '2026-05-23T10:30:00Z',
    label: 'Caso aberto',
    kind: 'create',
    actor: 'alice',
  },
  {
    timestamp: '2026-05-23T10:45:00Z',
    label: 'Severidade alta',
    kind: 'update',
    actor: 'bob',
  },
  {
    timestamp: '2026-05-23T11:15:00Z',
    label: 'Ação executada',
    kind: 'action.execute.success',
    actor: 'carol',
  },
];

describe('Timeline widget — Sprint L17', () => {
  it('renders empty state when source is unset', () => {
    renderTimeline({}, {});
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument();
  });

  it('renders events with labels and actors', () => {
    renderTimeline({ source: 'audit' }, { audit: events });
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
    expect(screen.getByText('Caso aberto')).toBeInTheDocument();
    expect(screen.getByText('Severidade alta')).toBeInTheDocument();
    expect(screen.getByText(/por alice/)).toBeInTheDocument();
  });

  it('orders descending by default (newest first)', () => {
    renderTimeline({ source: 'audit' }, { audit: events });
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ação executada');
    expect(items[2]).toHaveTextContent('Caso aberto');
  });

  it('orders ascending when direction=asc', () => {
    renderTimeline(
      { source: 'audit', direction: 'asc' },
      { audit: events },
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Caso aberto');
    expect(items[2]).toHaveTextContent('Ação executada');
  });

  it('truncates to max_items + shows count', () => {
    renderTimeline(
      { source: 'audit', max_items: 2 },
      { audit: events },
    );
    expect(screen.getByText(/\+ 1 eventos não mostrados/)).toBeInTheDocument();
  });
});
