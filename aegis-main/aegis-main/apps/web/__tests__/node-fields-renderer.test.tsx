/**
 * Wave 1 inc2 — NodeFieldsRenderer: o renderer GENÉRICO de um nó do DAG.
 * Prova: (1) despacho por type (string/number/boolean/options/notice); (2) filtro
 * por displayOptions (campo aparece só quando outro=X); (3) escape hatch `custom`;
 * (4) collection repetível (add/remove + recursão); (5) clamp de number.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';

import { NodeFieldsRenderer, type CustomFieldWidget } from '@/components/dados/node-fields-renderer';
import type { NodeFieldSpec } from '@/lib/pipeline/node-fields';

jest.mock('@/lib/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'pt-BR' }),
  useT: () => (k: string) => k,
}));

function Harness({ fields, initial = {}, customWidgets, resolveOptions }: {
  fields: NodeFieldSpec[];
  initial?: Record<string, unknown>;
  customWidgets?: Record<string, CustomFieldWidget>;
  resolveOptions?: (s: string, d?: string) => { name: string; value: string | number | boolean }[] | null;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>(initial);
  return (
    <NodeFieldsRenderer
      fields={fields}
      values={values}
      onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
      customWidgets={customWidgets}
      resolveOptions={resolveOptions}
      testidPrefix="nf"
    />
  );
}

describe('NodeFieldsRenderer', () => {
  it('despacha por type e escreve o valor no config', () => {
    render(<Harness fields={[
      { key: 'name', label: 'Nome', type: 'string', default: '' },
      { key: 'n', label: 'N', type: 'number', default: 0 },
      { key: 'on', label: 'On', type: 'boolean', default: false },
    ]} />);
    fireEvent.change(screen.getByTestId('nf-name'), { target: { value: 'ana' } });
    expect((screen.getByTestId('nf-name') as HTMLInputElement).value).toBe('ana');
    expect((screen.getByTestId('nf-n') as HTMLInputElement).type).toBe('number');
    expect((screen.getByTestId('nf-on') as HTMLInputElement).type).toBe('checkbox');
  });

  it('number CLAMPA a min/max ao digitar acima do teto', () => {
    render(<Harness fields={[
      { key: 'secs', label: 'S', type: 'number', default: 5, typeOptions: { minValue: 0, maxValue: 120 } },
    ]} />);
    const inp = screen.getByTestId('nf-secs') as HTMLInputElement;
    fireEvent.change(inp, { target: { value: '999' } });
    expect(inp.value).toBe('120'); // clampado ao max
  });

  it('displayOptions: campo só aparece quando outro campo casa', () => {
    render(<Harness
      initial={{ mode: 'append' }}
      fields={[
        { key: 'mode', label: 'Modo', type: 'options', default: 'append', required: true, options: [
          { name: 'append', value: 'append' }, { name: 'combine', value: 'combine' },
        ] },
        { key: 'key', label: 'Chave', type: 'string', default: '',
          displayOptions: { show: { mode: ['combine'] } } },
      ]}
    />);
    // mode=append → 'key' escondido
    expect(screen.queryByTestId('nf-key')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('nf-mode'), { target: { value: 'combine' } });
    // agora aparece
    expect(screen.getByTestId('nf-key')).toBeInTheDocument();
  });

  it('escape hatch custom: renderiza o widget bespoke registrado', () => {
    const MyWidget: CustomFieldWidget = ({ value, onChange, testid }) => (
      <button type="button" data-testid={testid} onClick={() => onChange('picked')}>
        {String(value ?? 'vazio')}
      </button>
    );
    render(<Harness
      fields={[{ key: 'x', label: 'X', type: 'custom', typeOptions: { widget: 'my' } }]}
      customWidgets={{ my: MyWidget }}
    />);
    const btn = screen.getByTestId('nf-x');
    expect(btn).toHaveTextContent('vazio');
    fireEvent.click(btn);
    expect(btn).toHaveTextContent('picked');
  });

  it('collection: adiciona e remove itens (grupo repetível)', () => {
    render(<Harness fields={[
      { key: 'rules', label: 'Regras', type: 'collection', typeOptions: {
        addButtonText: 'add', itemFields: [{ key: 'name', label: 'Nome', type: 'string', default: '' }],
      } },
    ]} />);
    expect(screen.queryByTestId('nf-rules-item-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nf-rules-add'));
    expect(screen.getByTestId('nf-rules-item-0')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nf-rules-add'));
    expect(screen.getByTestId('nf-rules-item-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nf-rules-remove-0'));
    expect(screen.queryByTestId('nf-rules-item-1')).not.toBeInTheDocument(); // uma foi removida
  });

  it('options dinâmicas: usa resolveOptions (loadOptions) p/ popular o select', () => {
    render(<Harness
      fields={[{ key: 'col', label: 'Coluna', type: 'options', default: '', required: true,
        typeOptions: { loadOptions: 'columns' } }]}
      resolveOptions={(s) => (s === 'columns' ? [{ name: 'cpf', value: 'cpf' }, { name: 'nome', value: 'nome' }] : null)}
    />);
    const sel = screen.getByTestId('nf-col') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['cpf', 'nome']);
  });

  // batch 2b — enum select com default REAL (datetime.mode/crypto.algo): sem opção
  // vazia '—' e SEM asterisco de obrigatório (o default já é uma escolha válida).
  it('options com default real: NÃO renderiza a opção vazia nem o asterisco', () => {
    render(<Harness
      initial={{ algo: 'sha256' }}
      fields={[{ key: 'algo', label: 'Algoritmo', type: 'options', default: 'sha256', options: [
        { name: 'SHA-256', value: 'sha256' }, { name: 'MD5', value: 'md5' },
      ] }]}
    />);
    const sel = screen.getByTestId('nf-algo') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['sha256', 'md5']); // sem ''
    expect(screen.getByText('Algoritmo').textContent).not.toContain('*');
  });

  // batch 2b — options SEM default (ou default '') = picker de recurso (board_id):
  // mostra a opção vazia usando o `placeholder` como rótulo (não o '—' cru).
  it('options com default vazio: mostra a opção vazia rotulada pelo placeholder', () => {
    render(<Harness
      fields={[{ key: 'board_id', label: 'Quadro', type: 'options', default: '',
        placeholder: 'Escolher Quadro', typeOptions: { loadOptions: 'boards' } }]}
      resolveOptions={(s) => (s === 'boards' ? [{ name: 'Fluxo B', value: 'b2' }] : null)}
    />);
    const sel = screen.getByTestId('nf-board_id') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['', 'b2']);
    const empty = Array.from(sel.options).find((o) => o.value === '')!;
    expect(empty.textContent).toBe('Escolher Quadro');
  });

  // batch 2b — number cai no default quando a chave está ausente (idioma `?? default`).
  it('number: exibe o default quando o valor está ausente', () => {
    render(<Harness fields={[
      { key: 'count', label: 'Qtd', type: 'number', default: 100, typeOptions: { minValue: 0 } },
    ]} />);
    expect((screen.getByTestId('nf-count') as HTMLInputElement).value).toBe('100');
  });
});
