/**
 * Sprint L7 — Slate Chart widget.
 */
import { render, screen } from '@testing-library/react';

import { SlateChart } from '@/components/workshop/widgets/slate-chart';

type RP = Parameters<typeof SlateChart>[0];

function renderChart(
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
  return render(<SlateChart {...props} />);
}

const rows = [
  { mes: 'Jan', bo: 142, prisoes: 30 },
  { mes: 'Fev', bo: 168, prisoes: 41 },
  { mes: 'Mar', bo: 134, prisoes: 28 },
  { mes: 'Abr', bo: 201, prisoes: 49 },
];

describe('slate_chart widget — Sprint L7', () => {
  it('renders empty state without x_field/series', () => {
    renderChart({ source: 'rows' }, { rows });
    expect(screen.getByTestId('slate-chart-empty')).toBeInTheDocument();
  });

  it('renders empty state with no rows', () => {
    renderChart(
      {
        source: 'rows',
        x_field: 'mes',
        series: [{ field: 'bo' }],
        kind: 'bar',
      },
      { rows: [] },
    );
    expect(screen.getByTestId('slate-chart-empty')).toBeInTheDocument();
  });

  it('renders SVG when configured (line kind default)', () => {
    renderChart(
      {
        source: 'rows',
        x_field: 'mes',
        series: [{ field: 'bo', label: 'BOs' }],
      },
      { rows },
    );
    expect(screen.getByTestId('slate-chart')).toBeInTheDocument();
    expect(screen.getByTestId('slate-chart-svg-line')).toBeInTheDocument();
  });

  it('supports bar kind', () => {
    renderChart(
      {
        source: 'rows',
        x_field: 'mes',
        kind: 'bar',
        series: [{ field: 'bo' }],
      },
      { rows },
    );
    expect(screen.getByTestId('slate-chart-svg-bar')).toBeInTheDocument();
  });

  it('supports area kind', () => {
    renderChart(
      {
        source: 'rows',
        x_field: 'mes',
        kind: 'area',
        series: [{ field: 'bo' }],
      },
      { rows },
    );
    expect(screen.getByTestId('slate-chart-svg-area')).toBeInTheDocument();
  });

  it('renders legend with all series', () => {
    renderChart(
      {
        source: 'rows',
        x_field: 'mes',
        kind: 'line',
        series: [
          { field: 'bo', label: 'BOs' },
          { field: 'prisoes', label: 'Prisões' },
        ],
      },
      { rows },
    );
    const legend = screen.getByTestId('slate-chart-legend');
    expect(legend).toHaveTextContent('BOs');
    expect(legend).toHaveTextContent('Prisões');
  });

  it('caps to 3 series even when more are provided', () => {
    renderChart(
      {
        source: 'rows',
        x_field: 'mes',
        kind: 'line',
        series: [
          { field: 'a' },
          { field: 'b' },
          { field: 'c' },
          { field: 'd' },
          { field: 'e' },
        ],
      },
      { rows },
    );
    // Three series → three groups
    const groups = screen.getAllByTestId(/^slate-chart-series-/);
    expect(groups).toHaveLength(3);
  });
});
