/**
 * Inventário de números editável pelo PAINEL (capability genérica `inventory`).
 *
 * Prova: os botões só existem quando a skill DECLARA a capability (nunca por
 * tipo de dispositivo); cadastrar manda o msisdn só em dígitos; editar trava o
 * identificador (é a chave do número na estação e no mapa de aparelhos da
 * automação); remover passa pelo confirmModal e cancelar não chama nada; e a
 * frase de erro do driver chega inteira à tela — trocá-la por "falhou" jogaria
 * fora a única informação acionável.
 *
 * i18n REAL (useT fora do Provider resolve pt-BR do DICT).
 */
import * as React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

import { EdgeSection } from '@/components/dados/edge-section';

jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/components/ui/modal-backdrop', () => ({
  __esModule: true,
  ModalPortal: (props: { children?: React.ReactNode }) => props.children,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({ confirmModal: jest.fn() }));
jest.mock('@/lib/api', () => ({
  Edge: { nodes: jest.fn(), createPairingCode: jest.fn(), revoke: jest.fn() },
  Connectors: {
    pairingStart: jest.fn(), pairingPoll: jest.fn(), inventoryApply: jest.fn(),
  },
}));

const { Edge, Connectors } = jest.requireMock('@/lib/api') as {
  Edge: Record<string, jest.Mock>;
  Connectors: Record<string, jest.Mock>;
};
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog') as {
  confirmModal: jest.Mock;
};

const RECENT = new Date().toISOString();
const NUMEROS = [
  { id: 'tit', msisdn: '5515991044002', role: 'titular', owner: 'cliente',
    state: 'paired', sendable: true, needs_gesture: false, sent: 42 },
  { id: 'v1', msisdn: '5515999990001', role: 'vazao', owner: 'vendor',
    state: 'needs_relink', sendable: false, needs_gesture: true, sent: 7 },
];

function nodes(capabilities: string[] | undefined) {
  return {
    expected_version: '',
    nodes: [{
      edge_id: 'e-pool', name: 'Estação Hotel', kind: 'whatsapp_pool',
      status: 'online', version: '0.3.0', last_seen_at: RECENT,
      update_available: false, cameras_ok: null,
      pairing: {
        agent_id: 'ag-pool', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_pool',
        ...(capabilities ? { capabilities } : {}),
      },
      diagnostics_summary: null,
      pool: { health: { total: 2, sendable: 1 }, numbers: NUMEROS },
    }],
  };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Edge.nodes.mockResolvedValue(nodes(['pairing', 'inventory']));
  Connectors.inventoryApply.mockResolvedValue({ ok: true, detail: '', item: null });
});

it('sem a capability declarada, nenhum gesto de inventário aparece', async () => {
  // A tela gateia por CAPABILITY, nunca por tipo de dispositivo — senão
  // "cadastrar número" viraria conhecimento de vertical dentro da UI.
  Edge.nodes.mockResolvedValue(nodes(['pairing']));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.queryByTestId('edge-pool-add-e-pool')).toBeNull();
  expect(screen.queryByTestId('edge-pool-edit-e-pool-tit')).toBeNull();
  expect(screen.queryByTestId('edge-pool-remove-e-pool-tit')).toBeNull();
  // e o pareamento, que a skill declara, continua onde estava
  expect(screen.getByTestId('edge-pool-pair-e-pool-v1')).toBeInTheDocument();
});

it('cadastrar número manda só os dígitos do que o operador digitou', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');

  fireEvent.click(screen.getByTestId('edge-pool-add-e-pool'));
  await flush();
  expect(screen.getByTestId('number-form-modal')).toBeInTheDocument();

  fireEvent.change(screen.getByTestId('number-form-id'), { target: { value: 'v2' } });
  fireEvent.change(screen.getByTestId('number-form-msisdn'),
    { target: { value: '+55 15 99999-0002' } });
  fireEvent.change(screen.getByTestId('number-form-role'), { target: { value: 'titular' } });
  fireEvent.click(screen.getByTestId('number-form-save'));
  await flush();

  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'add',
    { id: 'v2', msisdn: '5515999990002', role: 'titular', owner: 'vendor' },
  );
});

it('identificador fora do vocabulário bloqueia o salvar', async () => {
  // O id viaja em URL e em nome de instância do gateway: espaço e acento
  // viram bug silencioso lá na frente.
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  fireEvent.click(screen.getByTestId('edge-pool-add-e-pool'));
  await flush();

  fireEvent.change(screen.getByTestId('number-form-id'), { target: { value: 'Número 2' } });
  fireEvent.change(screen.getByTestId('number-form-msisdn'),
    { target: { value: '5515999990002' } });
  expect(screen.getByTestId('number-form-id-invalid')).toBeInTheDocument();
  expect(screen.getByTestId('number-form-save')).toBeDisabled();
});

