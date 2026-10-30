/**
 * Heatmap (matriz) widget tests.
 *
 * Verifica: render de células coloridas por intensidade a partir de um
 * object set mockado (agregação row × col, igual ao pivot_table), legenda
 * de escala, rótulos de eixos e placeholders de config/empty.
 */
import { render, screen } from '@testing-library/react';

import { HeatmapMatrix } from '@/components/workshop/widgets/heatmap';

type RP = Parameters<typeof HeatmapMatrix>[0];

function renderHM(
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
  return render(<HeatmapMatrix {...props} />);
}

const ROWS = [
  { bairro: 'Centro', hora: '08h', ocorrencias: 10 },
  { bairro: 'Centro', hora: '20h', ocorrencias: 40 },
  { bairro: 'Norte', hora: '08h', ocorrencias: 2 },
  { bairro: 'Norte', hora: '20h', ocorrencias: 20 },
];

describe('heatmap widget', () => {
  it('pede configuração quando row/col_field não estão setados', () => {
    renderHM({ source: 'rows' }, { rows: ROWS });
    expect(screen.queryByTestId('heatmap-matrix')).not.toBeInTheDocument();
    // mostra o hint i18n (chave resolve via fallback pt-BR fora do provider)
    expect(screen.getByText(/Configure o campo das linhas/i)).toBeInTheDocument();
  });

  it('renderiza células coloridas por intensidade a partir do object set', () => {
    renderHM(
      {
        source: 'rows',
        row_field: 'bairro',
        col_field: 'hora',
        value_field: 'ocorrencias',
        agg: 'sum',
      },
      { rows: ROWS },
    );
    expect(screen.getByTestId('heatmap-matrix')).toBeInTheDocument();

    // 2 linhas × 2 colunas = 4 células.
    const hi = screen.getByTestId('heatmap-cell-Centro-20h'); // valor 40 (máx)
    const lo = screen.getByTestId('heatmap-cell-Norte-08h'); // valor 2 (mín)
    expect(hi).toBeInTheDocument();
    expect(lo).toBeInTheDocument();

    // valor agregado anotado na célula
    expect(hi).toHaveAttribute('data-value', '40');
    expect(lo).toHaveAttribute('data-value', '2');

    // a célula de pico tem opacidade de preenchimento maior que a mínima
    const hiFill = screen.getByTestId('heatmap-fill-Centro-20h');
    const loFill = screen.getByTestId('heatmap-fill-Norte-08h');
    const opHi = parseFloat(hiFill.style.opacity || '0');
    const opLo = parseFloat(loFill.style.opacity || '0');
    expect(opHi).toBeGreaterThan(opLo);
    // pico vai a 1; mínimo fica no piso da rampa (~0.08)
    expect(opHi).toBeCloseTo(1, 5);
    expect(opLo).toBeLessThan(0.2);
  });

  it('rotula os eixos e exibe a legenda de escala', () => {
    renderHM(
      { source: 'rows', row_field: 'bairro', col_field: 'hora' },
      { rows: ROWS },
    );
    // rótulo do eixo de linhas (header)
    expect(screen.getByText('bairro')).toBeInTheDocument();
    // valores de coluna aparecem como cabeçalhos
    expect(screen.getByText('08h')).toBeInTheDocument();
    expect(screen.getByText('20h')).toBeInTheDocument();
    // legenda de escala presente
    expect(screen.getByTestId('heatmap-legend')).toBeInTheDocument();
  });

  it('conta ocorrências (count) quando não há value_field', () => {
    renderHM(
      { source: 'rows', row_field: 'bairro', col_field: 'hora' },
      { rows: ROWS },
    );
    // cada par bairro×hora aparece 1 vez → count = 1 em cada célula
    expect(screen.getByTestId('heatmap-cell-Centro-08h')).toHaveAttribute(
      'data-value',
      '1',
    );
  });

  it('mostra placeholder vazio quando a fonte não tem dados', () => {
    renderHM({ source: 'rows', row_field: 'bairro', col_field: 'hora' }, { rows: [] });
    expect(screen.getByText(/Sem dados na fonte selecionada/i)).toBeInTheDocument();
  });
});
