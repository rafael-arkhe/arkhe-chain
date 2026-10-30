/**
 * Onda 16 UI — Ontology Manager (editor de Object/Link Type). Lista tipos → novo
 * tipo → adiciona property + marca Título → Salvar chama a Write API governada;
 * abre tipo existente projetando o contrato (objectTypeSchema).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TiposEditorPage from '@/app/painel-de-controle/tipos-editor/page';

jest.mock('@/components/auth/require-perm', () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodeTypes: jest.fn(),
    objectTypeSchema: jest.fn(),
    createObjectType: jest.fn(),
    updateObjectType: jest.fn(),
    deleteObjectType: jest.fn(),
    declareLinkType: jest.fn(),
  },
}));
const { Ontology } = jest.requireMock('@/lib/api') as { Ontology: Record<string, jest.Mock> };

describe('Ontology Manager — editor de Object Type (Onda 16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Ontology.listNodeTypes.mockResolvedValue([
      { name: 'subestacao', label: 'Subestacao', count: 3 },
      { name: 'transformador', label: 'Transformador', count: 5 },
    ]);
    Ontology.objectTypeSchema.mockResolvedValue({
      kind: 'subestacao', display_name: 'Subestacao', title_property: 'nome', count: 3,
      properties: [
        { key: 'nome', type: 'text', label: 'Nome', is_title: true },
        { key: 'tensao', type: 'number', label: 'Tensão', is_title: false },
      ],
      links: [{ relation: 'alimenta', target_kind: 'transformador', target_label: 'Transformador', cardinality: 'one_to_many', direction: 'outgoing' }],
      actions: [],
    });
    Ontology.createObjectType.mockResolvedValue({ id: 'x', kind: 'reator', display_name: 'Reator', title_property: 'nome', properties: [], enforce: 'strict', signed_hash: 'h', version: 1 });
  });

  it('lista os tipos e abre um projetando o contrato (properties + Título + links)', async () => {
    render(<TiposEditorPage />);
    fireEvent.click(await screen.findByTestId('otm-type-subestacao'));
    await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('subestacao'));
    expect(await screen.findByTestId('otm-editor')).toBeInTheDocument();
    // property keys do contrato aparecem + o link declarado
    expect(screen.getByDisplayValue('nome')).toBeInTheDocument();
    expect(screen.getByTestId('otm-link-alimenta')).toHaveTextContent(/transformador/);
    expect(screen.getByTestId('otm-link-alimenta')).toHaveTextContent('1:N');
  });

  it('novo tipo: kind + property + Título + enforce strict → createObjectType governado', async () => {
    render(<TiposEditorPage />);
    fireEvent.click(await screen.findByTestId('otm-new'));
    fireEvent.change(screen.getByTestId('otm-kind'), { target: { value: 'reator' } });
    fireEvent.click(screen.getByTestId('otm-add-prop'));
    const key = await screen.findByTestId('otm-prop-key');
    fireEvent.change(key, { target: { value: 'nome' } });
    fireEvent.change(screen.getByTestId('otm-prop-type'), { target: { value: 'text' } });
    fireEvent.click(screen.getByTestId('otm-prop-title'));   // marca 'nome' como Título
    fireEvent.change(screen.getByTestId('otm-enforce'), { target: { value: 'strict' } });
    fireEvent.click(screen.getByTestId('otm-save'));
    await waitFor(() => expect(Ontology.createObjectType).toHaveBeenCalled());
    const body = Ontology.createObjectType.mock.calls[0][0];
    expect(body.kind).toBe('reator');
    expect(body.title_property).toBe('nome');
    expect(body.enforce).toBe('strict');
    expect(body.properties[0]).toMatchObject({ key: 'nome', type: 'text', is_title: true });
  });

  it('declara um Link Type com cardinalidade pela Write API', async () => {
    render(<TiposEditorPage />);
    fireEvent.click(await screen.findByTestId('otm-type-subestacao'));
    await screen.findByTestId('otm-editor');
    fireEvent.change(screen.getByTestId('otm-link-target'), { target: { value: 'transformador' } });
    fireEvent.change(screen.getByTestId('otm-link-relation'), { target: { value: 'protege' } });
    fireEvent.change(screen.getByTestId('otm-link-card'), { target: { value: 'one_to_one' } });
    fireEvent.click(screen.getByTestId('otm-link-declare'));
    await waitFor(() => expect(Ontology.declareLinkType).toHaveBeenCalledWith({
      source_kind: 'subestacao', target_kind: 'transformador', relation: 'protege', cardinality: 'one_to_one',
    }));
  });
});
