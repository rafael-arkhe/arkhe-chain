/**
 * /painel-de-controle/alertas — Rotas de notificação (config de alertas).
 *
 * Cobre: tabela com rótulos humanos (kinds + severidade mínima + canal);
 * criar via painel lateral com DROPDOWNS populados (kinds do catálogo,
 * severidades, canais de GET /alerts/channels com aviso honesto p/ canal
 * sem config do tenant); silenciar = promptModal de duração → confirmModal;
 * desativar = confirmModal → PATCH active:false; estados vazio/erro
 * honestos; gate de gestão por alerts.routes.manage.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { AlertRoutesWorkspace } from '@/components/control-panel/alert-routes-workspace';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ actions }: any) => <div>{actions}</div>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
  promptModal: jest.fn(),
}));
const mockCan = jest.fn((_perm: string) => true);
jest.mock('@/lib/auth/useAuth', () => ({ useCan: (p: string) => mockCan(p) }));
jest.mock('@/lib/api', () => ({
  AlertRoutes: {
    list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(),
    silence: jest.fn(), channels: jest.fn(), kinds: jest.fn(),
    putChannel: jest.fn(), removeChannel: jest.fn(),
  },
}));

const { AlertRoutes } = jest.requireMock('@/lib/api') as {
  AlertRoutes: Record<string, jest.Mock>;
};
const { confirmModal, promptModal } = jest.requireMock(
  '@/components/dialog/confirm-dialog',
) as { confirmModal: jest.Mock; promptModal: jest.Mock };

const ROUTE = {
  id: 'r1',
  name: 'Plantão crítico',
  match: { kinds: ['geofence'], min_severity: 'high' },
  channel: 'whatsapp',
  channel_config_ref: null,
  silence_until: null,
  escalation: null,
  active: true,
};

const CHANNELS = [
  { channel: 'log', configured: false, requires_config: false, config_refs: [] },
  { channel: 'webhook', configured: false, requires_config: true, config_refs: [] },
  { channel: 'discord', configured: false, requires_config: true, config_refs: [] },
  {
    channel: 'whatsapp', configured: true, requires_config: true,
    config_refs: ['zap-plantao'],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCan.mockReturnValue(true);
  AlertRoutes.list.mockResolvedValue([ROUTE]);
  AlertRoutes.channels.mockResolvedValue(CHANNELS);
  AlertRoutes.kinds.mockResolvedValue([
    'geofence', 'object_watch', 'search_feed', 'share',
  ]);
  AlertRoutes.create.mockResolvedValue({ ...ROUTE, id: 'r2' });
  AlertRoutes.update.mockResolvedValue({ ...ROUTE, active: false });
  AlertRoutes.silence.mockResolvedValue({
    ...ROUTE, silence_until: '2026-06-12T23:00:00+00:00',
  });
  AlertRoutes.putChannel.mockResolvedValue({
    ref: 'discord', channel: 'discord', config: { url: '…cdef' },
  });
  confirmModal.mockResolvedValue(true);
  promptModal.mockResolvedValue('45');
});

async function renderLoaded() {
  render(<AlertRoutesWorkspace />);
  await waitFor(() => expect(AlertRoutes.list).toHaveBeenCalled());
  await screen.findByText('Plantão crítico');
}

test('tabela mostra rótulos humanos: kind, severidade mínima e canal', async () => {
  await renderLoaded();
  expect(screen.getByText('alertasRotas.kind.geofence')).toBeInTheDocument();
  expect(screen.getByText(/alertasRotas\.sev\.high/)).toBeInTheDocument();
  expect(screen.getByText('alertasRotas.channel.whatsapp')).toBeInTheDocument();
});

test('estado vazio honesto + CTA de criação', async () => {
  AlertRoutes.list.mockResolvedValue([]);
  render(<AlertRoutesWorkspace />);
  await screen.findByText('alertasRotas.empty');
});

test('estado de erro honesto com retry que refaz o fetch', async () => {
  AlertRoutes.list.mockRejectedValueOnce(new Error('offline'));
  render(<AlertRoutesWorkspace />);
  await screen.findByText('alertasRotas.error');
  AlertRoutes.list.mockResolvedValue([ROUTE]);
  fireEvent.click(screen.getByText('common.retry'));
  await screen.findByText('Plantão crítico');
});

test('criar: dropdowns populados e POST com match estruturado', async () => {
  await renderLoaded();
  fireEvent.click(screen.getByText('alertasRotas.new'));

  // Canais populados do GET /alerts/channels — nunca input técnico livre.
  const channelSelect = await screen.findByTestId('route-channel');
  const options = Array.from(
    (channelSelect as HTMLSelectElement).options,
  ).map((o) => o.value);
  expect(options).toEqual(expect.arrayContaining(['log', 'webhook', 'whatsapp']));

  // Kinds do catálogo viram checkboxes com rótulo humano.
  expect(screen.getByTestId('route-kind-object_watch')).toBeInTheDocument();

  fireEvent.change(screen.getByTestId('route-name'), {
    target: { value: 'Rota nova' },
  });
  fireEvent.click(screen.getByTestId('route-kind-geofence'));
  fireEvent.change(screen.getByTestId('route-severity'), {
    target: { value: 'high' },
  });
  fireEvent.change(channelSelect, { target: { value: 'whatsapp' } });
  fireEvent.click(screen.getByTestId('route-submit'));

  await waitFor(() =>
    expect(AlertRoutes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Rota nova',
        channel: 'whatsapp',
        match: { kinds: ['geofence'], min_severity: 'high' },
      }),
    ),
  );
});

test('canal sem config do tenant mostra aviso honesto', async () => {
  await renderLoaded();
  fireEvent.click(screen.getByText('alertasRotas.new'));
  const channelSelect = await screen.findByTestId('route-channel');
  fireEvent.change(channelSelect, { target: { value: 'webhook' } });
  expect(await screen.findByText('alertasRotas.channel_warning')).toBeInTheDocument();
  // log funciona sem config — aviso some.
  fireEvent.change(channelSelect, { target: { value: 'log' } });
  await waitFor(() =>
    expect(screen.queryByText('alertasRotas.channel_warning')).toBeNull(),
  );
});

test('silenciar: promptModal de duração → confirmModal → POST silence', async () => {
  await renderLoaded();
  fireEvent.click(screen.getByTestId('route-silence-r1'));
  await waitFor(() => expect(promptModal).toHaveBeenCalled());
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  await waitFor(() =>
    expect(AlertRoutes.silence).toHaveBeenCalledWith('r1', 45),
  );
});

test('silenciar cancelado no prompt não chama a API', async () => {
  promptModal.mockResolvedValue(null);
  await renderLoaded();
  fireEvent.click(screen.getByTestId('route-silence-r1'));
  await waitFor(() => expect(promptModal).toHaveBeenCalled());
  expect(AlertRoutes.silence).not.toHaveBeenCalled();
});

test('desativar: confirmModal → PATCH active:false', async () => {
  await renderLoaded();
  fireEvent.click(screen.getByTestId('route-toggle-r1'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  await waitFor(() =>
    expect(AlertRoutes.update).toHaveBeenCalledWith('r1', { active: false }),
  );
});

test('sem alerts.routes.manage: leitura sem gestos de gestão', async () => {
  mockCan.mockImplementation((p: string) => p !== 'alerts.routes.manage');
  await renderLoaded();
  expect(screen.queryByText('alertasRotas.new')).toBeNull();
  expect(screen.queryByTestId('route-silence-r1')).toBeNull();
  expect(screen.queryByTestId('route-toggle-r1')).toBeNull();
});



// ── Configurar o canal pela tela ─────────────────────────────────────────────
// O aviso "este canal não tem configuração" existia desde sempre e deixava o
// operador sem saída: apontar o webhook exigia editar o JSONB do tenant no
// banco. Estes testes seguram o gesto que fechou esse buraco.

async function abrirFormularioComCanal(canal: string) {
  await renderLoaded();
  fireEvent.click(screen.getByText('alertasRotas.new'));
  const select = await screen.findByTestId('route-channel');
  fireEvent.change(select, { target: { value: canal } });
  return select;
}

test('canal que precisa de config oferece o gesto de configurar', async () => {
  await abrirFormularioComCanal('discord');
  expect(await screen.findByTestId('channel-cfg-toggle')).toBeInTheDocument();
  // o aviso honesto continua lá — ele diz POR QUE o botão importa
  expect(screen.getByText('alertasRotas.channel_warning')).toBeInTheDocument();
});

test('canal sem config necessária não mostra o formulário', async () => {
  await abrirFormularioComCanal('log');
  expect(screen.queryByTestId('channel-cfg-toggle')).toBeNull();
});

test('salvar aponta o canal e relê a lista do backend', async () => {
  await abrirFormularioComCanal('discord');
  fireEvent.click(screen.getByTestId('channel-cfg-toggle'));
  fireEvent.change(await screen.findByTestId('channel-cfg-url'), {
    target: { value: 'https://discord.com/api/webhooks/1/abcdef' },
  });
  const antes = AlertRoutes.channels.mock.calls.length;
  fireEvent.click(screen.getByTestId('channel-cfg-save'));

  await waitFor(() =>
    expect(AlertRoutes.putChannel).toHaveBeenCalledWith('discord', {
      channel: 'discord',
      url: 'https://discord.com/api/webhooks/1/abcdef',
    }),
  );
  // quem diz se ficou configurado é o backend, não a tela: relê depois do save
  await waitFor(() =>
    expect(AlertRoutes.channels.mock.calls.length).toBeGreaterThan(antes),
  );
  await screen.findByText('alertasRotas.channel_cfg.saved');
});

test('endereço vazio não dispara gesto', async () => {
  await abrirFormularioComCanal('discord');
  fireEvent.click(screen.getByTestId('channel-cfg-toggle'));
  fireEvent.click(await screen.findByTestId('channel-cfg-save'));
  expect(AlertRoutes.putChannel).not.toHaveBeenCalled();
});

test('trocar de canal limpa o que foi digitado (credencial não vaza de um canal p/ outro)', async () => {
  const select = await abrirFormularioComCanal('discord');
  fireEvent.click(screen.getByTestId('channel-cfg-toggle'));
  fireEvent.change(await screen.findByTestId('channel-cfg-url'), {
    target: { value: 'https://discord.com/api/webhooks/1/segredo' },
  });
  fireEvent.change(select, { target: { value: 'webhook' } });
  fireEvent.click(await screen.findByTestId('channel-cfg-toggle'));
  expect((await screen.findByTestId('channel-cfg-url')).getAttribute('value') ?? '')
    .not.toContain('segredo');
});

test('sem alerts.routes.manage não aparece o gesto de configurar canal', async () => {
  mockCan.mockImplementation((p: string) => p !== 'alerts.routes.manage');
  await renderLoaded();
  expect(screen.queryByTestId('channel-cfg-toggle')).toBeNull();
});
