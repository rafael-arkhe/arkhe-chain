/**
 * Onda 4 (OSDK) — /ontologia/tipos inspector projeta o CONTRATO TIPADO do
 * Object Type (não mais heurística de frequência de chaves): properties
 * tipadas (com Título), link types navegáveis com cardinalidade, e action
 * types ligadas ao tipo. Consome `Ontology.objectTypeSchema(kind)`.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TiposPage from '@/app/ontologia/tipos/page';

jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: jest.fn(),
    objectTypeSchema: jest.fn(),
    listNodes: jest.fn(),
    osdkGenerate: jest.fn(),
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({ principal: { username: 'admin', roles: ['admin'] }, loading: false }),
  useCan: () => true,
}));

const { Ontology } = jest.requireMock('@/lib/api') as {
  Ontology: Record<string, jest.Mock>;
};

const VEICULO_SCHEMA = {
  kind: 'Veiculo',
  display_name: 'Veículo',
  title_property: 'placa',
  count: 3,
  properties: [
    { key: 'placa', type: 'text', label: 'Placa', is_title: true },
    { key: 'ano', type: 'number', label: 'Ano', is_title: false },
  ],
  links: [
    {
      relation: 'conduzido_por',
      target_kind: 'Motorista',
      target_label: 'Motorista',
      cardinality: 'one_to_many',
      direction: 'outgoing',
    },
  ],
  actions: [
    {
      name: 'Criar veículo',
      rule: 'create_object',
      parameters: [
        { key: 'placa', type: 'string', title: 'Placa' },
        { key: 'ano', type: 'number', title: 'Ano' },
      ],
    },
  ],
};

describe('OntologiaTiposPage — contrato tipado (Onda 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ontology.listNodeTypes.mockResolvedValue([
      { name: 'Veiculo', label: 'Veículo', count: 3 },
      { name: 'Motorista', label: 'Motorista', count: 2 },
    ]);
    Ontology.objectTypeSchema.mockImplementation((kind: string) =>
      kind === 'Veiculo'
        ? Promise.resolve(VEICULO_SCHEMA)
        : Promise.resolve({
            kind,
            display_name: kind,
            title_property: '',
            count: 0,
            properties: [],
            links: [],
            actions: [],
          }),
    );
    Ontology.listNodes.mockResolvedValue([]);
  });

  it('projeta as properties TIPADAS do contrato (com Título), não heurística', async () => {
    render(<TiposPage />);
    await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('Veiculo'));
    const placa = await screen.findByTestId('ontologia-tipo-prop-placa');
    expect(placa).toHaveTextContent(/placa/i);
    expect(placa).toHaveTextContent(/título/i); // is_title → tag "Título"
    expect(placa).toHaveTextContent(/text/i); // tipo declarado
    expect(screen.getByTestId('ontologia-tipo-prop-ano')).toHaveTextContent(/number/i);
  });

  it('atalho "Editar tipo" no inspetor leva ao tipos-editor com ?kind= (retoque UX #1)', async () => {
    render(<TiposPage />);
    const editar = await screen.findByTestId('ontologia-tipo-inspector-editar');
    expect(editar.getAttribute('href')).toBe('/painel-de-controle/tipos-editor?kind=Veiculo&cp=1');
  });

  it('lista os Link Types navegáveis com alvo + cardinalidade', async () => {
    render(<TiposPage />);
    const link = await screen.findByTestId('ontologia-tipo-link-conduzido_por');
    expect(link).toHaveTextContent(/Motorista/);
    expect(link).toHaveTextContent(/1:N/); // one_to_many
  });

  it('clicar num Link Type navega para o contrato do tipo alvo', async () => {
    render(<TiposPage />);
    const link = await screen.findByTestId('ontologia-tipo-link-conduzido_por');
    fireEvent.click(link);
    await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('Motorista'));
  });

  it('botão Gerar OSDK chama o codegen (Onda 6)', async () => {
    Ontology.osdkGenerate.mockResolvedValue({ lang: 'python', filename: 'aegis_osdk.py', source: '# gen' });
    // jsdom: stub URL.createObjectURL p/ o download não quebrar
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    render(<TiposPage />);
    const btn = await screen.findByTestId('ontologia-tipos-osdk');
    fireEvent.click(btn);
    await waitFor(() => expect(Ontology.osdkGenerate).toHaveBeenCalledWith('python'));
  });

  it('seletor de linguagem gera o OSDK em TypeScript (backlog)', async () => {
    Ontology.osdkGenerate.mockResolvedValue({ lang: 'typescript', filename: 'aegis_osdk.ts', source: 'export interface X {}' });
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    render(<TiposPage />);
    fireEvent.change(await screen.findByTestId('ontologia-tipos-osdk-lang'), { target: { value: 'typescript' } });
    fireEvent.click(screen.getByTestId('ontologia-tipos-osdk'));
    await waitFor(() => expect(Ontology.osdkGenerate).toHaveBeenCalledWith('typescript'));
  });

  it('lista as Action Types ligadas ao tipo com o verbo da rule', async () => {
    render(<TiposPage />);
    const action = await screen.findByTestId('ontologia-tipo-action-Criar veículo');
    expect(action).toHaveTextContent(/Criar veículo/);
    expect(action).toHaveTextContent(/Cria/); // create_object → "Cria"
  });
});
