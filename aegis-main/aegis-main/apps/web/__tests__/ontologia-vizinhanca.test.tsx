/**
 * Onda 10 (UI) — explorador de vizinhança (search-around) em /ontologia/vizinhanca.
 * O operador escolhe o tipo semente, segue uma relação do CONTRATO (Onda 4) e
 * explora o object set relacionado (multi-hop). Relações via dropdown, nunca texto.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VizinhancaPage from '@/app/ontologia/vizinhanca/page';

jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: jest.fn(),
    objectTypeSchema: jest.fn(),
    searchAround: jest.fn(),
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'op', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));

const { Ontology } = jest.requireMock('@/lib/api') as { Ontology: Record<string, jest.Mock> };

describe('Vizinhança — search-around (Onda 10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ontology.listNodeTypes.mockResolvedValue([
      { name: 'Morador', label: 'Morador', count: 3 },
      { name: 'Veiculo', label: 'Veículo', count: 2 },
    ]);
    Ontology.objectTypeSchema.mockImplementation((kind: string) =>
      Promise.resolve({
        kind, display_name: kind, title_property: '', count: 0, properties: [], actions: [],
        links: kind === 'Morador'
          ? [{ relation: 'possui_veiculo', target_kind: 'Veiculo', target_label: 'Veículo', cardinality: 'one_to_many', direction: 'outgoing' }]
          : [],
      }),
    );
    Ontology.searchAround.mockResolvedValue({
      seed_count: 3, hops_executed: 1, truncated: false,
      result: [{ id: 'v1', name: 'ABC-1234', node_type: 'Veiculo', properties: {}, markings: [] }],
    });
  });

  it('monta o caminho (relação do contrato) e explora a vizinhança', async () => {
    render(<VizinhancaPage />);
    // escolhe o tipo semente
    fireEvent.change(await screen.findByTestId('vizinhanca-seed'), { target: { value: 'Morador' } });
    // o dropdown de salto carrega as relações do CONTRATO de Morador
    await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('Morador'));
    const addHop = await screen.findByTestId('vizinhanca-add-hop');
    expect(addHop).toHaveTextContent(/possui_veiculo/);
    fireEvent.change(addHop, { target: { value: '0' } });   // adiciona o 1º link
    expect(await screen.findByTestId('vizinhanca-hop-0')).toHaveTextContent(/Veículo/);
    // explora
    fireEvent.click(screen.getByTestId('vizinhanca-run'));
    await waitFor(() => expect(Ontology.searchAround).toHaveBeenCalledWith(
      'Morador',
      [{ relation: 'possui_veiculo', direction: 'outgoing', target_kind: 'Veiculo' }],
    ));
    const result = await screen.findByTestId('vizinhanca-result');
    expect(result).toHaveTextContent(/ABC-1234/);
    expect(result).toHaveTextContent(/1 objeto relacionado/);
  });

  it('não oferece salto quando o tipo não declara relações', async () => {
    render(<VizinhancaPage />);
    fireEvent.change(await screen.findByTestId('vizinhanca-seed'), { target: { value: 'Veiculo' } });
    await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('Veiculo'));
    expect(screen.queryByTestId('vizinhanca-add-hop')).not.toBeInTheDocument();
  });
});
