/**
 * Front (b) — builders visuais que substituem os textarea de JSON cru dos
 * widgets estruturados (object_table.columns / object_view.groups). Cada linha
 * escolhe a PROPERTY pelo contrato do Object Type (PropertyFieldPicker), nunca
 * digitando JSON. Resolve o kind do campo irmão `source`.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  ColumnsFieldEditor,
  GroupsFieldEditor,
} from '@/components/workshop/prop-field-editor';

jest.mock('@/lib/api', () => ({
  Ontology: { listNodeTypes: jest.fn().mockResolvedValue([]), objectTypeSchema: jest.fn() },
}));
const { Ontology } = jest.requireMock('@/lib/api') as { Ontology: Record<string, jest.Mock> };

const VEICULO = {
  kind: 'Veiculo',
  display_name: 'Veículo',
  title_property: 'placa',
  count: 0,
  properties: [
    { key: 'placa', type: 'text', label: 'Placa', is_title: true },
    { key: 'modelo', type: 'text', label: 'Modelo', is_title: false },
    { key: 'ano', type: 'number', label: 'Ano', is_title: false },
  ],
  links: [],
  actions: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  Ontology.objectTypeSchema.mockResolvedValue(VEICULO);
});

describe('ColumnsFieldEditor', () => {
  it('renderiza linhas existentes e cada uma escolhe a property pelo contrato', async () => {
    const onChange = jest.fn();
    render(
      <ColumnsFieldEditor
        value={[{ field: 'placa', label: 'Placa' }]}
        onChange={onChange}
        kind="Veiculo"
      />,
    );
    const row = await screen.findByTestId('object-columns-row-0');
    // a property é escolhida num select do contrato (não texto livre)
    await waitFor(() =>
      expect(within(row).getByTestId('property-picker-select')).toBeInTheDocument(),
    );
    expect(within(row).getByRole('option', { name: /Modelo/ })).toBeInTheDocument();
  });

  it('adiciona uma coluna nova', async () => {
    const onChange = jest.fn();
    render(<ColumnsFieldEditor value={[]} onChange={onChange} kind="Veiculo" />);
    fireEvent.click(screen.getByTestId('object-columns-add'));
    expect(onChange).toHaveBeenCalledWith([{ field: '' }]);
  });

  it('edita o label de uma coluna', async () => {
    const onChange = jest.fn();
    render(
      <ColumnsFieldEditor value={[{ field: 'placa' }]} onChange={onChange} kind="Veiculo" />,
    );
    fireEvent.change(screen.getByTestId('object-columns-label-0'), { target: { value: 'Emplacamento' } });
    expect(onChange).toHaveBeenCalledWith([{ field: 'placa', label: 'Emplacamento' }]);
  });

  it('remove uma coluna', async () => {
    const onChange = jest.fn();
    render(
      <ColumnsFieldEditor
        value={[{ field: 'placa' }, { field: 'modelo' }]}
        onChange={onChange}
        kind="Veiculo"
      />,
    );
    fireEvent.click(screen.getByTestId('object-columns-remove-0'));
    expect(onChange).toHaveBeenCalledWith([{ field: 'modelo' }]);
  });

  it('normaliza valor legado salvo como JSON string', async () => {
    const onChange = jest.fn();
    render(
      <ColumnsFieldEditor
        value={'[{"field":"placa","label":"Placa"}]'}
        onChange={onChange}
        kind="Veiculo"
      />,
    );
    expect(await screen.findByTestId('object-columns-row-0')).toBeInTheDocument();
  });
});

describe('GroupsFieldEditor', () => {
  it('adiciona grupo e campo dentro do grupo', async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <GroupsFieldEditor value={[]} onChange={onChange} kind="Veiculo" />,
    );
    fireEvent.click(screen.getByTestId('object-groups-add-group'));
    expect(onChange).toHaveBeenCalledWith([{ title: '', fields: [] }]);

    rerender(
      <GroupsFieldEditor value={[{ title: 'Identidade', fields: [] }]} onChange={onChange} kind="Veiculo" />,
    );
    fireEvent.click(screen.getByTestId('object-groups-add-field-0'));
    expect(onChange).toHaveBeenCalledWith([{ title: 'Identidade', fields: [{ key: '' }] }]);
  });

  it('cada campo do grupo escolhe a key pelo contrato', async () => {
    render(
      <GroupsFieldEditor
        value={[{ title: 'Identidade', fields: [{ key: 'placa', label: 'Placa' }] }]}
        onChange={jest.fn()}
        kind="Veiculo"
      />,
    );
    const fieldRow = await screen.findByTestId('object-groups-field-0-0');
    await waitFor(() =>
      expect(within(fieldRow).getByTestId('property-picker-select')).toBeInTheDocument(),
    );
    expect(within(fieldRow).getByRole('option', { name: /Modelo/ })).toBeInTheDocument();
  });

  it('normaliza groups legado salvo como JSON string', async () => {
    render(
      <GroupsFieldEditor
        value={'[{"title":"Identidade","fields":[{"key":"placa"}]}]'}
        onChange={jest.fn()}
        kind="Veiculo"
      />,
    );
    expect(await screen.findByTestId('object-groups-group-0')).toBeInTheDocument();
  });
});
