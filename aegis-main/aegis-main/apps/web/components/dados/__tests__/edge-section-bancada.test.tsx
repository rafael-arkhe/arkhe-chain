/**
 * Bancada de Aparelhos — o celular é um Dispositivo, não uma string.
 *
 * O celular que religa um número é um edge físico como a câmera. Antes ele
 * vivia como serial dentro do registro do número, e o operador NÃO tinha onde
 * ver se a bancada existia, quantos aparelhos o runner enxergava ou se algum
 * estava aguardando autorização — dependia de ler log de container.
 *
 * Prova: o card kind=android_bench rende o badge traduzido; o bloco de
 * aparelhos aparece pela PRESENÇA de nodes[].bench (inclusive VAZIO, porque
 * "bancada sem aparelho" é o diagnóstico); cada aparelho mostra modelo, serial
 * mono, estado TRADUZIDO (nunca o vocabulário cru do adb) e o número que ele
 * religa; aparelho visível sem vínculo é dito como tal; dispositivo sem
 * bancada não ganha o bloco.
 *
 * i18n REAL (useT fora do Provider resolve pt-BR do DICT).
 */
import * as React from 'react';
import { render, screen, act } from '@testing-library/react';

import { EdgeSection } from '@/components/dados/edge-section';

jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Edge: { nodes: jest.fn(), createPairingCode: jest.fn(), revoke: jest.fn() },
  Connectors: { pairingStart: jest.fn(), pairingPoll: jest.fn() },
}));

const { Edge } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
};

const RECENT = new Date().toISOString();

const NODES = {
  expected_version: '',
  nodes: [
    {
      edge_id: 'e-bench', name: 'Bancada de Aparelhos', kind: 'android_bench',
      status: 'online', version: '', last_seen_at: RECENT,
      update_available: false, cameras_ok: null, diagnostics_summary: null,
      pool: null,
      // a bancada é administrada pela MESMA estação de pool (ela é quem fala com
      // os runners) — é este alvo que faz o gesto existir na tela
      pairing: {
        agent_id: 'ag-pool', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_pool',
        capabilities: ['pairing', 'inventory', 'devices'],
      },
      bench: {
        total: 2, ready: 1, armed: 1,
        devices: [
          { serial: 'R58M30ABCDE', state: 'device', model: 'SM_A105M',
            runner: 'bancada-1', atende: '5515991044002' },
          // visível mas o operador ainda não tocou "permitir" no aparelho
          { serial: 'ZY223KKQWE', state: 'unauthorized', model: '',
            runner: 'bancada-1' },
        ],
      },
    },
    {
      // outro Dispositivo: sem bancada → nada de bloco de aparelhos
      edge_id: 'e-cam', name: 'Gateway Portaria', kind: 'camera_gateway',
      status: 'online', version: '1.0.0', last_seen_at: RECENT,
      update_available: false, cameras_ok: 4, diagnostics_summary: null,
      pool: null, bench: null,
    },
  ],
};

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Edge.nodes.mockResolvedValue(NODES);
});

it('badge do kind + bloco de aparelhos só onde há bancada', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-card-e-bench');
  expect(screen.getByTestId('edge-kind-e-bench'))
    .toHaveTextContent('Bancada de aparelhos');
  expect(screen.getByTestId('edge-bench-e-bench')).toBeInTheDocument();
  expect(screen.queryByTestId('edge-bench-e-cam')).toBeNull();
});

it('cada aparelho: modelo, serial mono e estado TRADUZIDO', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  const pronto = screen.getByTestId('edge-bench-dev-e-bench-R58M30ABCDE');
  expect(pronto).toHaveTextContent('SM_A105M');
  expect(pronto).toHaveTextContent('R58M30ABCDE');
  expect(screen.getByTestId('edge-bench-state-e-bench-R58M30ABCDE'))
    .toHaveTextContent('Pronto');
  // aguardando o toque de "permitir" na tela do celular — dito por extenso,
  // porque é AÇÃO do operador, não um código pra ele decifrar
  expect(screen.getByTestId('edge-bench-state-e-bench-ZY223KKQWE'))
    .toHaveTextContent('Aguardando autorizacao no aparelho');
  // vocabulário cru do adb jamais aparece
  const bloco = screen.getByTestId('edge-bench-e-bench').textContent ?? '';
  expect(bloco).not.toMatch(/unauthorized|"device"/);
});

