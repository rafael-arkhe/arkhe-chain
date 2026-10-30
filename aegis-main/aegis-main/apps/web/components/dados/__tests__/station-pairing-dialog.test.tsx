/**
 * Sprint 5 (Estação WhatsApp) — StationPairingDialog.
 *
 * Prova: ao abrir chama pairingStart e renderiza o QR (awaiting_scan); poll
 * a cada 3s até connected mostra o estado Conectado e PARA o poll; "Gerar novo
 * código" chama pairingStart com { refresh: true }; testid presente.
 */
import * as React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { StationPairingDialog } from '@/components/dados/station-pairing-dialog';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/components/dialog/use-dialog-a11y', () => ({
  useDialogA11y: () => ({ current: null }),
}));
jest.mock('@/components/ui/modal-backdrop', () => ({
  // Sem JSX (o factory do jest não pode referenciar React fora de escopo).
  ModalPortal: (props: { children?: React.ReactNode }) => props.children,
}));
jest.mock('@/lib/api', () => ({
  Connectors: { pairingStart: jest.fn(), pairingPoll: jest.fn() },
}));

const { Connectors } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
};

const AWAITING = {
  state: 'awaiting_scan', qr_data_url: 'data:image/png;base64,AAAA',
  code: null, expires_at: null, detail: '',
};
const CONNECTED = {
  state: 'connected', qr_data_url: null, code: null, expires_at: null, detail: '',
};

// Flush do microtask do mock async (start/poll) sem depender de timers reais.
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

it('ao abrir chama pairingStart e renderiza o QR (awaiting_scan)', async () => {
  Connectors.pairingStart.mockResolvedValue(AWAITING);
  Connectors.pairingPoll.mockResolvedValue(AWAITING);
  render(<StationPairingDialog agentId="ag1" skillKey="connector.whatsapp" onClose={() => {}} />);
  await flush();

  expect(screen.getByTestId('connector-pair-modal')).toBeInTheDocument();
  // Título NEUTRO: o mesmo diálogo pareia estação e ponte AutoSync (o valor
  // pt-BR/en-US da chave é provado no teste de Dispositivos, com i18n real).
  expect(screen.getByTestId('connector-pair-title')).toHaveTextContent('conectores.pair.title');
  expect(Connectors.pairingStart).toHaveBeenCalledWith('ag1', 'connector.whatsapp', {});
  const qr = screen.getByTestId('connector-pair-qr');
  expect(qr).toHaveAttribute('src', 'data:image/png;base64,AAAA');
});

it('poll até connected mostra Conectado e para o poll', async () => {
  jest.useFakeTimers();
  Connectors.pairingStart.mockResolvedValue(AWAITING);
  Connectors.pairingPoll
    .mockResolvedValueOnce(AWAITING)
    .mockResolvedValue(CONNECTED);

  render(<StationPairingDialog agentId="ag1" skillKey="sk" onClose={() => {}} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(screen.getByTestId('connector-pair-qr')).toBeInTheDocument();

  // 3s → poll #1 (ainda awaiting_scan)
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(Connectors.pairingPoll).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('connector-pair-connected')).toBeNull();

  // 3s → poll #2 (connected)
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(screen.getByTestId('connector-pair-connected')).toBeInTheDocument();
  const atConnect = Connectors.pairingPoll.mock.calls.length;

  // poll parado: avançar mais não dispara novas leituras
  await act(async () => { await jest.advanceTimersByTimeAsync(9000); });
  expect(Connectors.pairingPoll).toHaveBeenCalledTimes(atConnect);
});

it('estado error com detail mostra o MOTIVO (ex.: licença), não "Erro" pelado', async () => {
  // O backend responde 200 { state:"error", detail:"...licença..." } — NÃO
  // lança. O diálogo tem que surfacear o `detail`, senão o operador via só
  // "Erro" sem saber o que fazer.
  const ERR = {
    state: 'error', qr_data_url: null, code: null, expires_at: null,
    detail: 'o serviço local de WhatsApp requer ativação de licença — abra o manager',
  };
  Connectors.pairingStart.mockResolvedValue(ERR);
  Connectors.pairingPoll.mockResolvedValue(ERR);
  render(<StationPairingDialog agentId="ag1" skillKey="sk" onClose={() => {}} />);
  await flush();

  const alert = screen.getByTestId('connector-pair-error');
  expect(alert).toHaveTextContent('ativação de licença');
});

