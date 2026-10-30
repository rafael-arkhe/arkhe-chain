/**
 * Wave G.3 — Vega Chart widget tests (2026-05-23).
 *
 * Cobre o caminho fallback SVG (vega-embed não está instalado no projeto).
 * Quando o pacote estiver presente, o iframe nativo substitui o canvas;
 * cobertura nativa fica para um spec E2E + visual diff.
 */
import { render, screen } from '@testing-library/react';

import { VegaChart } from '@/components/workshop/widgets/vega-chart';

type RP = Parameters<typeof VegaChart>[0];

// Polyfill mínimo do ResizeObserver (jsdom não tem).
class ResizeObserverPoly {
  observe() {
    /* noop */
  }
  unobserve() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = ResizeObserverPoly;

function renderVC(
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
  return render(<VegaChart {...props} />);
}

const BASE_SPEC = {
  mark: 'bar',
  encoding: {
    x: { field: 'categoria', type: 'nominal' },
    y: { field: 'valor', type: 'quantitative' },
  },
  data: {
    values: [
      { categoria: 'A', valor: 10 },
      { categoria: 'B', valor: 25 },
      { categoria: 'C', valor: 15 },
    ],
  },
};

describe('vega_chart widget — Wave G.3', () => {
  it('mostra placeholder quando spec ausente', () => {
    renderVC({});
    expect(screen.getByTestId('vega-chart-empty')).toBeInTheDocument();
  });

  it('renderiza canvas + SVG fallback com bar mark', async () => {
    renderVC({ spec: BASE_SPEC });
    expect(screen.getByTestId('vega-chart-widget')).toBeInTheDocument();
    expect(screen.getByTestId('vega-chart-canvas')).toBeInTheDocument();
    // O SVG fallback aparece imediatamente; vega-embed é assíncrono.
    expect(screen.getByTestId('vega-chart-svg')).toHaveAttribute('data-mark', 'bar');
  });

  it('aceita spec como string JSON', () => {
    renderVC({ spec: JSON.stringify(BASE_SPEC) });
    expect(screen.getByTestId('vega-chart-svg')).toBeInTheDocument();
  });

  it('substitui spec.data.values quando `source` aponta para variable array', () => {
    const customData = [
      { categoria: 'X', valor: 99 },
      { categoria: 'Y', valor: 50 },
    ];
    renderVC(
      { spec: BASE_SPEC, source: 'meus_dados' },
      { meus_dados: customData },
    );
    const svg = screen.getByTestId('vega-chart-svg');
    expect(svg).toBeInTheDocument();
    // Confere que o maior label do eixo Y reflete o maior valor (99).
    const text = svg.textContent ?? '';
    expect(text).toContain('99');
  });

  it('renderiza titulo no header quando configurado', () => {
    renderVC({ spec: BASE_SPEC, title: 'Receita 2026' });
    expect(screen.getByText('Receita 2026')).toBeInTheDocument();
  });

  it('mostra estado "sem dados" quando array de values é vazio', () => {
    const empty = { ...BASE_SPEC, data: { values: [] } };
    renderVC({ spec: empty });
    expect(screen.getByTestId('vega-chart-no-data')).toBeInTheDocument();
  });
});
