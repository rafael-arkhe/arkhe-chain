/**
 * DeviceFormDialog — conectar um celular à bancada, pela TELA.
 *
 * Este é o gesto que faltava. A bancada existia como card e a única forma de
 * conectar um aparelho era escrever `RUNNER_ADB_CONNECT=ip:porta` num arquivo de
 * env da ilha e re-deployar — o operador abria a tela, lia "nenhum aparelho
 * detectado" e não tinha nada para clicar.
 *
 * Prova: o diálogo pede SÓ o que está na janelinha do aparelho (o Android mostra
 * "IP address & Port" em dois lugares com o mesmo rótulo — pedir os dois é pedir
 * adivinhação, e foi o que o dono encontrou ao tentar usar); recusa material
 * incompleto ANTES de chamar o backend; manda o gesto pelo trilho genérico de
 * sub-unidade (`inventory` com kind=device); mostra a frase do driver quando ele
 * recusa; e o PIN nunca é pré-preenchido nem exibido.
 */
import * as React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { DeviceFormDialog } from '@/components/dados/device-form-dialog';

jest.mock('@/lib/api', () => ({
  Connectors: { inventoryApply: jest.fn() },
}));

const { Connectors } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
};

function abrir(props: Partial<React.ComponentProps<typeof DeviceFormDialog>> = {}) {
  return render(
    <DeviceFormDialog
      agentId="ag-pool"
      skillKey="connector.whatsapp_pool"
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
  Connectors.inventoryApply.mockResolvedValue({ ok: true, detail: 'queued' });
});

it('pede SÓ o que está na janelinha, e diz qual dos dois endereços é', async () => {
  abrir();
  const texto = screen.getByTestId('device-form-modal').textContent ?? '';
  // Sem o caminho exato, o operador não sabe nem onde começar — e "Depuração
  // sem fio" está escondida atrás de Opções do desenvolvedor.
  expect(texto).toMatch(/Depura/i);
  expect(texto).toMatch(/desenvolvedor/i);
  // O ERRO que o dono encontrou: o Android mostra "IP address & Port" em dois
  // lugares, com o mesmo rótulo. A tela tem de dizer QUAL usar.
  expect(texto).toMatch(/DOIS lugares/i);
  expect(texto).toMatch(/janelinha/i);
  // O que resolve a ambiguidade não é esconder um campo — é MOSTRAR a tela do
  // celular com as setas. Sem o desenho, "IP address & Port" aparece duas vezes
  // e não há como saber qual vai em qual campo.
  const mapa = screen.getByTestId('device-form-mapa').textContent ?? '';
  expect(mapa).toMatch(/IP address & Port/);
  expect(mapa).toMatch(/Wi-Fi pairing code/);
  expect(mapa).toMatch(/campo 1/);
  expect(mapa).toMatch(/campo 3/);
});

it('recusa material incompleto SEM chamar o backend', async () => {
  abrir();
  // código sem endereço: meio gesto, o runner tentaria um pareamento pela
  // metade e reportaria uma falha que não é do aparelho
  fireEvent.change(screen.getByTestId('device-form-code'),
    { target: { value: '714348' } });
  await flush();
  expect(screen.getByTestId('device-form-save')).toBeDisabled();
  fireEvent.click(screen.getByTestId('device-form-save'));
  await flush();
  expect(Connectors.inventoryApply).not.toHaveBeenCalled();
});

