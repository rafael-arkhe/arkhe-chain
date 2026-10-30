/**
 * ConfigureDialog compartilhado (extraído de conectores-workspace, 2026-07-26).
 *
 * Prova: schema vazio → estado "sem parâmetros"; schema com param → SchemaForm
 * real (input pré-preenchido, onChange propagado); os testids do CONECTOR são
 * o default (contrato de teste desde a Tarefa H) e o prefixo é sobrescrevível
 * para o Configurar do DISPOSITIVO; avisos de clamp e erro aparecem.
 *
 * `t` é injetado pelo caller — aqui a identidade, como o resto do projeto.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ConfigureDialog } from '@/components/dados/configure-dialog';
import type { SkillParam } from '@/lib/api';

const t = (k: string) => k;

const SCHEMA = [
  { key: 'janela', label: 'Janela', param_type: 'int', required: false, min: 10, max: 600 },
] as unknown as SkillParam[];

function renderDialog(over: Partial<React.ComponentProps<typeof ConfigureDialog>> = {}) {
  const props: React.ComponentProps<typeof ConfigureDialog> = {
    t,
    name: 'Ponte do AJX',
    skillName: 'Ponte',
    schema: [],
    values: {},
    loading: false,
    busy: false,
    error: null,
    warnings: [],
    onChange: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    ...over,
  };
  return { props, ...render(<ConfigureDialog {...props} />) };
}

it('schema vazio → estado "sem parâmetros" (nenhum form)', () => {
  renderDialog({ schema: [] });
  expect(screen.getByTestId('conector-configurar-vazio'))
    .toHaveTextContent('conectores.configure.no_schema');
  expect(screen.queryByTestId('cf-cfg-form')).toBeNull();
});

it('schema com param → SchemaForm com o valor atual', () => {
  renderDialog({ schema: SCHEMA, values: { janela: 30 } });
  const field = screen.getByTestId('cf-cfg-field-janela') as HTMLInputElement;
  expect(field.value).toBe('30');
  expect(screen.queryByTestId('conector-configurar-vazio')).toBeNull();
});

it('edição do campo propaga onChange com a chave declarada', () => {
  const onChange = jest.fn();
  renderDialog({ schema: SCHEMA, values: { janela: 30 }, onChange });
  fireEvent.change(screen.getByTestId('cf-cfg-field-janela'), { target: { value: '45' } });
  expect(onChange).toHaveBeenCalledWith('janela', 45);
});

it('testids do conector são o default (contrato preservado)', () => {
  renderDialog();
  expect(screen.getByTestId('conector-configurar-modal')).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByTestId('conector-configurar-submit')).toBeInTheDocument();
  expect(screen.getByTestId('conector-configurar-cancel')).toBeInTheDocument();
  expect(screen.getByTestId('conector-configurar-close')).toBeInTheDocument();
});

it('prefixo sobrescrito serve o Configurar do dispositivo, sem colidir', () => {
  renderDialog({
    schema: SCHEMA, values: {},
    testidPrefix: 'device-configurar', formTestidPrefix: 'dev-cfg',
  });
  expect(screen.getByTestId('device-configurar-modal')).toBeInTheDocument();
  expect(screen.getByTestId('dev-cfg-field-janela')).toBeInTheDocument();
  expect(screen.queryByTestId('conector-configurar-modal')).toBeNull();
});

it('clamps e erro aparecem no corpo do diálogo', () => {
  renderDialog({ warnings: ['Janela: 9999 → 600 (máx. declarado).'], error: 'boom' });
  expect(screen.getByTestId('conector-configurar-clamps')).toHaveTextContent('600');
  expect(screen.getByTestId('conector-configurar-err')).toHaveTextContent('boom');
});

it('submit fica bloqueado enquanto carrega a config atual', () => {
  renderDialog({ loading: true });
  expect(screen.getByTestId('conector-configurar-submit')).toBeDisabled();
});
