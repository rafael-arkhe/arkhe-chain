/**
 * Wave D.4 — Container Group widget tests (2026-05-23).
 */
import { render, screen, fireEvent } from '@testing-library/react';

import { ContainerGroup } from '@/components/workshop/widgets/container-group';

type RP = Parameters<typeof ContainerGroup>[0];

function renderCG(config: Record<string, unknown>) {
  const props = {
    config,
    variables: {},
    bindings: {},
    appId: 'test-app',
    setBinding: jest.fn(),
    emit: jest.fn(),
  } as unknown as RP;
  return render(<ContainerGroup {...props} />);
}

describe('container_group widget — Wave D.4', () => {
  it('renderiza com título e contagem zero quando vazio', () => {
    renderCG({ title: 'Identificação' });
    expect(screen.getByTestId('container-group-widget')).toBeInTheDocument();
    expect(screen.getByText('Identificação')).toBeInTheDocument();
    expect(screen.getByTestId('container-group-count')).toHaveTextContent(
      '0 widgets',
    );
    expect(screen.getByTestId('container-group-empty')).toBeInTheDocument();
  });

  it('mostra chips por id quando children_ids é array', () => {
    renderCG({
      title: 'Endereços',
      children_ids: ['principal', 'comercial', 'familiar'],
    });
    expect(screen.getByTestId('container-group-count')).toHaveTextContent(
      '3 widgets',
    );
    expect(screen.getByTestId('container-group-child-0')).toHaveTextContent(
      'principal',
    );
    expect(screen.getByTestId('container-group-child-2')).toHaveTextContent(
      'familiar',
    );
  });

  it('aceita children_ids como JSON string', () => {
    renderCG({ children_ids: '["a","b"]' });
    expect(screen.getByTestId('container-group-count')).toHaveTextContent('2');
  });

  it('aceita children_ids como CSV', () => {
    renderCG({ children_ids: 'um, dois, tres' });
    expect(screen.getByTestId('container-group-count')).toHaveTextContent('3');
    expect(screen.getByTestId('container-group-child-1')).toHaveTextContent('dois');
  });

  it('respeita initially_collapsed e expande ao clicar no toggle', () => {
    renderCG({
      title: 'Doc',
      children_ids: ['a'],
      initially_collapsed: true,
    });
    // Body não aparece
    expect(screen.queryByTestId('container-group-body')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('container-group-toggle'));
    expect(screen.getByTestId('container-group-body')).toBeInTheDocument();
  });

  it('singular quando exatamente 1 widget', () => {
    renderCG({ children_ids: ['solo'] });
    expect(screen.getByTestId('container-group-count')).toHaveTextContent(
      '1 widget',
    );
  });
});