it('resumo de prontidão e o número que cada aparelho religa', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  expect(screen.getByTestId('edge-bench-summary-e-bench'))
    .toHaveTextContent('1 de 2 prontos');
  // Com permissão, o vínculo é CLICÁVEL: é aqui que o operador lê "sem número
  // atribuído", e o gesto de resolver isso tem de estar na mesma linha.
  expect(screen.getByTestId('edge-bench-atribuir-e-bench-R58M30ABCDE'))
    .toHaveTextContent('religa 5515991044002');
  expect(screen.getByTestId('edge-bench-atribuir-e-bench-ZY223KKQWE'))
    .toHaveTextContent('sem numero atribuido');
});

it('bancada VAZIA rende o bloco e diz o que fazer', async () => {
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      bench: { total: 0, ready: 0, armed: 0, devices: [] },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  // "bancada sem aparelho" é diagnóstico, não ausência de dado: o bloco fica
  expect(screen.getByTestId('edge-bench-summary-e-bench'))
    .toHaveTextContent('0 de 0 prontos');
  expect(screen.getByTestId('edge-bench-empty-e-bench').textContent)
    .toMatch(/Nenhum aparelho detectado/);
  await flush();
});


it('o gesto de conectar aparelho EXISTE e é gated pela capability', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  // o furo que este bloco fecha: antes, conectar um celular era editar env da
  // ilha e re-deployar — o operador abria a tela e não tinha o que clicar.
  expect(screen.getByTestId('edge-bench-connect-e-bench')).toBeInTheDocument();
  expect(screen.getByTestId('edge-bench-pin-set-e-bench-R58M30ABCDE')).toBeInTheDocument();
  expect(screen.getByTestId('edge-bench-forget-e-bench-R58M30ABCDE')).toBeInTheDocument();
});