it('pareamento por CÓDIGO (sem QR) mostra o código e a instrução do backend', async () => {
  // AutoSync pareia por código digitável, não por QR: o backend devolve
  // qr_data_url:null + code + detail (o comando a rodar na máquina do AJX).
  const BY_CODE = {
    state: 'awaiting_scan', qr_data_url: null, code: 'A1B2-C3D4-E5F6',
    expires_at: null,
    detail: 'na máquina do AJX, rode: autosync pair A1B2-C3D4-E5F6',
  };
  Connectors.pairingStart.mockResolvedValue(BY_CODE);
  Connectors.pairingPoll.mockResolvedValue(BY_CODE);
  render(<StationPairingDialog agentId="ag1" skillKey="connector.autosync" onClose={() => {}} />);
  await flush();

  expect(screen.getByTestId('connector-pair-code')).toHaveTextContent('A1B2-C3D4-E5F6');
  expect(screen.getByTestId('connector-pair-hint')).toHaveTextContent('autosync pair');
  // sem QR e sem a caixa vazia de "sem QR"
  expect(screen.queryByTestId('connector-pair-qr')).toBeNull();
  expect(screen.queryByTestId('connector-pair-noqr')).toBeNull();
  // a instrução de WhatsApp ("Abra o WhatsApp...") não faz sentido aqui
  expect(screen.queryByText('conectores.pair.scan')).toBeNull();
  // detail aqui é ajuda, não erro
  expect(screen.queryByTestId('connector-pair-error')).toBeNull();
});

it('CÓDIGO persiste após o poll (o poll GET não retorna o código — hash-at-rest)', async () => {
  // Regressão do bug que o dono viu: o POST emite o código, mas o poll (GET,
  // read-only) volta SEM código (só estado + prazo). Sem preservar, a cada 3s
  // o código sumia e o corpo caía no texto de leitura de QR do WhatsApp.
  jest.useFakeTimers();
  const ISSUED = {
    state: 'awaiting_scan', qr_data_url: null, code: 'A1B2-C3D4-E5F6',
    expires_at: '2099-01-01T00:00:00Z',
    detail: 'na máquina do AJX, rode: autosync pair A1B2-C3D4-E5F6',
  };
  // o que o backend REAL devolve no GET: sem código, sem QR, só estado.
  const POLLED = {
    state: 'awaiting_scan', qr_data_url: null, code: null,
    expires_at: '2099-01-01T00:00:00Z',
    detail: 'aguardando o AutoSync resgatar o código.',
  };
  Connectors.pairingStart.mockResolvedValue(ISSUED);   // POST emite
  Connectors.pairingPoll.mockResolvedValue(POLLED);    // GET não retorna código

  render(<StationPairingDialog agentId="ag1" skillKey="connector.autosync" onClose={() => {}} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(screen.getByTestId('connector-pair-code')).toHaveTextContent('A1B2-C3D4-E5F6');

  // 3s → poll (sem código): o código TEM que continuar na tela
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(Connectors.pairingPoll).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('connector-pair-code')).toHaveTextContent('A1B2-C3D4-E5F6');
  // e a instrução do comando também persiste (não cai no "aguardando" pelado)
  expect(screen.getByTestId('connector-pair-hint')).toHaveTextContent('autosync pair');
  // o texto de leitura de QR do WhatsApp NUNCA aparece p/ o modo código
  expect(screen.queryByText('conectores.pair.scan')).toBeNull();
  expect(screen.queryByTestId('connector-pair-qr')).toBeNull();
});

it('"Gerar novo código" chama pairingStart com { refresh: true }', async () => {
  Connectors.pairingStart.mockResolvedValue(AWAITING);
  Connectors.pairingPoll.mockResolvedValue(AWAITING);
  render(<StationPairingDialog agentId="ag1" skillKey="sk" onClose={() => {}} />);
  await flush();

  Connectors.pairingStart.mockClear();
  fireEvent.click(screen.getByTestId('connector-pair-refresh'));
  await flush();

  expect(Connectors.pairingStart).toHaveBeenCalledWith('ag1', 'sk', { refresh: true });
});
