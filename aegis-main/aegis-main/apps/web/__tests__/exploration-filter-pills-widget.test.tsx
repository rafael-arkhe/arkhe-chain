/**
 * Wave G.3 — Exploration Filter Pills widget tests (2026-05-23).
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { ExplorationFilterPills } from '@/components/workshop/widgets/exploration-filter-pills';

type RP = Parameters<typeof ExplorationFilterPills>[0];

const PILLS = [
  { value: 'critica', label: 'Crítica', group: 'Severidade' },
  { value: 'alta', label: 'Alta', group: 'Severidade' },
  { value: 'sp', label: 'SP', group: 'UF' },
  { value: 'rj', label: 'RJ', group: 'UF' },
];

function renderEFP(
  config: Record<string, unknown>,
  bindings: Record<string, unknown> = {},
) {
  const setBinding = jest.fn();
  const emit = jest.fn();
  const props = {
    config,
    variables: {},
    bindings,
    appId: 'test-app',
    setBinding,
    emit,
  } as unknown as RP;
  const utils = render(<ExplorationFilterPills {...props} />);
  return { ...utils, setBinding, emit };
}

describe('exploration_filter_pills widget — Wave G.3', () => {
  it('mostra hint de config quando genuinamente não-configurado (sem target/fonte)', () => {
    renderEFP({});
    expect(
      screen.getByTestId('exploration-filter-pills-unconfigured'),
    ).toBeInTheDocument();
  });

  it('renderiza grupos rotulados com pills correspondentes', () => {
    renderEFP({ target: 'filtros', pills: PILLS, title: 'Explorar' });
    expect(
      screen.getByTestId('exploration-filter-pills-group-Severidade'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('exploration-filter-pills-group-UF'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('exploration-filter-pill-critica')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-filter-pill-sp')).toBeInTheDocument();
  });

  it('clica em pill emite painel.filter.changed + grava target', () => {
    const { setBinding, emit } = renderEFP({
      target: 'filtros',
      pills: PILLS,
    });
    fireEvent.click(screen.getByTestId('exploration-filter-pill-alta'));
    expect(setBinding).toHaveBeenCalledWith('filtros', ['alta']);
    expect(emit).toHaveBeenCalledWith(
      'painel.filter.changed',
      expect.objectContaining({
        active: ['alta'],
        by_group: { Severidade: ['alta'] },
        target: 'filtros',
      }),
    );
  });

  it('quando target_by_group definido, grava mapa por grupo no setBinding', () => {
    const { setBinding } = renderEFP({
      target: 'filtros',
      target_by_group: 'filtros_grp',
      pills: PILLS,
    });
    fireEvent.click(screen.getByTestId('exploration-filter-pill-sp'));
    const grpCall = setBinding.mock.calls.find(
      (c) => c[0] === 'filtros_grp',
    );
    expect(grpCall).toBeTruthy();
    expect(grpCall![1]).toEqual({ UF: ['sp'] });
  });

  it('multi=false: nova seleção substitui antiga', () => {
    const { setBinding } = renderEFP(
      { target: 'filtros', pills: PILLS, multi: false },
      { filtros: 'critica' },
    );
    fireEvent.click(screen.getByTestId('exploration-filter-pill-alta'));
    expect(setBinding).toHaveBeenCalledWith('filtros', 'alta');
  });

  it('botão limpar zera seleção e emite array vazio', () => {
    const { setBinding, emit } = renderEFP(
      { target: 'filtros', pills: PILLS },
      { filtros: ['critica', 'sp'] },
    );
    fireEvent.click(screen.getByTestId('exploration-filter-pills-clear'));
    expect(setBinding).toHaveBeenCalledWith('filtros', []);
    expect(emit).toHaveBeenCalledWith(
      'painel.filter.changed',
      expect.objectContaining({ active: [], by_group: {} }),
    );
  });
});
