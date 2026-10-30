/**
 * <ReportNodeEmbed> — widgets genéricos do objeto embutidos num relatório,
 * referenciando node_id (P5 Onda 4). Cada visão reflete a ontologia ao vivo.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { ReportNodeEmbed } from '@/components/relatorios/node-embed';

jest.mock('@/lib/api', () => ({
  Ontology: { getNode: jest.fn(), neighbors: jest.fn(), nodeHistory: jest.fn() },
}));
const { Ontology } = jest.requireMock('@/lib/api') as { Ontology: Record<string, jest.Mock> };

const node = (over: Record<string, unknown> = {}) => ({
  id: 'n1', name: 'Node 1', node_type: 'veiculo', properties: {}, schema_definition: {},
  description: '', version: 1, created_by: '', signed_hash: null, created_at: '', updated_at: null, ...over,
});

describe('ReportNodeEmbed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('object_table: tabela de propriedades do nó', async () => {
    Ontology.getNode.mockResolvedValue(node({ properties: { placa: 'XYZ9988' } }));
    render(<ReportNodeEmbed nodeId="n1" widget="object_table" />);
    expect(await screen.findByText('XYZ9988')).toBeInTheDocument();
    expect(screen.getByTestId('node-embed')).toHaveAttribute('data-widget', 'object_table');
  });

  it('vizinhos: lista vizinhos 1-hop (exclui a raiz)', async () => {
    Ontology.neighbors.mockResolvedValue({
      nodes: [node(), node({ id: 'n2', name: 'Vizinho A', node_type: 'pessoa' })],
      edges: [{ id: 'e1', source_node_id: 'n1', target_node_id: 'n2', metadata: {}, created_at: '' }],
    });
    render(<ReportNodeEmbed nodeId="n1" widget="vizinhos" />);
    expect(await screen.findByText('Vizinho A')).toBeInTheDocument();
    await waitFor(() => expect(Ontology.neighbors).toHaveBeenCalledWith('n1', 1));
  });

  it('correlacao: usa vizinhança 2-hop da ontologia', async () => {
    Ontology.neighbors.mockResolvedValue({ nodes: [node()], edges: [] });
    render(<ReportNodeEmbed nodeId="n1" widget="correlacao" />);
    await waitFor(() => expect(Ontology.neighbors).toHaveBeenCalledWith('n1', 2));
    expect(await screen.findByTestId('node-embed-empty')).toBeInTheDocument();
  });

  it('mapa: mostra coordenadas quando o objeto tem lat/lon', async () => {
    Ontology.getNode.mockResolvedValue(node({ properties: { latitude: -23.55, longitude: -46.63 } }));
    render(<ReportNodeEmbed nodeId="n1" widget="mapa" />);
    expect(await screen.findByTestId('node-embed-coords')).toHaveTextContent('-23.55000, -46.63000');
  });

  it('mapa: estado honesto quando não há coordenadas', async () => {
    Ontology.getNode.mockResolvedValue(node({ properties: { cor: 'azul' } }));
    render(<ReportNodeEmbed nodeId="n1" widget="mapa" />);
    expect(await screen.findByTestId('node-embed-nocoords')).toBeInTheDocument();
  });

  it('timeline: linha do tempo das versões do objeto', async () => {
    Ontology.nodeHistory.mockResolvedValue([
      { version: 1, content_hash: 'a', lineage_event_id: null, markings: [], author: 'ferreira', created_at: '2026-06-01' },
      { version: 2, content_hash: 'b', lineage_event_id: null, markings: [], author: 'ferreira', created_at: '2026-06-10' },
    ]);
    render(<ReportNodeEmbed nodeId="n1" widget="timeline" />);
    const body = await screen.findByTestId('node-embed-body');
    await waitFor(() => expect(body).toHaveTextContent('2026-06-10'));
  });

  it('widget desconhecido: estado de erro (catálogo fechado)', async () => {
    render(<ReportNodeEmbed nodeId="n1" widget="qualquer" />);
    expect(await screen.findByTestId('node-embed-error')).toBeInTheDocument();
    expect(Ontology.getNode).not.toHaveBeenCalled();
  });
});