it('conector SEM a capability devices não ganha o gesto', async () => {
  // A tela nunca oferece um botão que o backend recusaria: gate por capability
  // DECLARADA, nunca por kind ou skill_key chumbada.
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      pairing: {
        agent_id: 'ag-pool', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_pool',
        capabilities: ['pairing'],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  expect(screen.queryByTestId('edge-bench-connect-e-bench')).toBeNull();
  expect(screen.queryByTestId('edge-bench-forget-e-bench-R58M30ABCDE')).toBeNull();
  // sem `inventory` o vínculo vira texto: a tela nunca oferece um botão que o
  // backend recusaria
  expect(screen.queryByTestId('edge-bench-atribuir-e-bench-R58M30ABCDE')).toBeNull();
  expect(screen.getByTestId('edge-bench-serves-e-bench-R58M30ABCDE'))
    .toHaveTextContent('religa 5515991044002');
});

it('aparelho declarado e AUSENTE do adb mostra o estágio e o motivo', async () => {
  // É o caso em que o operador precisa agir. Sem o estágio, este aparelho seria
  // um serial mudo na lista — ou pior, não apareceria.
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      bench: {
        total: 1, ready: 0, armed: 0,
        devices: [{
          serial: '10.0.0.9:5555', declared: true, adoption: 'failed',
          has_pin: false,
          detail: 'o aparelho recusou o código (ele expira em segundos)',
        }],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  expect(screen.getByTestId('edge-bench-state-e-bench-10.0.0.9:5555'))
    .toHaveTextContent('Nao consegui conectar');
  expect(screen.getByTestId('edge-bench-detail-e-bench-10.0.0.9:5555').textContent)
    .toMatch(/expira em segundos/);
  await flush();
});

it('aparelho com dois aplicativos e nenhum escolhido AVISA', async () => {
  // O celular do dono tem WhatsApp e WhatsApp Business. Sem escolher, a
  // automação abre o errado e cai na tela de cadastro: falha silenciosa, e o
  // número simplesmente não volta.
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      bench: {
        total: 1, ready: 1, armed: 0,
        devices: [{
          serial: '192.168.1.64', state: 'device', model: 'SM_A115M',
          apps: ['com.whatsapp', 'com.whatsapp.w4b'],
        }],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  expect(screen.getByTestId('edge-bench-app-falta-e-bench-192.168.1.64'))
    .toHaveTextContent('falta escolher o aplicativo');
});

it('aplicativo escolhido aparece com o nome que o operador conhece', async () => {
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      bench: {
        total: 1, ready: 1, armed: 0,
        devices: [{
          serial: '192.168.1.64', state: 'device',
          app: 'com.whatsapp.w4b', apps: ['com.whatsapp', 'com.whatsapp.w4b'],
        }],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  const chip = screen.getByTestId('edge-bench-app-e-bench-192.168.1.64');
  expect(chip).toHaveTextContent('WhatsApp Business');
  // nome de pacote é vocabulário de máquina: jamais na tela
  expect(chip.textContent).not.toMatch(/com\.whatsapp/);
  await flush();
});

it('aparelho FORA do carregador é avisado antes de a automação parar', async () => {
  // Foi o que derrubou o aparelho do dono no teste real: a tela apagou, o
  // Android entrou em sono profundo, o Wi-Fi caiu e o adb morreu junto. Nada
  // estava "quebrado" — e por isso o aviso tem de vir antes.
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      bench: {
        total: 1, ready: 1, armed: 0,
        devices: [{ serial: '192.168.1.64', state: 'device', charging: false }],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  expect(screen.getByTestId('edge-bench-energia-e-bench-192.168.1.64'))
    .toHaveTextContent('fora do carregador');
});

it('aparelho no carregador NÃO vira ruído na tela', async () => {
  // "Está tudo bem" não precisa de selo: aviso que aparece sempre deixa de ser
  // aviso. E ausência de informação (telemetria ainda não chegou) também não
  // pode virar alarme.
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      bench: {
        total: 2, ready: 2, armed: 0,
        devices: [
          { serial: '192.168.1.64', state: 'device', charging: true },
          { serial: '192.168.1.65', state: 'device' },
        ],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  expect(screen.queryByTestId('edge-bench-energia-e-bench-192.168.1.64')).toBeNull();
  expect(screen.queryByTestId('edge-bench-energia-e-bench-192.168.1.65')).toBeNull();
  await flush();
});

it('aparelho declarado que SUMIU diz o que aconteceu e o que fazer', async () => {
  // Medido no aparelho do dono: depois de um reboot o celular volta na rede e
  // nenhuma porta de depuração responde — o Android desliga a Depuração sem fio
  // a cada reinício, por projeto. Dizer "Declarado" aqui seria verdade inútil.
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      ...NODES.nodes[0],
      bench: {
        total: 1, ready: 0, armed: 1,
        devices: [{
          serial: '192.168.1.64', addr: '192.168.1.64:35215',
          declared: true, adoption: 'ready', has_pin: true,
          atende: '5515991244858',
        }],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-bench-e-bench');
  expect(screen.getByTestId('edge-bench-state-e-bench-192.168.1.64'))
    .toHaveTextContent('Sem contato');
  // a instrução fica NA LINHA: operador não passa o mouse procurando ajuda
  const aviso = screen.getByTestId('edge-bench-ausente-e-bench-192.168.1.64');
  expect(aviso.textContent).toMatch(/reiniciou/i);
  expect(aviso.textContent).toMatch(/CABO/);
  await flush();
});
