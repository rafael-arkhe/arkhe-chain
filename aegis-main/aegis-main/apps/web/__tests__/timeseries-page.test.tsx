/**
 * Time Series (UI). Charts salvos de contagem por bucket temporal sobre um
 * node_type. Cria → renderiza (reusa SeriesChart) → alterna linha/barras.
 * Espelha /platform/v23/timeseries.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TimeSeriesPage from '@/app/painel-de-controle/timeseries/page';

jest.mock('@/components/auth/require-perm', () => ({ RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/lib/api', () => ({
  TimeSeries: { list: jest.fn(), create: jest.fn(), remove: jest.fn(), render: jest.fn() },
  Ontology: { listNodeTypes: jest.fn(), listNodes: jest.fn(), objectTypeSchema: jest.fn(), queryTimeseries: jest.fn() },
}));
const { TimeSeries, Ontology } = jest.requireMock('@/lib/api') as { TimeSeries: Record<string, jest.Mock>; Ontology: Record<string, jest.Mock> };

const CHART = { id: 'c1', slug: 'ocorrencias-dia', display_name: 'Ocorrências por dia', node_type: 'ocorrencia', config: { bucket: 'day' }, markings: [], created_at: '2026-05-31T00:00:00Z' };
const RENDER = {
  chart_id: 'c1', node_type: 'ocorrencia', bucket: 'day', total_visible: 5,
  series: [{ bucket: '2026-05-29', count: 2 }, { bucket: '2026-05-30', count: 3 }],
};

describe('Time Series (UI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TimeSeries.list.mockResolvedValue([CHART]);
    TimeSeries.render.mockResolvedValue(RENDER);
    TimeSeries.create.mockResolvedValue(CHART);
    Ontology.listNodeTypes.mockResolvedValue([{ name: 'ocorrencia', label: 'Ocorrencia', count: 5 }, { name: 'sensor', label: 'Sensor', count: 2 }]);
    Ontology.listNodes.mockResolvedValue([{ id: 'n1', name: 'Sensor 1' }, { id: 'n2', name: 'Sensor 2' }]);
    Ontology.objectTypeSchema.mockResolvedValue({ properties: [
      { key: 'leituras', type: 'timeseries', label: 'Leituras' },
      { key: 'status', type: 'text', label: 'Status' },
    ] });
    Ontology.queryTimeseries.mockResolvedValue({ node_id: 'n1', property_name: 'leituras', total_points_in_range: 2, returned_points: 2, downsampled: false, points: [{ t: '2026-05-01T00:00:00Z', v: 10 }, { t: '2026-05-02T00:00:00Z', v: 12 }] });
  });

  it('lista charts e renderiza ao selecionar (linha por bucket)', async () => {
    render(<TimeSeriesPage />);
    fireEvent.click(await screen.findByTestId('ts-item-ocorrencias-dia'));
    await waitFor(() => expect(TimeSeries.render).toHaveBeenCalledWith('c1'));
    // 2 buckets → 2 pontos da linha (SeriesChart, testid chart-point)
    await waitFor(() => expect(screen.getAllByTestId('chart-point')).toHaveLength(2));
    expect(screen.getByTestId('ts-render')).toHaveTextContent('5 instâncias');
  });

  it('alterna p/ barras (uma barra por bucket)', async () => {
    render(<TimeSeriesPage />);
    fireEvent.click(await screen.findByTestId('ts-item-ocorrencias-dia'));
    await screen.findAllByTestId('chart-point');
    fireEvent.click(screen.getByTestId('ts-kind-bar'));
    await waitFor(() => expect(screen.getAllByTestId('chart-bar')).toHaveLength(2));
  });

  it('transformação Acumulado soma a série de forma cumulativa', async () => {
    render(<TimeSeriesPage />);
    fireEvent.click(await screen.findByTestId('ts-item-ocorrencias-dia'));
    await screen.findAllByTestId('chart-point'); // série bruta [2,3]
    fireEvent.change(screen.getByTestId('ts-transform'), { target: { value: 'cumulative' } });
    // acumulado [2,5] → maxY=5 → ticks inteiros incluem "5" no eixo (não no bruto, maxY=3)
    await waitFor(() => {
      const svg = screen.getByTestId('chart-svg');
      const yLabels = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent || '').filter((t) => /^\d+$/.test(t));
      expect(yLabels).toContain('5');
    });
  });

  it('cria um chart (slug derivado do nome + node_type + bucket)', async () => {
    render(<TimeSeriesPage />);
    await screen.findByTestId('ts-create');
    fireEvent.change(screen.getByTestId('ts-name'), { target: { value: 'Ocorrências por dia' } });
    fireEvent.change(screen.getByTestId('ts-nodetype'), { target: { value: 'ocorrencia' } });
    fireEvent.click(screen.getByTestId('ts-create-btn'));
    await waitFor(() =>
      expect(TimeSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'ocorrencias-por-dia', display_name: 'Ocorrências por dia', node_type: 'ocorrencia', config: { bucket: 'day' } }),
      ),
    );
  });

  // ── Onda 25 — visor da propriedade timeseries por instância (multi-série) ──
  it('visor: tipo → instância → propriedade timeseries consulta a série e plota', async () => {
    render(<TimeSeriesPage />);
    fireEvent.click(await screen.findByTestId('ts-mode-visor'));
    fireEvent.change(await screen.findByTestId('visor-type'), { target: { value: 'sensor' } });
    fireEvent.change(await screen.findByTestId('visor-instance'), { target: { value: 'n1' } });
    // só a propriedade timeseries 'leituras' aparece (status=text é filtrado)
    expect(await screen.findByTestId('visor-prop-leituras')).toBeInTheDocument();
    expect(screen.queryByTestId('visor-prop-status')).toBeNull();
    fireEvent.click(screen.getByTestId('visor-prop-leituras'));
    await waitFor(() => expect(Ontology.queryTimeseries).toHaveBeenCalledWith('n1', 'leituras', expect.objectContaining({ max_points: 500 })));
    // série renderizada (multi-série, 1 série → 2 pontos)
    await waitFor(() => expect(screen.getAllByTestId('ms-point')).toHaveLength(2));
  });

  it('visor: transformação Acumulado reprocessa a série client-side', async () => {
    render(<TimeSeriesPage />);
    fireEvent.click(await screen.findByTestId('ts-mode-visor'));
    fireEvent.change(await screen.findByTestId('visor-type'), { target: { value: 'sensor' } });
    fireEvent.change(await screen.findByTestId('visor-instance'), { target: { value: 'n1' } });
    fireEvent.click(await screen.findByTestId('visor-prop-leituras'));
    await waitFor(() => expect(screen.getAllByTestId('ms-point')).toHaveLength(2));
    fireEvent.change(screen.getByTestId('visor-transform'), { target: { value: 'cumulative' } });
    // acumulado [10,12]→[10,22] → maxY=22 → eixo Y contém "22"
    await waitFor(() => {
      const svg = screen.getByTestId('chart-svg');
      const labels = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent || '');
      expect(labels).toContain('22');
    });
  });
});
