/**
 * Widget connector_status (4A — status/gestão de conectores dentro de apps).
 *
 * Invariantes:
 *  - lê um ObjectSet de nós 'conector' (espelho WP-E: rows ou array cru) e
 *    mostra nome, skill humanizada, status, última execução (quando + desfecho),
 *    contadores e erro recente;
 *  - "Rodar agora" resolve o agente pelo slug (Connectors.list) e chama
 *    Connectors.run(agentId, skill) — MESMO trilho governance/agents da central
 *    — e emite value_change;
 *  - Pausar/Retomar confirma via confirmModal (NUNCA dialog nativo) e chama
 *    Connectors.update(agentId, {status});
 *  - sem connectors.manage → NENHUM botão de gestão nem link da central
 *    (e nenhuma chamada à API de agentes);
 *  - declara mockConfig/mockVariables (regra da paleta) + entrada no catálogo.
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/auth/useAuth', () => ({ useCan: jest.fn(() => true) }));
jest.mock('@/lib/api', () => ({
  Connectors: { list: jest.fn(), run: jest.fn(), update: jest.fn() },
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(async () => true),
}));

import { Connectors } from '@/lib/api';
import { useCan } from '@/lib/auth/useAuth';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import {
  getWidgetComponent,
  getWidgetMeta,
} from '@/components/workshop/WorkshopV2Renderer';
import { WIDGET_EMITS } from '@/lib/workshop/widget-emits';
import '@/components/workshop/widgets/connector-status';

const mockApi = Connectors as jest.Mocked<typeof Connectors>;
const mockCan = useCan as jest.Mock;
const mockConfirm = confirmModal as jest.Mock;

// Rows no shape canônico do /evaluate (ObjectSet de nós 'conector').
const ROWS = [
  {
    id: 'n1',
    name: 'Fonte de cadastros',
    node_type: 'conector',
    properties: {
      agent_slug: 'fonte-cadastros',
      skill: 'connector.http',
      status: 'active',
      last_run_at: '2026-06-10T08:30:00Z',
      last_run_status: 'succeeded',
      runs_total: 128,
      runs_failed: 2,
    },
  },
  {
    id: 'n2',
    name: 'Fonte de leituras',
    node_type: 'conector',
    properties: {
      agent_slug: 'fonte-leituras',
      skill: 'connector.http',
      status: 'inactive',
      last_run_at: '2026-06-09T22:10:00Z',
      last_run_status: 'failed',
      last_run_output: { error: 'HTTP 500 da fonte' },
      runs_total: 40,
      runs_failed: 5,
    },
  },
];

const AGENTS = [
  { id: 'a1', slug: 'fonte-cadastros', display_name: 'Fonte de cadastros', kind: 'worker', status: 'active', config: {}, created_at: '', skill_keys: ['connector.http'] },
  { id: 'a2', slug: 'fonte-leituras', display_name: 'Fonte de leituras', kind: 'worker', status: 'inactive', config: {}, created_at: '', skill_keys: ['connector.http'] },
];

function renderWidget(opts: { rows?: unknown; config?: Record<string, unknown>; emit?: jest.Mock } = {}) {
  const Comp = getWidgetComponent('connector_status')!;
  const emit = opts.emit ?? jest.fn();
  render(
    <Comp
      appId="app-1"
      config={opts.config ?? { source: 'conectores', title: 'Conectores' }}
      variables={{ conectores: opts.rows === undefined ? { rows: ROWS } : opts.rows }}
      bindings={{}}
      setBinding={() => {}}
      emit={emit}
    />,
  );
  return emit;
}

describe('connector_status (4A)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockReturnValue(true);
    mockConfirm.mockResolvedValue(true);
    mockApi.list.mockResolvedValue(AGENTS as never);
    mockApi.run.mockResolvedValue({ status: 'queued' } as never);
    mockApi.update.mockResolvedValue({} as never);
  });

  it('está registrado com label humano + mockConfig/mockVariables (regra da paleta)', () => {
    const meta = getWidgetMeta('connector_status')!;
    expect(meta).toBeTruthy();
    expect(meta.label).toBe('Status de conectores');
    expect(meta.mockConfig).toBeTruthy();
    expect(meta.mockVariables).toBeTruthy();
    expect(meta.emits).toEqual(['value_change']);
  });

  it('tem entrada no widget-catalog.json (paridade backend ↔ frontend)', () => {
    const p = path.join(process.cwd(), 'lib', 'workshop', 'widget-catalog.json');
    const catalog = JSON.parse(fs.readFileSync(p, 'utf-8')) as { type: string }[];
    expect(catalog.some((e) => e.type === 'connector_status')).toBe(true);
  });

  it('declara o trigger real no WIDGET_EMITS (editor de Eventos)', () => {
    expect(WIDGET_EMITS.connector_status).toEqual(['value_change']);
  });

  it('renderiza nome, skill humanizada, status, última execução, contadores e erro recente', () => {
    renderWidget();
    expect(screen.getByText('Fonte de cadastros')).toBeInTheDocument();
    expect(screen.getByText('Fonte de leituras')).toBeInTheDocument();
    // skill humanizada via helper compartilhado do display layer (Tarefa E:
    // connectorStatus.skill.http foi SUBSTITUÍDA por skills.connector.http.label
    // no dict — o useT mockado é identidade, então a chave aparece crua aqui),
    // nunca o type cru sozinho.
    expect(screen.getAllByText('skills.connector.http.label').length).toBe(2);
    // status ativo/pausado via i18n
    expect(screen.getByText('conectores.status.active')).toBeInTheDocument();
    expect(screen.getByText('conectores.status.inactive')).toBeInTheDocument();
    // última execução: quando + desfecho
    expect(screen.getByText(/2026-06-10 08:30/)).toBeInTheDocument();
    expect(screen.getByText('conectores.status.succeeded')).toBeInTheDocument();
    expect(screen.getByText('conectores.status.failed')).toBeInTheDocument();
    // contadores
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    // erro recente da execução falhada
    expect(screen.getByText(/HTTP 500 da fonte/)).toBeInTheDocument();
  });

  it('"Rodar agora" resolve o agente pelo slug e chama Connectors.run + emite value_change', async () => {
    const emit = renderWidget();
    const btn = await screen.findByTestId('cs-run-fonte-cadastros');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => expect(mockApi.run).toHaveBeenCalledWith('a1', 'connector.http'));
    expect(emit).toHaveBeenCalledWith('value_change', { value: 'run', target: 'fonte-cadastros' });
  });

  it('Pausar confirma (confirmModal) e faz PATCH status=inactive', async () => {
    const emit = renderWidget();
    const btn = await screen.findByTestId('cs-toggle-fonte-cadastros');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => expect(mockApi.update).toHaveBeenCalledWith('a1', { status: 'inactive' }));
    expect(mockConfirm).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('value_change', { value: 'inactive', target: 'fonte-cadastros' });
  });

  it('Retomar no conector pausado faz PATCH status=active', async () => {
    renderWidget();
    const btn = await screen.findByTestId('cs-toggle-fonte-leituras');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => expect(mockApi.update).toHaveBeenCalledWith('a2', { status: 'active' }));
  });

  it('cancelar a confirmação NÃO chama a API', async () => {
    mockConfirm.mockResolvedValue(false);
    renderWidget();
    const btn = await screen.findByTestId('cs-toggle-fonte-cadastros');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockApi.update).not.toHaveBeenCalled();
  });

  it('sem connectors.manage → sem botões de gestão, sem link da central, sem fetch de agentes', () => {
    mockCan.mockReturnValue(false);
    renderWidget();
    expect(mockCan).toHaveBeenCalledWith('connectors.manage');
    expect(screen.queryByTestId('cs-run-fonte-cadastros')).toBeNull();
    expect(screen.queryByTestId('cs-toggle-fonte-cadastros')).toBeNull();
    expect(screen.queryByTestId('cs-central-link')).toBeNull();
    expect(mockApi.list).not.toHaveBeenCalled();
    // leitura continua: o card renderiza os dados do espelho
    expect(screen.getByText('Fonte de cadastros')).toBeInTheDocument();
  });

  it('link "Abrir na central" aponta pra /painel-de-controle/conectores', () => {
    renderWidget();
    const link = screen.getByTestId('cs-central-link');
    expect(link).toHaveAttribute('href', '/painel-de-controle/conectores');
  });

  it('sem source → instrução de configuração; conjunto vazio → estado vazio', () => {
    renderWidget({ config: {} });
    expect(screen.getByText('connectorStatus.configureSource')).toBeInTheDocument();
    renderWidget({ rows: { rows: [] } });
    expect(screen.getByText('connectorStatus.empty')).toBeInTheDocument();
  });
});