it('editar abre preenchido e NÃO deixa trocar o identificador', async () => {
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');

  fireEvent.click(screen.getByTestId('edge-pool-edit-e-pool-tit'));
  await flush();

  expect(screen.getByTestId('number-form-id')).toHaveValue('tit');
  // o identificador é a chave do número na estação e no mapa de aparelhos:
  // trocá-lo órfãos os dois lados
  expect(screen.getByTestId('number-form-id')).toBeDisabled();
  expect(screen.getByTestId('number-form-msisdn')).toHaveValue('5515991044002');
  expect(screen.getByTestId('number-form-role')).toHaveValue('titular');

  fireEvent.change(screen.getByTestId('number-form-role'), { target: { value: 'vazao' } });
  fireEvent.click(screen.getByTestId('number-form-save'));
  await flush();

  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'update',
    // device_serial vai SEMPRE na edição, inclusive vazio: é assim que o
    // backend distingue "não mexi" de "desliguei a automação".
    { id: 'tit', msisdn: '5515991044002', role: 'vazao', owner: 'cliente',
      device_serial: '' },
  );
});

it('a frase do driver chega inteira à tela', async () => {
  // "já existe número com este identificador" é o diagnóstico; trocá-lo por
  // "falhou" deixaria o operador adivinhando.
  Connectors.inventoryApply.mockResolvedValue({
    ok: false, detail: 'já existe número com este identificador', item: null,
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  fireEvent.click(screen.getByTestId('edge-pool-add-e-pool'));
  await flush();
  fireEvent.change(screen.getByTestId('number-form-id'), { target: { value: 'tit' } });
  fireEvent.change(screen.getByTestId('number-form-msisdn'),
    { target: { value: '5515991044002' } });
  fireEvent.click(screen.getByTestId('number-form-save'));
  await flush();

  expect(screen.getByTestId('number-form-error'))
    .toHaveTextContent('já existe número com este identificador');
  // e o diálogo NÃO fecha: fechar em cima do erro esconderia o motivo
  expect(screen.getByTestId('number-form-modal')).toBeInTheDocument();
});

it('remover confirma antes, e cancelar não toca em nada', async () => {
  confirmModal.mockResolvedValue(false);
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');

  fireEvent.click(screen.getByTestId('edge-pool-remove-e-pool-v1'));
  await flush();
  expect(confirmModal).toHaveBeenCalled();
  expect(Connectors.inventoryApply).not.toHaveBeenCalled();

  confirmModal.mockResolvedValue(true);
  fireEvent.click(screen.getByTestId('edge-pool-remove-e-pool-v1'));
  await waitFor(() => expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'remove', { id: 'v1' },
  ));
});

it('botões de linha têm nome acessível DISTINTO por número', async () => {
  // N botões "Editar"/"Remover" no mesmo card seriam indistinguíveis para
  // leitor de tela e controle por voz.
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.getByTestId('edge-pool-edit-e-pool-tit'))
    .toHaveAttribute('aria-label', 'Editar 5515991044002');
  expect(screen.getByTestId('edge-pool-remove-e-pool-v1'))
    .toHaveAttribute('aria-label', 'Remover 5515999990001');
});

it('chip pareado diferente do cadastrado aparece em vermelho na linha', async () => {
  // Era o silêncio que deixou parear com o número errado sem ninguém notar.
  Edge.nodes.mockResolvedValue({
    expected_version: '',
    nodes: [{
      edge_id: 'e-pool', name: 'Estação', kind: 'whatsapp_pool', status: 'online',
      version: '', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: {
        agent_id: 'ag-pool', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_pool', capabilities: ['pairing', 'inventory'],
      },
      diagnostics_summary: null,
      pool: {
        health: { total: 1, sendable: 1 },
        numbers: [{
          id: 'tit', msisdn: '5515991044002', role: 'titular', state: 'paired',
          sendable: true, needs_gesture: false, sent: 0,
          connected_msisdn: '5515996770539', msisdn_mismatch: true,
        }],
      },
    }],
  });
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  const aviso = screen.getByTestId('edge-pool-mismatch-e-pool-tit');
  expect(aviso).toHaveTextContent('5515996770539');
  expect(aviso.className).toMatch(/text-danger/);
});

it('sem divergência, nada de aviso na linha', async () => {
  Edge.nodes.mockResolvedValue(nodes(['pairing', 'inventory']));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  expect(screen.queryByTestId('edge-pool-mismatch-e-pool-tit')).toBeNull();
});



