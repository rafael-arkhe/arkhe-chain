/**
 * Onda 1.B (GAP 1) — coluna FUNCTION-BACKED no object-table.
 * Uma coluna com `function_slug` mostra o valor COMPUTADO por uma CodeFunction
 * (sandbox), invocada UMA vez com todas as linhas ({rows:[...]}) → {results:{rowId:valor}}.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { ObjectTable } from '@/components/workshop/widgets/object-table';

const mockRows = [
  { id: 'n1', name: 'Boleto A', node_type: 'boleto', properties: { base: 100 } },
  { id: 'n2', name: 'Boleto B', node_type: 'boleto', properties: { base: 200 } },
];
jest.mock('@/lib/workshop/runtime', () => ({
  useObjectSet: () => ({ status: 'ready', rows: mockRows, total: mockRows.length, error: undefined }),
}));
jest.mock('@/lib/api', () => ({
  Functions: {
    invoke: jest.fn().mockResolvedValue({ ok: true, output: { results: { n1: 110, n2: 220 } } }),
  },
}));
const { Functions } = jest.requireMock('@/lib/api') as { Functions: { invoke: jest.Mock } };

function renderTable(columns: unknown[]) {
  return render(
    <ObjectTable
      appId="app1"
      config={{ source: 'boletos', columns } as never}
      bindings={{}}
      setBinding={() => {}}
      emit={() => {}}
      variables={{}}
    />,
  );
}

describe('object_table — coluna function-backed (Onda 1.B)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mostra o valor computado pela Function (1 invoke com todas as linhas)', async () => {
    renderTable([
      { field: 'name', label: 'Nome' },
      { field: 'valor', label: 'Valor c/ juros', function_slug: 'juros' },
    ]);
    // valores computados aparecem nas duas linhas
    await waitFor(() => expect(screen.getByText('110')).toBeInTheDocument());
    expect(screen.getByText('220')).toBeInTheDocument();
    // properties cruas continuam funcionando (coluna normal)
    expect(screen.getByText('Boleto A')).toBeInTheDocument();
    // invocada UMA vez, com TODAS as linhas (não por-linha)
    expect(Functions.invoke).toHaveBeenCalledTimes(1);
    expect(Functions.invoke).toHaveBeenCalledWith('juros', {
      rows: [
        { id: 'n1', name: 'Boleto A', node_type: 'boleto', properties: { base: 100 } },
        { id: 'n2', name: 'Boleto B', node_type: 'boleto', properties: { base: 200 } },
      ],
    });
  });

  it('não invoca Function quando não há coluna function-backed', async () => {
    renderTable([{ field: 'name' }, { field: 'node_type' }]);
    await waitFor(() => expect(screen.getByText('Boleto A')).toBeInTheDocument());
    expect(Functions.invoke).not.toHaveBeenCalled();
  });
});
