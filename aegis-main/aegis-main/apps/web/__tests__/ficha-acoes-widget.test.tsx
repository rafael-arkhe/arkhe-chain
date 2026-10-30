/**
 * P5 — `security.ficha.acoes`: ações do TIPO executadas pelo pipeline GOVERNADO.
 *
 * Lê `type_def.actions` (objectTypeSchema) e executa cada ação via
 * `ActionTypes.execute` (POST /platform/v23/action-types/{id}/execute — gates +
 * lineage), o MESMO trilho dos apps AIP/Workshop. A ação opera sobre a instância
 * da ficha via `object_id`. O contrato expõe a ação pelo NOME; resolvemos o id
 * via catálogo (`ActionTypes.list`).
 *
 * Cobertura:
 *  1. lista type_def.actions como botões; sem ação → estado vazio honesto.
 *  2. ação sem parâmetro → confirma → execute(id, {object_id}, note) governado.
 *  3. status governados (PENDING_APPROVAL / POLICY_DENIED) viram mensagem clara.
 *  4. ação COM parâmetro → form inline → execute com o param coagido pelo tipo.
 *  5. type_def ausente → busca objectTypeSchema(entity_type) (caminho Entity).
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  ActionTypes: { list: jest.fn(), execute: jest.fn() },
  Ontology: { objectTypeSchema: jest.fn() },
}));

const mockConfirm = jest.fn(() => Promise.resolve(true));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: () => mockConfirm(),
}));

jest.mock('@/lib/workshop/missing-inputs', () => ({
  humanizeApiError: (s: string) => s,
}));

jest.mock('@/lib/i18n/provider', () => ({
  useT: () => (k: string) => k,
}));

import { FichaAcoes } from '@/components/workshop/widgets/ficha-acoes';
import { ActionTypes, Ontology } from '@/lib/api';

const list = ActionTypes.list as jest.Mock;
const execute = ActionTypes.execute as jest.Mock;
const objectTypeSchema = Ontology.objectTypeSchema as jest.Mock;

type RP = Parameters<typeof FichaAcoes>[0];
function renderWidget(variables: Record<string, unknown>, config: Record<string, unknown> = {}) {
  const props = {
    appId: 'app1',
    config,
    variables,
    bindings: {},
    setBinding: jest.fn(),
  } as unknown as RP;
  return render(<FichaAcoes {...props} />);
}

const OBJ = { id: 'n1', name: 'Alvo', entity_type: 'imovel' };

beforeEach(() => {
  list.mockReset();
  execute.mockReset();
  objectTypeSchema.mockReset();
  mockConfirm.mockClear();
  mockConfirm.mockResolvedValue(true);
});

describe('security.ficha.acoes — lista + execução governada', () => {
  it('lista as ações do contrato; sem ação → estado vazio', () => {
    renderWidget({ obj: OBJ, type_def: { actions: [] } });
    expect(screen.getByTestId('ficha-acoes-empty')).toBeInTheDocument();
  });

  it('ação sem parâmetro → confirma → execute(id, {object_id}, note) governado', async () => {
    list.mockResolvedValue([{ id: 'act-1', name: 'Arquivar' }]);
    execute.mockResolvedValue({ status: 'SUCCESS', execution_id: 'e1', output: {} });

    renderWidget(
      {
        obj: OBJ,
        type_def: { actions: [{ name: 'Arquivar', rule: 'custom', parameters: [] }] },
      },
      { note: 'rotina' },
    );

    // botão da ação (sem parâmetro → executa direto após confirmar).
    await act(async () => {
      fireEvent.click(screen.getByTestId('ficha-acoes-trigger-Arquivar'));
    });

    await waitFor(() => expect(execute).toHaveBeenCalled());
    expect(mockConfirm).toHaveBeenCalled();
    // id resolvido do catálogo (name→id); object_id da ficha; note da config.
    expect(execute).toHaveBeenCalledWith('act-1', { object_id: 'n1' }, 'rotina');
    expect(await screen.findByTestId('ficha-acoes-result-Arquivar')).toBeInTheDocument();
  });

  it('status PENDING_APPROVAL e POLICY_DENIED viram mensagem clara', async () => {
    list.mockResolvedValue([
      { id: 'act-1', name: 'Notificar' },
      { id: 'act-2', name: 'Bloquear' },
    ]);
    execute
      .mockResolvedValueOnce({ status: 'PENDING_APPROVAL', approval_id: 'ap1', output: {} })
      .mockResolvedValueOnce({ status: 'POLICY_DENIED', output: {} });

    renderWidget({
      obj: OBJ,
      type_def: {
        actions: [
          { name: 'Notificar', rule: 'custom', parameters: [] },
          { name: 'Bloquear', rule: 'custom', parameters: [] },
        ],
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('ficha-acoes-trigger-Notificar'));
    });
    expect(await screen.findByTestId('ficha-acoes-result-Notificar')).toHaveTextContent(
      'ficha.acoes.pendente',
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('ficha-acoes-trigger-Bloquear'));
    });
    expect(await screen.findByTestId('ficha-acoes-result-Bloquear')).toHaveTextContent(
      'ficha.acoes.negado',
    );
  });

  it('ação COM parâmetro → form inline → execute com param coagido pelo tipo', async () => {
    list.mockResolvedValue([{ id: 'act-9', name: 'Definir prioridade' }]);
    execute.mockResolvedValue({ status: 'SUCCESS', execution_id: 'e9', output: {} });

    renderWidget({
      obj: OBJ,
      type_def: {
        actions: [
          {
            name: 'Definir prioridade',
            rule: 'custom',
            parameters: [{ key: 'nivel', type: 'number', title: 'Nível' }],
          },
        ],
      },
    });

    // 1º clique expande o form (NÃO executa).
    fireEvent.click(screen.getByTestId('ficha-acoes-trigger-Definir prioridade'));
    expect(execute).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText('number');
    fireEvent.change(input, { target: { value: '3' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('ficha-acoes-run-Definir prioridade'));
    });

    await waitFor(() => expect(execute).toHaveBeenCalled());
    // número coagido (3, não "3").
    expect(execute).toHaveBeenCalledWith('act-9', { object_id: 'n1', nivel: 3 }, undefined);
  });
});

describe('security.ficha.acoes — caminho Entity (sem type_def injetado)', () => {
  it('type_def ausente → busca objectTypeSchema(entity_type)', async () => {
    objectTypeSchema.mockResolvedValue({
      kind: 'imovel',
      display_name: 'Imóvel',
      actions: [{ name: 'Vistoriar', rule: 'custom', parameters: [] }],
    });

    await act(async () => {
      renderWidget({ obj: OBJ });
    });

    expect(objectTypeSchema).toHaveBeenCalledWith('imovel');
    expect(await screen.findByTestId('ficha-acoes-trigger-Vistoriar')).toBeInTheDocument();
  });
});
