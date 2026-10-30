/**
 * Análise — hub que consolida Quiver + Time Series (Fase 1 da consolidação de IA).
 * Segmentado Panorama(Fácil) · Distribuições(Quiver) · Séries(Time Series).
 * Panorama: tipo → total + distribuição automática. As abas avançadas montam os
 * workspaces embutidos.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnalisePage from '@/app/painel-de-controle/analise/page';

jest.mock('@/components/auth/require-perm', () => ({ RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/components/control-panel/cp-hub-subnav', () => ({ CpHubSubnav: () => null }));
jest.mock('@/lib/api', () => ({
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn(), aggregateObjectSet: jest.fn(), listNodes: jest.fn(), queryTimeseries: jest.fn() },
  Quiver: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
  TimeSeries: { list: jest.fn(), create: jest.fn(), remove: jest.fn(), render: jest.fn() },
}));
const { Ontology, Quiver, TimeSeries } = jest.requireMock('@/lib/api') as {
  Ontology: Record<string, jest.Mock>; Quiver: Record<string, jest.Mock>; TimeSeries: Record<string, jest.Mock>;
};

describe('Análise (hub — Fase 1 IA)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ontology.listNodeTypes.mockResolvedValue([{ name: 'sensor', label: 'Sensor', count: 5 }]);
    Ontology.objectTypeSchema.mockResolvedValue({ properties: [
      { key: 'status', type: 'text', label: 'Status' },
      { key: 'leituras', type: 'timeseries', label: 'Leituras' },
    ] });
    Ontology.aggregateObjectSet.mockImplementation((_t: string, agg: { group_by?: string[] }) =>
      agg.group_by
        ? Promise.resolve({ result: [{ key: { status: 'aberta' }, count: 3 }, { key: { status: 'fechada' }, count: 2 }] })
        : Promise.resolve({ result: 5 }));
    Quiver.list.mockResolvedValue([]);
    TimeSeries.list.mockResolvedValue([]);
  });

  it('um único hub com 3 modos (Panorama/Distribuições/Séries); abre no Panorama', async () => {
    render(<AnalisePage />);
    expect(await screen.findByTestId('an-tab-panorama')).toBeInTheDocument();
    expect(screen.getByTestId('an-tab-dist')).toBeInTheDocument();
    expect(screen.getByTestId('an-tab-series')).toBeInTheDocument();
    expect(screen.getByTestId('an-panorama')).toBeInTheDocument();
  });

  it('Panorama (Fácil): escolher tipo → total + distribuição automática', async () => {
    render(<AnalisePage />);
    fireEvent.change(await screen.findByTestId('an-type'), { target: { value: 'sensor' } });
    // total via count
    await waitFor(() => expect(screen.getByTestId('an-total')).toHaveTextContent('5'));
    // distribuição automática pelo 1º campo categórico (status) — group_by físico
    await waitFor(() => expect(Ontology.aggregateObjectSet).toHaveBeenCalledWith('sensor', expect.objectContaining({ group_by: ['properties.status'] })));
    expect(await screen.findByTestId('an-dist-chart')).toBeInTheDocument();
  });

  it('aba Distribuições monta o workspace do Quiver embutido', async () => {
    render(<AnalisePage />);
    fireEvent.click(await screen.findByTestId('an-tab-dist'));
    expect(await screen.findByTestId('qv-new')).toBeInTheDocument();
  });

  it('aba Séries monta o workspace de Time Series embutido', async () => {
    render(<AnalisePage />);
    fireEvent.click(await screen.findByTestId('an-tab-series'));
    expect(await screen.findByTestId('ts-mode-agg')).toBeInTheDocument();
  });
});
