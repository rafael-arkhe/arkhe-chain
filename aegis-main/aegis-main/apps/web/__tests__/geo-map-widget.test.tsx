/**
 * Sprint L16 — Geo Map widget tests (Layout da Sala, 2026-05-23).
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

describe('geo_map widget — Sprint L16', () => {
  it('renders the SVG canvas + grid even with no markers', () => {
    renderMap({});
    expect(screen.getByTestId('geo-map-widget')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-svg')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-grid')).toBeInTheDocument();
  });

  it('shows the empty placeholder when source is unset', () => {
    renderMap({});
    expect(screen.getByTestId('geo-map-empty')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-count')).toHaveTextContent('0 marcadores');
  });

  it('renders one marker per point in the source variable', () => {
    renderMap(
      { source: 'pontos' },
      {
        pontos: [
          { lat: -23.55, lng: -46.63, label: 'SP' },
          { lat: -22.91, lng: -43.21, label: 'RJ' },
        ],
      },
    );
    expect(screen.getByTestId('geo-map-marker-0')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-marker-1')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-count')).toHaveTextContent('2 marcadores');
  });

  it('uses singular "marcador" when only 1 point', () => {
    renderMap(
      { source: 'p' },
      { p: [{ lat: 0, lng: 0, label: 'Origem' }] },
    );
    expect(screen.getByTestId('geo-map-count')).toHaveTextContent('1 marcador');
  });

  // Onda 5 (mapa-de-calor do síndico) — o objectSet canônico do vertical traz a
  // posição em properties.geopoint; o widget precisa descer nela (não só no topo).
  it('reads lat/lng from properties.geopoint (canonical ontology instances)', () => {
    renderMap(
      { source: 'desvios' },
      {
        desvios: [
          { id: 'e1', name: 'Desvio A', node_type: 'evento',
            properties: { categoria: 'desvio', geopoint: { lat: -23.55, lng: -46.63 } } },
          { id: 'e2', name: 'Desvio B', node_type: 'evento',
            properties: { categoria: 'desvio', geo: { lat: -22.91, lon: -43.21 } } },
        ],
      },
    );
    expect(screen.getByTestId('geo-map-count')).toHaveTextContent('2 marcadores');
    expect(screen.getByTestId('geo-map-marker-0')).toBeInTheDocument();
    expect(screen.getByTestId('geo-map-marker-1')).toBeInTheDocument();
  });

  it('event without any geopoint is skipped (heatmap tolerates sparse geo)', () => {
    renderMap(
      { source: 'desvios' },
      {
        desvios: [
          { id: 'e1', name: 'Com geo', properties: { geopoint: { lat: -23.5, lng: -46.6 } } },
          { id: 'e2', name: 'Sem geo', properties: { categoria: 'desvio' } },
        ],
      },
    );
    expect(screen.getByTestId('geo-map-count')).toHaveTextContent('1 marcador');
  });

  it('skips entries with non-numeric coordinates without crashing', () => {
    renderMap(
      { source: 'p' },
      {
        p: [
          { lat: -23.55, lng: -46.63 }, // valid
          { lat: 'foo', lng: 'bar' },    // invalid → skip
          { foo: 'baz' },                // missing lat/lng → skip
        ],
      },
    );
    expect(screen.getByTestId('geo-map-marker-0')).toBeInTheDocument();
    expect(screen.queryByTestId('geo-map-marker-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('geo-map-count')).toHaveTextContent('1 marcador');
  });

  it('renders the optional title above the canvas', () => {
    renderMap({ title: 'Ocorrências SP' });
    expect(screen.getByText('Ocorrências SP')).toBeInTheDocument();
  });

  it('accepts {rows: [...]} envelope and normalizes', () => {
    renderMap(
      { source: 'p' },
      {
        p: {
          rows: [
            { lat: 10, lng: 20 },
            { lat: 30, lng: 40 },
            { lat: 50, lng: 60 },
          ],
        },
      },
    );
    expect(screen.getByTestId('geo-map-count')).toHaveTextContent('3 marcadores');
  });
});
