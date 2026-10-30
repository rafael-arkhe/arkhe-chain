/**
 * Widget alert_list — lista de alertas do tenant (inbox unificado).
 *
 * Invariantes:
 *  - consome a API REAL do núcleo (Alerts.inbox.list) com a config
 *    {kinds, severities, status, limit} repassada como filtro;
 *  - severidade com cor sóbria + rótulo humano via i18n; kind com rótulo
 *    humano (nunca o type cru das famílias conhecidas);
 *  - ack inline confirma via confirmModal (NUNCA dialog nativo) e chama
 *    Alerts.inbox.ack; sem a perm security.alertas.resolve não há botão;
 *  - estados honestos: vazio e erro explícitos, nunca dado inventado;
 *  - declara mockConfig/mockVariables (regra da paleta) + label humano;
 *  - na paleta/editor renderiza dados de EXEMPLO (alertas_demo), sem fetch.
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: jest.fn(() => true) }));
jest.mock('@/lib/api', () => ({
  Alerts: {
    inbox: {
      list: jest.fn(),
      countPending: jest.fn(),
      ack: jest.fn(),
      trail: jest.fn(),
    },
  },
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(async () => true),
}));

import { Alerts } from '@/lib/api';
import { useCan } from '@/lib/auth/useAuth';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import {
  getWidgetComponent,
  getWidgetMeta,
} from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets/alert-list';

const mockInbox = Alerts.inbox as jest.Mocked<typeof Alerts.inbox>;
const mockCan = useCan as jest.Mock;
const mockConfirm = confirmModal as jest.Mock;

const ROWS = [
  {
    id: 'al-1',
    kind: 'geofence',
    fired_at: '2026-06-12T10:30:00Z',
    classification: 'U',
    status: 'pending',
    severity: 'critical',
    title: 'Cerca Escola XV violada',
    payload: { geofence_name: 'Escola XV', event: 'enter' },
    redacted: false,
    escalated: true,
  },
  {
    id: 'al-2',
    kind: 'search_feed',
    fired_at: '2026-06-12T09:00:00Z',
    classification: 'U',
    status: 'acknowledged',
    severity: 'low',
    title: 'Feed semanal: 3 novos',
    payload: {},
    redacted: false,
    ack_by: 'op-1',
    ack_at: '2026-06-12T09:10:00Z',
    ack_latency_s: 600,
    escalated: false,
  },
];

const TRAIL = [
  {
    id: 'ev-1',
    event_type: 'alert.emitted',
    actor: 'system',
    at: '2026-06-12T10:30:00Z',
    status: 'completed',
    channel: null,
    meta: {},
  },
  {
    id: 'ev-2',
    event_type: 'alert.acknowledged',
    actor: 'op-9',
    at: '2026-06-12T10:40:00Z',
    status: 'completed',
    channel: null,
    meta: {},
  },
  {
    id: 'ev-3',
    event_type: 'alert.escalated',
    actor: 'system.alerts.escalation',
    at: '2026-06-12T11:00:00Z',
    status: 'completed',
    channel: 'email-plantao',
    meta: { channel: 'email-plantao' },
  },
];

function renderWidget(opts: {
  config?: Record<string, unknown>;
  appId?: string;
  variables?: Record<string, unknown>;
} = {}) {
  const Comp = getWidgetComponent('alert_list')!;
  render(
    <Comp
      appId={opts.appId ?? 'page::alertas'}
      config={opts.config ?? {}}
      variables={opts.variables ?? {}}
      bindings={{}}
      setBinding={() => {}}
      emit={jest.fn()}
    />,
  );
}

describe('alert_list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockReturnValue(true);
    mockConfirm.mockResolvedValue(true);
    mockInbox.list.mockResolvedValue(ROWS as never);
    mockInbox.ack.mockResolvedValue({ ...ROWS[0], status: 'acknowledged' } as never);
    mockInbox.trail.mockResolvedValue(TRAIL as never);
  });

  it('registrado com label humano + mockConfig/mockVariables (regra da paleta)', () => {
    const meta = getWidgetMeta('alert_list')!;
    expect(meta).toBeTruthy();
    expect(meta.label).toBe('Lista de alertas');
    expect(meta.mockConfig).toBeTruthy();
    expect(meta.mockVariables).toBeTruthy();
    expect(meta.config_schema?.some((f) => f.name === 'kinds')).toBe(true);
    expect(meta.config_schema?.some((f) => f.name === 'limit')).toBe(true);
    // canais/severidades = dropdown populado, nunca input técnico manual
    const kindsField = meta.config_schema?.find((f) => f.name === 'kinds');
    expect(kindsField?.field).toBe('select');
    expect(kindsField?.options?.length).toBeGreaterThan(1);
  });

  it('tem entrada no widget-catalog.json (paridade backend ↔ frontend)', () => {
    const p = path.join(process.cwd(), 'lib', 'workshop', 'widget-catalog.json');
    const catalog = JSON.parse(fs.readFileSync(p, 'utf-8')) as { type: string }[];
    expect(catalog.some((e) => e.type === 'alert_list')).toBe(true);
  });

  it('lista alertas reais com severidade e kind humanos + respeita a config', async () => {
    renderWidget({
      config: { kinds: ['geofence', 'search_feed'], severities: 'critical', status: 'pending', limit: 10, mostrar_origem: true },
    });
    await screen.findByText('Cerca Escola XV violada');
    expect(mockInbox.list).toHaveBeenCalledWith({
      kinds: ['geofence', 'search_feed'],
      severities: ['critical'],
      status: 'pending',
      limit: 10,
    });
    // severidade humana via i18n (nunca token cru sozinho)
    expect(screen.getByText('alertas.severity.critical')).toBeInTheDocument();
    // origem (canal) humana
    expect(screen.getByText('alertas.canal.geofence')).toBeInTheDocument();
  });

  it('placa procurada (lpr_hotlist) renderiza com rótulo humano, nunca o type cru', async () => {
    mockInbox.list.mockResolvedValueOnce([
      {
        id: 'al-h',
        kind: 'lpr_hotlist',
        fired_at: '2026-06-15T12:00:00Z',
        classification: 'U',
        status: 'pending',
        severity: 'high',
        title: 'Placa procurada ABC1D23 lida em cam-7',
        payload: { plate: 'ABC1D23', camera: 'cam-7' },
        redacted: false,
      },
    ] as never);
    renderWidget({ config: { mostrar_origem: true } });
    await screen.findByText('Placa procurada ABC1D23 lida em cam-7');
    // rótulo humano via i18n — nunca 'lpr_hotlist' cru na UI
    expect(screen.getByText('alertas.canal.hotlist')).toBeInTheDocument();
    expect(screen.queryByText('lpr_hotlist')).not.toBeInTheDocument();
  });

  it('ack inline: confirmModal + Alerts.inbox.ack; some pra quem não pode', async () => {
    renderWidget();
    const btn = await screen.findByTestId('alert-ack-al-1');
    fireEvent.click(btn);
    await waitFor(() => expect(mockInbox.ack).toHaveBeenCalledWith('al-1'));
    expect(mockConfirm).toHaveBeenCalled();
    // alerta já reconhecido não tem botão
    expect(screen.queryByTestId('alert-ack-al-2')).not.toBeInTheDocument();
  });

  it('sem security.alertas.resolve não renderiza botão de ack', async () => {
    mockCan.mockReturnValue(false);
    renderWidget();
    await screen.findByText('Cerca Escola XV violada');
    expect(screen.queryByTestId('alert-ack-al-1')).not.toBeInTheDocument();
  });

  it('estados honestos: vazio e erro (sem dado inventado)', async () => {
    mockInbox.list.mockResolvedValueOnce([] as never);
    renderWidget();
    await screen.findByTestId('alert-list-empty');

    mockInbox.list.mockRejectedValueOnce(new Error('offline'));
    renderWidget();
    await screen.findByTestId('alert-list-error');
  });

  it('na paleta renderiza dados de exemplo (mockVariables) sem fetch', async () => {
    const meta = getWidgetMeta('alert_list')!;
    renderWidget({
      appId: 'palette-preview',
      config: meta.mockConfig!,
      variables: meta.mockVariables!,
    });
    // dados de exemplo visíveis, nenhuma chamada de rede
    await waitFor(() =>
      expect(screen.queryByTestId('alert-list-empty')).not.toBeInTheDocument(),
    );
    expect(mockInbox.list).not.toHaveBeenCalled();
  });

  // ── BACKLOG #6a (gestão/auditoria — ELO 2) ───────────────────────────────

  it('ATRIBUIÇÃO: alerta resolvido mostra "resolvido por {ack_by} em {ack_at}"', async () => {
    renderWidget();
    const attrib = await screen.findByTestId('alert-attribution-al-2');
    // rótulo humano via i18n + o ator e o horário do dict (nunca inventado)
    expect(attrib).toHaveTextContent('alertas.attribution.by');
    expect(attrib).toHaveTextContent('op-1');
    expect(attrib).toHaveTextContent('2026-06-12 09:10');
  });

  it('FILTRO de status: todos/pendentes/resolvidos/escalados (client-side)', async () => {
    renderWidget();
    await screen.findByText('Cerca Escola XV violada');
    // começa em "todos" → as duas linhas
    expect(screen.getByTestId('alert-row-al-1')).toBeInTheDocument();
    expect(screen.getByTestId('alert-row-al-2')).toBeInTheDocument();

    // resolvidos → só o acknowledged (al-2)
    fireEvent.click(screen.getByTestId('alert-filter-acknowledged'));
    expect(screen.queryByTestId('alert-row-al-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('alert-row-al-2')).toBeInTheDocument();

    // pendentes → só o pending (al-1)
    fireEvent.click(screen.getByTestId('alert-filter-pending'));
    expect(screen.getByTestId('alert-row-al-1')).toBeInTheDocument();
    expect(screen.queryByTestId('alert-row-al-2')).not.toBeInTheDocument();

    // escalados → só o que tem escalated=true (al-1)
    fireEvent.click(screen.getByTestId('alert-filter-escalated'));
    expect(screen.getByTestId('alert-row-al-1')).toBeInTheDocument();
    expect(screen.queryByTestId('alert-row-al-2')).not.toBeInTheDocument();
  });

  it('filtro sem resultado mostra estado honesto (sem dado inventado)', async () => {
    // só pendentes carregados; filtrar por resolvidos → vazio explícito
    mockInbox.list.mockResolvedValueOnce([ROWS[0]] as never);
    renderWidget();
    await screen.findByText('Cerca Escola XV violada');
    fireEvent.click(screen.getByTestId('alert-filter-acknowledged'));
    expect(screen.getByTestId('alert-list-filter-empty')).toBeInTheDocument();
  });

  it('TRILHA: clicar o alerta abre o drawer e renderiza a trilha (Alerts.inbox.trail)', async () => {
    renderWidget();
    fireEvent.click(await screen.findByTestId('alert-audit-al-1'));
    await waitFor(() => expect(mockInbox.trail).toHaveBeenCalledWith('al-1'));
    const drawer = await screen.findByTestId('alert-trail-drawer');

    // 3 eventos em ordem cronológica, cada um com seu testid
    expect(within(drawer).getByTestId('trail-event-ev-1')).toBeInTheDocument();
    expect(within(drawer).getByTestId('trail-event-ev-2')).toBeInTheDocument();
    expect(within(drawer).getByTestId('trail-event-ev-3')).toBeInTheDocument();
    // rótulo humano do gesto (nunca o token cru 'alert.emitted')
    expect(within(drawer).getByText('alertas.trail.emitted')).toBeInTheDocument();
    expect(within(drawer).queryByText('alert.emitted')).not.toBeInTheDocument();
    // ator + canal do gesto de escalonamento
    expect(within(drawer).getByText(/system\.alerts\.escalation/)).toBeInTheDocument();
    expect(within(drawer).getByText(/email-plantao/)).toBeInTheDocument();

    // fecha o drawer
    fireEvent.click(within(drawer).getByTestId('alert-trail-close'));
    expect(screen.queryByTestId('alert-trail-drawer')).not.toBeInTheDocument();
  });

  it('ficha do alerta no drawer expõe o MTTR por-alerta (ack_latency_s)', async () => {
    renderWidget();
    fireEvent.click(await screen.findByTestId('alert-open-al-2'));
    const drawer = await screen.findByTestId('alert-trail-drawer');
    const latency = within(drawer).getByTestId('alert-ack-latency');
    expect(latency).toHaveTextContent('10m 0s'); // 600s
  });

  it('drawer com trilha vazia → estado honesto (nunca inventa evento)', async () => {
    mockInbox.trail.mockResolvedValueOnce([] as never);
    renderWidget();
    fireEvent.click(await screen.findByTestId('alert-audit-al-1'));
    expect(await screen.findByTestId('alert-trail-empty')).toBeInTheDocument();
  });
});
