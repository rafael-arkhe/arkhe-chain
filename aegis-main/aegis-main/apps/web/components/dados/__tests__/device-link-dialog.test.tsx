/**
 * DeviceLinkDialog — vincular aparelho→número A PARTIR da bancada.
 *
 * Quem lê "sem número atribuído" é a linha do aparelho. Mandar o operador
 * procurar o formulário do número noutro cartão é mandá-lo adivinhar onde fica
 * a resposta que a própria tela acabou de pedir.
 */
import * as React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { DeviceLinkDialog } from '@/components/dados/device-link-dialog';

jest.mock('@/lib/api', () => ({ Connectors: { inventoryApply: jest.fn() } }));
const { Connectors } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
};

const NUMEROS = [
  { id: 'tit', msisdn: '5515996770539', role: 'titular', state: 'paired',
    sendable: true, needs_gesture: false },
  { id: 'v1', msisdn: '5515991244858', role: 'vazao', state: 'paired',
    sendable: true, needs_gesture: false },
];

function abrir(props: Partial<React.ComponentProps<typeof DeviceLinkDialog>> = {}) {
  return render(
    <DeviceLinkDialog
      agentId="ag-pool"
      skillKey="connector.whatsapp_pool"
      device={{ serial: '192.168.1.64', addr: '192.168.1.64:35215', model: 'SM_A115M' }}
      numeros={NUMEROS}
      onClose={props.onClose ?? jest.fn()}
      onDone={props.onDone ?? jest.fn()}
      {...props}
    />,
  );
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Connectors.inventoryApply.mockResolvedValue({ ok: true, detail: '' });
});

it('vincula usando o ENDEREÇO do adb, não o IP da linha', async () => {
  // A linha é chaveada pelo IP (a porta muda a cada reinício), mas o vínculo
  // precisa do endereço completo — é ele que a estação manda ao runner.
  abrir();
  fireEvent.change(screen.getByTestId('device-link-numero'), { target: { value: 'v1' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-link-save'));
  await flush();
  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'update',
    { id: 'v1', device_serial: '192.168.1.64:35215' },
  );
});

it('número preso a OUTRO aparelho aparece desabilitado', async () => {
  // Sumir da lista faria o operador achar que o número desapareceu;
  // selecionável, ele criaria a colisão e descobriria pelo número que não volta.
  abrir({
    numeros: [
      NUMEROS[0],
      { ...NUMEROS[1], device_serial: '10.0.0.7:5555' },
    ],
  });
  const opcoes = screen.getByTestId('device-link-numero')
    .querySelectorAll('option');
  const v1 = Array.from(opcoes).find((o) => (o as HTMLOptionElement).value === 'v1');
  expect((v1 as HTMLOptionElement).disabled).toBe(true);
  expect(v1?.textContent).toMatch(/10\.0\.0\.7/);
});

it('trocar de número SOLTA o anterior antes de prender o novo', async () => {
  // Dois números apontando para o mesmo aparelho fariam o runner digitar o
  // código de um no aplicativo do outro — e invalidar os dois.
  abrir({
    numeros: [
      { ...NUMEROS[0], device_serial: '192.168.1.64:35215' },
      NUMEROS[1],
    ],
  });
  fireEvent.change(screen.getByTestId('device-link-numero'), { target: { value: 'v1' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-link-save'));
  await flush();
  expect(Connectors.inventoryApply).toHaveBeenNthCalledWith(
    1, 'ag-pool', 'connector.whatsapp_pool', 'update',
    { id: 'tit', device_serial: '' },
  );
  expect(Connectors.inventoryApply).toHaveBeenNthCalledWith(
    2, 'ag-pool', 'connector.whatsapp_pool', 'update',
    { id: 'v1', device_serial: '192.168.1.64:35215' },
  );
});

it('desvincular é gesto legítimo: solta sem prender ninguém', async () => {
  abrir({
    numeros: [{ ...NUMEROS[1], device_serial: '192.168.1.64:35215' }],
  });
  fireEvent.change(screen.getByTestId('device-link-numero'), { target: { value: '' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-link-save'));
  await flush();
  expect(Connectors.inventoryApply).toHaveBeenCalledTimes(1);
  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'update',
    { id: 'v1', device_serial: '' },
  );
});

it('estação sem números diz isso, em vez de oferecer lista vazia', async () => {
  abrir({ numeros: [] });
  expect(screen.getByTestId('device-link-vazio').textContent)
    .toMatch(/nao tem numeros/i);
  await flush();
});

it('a frase do driver aparece quando ele recusa', async () => {
  Connectors.inventoryApply.mockResolvedValue({
    ok: false, detail: 'este aparelho já religa outro número',
  });
  abrir();
  fireEvent.change(screen.getByTestId('device-link-numero'), { target: { value: 'v1' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-link-save'));
  await flush();
  expect(screen.getByTestId('device-link-error').textContent)
    .toMatch(/já religa outro/);
});
