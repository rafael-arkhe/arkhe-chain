/**
 * Débito Onda 4 (OSDK) — binding de PROPERTY validado em DESIGN-TIME no Workshop.
 *
 * O FieldKind 'property' lista as properties TIPADAS do Object Type (via
 * Ontology.objectTypeSchema) num dropdown/checklist, em vez de texto livre — o
 * "fim do bind no escuro" dentro do editor. O tipo vem de um campo IRMÃO
 * (`typeFrom`): um campo node-type (valor é o kind) OU uma variável objectSet
 * (spec.object_type). Fallback gracioso quando o tipo não está escolhido ou é
 * legado (404).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  resolveKindFromSibling,
  PropertyFieldPicker,
  PropFieldEditor,
} from '@/components/workshop/prop-field-editor';
import type { WorkshopVariable } from '@/lib/workshop/types';

jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: jest.fn().mockResolvedValue([]),
    objectTypeSchema: jest.fn(),
  },
}));

const { Ontology } = jest.requireMock('@/lib/api') as {
  Ontology: Record<string, jest.Mock>;
};

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

function objSetVar(external_id: string, object_type: string): WorkshopVariable {
  return {
    id: external_id,
    external_id,
    type: 'ObjectSet',
    kind: 'objectSet',
    recompute_mode: 'auto',
    spec: { object_type },
  } as WorkshopVariable;
}

function staticVar(external_id: string): WorkshopVariable {
  return {
    id: external_id,
    external_id,
    type: 'Json',
    kind: 'static',
    recompute_mode: 'auto',
    spec: { value: 1 },
  } as WorkshopVariable;
}

describe('resolveKindFromSibling', () => {
  const vars = [objSetVar('alvo', 'Veiculo'), staticVar('contador')];

  it('resolve o kind de uma variável objectSet via spec.object_type', () => {
    expect(resolveKindFromSibling('alvo', vars)).toBe('Veiculo');
  });

  it('faz strip do sufixo .path antes de procurar a variável', () => {
    expect(resolveKindFromSibling('alvo.properties.placa', vars)).toBe('Veiculo');
  });

  it('trata o valor como kind cru quando não casa nenhuma variável (campo node-type)', () => {
    expect(resolveKindFromSibling('Motorista', vars)).toBe('Motorista');
  });

  it('retorna null para variável conhecida sem tipo resolvível (static)', () => {
    expect(resolveKindFromSibling('contador', vars)).toBeNull();
  });

  it('retorna null para valor vazio/indefinido', () => {
    expect(resolveKindFromSibling('', vars)).toBeNull();
    expect(resolveKindFromSibling(undefined, vars)).toBeNull();
  });

  it('não estoura com object_type não-string/ausente (dado corrompido) → null', () => {
    const bad = [
      { id: 'a', external_id: 'a', type: 'ObjectSet', kind: 'objectSet', recompute_mode: 'auto', spec: { object_type: 123 } },
      { id: 'b', external_id: 'b', type: 'ObjectSet', kind: 'objectSet', recompute_mode: 'auto', spec: {} },
      { id: 'c', external_id: 'c', type: 'ObjectSet', kind: 'objectSet', recompute_mode: 'auto' },
    ] as unknown as WorkshopVariable[];
    expect(() => resolveKindFromSibling('a', bad)).not.toThrow();
    expect(resolveKindFromSibling('a', bad)).toBeNull();
    expect(resolveKindFromSibling('b', bad)).toBeNull();
    expect(resolveKindFromSibling('c', bad)).toBeNull();
  });
});

describe('PropertyFieldPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ontology.objectTypeSchema.mockResolvedValue(VEICULO);
  });

  it('lista as properties tipadas do tipo e seleciona (single)', async () => {
    const onChange = jest.fn();
    render(<PropertyFieldPicker value="" onChange={onChange} kind="Veiculo" />);
    await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('Veiculo'));
    const select = await screen.findByTestId('property-picker-select');
    // opções vêm do contrato (não texto livre)
    expect(screen.getByRole('option', { name: /Placa/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Modelo/ })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'modelo' } });
    expect(onChange).toHaveBeenCalledWith('modelo');
  });

  it('multi: marca/desmarca properties e devolve string[]', async () => {
    const onChange = jest.fn();
    render(<PropertyFieldPicker value={['placa']} onChange={onChange} kind="Veiculo" multi />);
    const ano = await screen.findByTestId('property-picker-opt-ano');
    fireEvent.click(ano);
    expect(onChange).toHaveBeenCalledWith(['placa', 'ano']);
  });

  it('sem tipo resolvido → hint + input manual (não quebra o fluxo)', async () => {
    const onChange = jest.fn();
    render(<PropertyFieldPicker value="" onChange={onChange} kind={null} typeFromLabel="Source" />);
    expect(screen.getByTestId('property-picker-no-type')).toBeInTheDocument();
    expect(Ontology.objectTypeSchema).not.toHaveBeenCalled();
    const manual = screen.getByTestId('property-picker-manual');
    fireEvent.change(manual, { target: { value: 'cpf' } });
    expect(onChange).toHaveBeenCalledWith('cpf');
  });

  it('tipo legado sem contrato (404) → fallback input manual', async () => {
    Ontology.objectTypeSchema.mockRejectedValue(new Error('404 não declarado'));
    const onChange = jest.fn();
    render(<PropertyFieldPicker value="" onChange={onChange} kind="social_post" />);
    const manual = await screen.findByTestId('property-picker-manual');
    fireEvent.change(manual, { target: { value: 'titulo' } });
    expect(onChange).toHaveBeenCalledWith('titulo');
  });

  it('multi: fallback manual preserva valor legado salvo como string CSV', async () => {
    Ontology.objectTypeSchema.mockRejectedValue(new Error('404'));
    render(<PropertyFieldPicker value="cpf, nome" onChange={jest.fn()} kind="social_post" multi />);
    const manual = await screen.findByTestId('property-picker-manual');
    expect((manual as HTMLInputElement).value).toBe('cpf, nome'); // não some
  });
});

describe('PropFieldEditor — case property (resolve via siblingConfig)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ontology.objectTypeSchema.mockResolvedValue(VEICULO);
  });

  it('resolve o tipo pelo campo irmão (typeFrom) e lista as properties', async () => {
    const onChange = jest.fn();
    render(
      <PropFieldEditor
        field={{ name: 'props', label: 'Propriedades', field: 'property', multi: true, typeFrom: 'source' }}
        value={[]}
        appVariables={[objSetVar('alvo', 'Veiculo')]}
        siblingConfig={{ source: 'alvo' }}
        onOpenVariablesPanel={() => {}}
        onChange={onChange}
      />,
    );
    // O picker resolveu o kind via siblingConfig.source → variável objectSet
    // (Veiculo) e projetou as properties do contrato (do cache ou da API).
    expect(await screen.findByTestId('property-picker-opt-modelo')).toBeInTheDocument();
    expect(screen.getByTestId('property-picker-opt-placa')).toBeInTheDocument();
  });

  it('cai no manual quando o campo irmão não resolve um tipo', async () => {
    const onChange = jest.fn();
    render(
      <PropFieldEditor
        field={{ name: 'props', label: 'Propriedades', field: 'property', typeFrom: 'source' }}
        value=""
        appVariables={[staticVar('contador')]}
        siblingConfig={{ source: 'contador' }}
        onOpenVariablesPanel={() => {}}
        onChange={onChange}
      />,
    );
    expect(await screen.findByTestId('property-picker-no-type')).toBeInTheDocument();
  });
});
