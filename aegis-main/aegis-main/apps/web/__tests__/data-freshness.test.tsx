/**
 * Sprint L1.4 — <DataFreshness />
 */
import { render, screen } from '@testing-library/react';
import { DataFreshness } from '@/components/data-table/data-freshness';

describe('<DataFreshness />', () => {
  it('renders "Sem dados" when updatedAt is null', () => {
    render(<DataFreshness updatedAt={null} />);
    expect(screen.getByText(/sem dados/i)).toBeInTheDocument();
    expect(screen.getByTestId('data-freshness')).toHaveAttribute(
      'data-state',
      'unknown',
    );
  });

  it('renders fresh state when recent', () => {
    const ts = new Date(Date.now() - 10_000).toISOString();
    render(<DataFreshness updatedAt={ts} />);
    expect(screen.getByTestId('data-freshness')).toHaveAttribute(
      'data-state',
      'fresh',
    );
    expect(screen.getByText(/há 10s|agora/i)).toBeInTheDocument();
  });

  it('renders stale state past stale-after-s', () => {
    const ts = new Date(Date.now() - 120_000).toISOString();
    render(<DataFreshness updatedAt={ts} staleAfterS={60} />);
    expect(screen.getByTestId('data-freshness')).toHaveAttribute(
      'data-state',
      'stale',
    );
  });

  it('renders critical state past critical-after-s', () => {
    const ts = new Date(Date.now() - 600_000).toISOString();
    render(<DataFreshness updatedAt={ts} criticalAfterS={300} />);
    expect(screen.getByTestId('data-freshness')).toHaveAttribute(
      'data-state',
      'critical',
    );
  });

  it('uses pt-BR relative time labels', () => {
    const ts = new Date(Date.now() - 90_000).toISOString();
    render(<DataFreshness updatedAt={ts} />);
    expect(screen.getByText(/há 1min/)).toBeInTheDocument();
  });
});