it('conectar por rede manda os três valores da tela do aparelho', async () => {
  const onDone = jest.fn();
  abrir({ onDone });
  fireEvent.change(screen.getByTestId('device-form-conn'),
    { target: { value: '192.168.1.64:39265' } });
  fireEvent.change(screen.getByTestId('device-form-code'),
    { target: { value: '714348' } });
  fireEvent.change(screen.getByTestId('device-form-pair'),
    { target: { value: '192.168.1.64:44699' } });
  fireEvent.change(screen.getByTestId('device-form-pin'),
    { target: { value: '784569' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-form-save'));
  await flush();

  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'add',
    { kind: 'device', pair_addr: '192.168.1.64:44699', pair_code: '714348',
      conn_addr: '192.168.1.64:39265', pin: '784569' },
  );
  // sem o endereço de conexão, a estação teria de PROCURAR a porta: mais de um
  // minuto de espera, e nada quando o celular entra em sono profundo
  const item = Connectors.inventoryApply.mock.calls[0][3];
  expect(item).not.toHaveProperty('serial');
  expect(onDone).toHaveBeenCalled();
});

it('falta o endereço do alto: não deixa salvar', async () => {
  abrir();
  fireEvent.change(screen.getByTestId('device-form-code'),
    { target: { value: '714348' } });
  fireEvent.change(screen.getByTestId('device-form-pair'),
    { target: { value: '192.168.1.64:44699' } });
  await flush();
  expect(screen.getByTestId('device-form-save')).toBeDisabled();
});

it('aparelho no cabo dispensa pareamento', async () => {
  abrir();
  fireEvent.click(screen.getByTestId('device-form-mode-usb'));
  fireEvent.change(screen.getByTestId('device-form-serial'),
    { target: { value: 'R58M30ABCDE' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-form-save'));
  await flush();
  const item = Connectors.inventoryApply.mock.calls[0][3];
  expect(item).toEqual(expect.objectContaining({ kind: 'device', serial: 'R58M30ABCDE' }));
  // sem material de pareamento: mandar vazio faria a estação recusar o gesto
  expect(item).not.toHaveProperty('pair_addr');
  expect(item).not.toHaveProperty('pair_code');
});

it('PIN não numérico é recusado na tela, antes do aparelho', async () => {
  // Padrão e biometria não têm caminho por adb. Deixar passar empurraria a
  // falha para o celular, com a religação já quebrada.
  abrir();
  fireEvent.click(screen.getByTestId('device-form-mode-usb'));
  fireEvent.change(screen.getByTestId('device-form-serial'),
    { target: { value: 'R58M30ABCDE' } });
  fireEvent.change(screen.getByTestId('device-form-pin'),
    { target: { value: '12ab' } });
  await flush();
  expect(screen.getByTestId('device-form-save')).toBeDisabled();
  expect(screen.getByTestId('device-form-pin-hint').textContent).toMatch(/digito/i);
});

it('a frase do driver aparece quando ele recusa', async () => {
  Connectors.inventoryApply.mockResolvedValue({
    ok: false,
    detail: 'este aparelho ainda religa o número 5515991044002',
  });
  abrir();
  fireEvent.click(screen.getByTestId('device-form-mode-usb'));
  fireEvent.change(screen.getByTestId('device-form-serial'),
    { target: { value: 'R58M30ABCDE' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-form-save'));
  await flush();
  expect(screen.getByTestId('device-form-error').textContent)
    .toMatch(/ainda religa/);
});

it('editar o PIN de um aparelho existente não pede pareamento de novo', async () => {
  abrir({ edit: { serial: 'R58M30ABCDE', state: 'device', has_pin: true } });
  // o aparelho já está conectado: o gesto aqui é só a senha da tela
  expect(screen.queryByTestId('device-form-pair')).toBeNull();
  expect(screen.queryByTestId('device-form-code')).toBeNull();
  // e o PIN JAMAIS é pré-preenchido — o retrato não traz a senha, só has_pin
  expect((screen.getByTestId('device-form-pin') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByTestId('device-form-pin'),
    { target: { value: '784569' } });
  await flush();
  fireEvent.click(screen.getByTestId('device-form-save'));
  await flush();
  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'update',
    { kind: 'device', serial: 'R58M30ABCDE', pin: '784569' },
  );
});

it('avisa para NÃO fechar a janelinha do celular', async () => {
  // O endereço de pareamento morre quando a janelinha fecha. Sem o aviso, o
  // operador copia os dados, fecha a tela e recebe um "não alcancei" que não
  // tem relação nenhuma com o que ele fez — foi exatamente o que aconteceu na
  // primeira tentativa real.
  abrir();
  const texto = screen.getByTestId('device-form-modal').textContent ?? '';
  expect(texto).toMatch(/JANELINHA ABERTA/i);
});
