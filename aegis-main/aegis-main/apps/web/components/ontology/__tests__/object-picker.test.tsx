/**
 * object-picker.test.tsx — <ObjectPicker> standalone (P4 ELO 2).
 *
 * Prova (jsdom):
 *   1. busca pré-populada pelo seed → Ontology.listNodes(node_type, q).
 *   2. clicar num resultado devolve o NODE COMPLETO em onPick.
 *   3. "Criar novo objeto" (allowCreate) chama onCreateNew.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockListNodes = jest.fn();
jest.mock('@/lib/api', () => ({
  Ontology: {
    listNodes: (...a: unknown[]) => mockListNodes(...a),
  },
}));

import { ObjectPicker } from '@/components/ontology/object-picker';

const NODES = [
  { id: 'p-1', name: 'João da Silva', node_type: 'pessoa', properties: {}, schema_definition: {} },
  { id: 'p-2', name: 'João Pereira', node_type: 'pessoa', properties: {}, schema_definition: {} },
];

beforeEach(() => {
  mockListNodes.mockReset().mockResolvedValue(NODES);
});

describe('ObjectPicker — busca pré-populada + escolha', () => {
  it('busca por node_type + seed e lista os objetos', async () => {
    render(<ObjectPicker node_type="pessoa" seed={{ value: 'João' }} onPick={jest.fn()} />);

    await waitFor(() =>
      expect(mockListNodes).toHaveBeenCalledWith(
        expect.objectContaining({ node_type: 'pessoa', q: 'João' }),
      ),
    );

    expect(await screen.findByTestId('object-picker-result-p-1')).toBeInTheDocument();
    expect(screen.getByText('João da Silva')).toBeInTheDocument();
    expect(screen.getByText('João Pereira')).toBeInTheDocument();
  });

  it('clicar num resultado devolve o node completo', async () => {
    const onPick = jest.fn();
    render(<ObjectPicker node_type="pessoa" seed={{ value: 'João' }} onPick={onPick} />);

    fireEvent.click(await screen.findByTestId('object-picker-result-p-2'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-2', name: 'João Pereira' }));
  });

  it('"Criar novo objeto" só aparece com allowCreate e dispara onCreateNew', async () => {
    const onCreateNew = jest.fn();
    const { rerender } = render(
      <ObjectPicker node_type="pessoa" seed={{ value: 'x' }} onPick={jest.fn()} />,
    );
    await screen.findByTestId('object-picker');
    expect(screen.queryByTestId('object-picker-create')).toBeNull();

    rerender(
      <ObjectPicker
        node_type="pessoa"
        seed={{ value: 'x' }}
        onPick={jest.fn()}
        allowCreate
        onCreateNew={onCreateNew}
      />,
    );
    fireEvent.click(screen.getByTestId('object-picker-create'));
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });
});
