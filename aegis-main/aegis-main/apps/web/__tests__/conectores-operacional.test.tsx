/**
 * WP-F (2026-06-10) — painel de Conectores operacional.
 *
 * Cobre: lista só agentes com skill connector.* (skill_keys do backend);
 * Ativar/Pausar PATCHa o status (com confirmModal, nunca confirm nativo);
 * registro serializa method/query/request_body/pagination/markings;
 * node_type vira dropdown governado populado dos object types;
 * Execuções busca o histórico, renderiza linhas e reexecuta run falho.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ConectoresWorkspace } from '@/components/dados/conectores-workspace';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
// Tarefa B — a seção AEGIS Edge tem suíte própria (conectores-edge.test);
// aqui fica stubada (a factory de @/lib/api destes testes não mocka Edge).
jest.mock('@/components/dados/edge-section', () => ({ EdgeSection: () => null }));
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ actions }: any) => <div>{actions}</div>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));
// Tarefa H — o workspace agora chama useCan('connectors.manage') p/ exibir o
// botão Configurar; sem o mock, useAuth exigiria <AuthProvider> no render.
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Connectors: {
    list: jest.fn(), register: jest.fn(), test: jest.fn(), run: jest.fn(),
    schedulerTick: jest.fn(), syncPreview: jest.fn(), update: jest.fn(),
    runs: jest.fn(), retryRun: jest.fn(),
  },
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Markings: { list: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));

const { Connectors, Ontology, Markings } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
};
const { confirmModal } = jest.requireMock('@/components/dialog/confirm-dialog') as {
  confirmModal: jest.Mock;
};

const CONN = {
  id: 'a1', slug: 'cep', display_name: 'API CEP', kind: 'worker', status: 'inactive',
  config: {}, created_at: '', skill_keys: ['connector.http'], schedule: 'hourly',
};
const NAO_CONN = {
  id: 'a2', slug: 'visao', display_name: 'Visão', kind: 'worker', status: 'active',
  config: {}, created_at: '', skill_keys: ['vision.count_objects'], schedule: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  Connectors.list.mockResolvedValue([CONN, NAO_CONN]);
  confirmModal.mockResolvedValue(true);
  Ontology.listNodeTypes.mockResolvedValue([{ name: 'endereco', label: 'Endereço', count: 3 }]);
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'endereco', display_name: 'Endereço', title_property: 'name', count: 3,
    properties: [
      { key: 'id', label: 'ID', type: 'string' },
      { key: 'logradouro', label: 'Logradouro', type: 'string' },
    ],
    links: [], actions: [],
  });
  Markings.list.mockResolvedValue([
    { slug: 'OFICIAL', display_name: 'Oficial', active: true },
    { slug: 'RESTRITO', display_name: 'Restrito', active: true },
  ]);
});

async function openForm() {
  render(<ConectoresWorkspace />);
  await waitFor(() => expect(Connectors.list).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('conectores-novo'));
  await screen.findByTestId('conectores-form');
}

it('lista só agentes com skill connector.* e mostra skill + status + agendamento', async () => {
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-cep');
  expect(screen.queryByTestId('conector-card-visao')).toBeNull();
  const card = screen.getByTestId('conector-card-cep');
  expect(card).toHaveTextContent('connector.http');
  expect(card).toHaveTextContent('conectores.cron.hourly');
  expect(screen.getByTestId('conector-status-cep')).toHaveTextContent('conectores.status.inactive');
});

it('estações (pareamento de aparelho) e portaria legada NÃO aparecem em Conectores', async () => {
  // Conectores é pipeline de DADOS: quem pareia um aparelho mora em
  // Dispositivos; "Portaria — Visitantes" é conector antigo, descontinuado.
  Connectors.list.mockResolvedValue([
    CONN,
    // fora pela SKILL do binding (slug qualquer)
    { ...CONN, id: 'a3', slug: 'estacao-x', display_name: 'Estação', skill_keys: ['connector.whatsapp_station'] },
    { ...CONN, id: 'a4', slug: 'ponte-x', display_name: 'Ponte', skill_keys: ['connector.autosync'] },
    { ...CONN, id: 'a5', slug: 'portaria-x', display_name: 'Portaria', skill_keys: ['connector.portaria'] },
    // instalação antiga: slug do seed sem o skill_key no payload → cai no
    // fallback por slug e também some da lista.
    { ...CONN, id: 'a6', slug: 'estacao-whatsapp', display_name: 'Estação legada', skill_keys: ['connector.http'] },
  ]);
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-cep');
  expect(screen.queryByTestId('conector-card-estacao-x')).toBeNull();
  expect(screen.queryByTestId('conector-card-ponte-x')).toBeNull();
  expect(screen.queryByTestId('conector-card-portaria-x')).toBeNull();
  expect(screen.queryByTestId('conector-card-estacao-whatsapp')).toBeNull();
});

it('Ativar confirma via confirmModal e PATCHa status=active', async () => {
  Connectors.update.mockResolvedValue({ ...CONN, status: 'active' });
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-cep');
  fireEvent.click(screen.getByTestId('conector-toggle-cep'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  await waitFor(() => expect(Connectors.update).toHaveBeenCalledWith('a1', { status: 'active' }));
});

it('Pausar (agente ativo) PATCHa status=inactive; cancelar no modal não PATCHa', async () => {
  Connectors.list.mockResolvedValue([{ ...CONN, status: 'active' }]);
  confirmModal.mockResolvedValueOnce(false);
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-cep');
  fireEvent.click(screen.getByTestId('conector-toggle-cep'));
  await waitFor(() => expect(confirmModal).toHaveBeenCalled());
  expect(Connectors.update).not.toHaveBeenCalled();

  confirmModal.mockResolvedValueOnce(true);
  Connectors.update.mockResolvedValue({ ...CONN, status: 'inactive' });
  fireEvent.click(screen.getByTestId('conector-toggle-cep'));
  await waitFor(() => expect(Connectors.update).toHaveBeenCalledWith('a1', { status: 'inactive' }));
});

it('node_type é dropdown governado populado dos object types; id_field depende dele', async () => {
  await openForm();
  const sel = (await screen.findByTestId('cf-node-type')) as HTMLSelectElement;
  await screen.findByRole('option', { name: 'Endereço' });
  expect(sel.tagName).toBe('SELECT');
  expect(Ontology.listNodeTypes).toHaveBeenCalled();
  fireEvent.change(sel, { target: { value: 'endereco' } });
  // id_field carrega as propriedades do tipo escolhido
  await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('endereco'));
  const idSel = screen.getByTestId('cf-id-field') as HTMLSelectElement;
  await waitFor(() =>
    expect(Array.from(idSel.options).map((o) => o.value)).toEqual(
      expect.arrayContaining(['id', 'logradouro']),
    ),
  );
});

it('registrar serializa method/query/request_body/pagination/markings no payload', async () => {
  Connectors.register.mockResolvedValue({ id: 'a9', slug: 'cep2' });
  await openForm();
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'cep2' } });
  fireEvent.change(screen.getByTestId('cf-base-url'), { target: { value: 'https://api.x' } });
  await screen.findByRole('option', { name: 'Endereço' });
  fireEvent.change(screen.getByTestId('cf-node-type'), { target: { value: 'endereco' } });

  // método POST → textarea de body aparece
  fireEvent.change(screen.getByTestId('cf-method'), { target: { value: 'POST' } });
  fireEvent.change(await screen.findByTestId('cf-body'), { target: { value: '{"filtro":"ativos"}' } });

  // query KV
  fireEvent.click(screen.getByTestId('cf-query-add'));
  fireEvent.change(screen.getByTestId('cf-query-key-0'), { target: { value: 'uf' } });
  fireEvent.change(screen.getByTestId('cf-query-val-0'), { target: { value: 'SP' } });

  // paginação por página
  fireEvent.change(screen.getByTestId('cf-pag-mode'), { target: { value: 'page' } });
  fireEvent.change(screen.getByTestId('cf-pag-page_param'), { target: { value: 'pagina' } });
  fireEvent.change(screen.getByTestId('cf-pag-max_pages'), { target: { value: '5' } });

  // markings do catálogo — abre o popover e seleciona
  fireEvent.click(screen.getByTestId('cf-markings'));
  const chip = await screen.findByTestId('cf-markings-opt-RESTRITO');
  fireEvent.click(chip);

  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await waitFor(() => expect(Connectors.register).toHaveBeenCalled());
  const payload = Connectors.register.mock.calls[0][0];
  expect(payload.method).toBe('POST');
  expect(payload.request_body).toEqual({ filtro: 'ativos' });
  expect(payload.query).toEqual({ uf: 'SP' });
  expect(payload.pagination).toEqual(expect.objectContaining({ mode: 'page', page_param: 'pagina', max_pages: 5 }));
  expect(payload.markings).toEqual(['RESTRITO']);
  expect(payload.node_type).toBe('endereco');
});

it('cron presets cobrem os 10 presets reais do agendador (1min/2min: cadência sem buraco)', async () => {
  await openForm();
  const sel = screen.getByTestId('cf-cron') as HTMLSelectElement;
  expect(Array.from(sel.options).map((o) => o.value)).toEqual(
    ['', '1min', '2min', '5min', '15min', '30min', 'hourly', '2h', '6h', '12h', 'daily'],
  );
});

it('Execuções busca histórico, renderiza linhas e reexecuta run falho', async () => {
  Connectors.runs.mockResolvedValue([
    {
      id: 'r1', agent_id: 'a1', skill_key: 'connector.http', status: 'failed', trigger: 'manual',
      queued_at: '2026-06-10T10:00:00+00:00', started_at: '2026-06-10T10:00:01+00:00',
      finished_at: '2026-06-10T10:00:03+00:00', duration_ms: 2100,
      output_summary: {}, error_message: 'HTTP 500', attempt_number: 1,
    },
    {
      id: 'r2', agent_id: 'a1', skill_key: 'connector.http', status: 'succeeded', trigger: 'cron',
      queued_at: '2026-06-10T09:00:00+00:00', started_at: '2026-06-10T09:00:01+00:00',
      finished_at: '2026-06-10T09:00:02+00:00', duration_ms: 900,
      output_summary: { persisted: 12 }, error_message: null, attempt_number: 1,
    },
  ]);
  Connectors.retryRun.mockResolvedValue({ id: 'r3', status: 'queued' });
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-cep');
  fireEvent.click(screen.getByTestId('conector-runs-cep'));
  await waitFor(() => expect(Connectors.runs).toHaveBeenCalledWith('a1', expect.any(Number)));
  const row1 = await screen.findByTestId('run-row-r1');
  expect(row1).toHaveTextContent('conectores.status.failed');
  expect(row1).toHaveTextContent('HTTP 500');
  const row2 = screen.getByTestId('run-row-r2');
  expect(row2).toHaveTextContent('persisted');
  // retry só no run falho
  expect(screen.queryByTestId('run-retry-r2')).toBeNull();
  fireEvent.click(screen.getByTestId('run-retry-r1'));
  await waitFor(() => expect(Connectors.retryRun).toHaveBeenCalledWith('r1'));
});

it('conector de detecção contínua (camera.detect_tick) aparece na central e usa a própria skill', async () => {
  // Tarefa Y — o pipeline contínuo de detecção é um conector COMUM da central
  // (zero mecanismo paralelo); o filtro connector.* não pode escondê-lo.
  const CAM = {
    id: 'a4', slug: 'detec-cams', display_name: 'Detecção contínua', kind: 'worker',
    status: 'active', config: {}, created_at: '', skill_keys: ['camera.detect_tick'], schedule: '15min',
  };
  Connectors.list.mockResolvedValue([CAM, NAO_CONN]);
  Connectors.run.mockResolvedValue({ id: 'r10', status: 'queued' });
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-detec-cams');
  expect(screen.queryByTestId('conector-card-visao')).toBeNull(); // worker genérico segue fora
  const card = screen.getByTestId('conector-card-detec-cams');
  expect(card).toHaveTextContent('camera.detect_tick');
  expect(card).toHaveTextContent('conectores.cron.15min');
  fireEvent.click(screen.getByTestId('conector-run-detec-cams'));
  await waitFor(() => expect(Connectors.run).toHaveBeenCalledWith('a4', 'camera.detect_tick'));
});

it('Testar/Rodar usam a skill real do binding (não hardcode connector.http)', async () => {
  Connectors.list.mockResolvedValue([
    { ...CONN, slug: 'sftp', id: 'a3', skill_keys: ['connector.sftp'] },
  ]);
  Connectors.test.mockResolvedValue({ ok: true, message: 'conectado' });
  Connectors.run.mockResolvedValue({ id: 'r9', status: 'queued' });
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-sftp');
  fireEvent.click(screen.getByTestId('conector-test-sftp'));
  await waitFor(() => expect(Connectors.test).toHaveBeenCalledWith('a3', 'connector.sftp'));
  fireEvent.click(screen.getByTestId('conector-run-sftp'));
  await waitFor(() => expect(Connectors.run).toHaveBeenCalledWith('a3', 'connector.sftp'));
});
