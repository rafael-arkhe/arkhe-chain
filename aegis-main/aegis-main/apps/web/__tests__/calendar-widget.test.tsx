/**
 * Sprint L16 — Calendar (heatmap) widget tests (Layout da Sala, 2026-05-23).
 */
import { render, screen } from '@testing-library/react';

import { Calendar } from '@/components/workshop/widgets/calendar';

type RP = Parameters<typeof Calendar>[0];

function renderCal(
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
  return render(<Calendar {...props} />);
}

describe('calendar widget — Sprint L16', () => {
  it('renders SVG with 52*7 = 364 cells regardless of input', () => {
    renderCal({});
    expect(screen.getByTestId('calendar-widget')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-svg')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-cell-0')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-cell-363')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-cell-364')).not.toBeInTheDocument();
  });

  it('shows total = 0 when no source data is provided', () => {
    renderCal({});
    expect(screen.getByTestId('calendar-total')).toHaveTextContent('Total: 0');
  });

  it('sums counts from array-of-objects source format', () => {
    renderCal(
      { source: 'a', end_date: '2026-05-23' },
      {
        a: [
          { date: '2026-05-23', count: 5 },
          { date: '2026-05-22', count: 3 },
          { date: '2026-05-21', count: 12 },
        ],
      },
    );
    expect(screen.getByTestId('calendar-total')).toHaveTextContent('Total: 20');
  });

  it('accepts map source format {YYYY-MM-DD: count}', () => {
    renderCal(
      { source: 'a', end_date: '2026-05-23' },
      {
        a: {
          '2026-05-22': 7,
          '2026-05-23': 8,
        },
      },
    );
    expect(screen.getByTestId('calendar-total')).toHaveTextContent('Total: 15');
  });

  it('renders the 5-step legend regardless of data', () => {
    renderCal({});
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`calendar-legend-step-${i}`)).toBeInTheDocument();
    }
  });

  it('respects color_scale config (renders without errors)', () => {
    renderCal({ color_scale: 'emerald' });
    expect(screen.getByTestId('calendar-svg')).toBeInTheDocument();
  });

  it('renders title when set', () => {
    renderCal({ title: 'Atividade 12m' });
    expect(screen.getByText('Atividade 12m')).toBeInTheDocument();
  });
});
