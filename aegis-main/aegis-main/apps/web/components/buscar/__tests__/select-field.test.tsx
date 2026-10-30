/**
 * SelectField — guarda de regressão do "backblur branco" dos selects do /buscar.
 *
 * A causa-raiz do bug que reapareceu por sessões: SelectField era um `<select>`
 * NATIVO, cujo popup de opções é desenhado pelo browser/SO (no Windows herda o
 * material Fluent/acrylic translúcido = o "backblur" que NENHUM ajuste de CSS
 * matava). A correção troca o nativo por um combobox FloatingPopover sólido,
 * 100% sob nosso controle. Estes testes travam o comportamento:
 *   - gatilho é <button>, NUNCA um <select> nativo;
 *   - busca SEMPRE presente (o nativo tinha type-ahead — não regredir);
 *   - filtra, escolhe (onChange + fecha), opção "vazio" governada por `clearable`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectField } from '@/components/buscar/select-field';

const OPTS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

describe('SelectField — combobox sólido (sem <select> nativo)', () => {
  it('renderiza um gatilho <button> e NENHUM <select> nativo (mata o popup acrylic do SO)', () => {
    const { container } = render(
      <SelectField name="t" label="Tipo" value="" onChange={() => {}} options={OPTS} />,
    );
    const trigger = screen.getByTestId('buscar-campo-t');
    expect(trigger.tagName).toBe('BUTTON');
    // regressão dura: nenhum <select> nativo na árvore.
    expect(container.querySelector('select')).toBeNull();
  });

  it('abre no clique, mostra busca SEMPRE, filtra e escolhe → onChange + fecha', async () => {
    const onChange = jest.fn();
    render(
      <SelectField name="t" label="Tipo" value="" onChange={onChange} options={OPTS} />,
    );

    fireEvent.click(screen.getByTestId('buscar-campo-t'));

    // busca sempre presente (não gateada por tamanho da lista).
    const input = await screen.findByTestId('buscar-campo-t-input');
    expect(input).toBeInTheDocument();
    expect(screen.getByTestId('buscar-campo-t-opt-a')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-campo-t-opt-c')).toBeInTheDocument();

    // filtra: 'bra' só casa Bravo.
    fireEvent.change(input, { target: { value: 'bra' } });
    expect(screen.queryByTestId('buscar-campo-t-opt-a')).toBeNull();
    expect(screen.getByTestId('buscar-campo-t-opt-b')).toBeInTheDocument();

    // escolhe → emite o value e fecha (popover desmonta).
    fireEvent.click(screen.getByTestId('buscar-campo-t-opt-b'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByTestId('buscar-campo-t-input')).toBeNull();
  });

  it('clearable (default) inclui opção "vazio"; clearable=false a omite (pick obrigatório)', () => {
    const { rerender } = render(
      <SelectField name="t" label="Tipo" value="a" onChange={() => {}} options={OPTS} />,
    );
    fireEvent.click(screen.getByTestId('buscar-campo-t'));
    expect(screen.getByTestId('buscar-campo-t-opt-')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' }); // fecha o popover
    rerender(
      <SelectField
        name="t"
        label="Tipo"
        value="a"
        onChange={() => {}}
        options={OPTS}
        clearable={false}
      />,
    );
    fireEvent.click(screen.getByTestId('buscar-campo-t'));
    expect(screen.queryByTestId('buscar-campo-t-opt-')).toBeNull();
  });

  it('emptyLabel vira o placeholder do gatilho quando nada está selecionado', () => {
    render(
      <SelectField
        name="t"
        label="Tipo"
        value=""
        onChange={() => {}}
        options={OPTS}
        emptyLabel="Selecione a finalidade…"
      />,
    );
    expect(screen.getByTestId('buscar-campo-t')).toHaveTextContent(
      'Selecione a finalidade…',
    );
  });
});
