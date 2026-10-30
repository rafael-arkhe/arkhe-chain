/**
 * Fase 3a (overhaul DAG n8n) — nó Fonte no modo Conector/HTTP.
 *
 * Prova o gesto headline: configurar a chamada → "Testar chamada" (sync/preview,
 * URL ao vivo OU amostra colada) → árvore de campos → "Gerar dataset" (SNAPSHOT
 * só com os campos selecionados) → vincula o dataset gerado ao nó Fonte. Absorve
 * no canvas o "criar fonte/dataset/upload" (a dor do operador).
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

import { HttpSourceConfig } from '@/components/dados/http-source-config';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({
  Connectors: {
    syncPreview: jest.fn(), list: jest.fn(), bindings: jest.fn(),
    sample: jest.fn(), materialize: jest.fn(), materializeStreamUrl: jest.fn(),
  },
  Datasets: { beginTransaction: jest.fn(), commitTransaction: jest.fn() },
}));
import { Connectors, Datasets } from '@/lib/api';

// Fake EventSource controlável (jsdom não tem a API) — instalado SÓ no teste de stream.
type Listener = (ev: MessageEvent) => void;
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  onerror: ((ev: Event) => void) | null = null;
  private listeners: Record<string, Listener[]> = {};
  closed = false;
  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = !!init?.withCredentials;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: Listener) { (this.listeners[type] ??= []).push(cb); }
  close() { this.closed = true; }
  emit(type: string, data: string) { (this.listeners[type] ?? []).forEach((cb) => cb({ data } as MessageEvent)); }
}

const PREVIEW = {
  format: 'json', row_count: 2, fetched_from: 'https://x',
  schema: [{ key: 'id', type: 'number' }, { key: 'nome', type: 'text' }, { key: '_raw', type: 'text' }],
  sample_rows: [{ id: 1, nome: 'A', _raw: 'zz' }, { id: 2, nome: 'B', _raw: 'yy' }],
};

const SAMPLE = {
  format: 'json', row_count: 42, fetched_from: null, truncated: false, pages: 3,
  schema: [{ key: 'id', type: 'number' }, { key: 'nome', type: 'text' }, { key: '_raw', type: 'text' }],
  sample_rows: [{ id: 1, nome: 'A', _raw: 'zz' }],
};
const CONN_AGENT = {
  id: 'a1', slug: 'fonte-x', display_name: 'Fonte X', kind: 'worker',
  status: 'active', config: {}, created_at: '', skill_keys: ['connector.http'],
};

beforeEach(() => jest.clearAllMocks());

test('Testar chamada (URL ao vivo) → sync/preview → árvore de campos', async () => {
  (Connectors.syncPreview as jest.Mock).mockResolvedValue(PREVIEW);
  render(<HttpSourceConfig config={{}} set={jest.fn()} />);
  fireEvent.change(screen.getByTestId('http-src-url'), { target: { value: 'https://api.example.com/x' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  await screen.findByTestId('schema-tree');
  expect(Connectors.syncPreview).toHaveBeenCalledWith({ format: 'json', source_url: 'https://api.example.com/x' });
  expect(screen.getByTestId('schema-field-id')).toBeInTheDocument();
  expect(screen.getByTestId('schema-field-nome')).toBeInTheDocument();
});

test('amostra COLADA → sync/preview com sample', async () => {
  (Connectors.syncPreview as jest.Mock).mockResolvedValue(PREVIEW);
  render(<HttpSourceConfig config={{}} set={jest.fn()} />);
  fireEvent.change(screen.getByTestId('http-src-mode'), { target: { value: 'sample' } });
  fireEvent.change(screen.getByTestId('http-src-sample'), { target: { value: '[{"id":1}]' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  expect(Connectors.syncPreview).toHaveBeenCalledWith({ format: 'json', sample: '[{"id":1}]' });
});

test('requisição HTTP POST envia método, headers e body para o preview', async () => {
  (Connectors.syncPreview as jest.Mock).mockResolvedValue(PREVIEW);
  render(<HttpSourceConfig config={{}} set={jest.fn()} />);
  fireEvent.change(screen.getByTestId('http-src-method'), { target: { value: 'POST' } });
  fireEvent.change(screen.getByTestId('http-src-url'), { target: { value: 'https://api.example.com/search' } });
  fireEvent.change(screen.getByTestId('http-src-headers'), { target: { value: 'Authorization: Bearer token\nAccept: application/json' } });
  fireEvent.change(screen.getByTestId('http-src-body'), { target: { value: '{"q":"abc"}' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  expect(Connectors.syncPreview).toHaveBeenCalledWith({
    format: 'json',
    source_url: 'https://api.example.com/search',
    method: 'POST',
    headers: { Authorization: 'Bearer token', Accept: 'application/json' },
    request_body: '{"q":"abc"}',
  });
});

test('Gerar dataset → SNAPSHOT só com os campos SELECIONADOS → vincula ao nó Fonte', async () => {
  (Connectors.syncPreview as jest.Mock).mockResolvedValue(PREVIEW);
  (Datasets.beginTransaction as jest.Mock).mockResolvedValue({ id: 'tx1' });
  (Datasets.commitTransaction as jest.Mock).mockResolvedValue({ status: 'COMMITTED' });
  const set = jest.fn();
  render(<HttpSourceConfig config={{}} set={set} />);
  fireEvent.change(screen.getByTestId('http-src-url'), { target: { value: 'https://api.example.com/x' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  await screen.findByTestId('schema-tree');

  // desmarca "_raw" → fica id + nome
  fireEvent.click(screen.getByTestId('schema-field-_raw'));
  fireEvent.change(screen.getByTestId('http-src-dsname'), { target: { value: 'minhafonte' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-generate')); await Promise.resolve(); });

  await waitFor(() => expect(Datasets.commitTransaction).toHaveBeenCalled());
  expect(Datasets.beginTransaction).toHaveBeenCalledWith('minhafonte', 'SNAPSHOT', 'main');
  // SNAPSHOT só com id+nome (sem _raw), preservando a ordem do schema
  expect(Datasets.commitTransaction).toHaveBeenCalledWith('minhafonte', 'tx1', {
    payload: { rows: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }] },
  });
  // o nó Fonte passa a apontar p/ o dataset gerado (+ proveniência da chamada)
  expect(set).toHaveBeenCalledWith(expect.objectContaining({ kind: 'http', dataset: 'minhafonte' }));
});

// ── Fase 3b — modo CONECTOR configurado (auth+paginação reais via Vault) ──────
test('modo conector → Testar chamada → Connectors.sample (autenticado) → árvore', async () => {
  (Connectors.list as jest.Mock).mockResolvedValue([CONN_AGENT]);
  (Connectors.bindings as jest.Mock).mockResolvedValue([
    { skill_key: 'connector.http', config: { auth: { mode: 'bearer' }, pagination: { mode: 'link' } }, active: true },
  ]);
  (Connectors.sample as jest.Mock).mockResolvedValue(SAMPLE);
  render(<HttpSourceConfig config={{}} set={jest.fn()} />);
  fireEvent.change(screen.getByTestId('http-src-mode'), { target: { value: 'connector' } });
  // a lista de conectores carrega lazy
  await screen.findByRole('option', { name: 'Fonte X' });
  fireEvent.change(screen.getByTestId('http-src-connector'), { target: { value: 'a1' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  await screen.findByTestId('schema-tree');
  // roda o conector autenticado em modo amostra — NÃO o sync/preview público
  expect(Connectors.sample).toHaveBeenCalledWith('a1', 'connector.http');
  expect(Connectors.syncPreview).not.toHaveBeenCalled();
  expect(screen.getByTestId('schema-field-id')).toBeInTheDocument();
});

test('modo conector → Gerar dataset → Connectors.materialize (campos selecionados + teto)', async () => {
  (Connectors.list as jest.Mock).mockResolvedValue([CONN_AGENT]);
  (Connectors.bindings as jest.Mock).mockResolvedValue([{ skill_key: 'connector.http', config: {}, active: true }]);
  (Connectors.sample as jest.Mock).mockResolvedValue(SAMPLE);
  (Connectors.materialize as jest.Mock).mockResolvedValue({ dataset: 'minhafonte', rows: 42, pages: 3, truncated: false });
  const set = jest.fn();
  render(<HttpSourceConfig config={{}} set={set} />);
  fireEvent.change(screen.getByTestId('http-src-mode'), { target: { value: 'connector' } });
  await screen.findByRole('option', { name: 'Fonte X' });
  fireEvent.change(screen.getByTestId('http-src-connector'), { target: { value: 'a1' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  await screen.findByTestId('schema-tree');

  fireEvent.click(screen.getByTestId('schema-field-_raw')); // desmarca _raw → id+nome
  fireEvent.change(screen.getByTestId('http-src-dsname'), { target: { value: 'minhafonte' } });
  fireEvent.change(screen.getByTestId('http-src-maxpages'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-generate')); await Promise.resolve(); });

  await waitFor(() => expect(Connectors.materialize).toHaveBeenCalled());
  // puxão capado server-side com os campos selecionados (keep-only-set) + teto
  expect(Connectors.materialize).toHaveBeenCalledWith(
    'a1', { dataset: 'minhafonte', fields: ['id', 'nome'], max_pages: 20 }, 'connector.http');
  // modo conector NÃO usa a transação de Datasets do FE (materialize faz no servidor)
  expect(Datasets.beginTransaction).not.toHaveBeenCalled();
  expect(set).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'http', dataset: 'minhafonte', connector_agent_id: 'a1', connector_skill_key: 'connector.http',
    fields: ['id', 'nome'], max_pages: 20,
  }));
});

test('modo conector → Gerar dataset via SSE → barra de progresso por página + vincula', async () => {
  const real = (globalThis as unknown as { EventSource: unknown }).EventSource;
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  FakeEventSource.instances = [];
  try {
    (Connectors.list as jest.Mock).mockResolvedValue([CONN_AGENT]);
    (Connectors.bindings as jest.Mock).mockResolvedValue([{ skill_key: 'connector.http', config: {}, active: true }]);
    (Connectors.sample as jest.Mock).mockResolvedValue(SAMPLE);
    (Connectors.materializeStreamUrl as jest.Mock).mockReturnValue('/api/x/materialize/stream?dataset=minhafonte');
    const set = jest.fn();
    render(<HttpSourceConfig config={{}} set={set} />);
    fireEvent.change(screen.getByTestId('http-src-mode'), { target: { value: 'connector' } });
    await screen.findByRole('option', { name: 'Fonte X' });
    fireEvent.change(screen.getByTestId('http-src-connector'), { target: { value: 'a1' } });
    await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
    await screen.findByTestId('schema-tree');

    fireEvent.click(screen.getByTestId('schema-field-_raw'));   // id + nome
    fireEvent.change(screen.getByTestId('http-src-dsname'), { target: { value: 'minhafonte' } });
    fireEvent.change(screen.getByTestId('http-src-maxpages'), { target: { value: '20' } });
    act(() => { fireEvent.click(screen.getByTestId('http-src-generate')); });

    // abriu o SSE de materialização (não o POST bloqueante)
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    expect(Connectors.materializeStreamUrl).toHaveBeenCalledWith(
      'a1', 'connector.http', { dataset: 'minhafonte', fields: ['id', 'nome'], max_pages: 20 });
    expect(Connectors.materialize).not.toHaveBeenCalled();

    const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    expect(es.withCredentials).toBe(true);
    // page → barra de progresso REAL (página atual / teto)
    await act(async () => { es.emit('page', JSON.stringify({ page: 1, seen: 2, rows: 2 })); await Promise.resolve(); });
    expect(await screen.findByTestId('http-src-progress')).toHaveTextContent('1/20');
    // done OK → fecha o stream + vincula o nó ao dataset gerado
    await act(async () => { es.emit('done', JSON.stringify({ status: 'OK', rows: 2, truncated: false })); await Promise.resolve(); });
    expect(es.closed).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'http', dataset: 'minhafonte', connector_agent_id: 'a1',
      fields: ['id', 'nome'], max_pages: 20,
    }));
  } finally {
    (globalThis as unknown as { EventSource: unknown }).EventSource = real;
  }
});

// ── D6 — serializer HTML no-code (row_selector + fields) ──────────────────────
test('serializer HTML → Testar chamada envia row_selector + fields ao preview', async () => {
  (Connectors.syncPreview as jest.Mock).mockResolvedValue(PREVIEW);
  render(<HttpSourceConfig config={{}} set={jest.fn()} />);
  fireEvent.change(screen.getByTestId('http-src-format'), { target: { value: 'html' } });
  fireEvent.change(screen.getByTestId('http-src-url'), { target: { value: 'https://itapetininga.siscam.com.br/lista' } });
  // editor aparece só no formato html
  expect(screen.getByTestId('http-src-html')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('http-src-html-rowsel'), { target: { value: 'table.lista tbody tr' } });
  fireEvent.change(screen.getByTestId('http-src-html-key-0'), { target: { value: 'numero' } });
  fireEvent.change(screen.getByTestId('http-src-html-sel-0'), { target: { value: 'td.num' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  expect(Connectors.syncPreview).toHaveBeenCalledWith({
    format: 'html',
    source_url: 'https://itapetininga.siscam.com.br/lista',
    options: { row_selector: 'table.lista tbody tr', fields: [{ key: 'numero', selector: 'td.num' }] },
  });
});

test('serializer HTML → attr opcional entra no field; Gerar grava options no nó (re-pull)', async () => {
  (Connectors.syncPreview as jest.Mock).mockResolvedValue(PREVIEW);
  (Datasets.beginTransaction as jest.Mock).mockResolvedValue({ id: 'tx1' });
  (Datasets.commitTransaction as jest.Mock).mockResolvedValue({ status: 'COMMITTED' });
  const set = jest.fn();
  render(<HttpSourceConfig config={{}} set={set} />);
  fireEvent.change(screen.getByTestId('http-src-format'), { target: { value: 'html' } });
  fireEvent.change(screen.getByTestId('http-src-url'), { target: { value: 'https://x.siscam.com.br/l' } });
  fireEvent.change(screen.getByTestId('http-src-html-rowsel'), { target: { value: 'tr.row' } });
  fireEvent.change(screen.getByTestId('http-src-html-key-0'), { target: { value: 'link' } });
  fireEvent.change(screen.getByTestId('http-src-html-sel-0'), { target: { value: 'a.doc' } });
  // 2 inputs opcionais (attr, contém, regex) — pega o 1º (attr) do field 0
  const optional = screen.getByTestId('http-src-html-field-0').querySelectorAll('input');
  fireEvent.change(optional[2], { target: { value: 'href' } }); // key, selector, attr
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-test')); await Promise.resolve(); });
  await screen.findByTestId('schema-tree');
  fireEvent.change(screen.getByTestId('http-src-dsname'), { target: { value: 'siscam-x' } });
  await act(async () => { fireEvent.click(screen.getByTestId('http-src-generate')); await Promise.resolve(); });
  await waitFor(() => expect(set).toHaveBeenCalled());
  expect(set).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'http', dataset: 'siscam-x', format: 'html',
    options: { row_selector: 'tr.row', fields: [{ key: 'link', selector: 'a.doc', attr: 'href' }] },
  }));
});

test('modo conector vinculado → select de re-pull agenda schedule_preset no nó', async () => {
  (Connectors.list as jest.Mock).mockResolvedValue([CONN_AGENT]);
  (Connectors.bindings as jest.Mock).mockResolvedValue([{ skill_key: 'connector.http', config: {}, active: true }]);
  const set = jest.fn();
  render(<HttpSourceConfig config={{ dataset: 'fonte_x', connector_agent_id: 'a1', connector_skill_key: 'connector.http' }} set={set} />);

  const sched = await screen.findByTestId('http-src-schedule');
  expect(sched.tagName).toBe('SELECT');
  expect(screen.getByRole('option', { name: 'pbw.schedHourly' })).toBeInTheDocument();
  fireEvent.change(sched, { target: { value: 'hourly' } });
  expect(set).toHaveBeenCalledWith({ schedule_preset: 'hourly' });
  fireEvent.change(sched, { target: { value: '' } });
  expect(set).toHaveBeenCalledWith({ schedule_preset: null });
});
