/**
 * Fase 3a (overhaul DAG n8n) — árvore de campos SELECIONÁVEL do response.
 *
 * "Testar chamada" devolve {schema:[{key,type}], sample_rows}; este componente
 * renderiza cada campo como linha selecionável (checkbox + ícone de tipo + chave
 * + prévia do valor). A seleção forma o schema final ("Gerar dataset"). Não havia
 * primitivo de árvore-de-campos no app — este é o novo (shape SyncSchemaField +
 * padrão chip-toggle do ColumnMultiSelect + ícone por tipo neutro).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { Type, Hash, Calendar, ToggleLeft } from 'lucide-react';

import { SchemaFieldTree, fieldTypeIcon } from '@/components/dados/schema-field-tree';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));

const FIELDS = [
  { key: 'id', type: 'number' as const },
  { key: 'nome', type: 'text' as const },
  { key: 'criado_em', type: 'date' as const },
  { key: 'ativo', type: 'boolean' as const },
];

describe('fieldTypeIcon — tipo → ícone NEUTRO (sem cor)', () => {
  it('mapeia number/date/boolean/text', () => {
    expect(fieldTypeIcon('number')).toBe(Hash);
    expect(fieldTypeIcon('date')).toBe(Calendar);
    expect(fieldTypeIcon('boolean')).toBe(ToggleLeft);
    expect(fieldTypeIcon('text')).toBe(Type);
    expect(fieldTypeIcon('qualquer')).toBe(Type); // default
  });
});

describe('SchemaFieldTree', () => {
  it('vazio → estado honesto; com campos → linhas selecionáveis', () => {
    const { rerender } = render(<SchemaFieldTree fields={[]} selected={[]} onChange={() => {}} />);
    expect(screen.getByTestId('schema-tree-empty')).toBeInTheDocument();
    rerender(<SchemaFieldTree fields={FIELDS} selected={[]} onChange={() => {}} />);
    expect(screen.getByTestId('schema-field-id')).toBeInTheDocument();
    expect(screen.getByTestId('schema-field-ativo')).toBeInTheDocument();
  });

  it('marcar um campo → onChange preservando a ORDEM do schema', () => {
    const onChange = jest.fn();
    render(<SchemaFieldTree fields={FIELDS} selected={['nome']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('schema-field-id'));
    expect(onChange).toHaveBeenCalledWith(['id', 'nome']); // id antes de nome no schema
  });

  it('desmarcar → remove o campo', () => {
    const onChange = jest.fn();
    render(<SchemaFieldTree fields={FIELDS} selected={['id', 'nome']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('schema-field-id'));
    expect(onChange).toHaveBeenCalledWith(['nome']);
  });

  it('selecionar tudo / nenhum', () => {
    const onChange = jest.fn();
    const { rerender } = render(<SchemaFieldTree fields={FIELDS} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('schema-tree-all'));
    expect(onChange).toHaveBeenCalledWith(['id', 'nome', 'criado_em', 'ativo']);
    onChange.mockClear();
    rerender(<SchemaFieldTree fields={FIELDS} selected={['id', 'nome', 'criado_em', 'ativo']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('schema-tree-all'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('prévia do valor da 1ª linha de amostra (como no n8n)', () => {
    render(<SchemaFieldTree fields={FIELDS} selected={[]} onChange={() => {}} sampleRows={[{ id: 7, nome: 'Acme', ativo: true }]} />);
    expect(screen.getByTestId('schema-field-id')).toHaveTextContent('7');
    expect(screen.getByTestId('schema-field-nome')).toHaveTextContent('Acme');
  });
});
