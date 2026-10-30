/**
 * Sprint L7 — Time Axis widget.
 */
import { render, screen, fireEvent } from '@testing-library/react';

import { TimeAxis } from '@/components/workshop/widgets/time-axis';

type RP = Parameters<typeof TimeAxis>[0];

function renderAxis(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
) {
  const props = {
    config,
    variables,
    bindings: {},
    appId: 'test-app',
    setBinding: jest.fn(),
    emit: jest.fn(),
  } as unknown as RP;
  return render(<TimeAxis {...props} />);
}

const events = [
  { timestamp: '2026-05-01T10:00:00Z', label: 'Início' },
  { timestamp: '2026-05-03T14:30:00Z', label: 'Atualização' },
  { timestamp: '2026-05-10T08:15:00Z', label: 'Apreensão' },
  { timestamp: '2026-05-22T22:00:00Z', label: 'Encerramento' },
];

describe('time_axis widget — Sprint L7', () => {
  it('renders empty state without events', () => {
    renderAxis({});
    expect(screen.getByTestId('time-axis-empty')).toBeInTheDocument();
  });

  it('renders axis when source provides events', () => {
    renderAxis({ source: 'eventos' }, { eventos: events });
    expect(screen.getByTestId('time-axis')).toBeInTheDocument();
    // Cabeçalho mostra 4/4
    expect(screen.getByTestId('time-axis')).toHaveTextContent('4/4');
  });

  it('renders one marker per visible event', () => {
    renderAxis({ source: 'eventos' }, { eventos: events });
    const markers = screen.getAllByTestId(/^time-axis-marker-/);
    expect(markers).toHaveLength(events.length);
  });

  it('zoom-out is disabled at base zoom', () => {
    renderAxis({ source: 'eventos' }, { eventos: events });
    const zoomOut = screen.getByTestId('time-axis-zoom-out') as HTMLButtonElement;
    expect(zoomOut.disabled).toBe(true);
  });

  it('zoom-in expands zoom level', () => {
    renderAxis({ source: 'eventos' }, { eventos: events });
    const zoomIn = screen.getByTestId('time-axis-zoom-in');
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    // Não há crash + zoom-out fica habilitado
    const zoomOut = screen.getByTestId('time-axis-zoom-out') as HTMLButtonElement;
    expect(zoomOut.disabled).toBe(false);
  });

  it('respects custom timestamp_key', () => {
    renderAxis(
      { source: 'evts', timestamp_key: 'ts' },
      {
        evts: [
          { ts: '2026-05-01T00:00:00Z', label: 'a' },
          { ts: '2026-05-15T00:00:00Z', label: 'b' },
        ],
      },
    );
    expect(screen.getByTestId('time-axis')).toBeInTheDocument();
    const markers = screen.getAllByTestId(/^time-axis-marker-/);
    expect(markers).toHaveLength(2);
  });

  it('ignores entries with unparseable timestamps', () => {
    renderAxis(
      { source: 'evts' },
      {
        evts: [
          { timestamp: '2026-05-01T00:00:00Z', label: 'good' },
          { timestamp: 'not-a-date', label: 'bad' },
          { timestamp: '2026-05-15T00:00:00Z', label: 'good2' },
        ],
      },
    );
    const markers = screen.getAllByTestId(/^time-axis-marker-/);
    expect(markers).toHaveLength(2);
  });
});
