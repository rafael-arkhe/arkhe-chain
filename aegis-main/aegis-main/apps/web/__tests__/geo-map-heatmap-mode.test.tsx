/**
 * Geo Map — modo densidade (heatmap geoespacial).
 *
 * Verifica retrocompatibilidade (sem flag → pins) e que `mode: 'heatmap'`
 * / `heatmap: true` renderiza a camada de densidade (círculos de calor)
 * sem quebrar.
 */
import { render, screen } from '@testing-library/react';

import { GeoMap } from '@/components/workshop/widgets/geo-map';

type RP = Parameters<typeof GeoMap>[0];

function renderMap(
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
  return render(<GeoMap {...props} />);
}

const PONTOS = {
  pontos: [
    { lat: -23.55, lng: -46.63 },
    { lat: -23.56, lng: -46.64 },
    { lat: -22.91, lng: -43.21 },
  ],
};

describe('geo_map — modo densidade', () => {
  it('default (sem flag) continua plotando pins, não densidade', () => {
    renderMap({ source: 'pontos' }, PONTOS);
    expect(screen.getByTestId('geo-map-markers')).toBeInTheDocument();
    expect(screen.queryByTestId('geo-map-heatmap')).not.toBeInTheDocument();
    expect(screen.getByTestId('geo-map-marker-0')).toBeInTheDocument();
  });

  it('mode="heatmap" renderiza a camada de densidade (sem pins)', () => {
    renderMap({ source: 'pontos', mode: 'heatmap' }, PONTOS);
    expect(screen.getByTestId('geo-map-heatmap')).toBeInTheDocument();
    expect(screen.queryByTestId('geo-map-markers')).not.toBeInTheDocument();
    // um círculo de calor por ponto válido
    expect(screen.getByTestId('geo-map-heat-0')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-heat-1')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-heat-2')).toBeInTheDocument();
  });

  it('atalho booleano heatmap:true também ativa a densidade', () => {
    renderMap({ source: 'pontos', heatmap: true }, PONTOS);
    expect(screen.getByTestId('geo-map-heatmap')).toBeInTheDocument();
  });

  it('modo densidade sem pontos não quebra e mostra o vazio', () => {
    renderMap({ source: 'pontos', mode: 'heatmap' }, { pontos: [] });
    expect(screen.getByTestId('geo-map-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-empty')).toBeInTheDocument();
  });

  it('o canvas/grid SVG continua presente no modo densidade', () => {
    renderMap({ source: 'pontos', mode: 'heatmap' }, PONTOS);
    expect(screen.getByTestId('geo-map-svg')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-grid')).toBeInTheDocument();
  });
});
