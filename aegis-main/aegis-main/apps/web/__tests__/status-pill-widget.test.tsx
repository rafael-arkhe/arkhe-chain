/**
 * Wave D.4 — Status Pill widget tests (2026-05-23).
 */
import { render, screen } from '@testing-library/react';

import { StatusPill } from '@/components/workshop/widgets/status-pill';

type RP = Parameters<typeof StatusPill>[0];

function renderSP(
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
  return render(<StatusPill {...props} />);
}

describe('status_pill widget — Wave D.4', () => {
  it('renderiza com tone neutral quando não há mapping nem source', () => {
    renderSP({});
    expect(screen.getByTestId('status-pill-widget')).toBeInTheDocument();
    const pill = screen.getByTestId('status-pill');
    expect(pill.getAttribute('data-tone')).toBe('neutral');
    expect(screen.getByTestId('status-pill-label')).toHaveTextContent('—');
  });

  it('aplica tone do mapping que casa', () => {
    renderSP(
      {
        source: 'st',
        mappings: [
          { value: 'aberto', label: 'Em aberto', tone: 'warning' },
          { value: 'fechado', label: 'Fechado', tone: 'success' },
        ],
      },
      { st: 'fechado' },
    );
    const pill = screen.getByTestId('status-pill');
    expect(pill.getAttribute('data-tone')).toBe('success');
    expect(screen.getByTestId('status-pill-label')).toHaveTextContent('Fechado');
  });

  it('usa fallback_label quando valor não casa', () => {
    renderSP(
      {
        source: 'st',
        fallback_label: 'Desconhecido',
        mappings: [{ value: 'aberto', label: 'Aberto', tone: 'warning' }],
      },
      { st: 'inexistente' },
    );
    expect(screen.getByTestId('status-pill-label')).toHaveTextContent(
      'Desconhecido',
    );
    expect(screen.getByTestId('status-pill').getAttribute('data-tone')).toBe(
      'neutral',
    );
  });

  it('compara number como string', () => {
    renderSP(
      {
        source: 'n',
        mappings: [
          { value: '1', label: 'Um', tone: 'primary' },
          { value: '2', label: 'Dois', tone: 'danger' },
        ],
      },
      { n: 2 },
    );
    expect(screen.getByTestId('status-pill-label')).toHaveTextContent('Dois');
  });

  it('aceita mappings serializado como JSON string', () => {
    renderSP(
      {
        source: 'st',
        mappings: '[{"value":"x","label":"X","tone":"primary"}]',
      },
      { st: 'x' },
    );
    expect(screen.getByTestId('status-pill-label')).toHaveTextContent('X');
    expect(screen.getByTestId('status-pill').getAttribute('data-tone')).toBe(
      'primary',
    );
  });

  it('mostra valor raw para debug', () => {
    renderSP({ source: 'st' }, { st: 'foo' });
    expect(screen.getByTestId('status-pill-raw')).toHaveTextContent('foo');
  });
});
