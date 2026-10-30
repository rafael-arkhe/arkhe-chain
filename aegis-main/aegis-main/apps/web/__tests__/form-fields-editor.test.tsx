/**
 * Onda K.2 — Form Fields Editor (visual, no manual JSON).
 *
 * Verifica: adicionar/remover campos, trocar tipo por dropdown, marcar
 * required, configurar validação, e construir regra condicional via
 * seletores (NUNCA texto JSON).
 */
import { render, screen, fireEvent } from '@testing-library/react';

import { FormFieldsEditor } from '@/components/workshop/widgets/form-fields-editor';
import type { FormFieldSpec } from '@/lib/api';

function renderEditor(initial: FormFieldSpec[] = []) {
  const onChange = jest.fn();
  const utils = render(
    <FormFieldsEditor
      value={initial}
      onChange={onChange}
      label="Campos"
      description="Editor visual"
    />,
  );
  return { onChange, ...utils };
}

describe('FormFieldsEditor — Onda K.2', () => {
  it('renders the add-field button and empty hint', () => {
    renderEditor();
    expect(screen.getByTestId('form-fields-add')).toBeInTheDocument();
    expect(screen.getByText('Nenhum campo ainda.')).toBeInTheDocument();
  });

  it('adds a field with a slugified key', () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByTestId('form-fields-add'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as FormFieldSpec[];
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe('text');
    expect(typeof next[0].key).toBe('string');
  });

  it('lists existing fields with human type label (never raw value)', () => {
    renderEditor([{ key: 'nome', label: 'Nome', type: 'lookup' }]);
    const card = screen.getByTestId('form-fields-card-nome');
    // shows the human label, not the raw "lookup"
    expect(card).toHaveTextContent('Busca na ontologia');
  });

  it('changes field type via dropdown', () => {
    const { onChange } = renderEditor([{ key: 'nome', label: 'Nome', type: 'text' }]);
    fireEvent.click(screen.getByTestId('form-fields-toggle-nome'));
    fireEvent.change(screen.getByTestId('form-field-type-nome'), {
      target: { value: 'number' },
    });
    const next = onChange.mock.calls.at(-1)![0] as FormFieldSpec[];
    expect(next[0].type).toBe('number');
  });

  it('toggles required', () => {
    const { onChange } = renderEditor([{ key: 'nome', label: 'Nome', type: 'text' }]);
    fireEvent.click(screen.getByTestId('form-fields-toggle-nome'));
    fireEvent.click(screen.getByTestId('form-field-required-nome'));
    const next = onChange.mock.calls.at(-1)![0] as FormFieldSpec[];
    expect(next[0].required).toBe(true);
  });

  it('configures a pattern (validation) for text fields', () => {
    const { onChange } = renderEditor([{ key: 'cpf', label: 'CPF', type: 'text' }]);
    fireEvent.click(screen.getByTestId('form-fields-toggle-cpf'));
    fireEvent.change(screen.getByTestId('form-field-pattern-cpf'), {
      target: { value: '\\d{11}' },
    });
    const next = onChange.mock.calls.at(-1)![0] as FormFieldSpec[];
    expect(next[0].pattern).toBe('\\d{11}');
  });

  it('builds a conditional rule via selectors (no JSON)', () => {
    const { onChange } = renderEditor([
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['pf', 'pj'] },
      { key: 'cnpj', label: 'CNPJ', type: 'text' },
    ]);
    fireEvent.click(screen.getByTestId('form-fields-toggle-cnpj'));
    fireEvent.click(screen.getByTestId('form-rule-add-cnpj'));
    // a rule row appears with when/op/effect selectors
    const next1 = onChange.mock.calls.at(-1)![0] as FormFieldSpec[];
    const cnpj = next1.find((f) => f.key === 'cnpj')!;
    expect(cnpj.rules).toHaveLength(1);
    expect(cnpj.rules![0].when_field).toBe('tipo'); // first other field
    expect(cnpj.rules![0].effect).toBe('show');
  });

  it('removes a field', () => {
    const { onChange } = renderEditor([{ key: 'nome', label: 'Nome', type: 'text' }]);
    fireEvent.click(screen.getByTestId('form-fields-remove-nome'));
    const next = onChange.mock.calls.at(-1)![0] as FormFieldSpec[];
    expect(next).toHaveLength(0);
  });
});
