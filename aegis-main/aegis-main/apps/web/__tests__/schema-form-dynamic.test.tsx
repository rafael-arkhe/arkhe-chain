/**
 * schema-form-dynamic.test.tsx
 *
 * Task 1 — SchemaForm dynamic dropdown branch.
 *
 * Cobre:
 *  - Param com dynamic_source='object_types' → lazy-load Ontology.listNodeTypes()
 *  - Param com dynamic_source='properties' + dynamic_depends_on → disabled quando
 *    depends-on ainda não tem valor.
 *  - Param com dynamic_source='sources' → lazy-load Sources.list()
 *  - Param sem dynamic_source continua renderizando input text normal.
 *
 * Mocks: lib/api (Ontology, Sources). useT → (k) => k.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { SchemaForm } from '@/components/ui/schema-form';
import type { SkillParam } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: jest.fn(),
    objectTypeSchema: jest.fn(),
  },
  Sources: {
    list: jest.fn(),
  },
  Datasets: {
    list: jest.fn(),
  },
  Markings: {
    list: jest.fn(),
  },
  Projects: {
    list: jest.fn(),
  },
}));

const { Ontology, Sources } = jest.requireMock('@/lib/api') as {
  Ontology: Record<string, jest.Mock>;
  Sources: Record<string, jest.Mock>;
};

describe('SchemaForm — dynamic_source branch (Task 1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders a text input for a param WITHOUT dynamic_source', () => {
    const params: SkillParam[] = [
      { key: 'hashtag', label: 'Hashtag', param_type: 'string', required: true },
    ];
    render(
      <SchemaForm params={params} values={{}} onChange={jest.fn()} testidPrefix="test" />,
    );
    const input = screen.getByTestId('test-field-hashtag');
    expect(input.tagName).toBe('INPUT');
    expect((input as HTMLInputElement).type).toBe('text');
  });

  it('renders a loading select for dynamic_source=object_types while fetching', () => {
    // Never resolves during this test
    Ontology.listNodeTypes.mockReturnValue(new Promise(() => {}));
    const params: SkillParam[] = [
      {
        key: 'node_type',
        label: 'Tipo de objeto',
        param_type: 'string',
        required: false,
        dynamic_source: 'object_types',
      },
    ];
    render(
      <SchemaForm params={params} values={{}} onChange={jest.fn()} testidPrefix="test" />,
    );
    const sel = screen.getByTestId('test-field-node_type') as HTMLSelectElement;
    expect(sel.tagName).toBe('SELECT');
    expect(sel.disabled).toBe(true);
    expect(sel.options[0].text).toMatch(/Carregando/);
  });

  it('populates object_types dropdown after fetch resolves', async () => {
    Ontology.listNodeTypes.mockResolvedValueOnce([
      { name: 'Vehicle', label: 'Veículo', count: 5 },
      { name: 'Person', label: 'Pessoa', count: 10 },
    ]);
    const params: SkillParam[] = [
      {
        key: 'node_type',
        label: 'Tipo',
        param_type: 'string',
        required: false,
        dynamic_source: 'object_types',
      },
    ];
    render(
      <SchemaForm params={params} values={{}} onChange={jest.fn()} testidPrefix="test" />,
    );
    // Wait for it to load
    await waitFor(() => {
      const sel = screen.getByTestId('test-field-node_type') as HTMLSelectElement;
      expect(sel.disabled).toBe(false);
    });
    const sel = screen.getByTestId('test-field-node_type') as HTMLSelectElement;
    const options = Array.from(sel.options).map((o) => o.text);
    expect(options).toContain('Veículo');
    expect(options).toContain('Pessoa');
  });

  it('shows disabled "selecione o tipo primeiro" for properties when dependsOn is empty', () => {
    const params: SkillParam[] = [
      { key: 'node_type', label: 'Tipo', param_type: 'string', required: false, dynamic_source: 'object_types' },
      { key: 'prop', label: 'Propriedade', param_type: 'string', required: false, dynamic_source: 'properties', dynamic_depends_on: 'node_type' },
    ];
    // listNodeTypes resolves immediately for the first select
    Ontology.listNodeTypes.mockResolvedValue([]);

    render(
      <SchemaForm params={params} values={{ node_type: '' }} onChange={jest.fn()} testidPrefix="test" />,
    );
    const propSel = screen.getByTestId('test-field-prop') as HTMLSelectElement;
    expect(propSel.disabled).toBe(true);
    expect(propSel.options[0].text).toMatch(/selecione/i);
  });

  it('loads properties when dependsOn has a value', async () => {
    Ontology.listNodeTypes.mockResolvedValue([{ name: 'Vehicle', label: 'Veículo', count: 1 }]);
    Ontology.objectTypeSchema.mockResolvedValueOnce({
      kind: 'Vehicle',
      display_name: 'Veículo',
      title_property: 'plate',
      count: 1,
      properties: [
        { key: 'plate', label: 'Placa', type: 'string', is_title: true },
        { key: 'color', label: 'Cor', type: 'string', is_title: false },
      ],
      links: [],
      actions: [],
    });
    const params: SkillParam[] = [
      { key: 'node_type', label: 'Tipo', param_type: 'string', required: false, dynamic_source: 'object_types' },
      { key: 'prop', label: 'Propriedade', param_type: 'string', required: false, dynamic_source: 'properties', dynamic_depends_on: 'node_type' },
    ];
    render(
      <SchemaForm params={params} values={{ node_type: 'Vehicle' }} onChange={jest.fn()} testidPrefix="test" />,
    );
    await waitFor(() => {
      const sel = screen.getByTestId('test-field-prop') as HTMLSelectElement;
      expect(sel.disabled).toBe(false);
    });
    const sel = screen.getByTestId('test-field-prop') as HTMLSelectElement;
    const opts = Array.from(sel.options).map((o) => o.value);
    expect(opts).toContain('plate');
    expect(opts).toContain('color');
  });

  it('loads sources dropdown for dynamic_source=sources', async () => {
    Sources.list.mockResolvedValueOnce([
      { id: 'src-1', name: 'Planilha de Ocorrências' },
      { id: 'src-2', name: 'API Municipal' },
    ]);
    const params: SkillParam[] = [
      {
        key: 'source_id',
        label: 'Fonte',
        param_type: 'string',
        required: true,
        dynamic_source: 'sources',
      },
    ];
    render(
      <SchemaForm params={params} values={{}} onChange={jest.fn()} testidPrefix="test" />,
    );
    await waitFor(() => {
      const sel = screen.getByTestId('test-field-source_id') as HTMLSelectElement;
      expect(sel.disabled).toBe(false);
    });
    const sel = screen.getByTestId('test-field-source_id') as HTMLSelectElement;
    const opts = Array.from(sel.options).map((o) => o.text);
    expect(opts).toContain('Planilha de Ocorrências');
    expect(opts).toContain('API Municipal');
  });
});

describe('SchemaForm — param json (connector.http) não mostra [object Object]', () => {
  const jsonParam: SkillParam[] = [
    { key: 'serializer', label: 'Serializador', param_type: 'json', required: false, default: { format: 'json' } },
  ];

  test('default dict renderiza como JSON (não [object Object])', () => {
    render(
      <SchemaForm params={jsonParam} values={{ serializer: { format: 'json' } }} onChange={jest.fn()} testidPrefix="t" />,
    );
    const ta = screen.getByTestId('t-field-serializer') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.value).toContain('"format"');
    expect(ta.value).not.toContain('[object');
  });

  test('placeholder do default é JSON, não [object Object]', () => {
    render(
      <SchemaForm params={jsonParam} values={{}} onChange={jest.fn()} testidPrefix="t" />,
    );
    const ta = screen.getByTestId('t-field-serializer') as HTMLTextAreaElement;
    expect(ta.placeholder).toBe('{"format":"json"}');
    expect(ta.placeholder).not.toContain('[object');
  });

  test('editar com JSON válido grava o objeto PARSEADO (não string)', () => {
    const onChange = jest.fn();
    render(
      <SchemaForm params={jsonParam} values={{}} onChange={onChange} testidPrefix="t" />,
    );
    const ta = screen.getByTestId('t-field-serializer') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '{"format":"csv"}' } });
    expect(onChange).toHaveBeenCalledWith('serializer', { format: 'csv' });
  });
});