// ── aparelho: ESCOLHER de uma lista, não digitar um serial ──────────────────
//
// Serial de adb é opaco, longo e sem validação possível. Digitado à mão erra, e
// o erro só apareceria quando o número caísse e ninguém religasse.

function nodesComAparelhos(seen: unknown[], numero: Record<string, unknown>) {
  return {
    expected_version: '',
    nodes: [{
      edge_id: 'e-pool', name: 'Estação', kind: 'whatsapp_pool', status: 'online',
      version: '', last_seen_at: RECENT, update_available: false, cameras_ok: null,
      pairing: {
        agent_id: 'ag-pool', slug: 'estacao-whatsapp',
        skill_key: 'connector.whatsapp_pool', capabilities: ['pairing', 'inventory'],
      },
      diagnostics_summary: null,
      pool: { health: { total: 1, sendable: 1 }, devices_seen: seen, numbers: [numero] },
    }],
  };
}

it('o aparelho é ESCOLHIDO na lista do que o adb enxerga', async () => {
  Edge.nodes.mockResolvedValue(nodesComAparelhos(
    [{ serial: 'R58M1234567', state: 'device', model: 'SM_A105M' }],
    { id: 'tit', msisdn: '5515991044002', role: 'titular', owner: 'cliente',
      state: 'paired', sendable: true, needs_gesture: false },
  ));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  fireEvent.click(screen.getByTestId('edge-pool-edit-e-pool-tit'));
  await flush();

  const sel = screen.getByTestId('number-form-device');
  expect(sel.tagName).toBe('SELECT');
  expect(sel).toHaveTextContent('R58M1234567');
  expect(sel).toHaveTextContent('SM_A105M');

  fireEvent.change(sel, { target: { value: 'R58M1234567' } });
  fireEvent.click(screen.getByTestId('number-form-save'));
  await flush();

  expect(Connectors.inventoryApply).toHaveBeenCalledWith(
    'ag-pool', 'connector.whatsapp_pool', 'update',
    expect.objectContaining({ id: 'tit', device_serial: 'R58M1234567' }),
  );
});

it('aparelho sem autorização aparece com o motivo, e não pode ser escolhido', async () => {
  // "unauthorized" é celular plugado esperando um toque no próprio aparelho.
  // Omiti-lo faria o operador achar que o cabo não funcionou.
  Edge.nodes.mockResolvedValue(nodesComAparelhos(
    [{ serial: 'R58M1234567', state: 'unauthorized', model: 'SM_A105M' }],
    { id: 'tit', msisdn: '5515991044002', role: 'titular', state: 'paired' },
  ));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  fireEvent.click(screen.getByTestId('edge-pool-edit-e-pool-tit'));
  await flush();

  const sel = screen.getByTestId('number-form-device');
  expect(sel).toHaveTextContent('autorize a depuração no aparelho');
  const opt = Array.from(sel.querySelectorAll('option'))
    .find((o) => (o as HTMLOptionElement).value === 'R58M1234567');
  expect(opt).toBeDisabled();
});

it('sem nenhum aparelho detectado, a tela DIZ o que falta', async () => {
  // Cair para campo de texto aqui seria pedir um serial que ninguém sabe.
  Edge.nodes.mockResolvedValue(nodesComAparelhos(
    [],
    { id: 'tit', msisdn: '5515991044002', role: 'titular', state: 'paired' },
  ));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  fireEvent.click(screen.getByTestId('edge-pool-edit-e-pool-tit'));
  await flush();

  expect(screen.getByTestId('number-form-device-empty'))
    .toHaveTextContent('Conecte o celular');
  expect(screen.queryByTestId('number-form-device')).toBeNull();
});

it('aparelho já declarado que o adb não vê continua na lista', async () => {
  // Sumir com ele faria o salvar APAGAR a automação em silêncio.
  Edge.nodes.mockResolvedValue(nodesComAparelhos(
    [{ serial: 'OUTRO123', state: 'device' }],
    { id: 'tit', msisdn: '5515991044002', role: 'titular', state: 'paired',
      device_serial: 'R58M1234567' },
  ));
  render(<EdgeSection />);
  await screen.findByTestId('edge-pool-e-pool');
  fireEvent.click(screen.getByTestId('edge-pool-edit-e-pool-tit'));
  await flush();

  const sel = screen.getByTestId('number-form-device') as HTMLSelectElement;
  expect(sel.value).toBe('R58M1234567');
  expect(sel).toHaveTextContent('não está sendo visto agora');
});
