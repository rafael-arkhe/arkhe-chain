/**
 * P5 (security-app) — IDE: rodar no sandbox + "Gerar com AIP" + autocomplete.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }: any) => (
    <textarea data-testid="monaco" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
  // #1 — DiffEditor do "Gerar com AIP": renderiza o código modificado como texto
  // p/ os testes ainda conseguirem ler o conteúdo gerado dentro do card.
  DiffEditor: ({ original, modified }: any) => (
    <div data-testid="monaco-diff" data-original={original}>{modified}</div>
  ),
}));
jest.mock('@/lib/api', () => ({
  Sandbox: { execute: jest.fn(), install: jest.fn(), listPackages: jest.fn().mockResolvedValue([]), terminalTicket: jest.fn(), terminalWsUrl: () => 'ws://x', terminalAvailable: jest.fn(() => false) },
  Codegen: { generate: jest.fn(), sdkSymbols: jest.fn().mockResolvedValue({ symbols: [] }) },
  Functions: {
    get: jest.fn(),
    previewBatch: jest.fn(),
    // F5/F6 — testes governados.
    tests: jest.fn().mockResolvedValue([]),
    createTest: jest.fn(),
    runTest: jest.fn(),
    runAllTests: jest.fn(),
    testRuns: jest.fn().mockResolvedValue([]),
  },
  Ontology: { objectTypeSchema: jest.fn(), listNodes: jest.fn().mockResolvedValue([]) },
}));
// SandboxTerminal usa xterm (import dinâmico) + WebSocket — stub no jsdom.
jest.mock('@/components/dev/sandbox-terminal', () => ({
  SandboxTerminal: () => <div data-testid="sandbox-terminal-stub" />,
}));

import { SandboxIDE, mergeGeneratedIntoHeader } from '@/components/dev/sandbox-ide';
const { Sandbox, Codegen, Functions, Ontology } = jest.requireMock('@/lib/api') as {
  Sandbox: Record<string, jest.Mock>;
  Codegen: Record<string, jest.Mock>;
  Functions: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
};

// Fixture compartilhado: schema + 2 amostras do mesmo kind (F3/F4).
function mockVeiculoContext() {
  Functions.get.mockResolvedValue({
    slug: 'normalize-text', display_name: 'Normalizar', language: 'python', version: 2,
    source: 'def transform(rows):\n    return rows\n',
  });
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'veiculo', display_name: 'Veículo', title_property: 'placa', count: 2,
    properties: [
      { key: 'placa', type: 'string', label: 'Placa', is_title: true },
      { key: 'velocidade', type: 'number', label: 'Velocidade', is_title: false },
    ],
    links: [], actions: [],
  });
  Ontology.listNodes.mockResolvedValue([
    { id: 'abcdef1234567890', name: 'Carro A', node_type: 'veiculo', properties: { placa: 'ABC1D23', velocidade: 80 }, schema_definition: {}, description: '', version: 1, created_by: 'u', signed_hash: null, created_at: '', updated_at: null },
    { id: 'zzzzzz9999999999', name: 'Carro B', node_type: 'veiculo', properties: { placa: 'XYZ9W87', velocidade: 60 }, schema_definition: {}, description: '', version: 1, created_by: 'u', signed_hash: null, created_at: '', updated_at: null },
  ]);
}

beforeEach(() => jest.clearAllMocks());

it('roda o código no sandbox e mostra o console', async () => {
  Sandbox.execute.mockResolvedValue({ session_id: 's', status: 'completed', exit_code: 0, stdout: 'oi mundo', stderr: '', duration_ms: 12, code_hash: 'h' });
  render(<SandboxIDE />);
  await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled()); // autocomplete buscado no mount
  fireEvent.click(screen.getByTestId('ide-run'));
  await waitFor(() => expect(Sandbox.execute).toHaveBeenCalled());
  const args = Sandbox.execute.mock.calls[0][0];
  expect(args.language).toBe('python');
  expect(await screen.findByTestId('ide-console')).toHaveTextContent('oi mundo');
});

// #2 (revisão) — sem saída + exit 0 = SUCESSO silencioso (não "(sem saída)" como
// uma falha). Distingue execução bem-sucedida de falha sem mensagem.
it('console: exit 0 sem saída mostra "executado com sucesso", exit !=0 mostra vazio', async () => {
  Sandbox.execute.mockResolvedValueOnce({ session_id: 's', status: 'completed', exit_code: 0, stdout: '', stderr: '', duration_ms: 3, code_hash: 'h' });
  // useT mockado devolve a CHAVE: sucesso → ide.consoleSuccess.
  render(<SandboxIDE />);
  fireEvent.click(screen.getAllByTestId('ide-run')[0]);
  await waitFor(() =>
    expect(screen.getByTestId('ide-console-empty')).toHaveTextContent('ide.consoleSuccess'),
  );
});

it('gera código pelo AIP e insere no editor', async () => {
  Codegen.generate.mockResolvedValue({
    code: 'def main():\n    return 1\n', kind: 'script', entrypoint: 'main', inference_log_id: 'l',
    model_default: { model: 'mixtral', provider: 'openrouter', source: 'hardcoded', jurisdictions: ['BR'], country: 'BR' },
    loadcheck: { ran: true, ok: true },
  });
  render(<SandboxIDE />);
  fireEvent.click(screen.getByTestId('ide-aip-toggle'));
  fireEvent.change(screen.getByTestId('ide-aip-objective'), { target: { value: 'somar' } });
  fireEvent.click(screen.getByTestId('ide-aip-generate'));
  await waitFor(() => expect(Codegen.generate).toHaveBeenCalledWith({ objective: 'somar', kind: 'script' }));
  const card = await screen.findByTestId('ide-aip-result');
  expect(card).toHaveTextContent('def main():');
  // atribuição NEUTRA: nunca o nome do modelo proprietário; mostra validação no sandbox
  expect(card).not.toHaveTextContent('mixtral');
  expect(card).toHaveTextContent('ide.aipValidated');
  // P4 — badge de soberania: mostra a jurisdição/país (BR), nunca o nome do modelo.
  const sov = screen.getByTestId('ide-aip-sovereignty');
  expect(sov).toHaveTextContent('BR');
  expect(sov).not.toHaveTextContent('mixtral');
  fireEvent.click(screen.getByTestId('ide-aip-apply'));
  expect((screen.getByTestId('monaco') as HTMLTextAreaElement).value).toContain('def main():');
  expect(screen.queryByTestId('ide-aip-result')).not.toBeInTheDocument();
});

it('erro do gate aparece sem inserir', async () => {
  Codegen.generate.mockRejectedValue(new Error('o código não carrega no sandbox'));
  render(<SandboxIDE />);
  fireEvent.click(screen.getByTestId('ide-aip-toggle'));
  fireEvent.change(screen.getByTestId('ide-aip-objective'), { target: { value: 'x' } });
  fireEvent.click(screen.getByTestId('ide-aip-generate'));
  expect(await screen.findByTestId('ide-aip-error')).toHaveTextContent(/não carrega/);
});

it('instala pacote pip por um MODAL dedicado (input + logs + feedback de pronto)', async () => {
  Sandbox.install.mockResolvedValue({ status: 'success', package_name: 'requests', stdout: 'Successfully installed requests', stderr: '' });
  render(<SandboxIDE />);
  // abre o modal de pacotes (era um input apertado na barra)
  fireEvent.click(screen.getByTestId('ide-packages-open'));
  fireEvent.change(await screen.findByTestId('ide-pkg'), { target: { value: 'requests' } });
  fireEvent.click(screen.getByTestId('ide-install'));
  await waitFor(() => expect(Sandbox.install).toHaveBeenCalledWith('requests'));
  // banner de pronto + log da instalação dentro do MODAL (não no console da IDE)
  expect(await screen.findByTestId('ide-install-ok')).toBeInTheDocument();
  expect(screen.getByTestId('ide-install-log')).toHaveTextContent('Successfully installed requests');
});

it('débito 4: sem WS configurado, o toggle de Terminal não aparece', () => {
  Sandbox.terminalAvailable.mockReturnValue(false);
  render(<SandboxIDE />);
  expect(screen.queryByTestId('ide-terminal-toggle')).not.toBeInTheDocument();
});

it('débito 4: com WS configurado, o toggle aparece e abre o terminal', () => {
  Sandbox.terminalAvailable.mockReturnValue(true);
  render(<SandboxIDE />);
  const toggle = screen.getByTestId('ide-terminal-toggle');
  expect(screen.queryByTestId('ide-terminal')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByTestId('ide-terminal')).toBeInTheDocument();
  expect(screen.getByTestId('sandbox-terminal-stub')).toBeInTheDocument();
});

// ─── F1 — IDE contextual ao nó de Processamento ──────────────────────────────

it('F1 retrocompat: sem props, começa no DEFAULT_CODE e não busca source/esquema', async () => {
  render(<SandboxIDE />);
  await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled());
  // DEFAULT_CODE ainda aparece no editor.
  expect((screen.getByTestId('monaco') as HTMLTextAreaElement).value).toContain('AegisClient');
  // Sem props → sem painel de esquema e sem chamadas contextuais.
  expect(screen.queryByTestId('ide-input-schema')).not.toBeInTheDocument();
  expect(Functions.get).not.toHaveBeenCalled();
  expect(Ontology.objectTypeSchema).not.toHaveBeenCalled();
});

it('F1: com nodeType, o painel de esquema renderiza as propriedades (key · type)', async () => {
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'veiculo', display_name: 'Veículo', title_property: 'placa', count: 3,
    properties: [
      { key: 'placa', type: 'string', label: 'Placa', is_title: true },
      { key: 'cor', type: 'string', label: 'Cor', is_title: false },
      { key: 'velocidade', type: 'number', label: 'Velocidade', is_title: false },
    ],
    links: [], actions: [],
  });
  render(<SandboxIDE nodeType="veiculo" />);
  await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('veiculo'));
  const panel = await screen.findByTestId('ide-input-schema');
  expect(panel).toBeInTheDocument();
  // Cada propriedade vira uma linha key · type.
  expect(await screen.findByTestId('ide-schema-prop-placa')).toHaveTextContent('placa');
  expect(screen.getByTestId('ide-schema-prop-placa')).toHaveTextContent('string');
  expect(screen.getByTestId('ide-schema-prop-cor')).toHaveTextContent('cor');
  expect(screen.getByTestId('ide-schema-prop-velocidade')).toHaveTextContent('number');
  // A propriedade-título é marcada.
  expect(screen.getByTestId('ide-schema-prop-placa-title')).toBeInTheDocument();
  expect(screen.queryByTestId('ide-schema-prop-cor-title')).not.toBeInTheDocument();
});

it('F1: com transformerSlug, o editor carrega o source buscado (não DEFAULT_CODE)', async () => {
  Functions.get.mockResolvedValue({
    slug: 'normalize-text', display_name: 'Normalizar texto', language: 'python', version: 2,
    source: 'def transform(rows):\n    return rows\n',
  });
  render(<SandboxIDE transformerSlug="normalize-text" />);
  await waitFor(() => expect(Functions.get).toHaveBeenCalledWith('normalize-text'));
  await waitFor(() =>
    expect((screen.getByTestId('monaco') as HTMLTextAreaElement).value).toContain('def transform(rows):'),
  );
  // O DEFAULT_CODE foi substituído pelo source salvo.
  expect((screen.getByTestId('monaco') as HTMLTextAreaElement).value).not.toContain('AegisClient');
});

it('F1: source vazio/erro cai no fallback DEFAULT_CODE', async () => {
  Functions.get.mockResolvedValue({
    slug: 'empty-fn', display_name: 'Vazia', language: 'python', version: 1, source: null,
  });
  render(<SandboxIDE transformerSlug="empty-fn" />);
  await waitFor(() => expect(Functions.get).toHaveBeenCalledWith('empty-fn'));
  // source null → mantém DEFAULT_CODE.
  expect((screen.getByTestId('monaco') as HTMLTextAreaElement).value).toContain('AegisClient');
});

// ─── F2 — amostras reais da ingestão + painel de input ───────────────────────

it('F2 retrocompat: sem props, não busca amostras nem mostra o navegador', async () => {
  render(<SandboxIDE />);
  await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled());
  expect(screen.queryByTestId('ide-samples')).not.toBeInTheDocument();
  expect(screen.queryByTestId('ide-input-panel')).not.toBeInTheDocument();
  expect(Ontology.listNodes).not.toHaveBeenCalled();
});

it('F2: com nodeType, o navegador lista os objetos reais (nome + id curto)', async () => {
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'veiculo', display_name: 'Veículo', title_property: 'placa', count: 2,
    properties: [{ key: 'placa', type: 'string', label: 'Placa', is_title: true }],
    links: [], actions: [],
  });
  Ontology.listNodes.mockResolvedValue([
    { id: 'abcdef1234567890', name: 'Carro A', node_type: 'veiculo', properties: { placa: 'ABC1D23', cor: 'preto' }, schema_definition: {}, description: '', version: 1, created_by: 'u', signed_hash: null, created_at: '', updated_at: null },
    { id: 'zzzzzz9999999999', name: 'Carro B', node_type: 'veiculo', properties: { placa: 'XYZ9W87' }, schema_definition: {}, description: '', version: 1, created_by: 'u', signed_hash: null, created_at: '', updated_at: null },
  ]);
  render(<SandboxIDE nodeType="veiculo" />);
  await waitFor(() => expect(Ontology.listNodes).toHaveBeenCalledWith({ node_type: 'veiculo', limit: 10 }));
  expect(await screen.findByTestId('ide-samples')).toBeInTheDocument();
  const row = await screen.findByTestId('ide-sample-abcdef1234567890');
  expect(row).toHaveTextContent('Carro A');
  expect(screen.getByTestId('ide-sample-zzzzzz9999999999')).toHaveTextContent('Carro B');
});

it('F2: selecionar uma amostra preenche o painel de input com as properties', async () => {
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'veiculo', display_name: 'Veículo', title_property: 'placa', count: 1,
    properties: [{ key: 'placa', type: 'string', label: 'Placa', is_title: true }],
    links: [], actions: [],
  });
  Ontology.listNodes.mockResolvedValue([
    { id: 'abcdef1234567890', name: 'Carro A', node_type: 'veiculo', properties: { placa: 'ABC1D23', cor: 'preto' }, schema_definition: {}, description: '', version: 1, created_by: 'u', signed_hash: null, created_at: '', updated_at: null },
  ]);
  render(<SandboxIDE nodeType="veiculo" />);
  const row = await screen.findByTestId('ide-sample-abcdef1234567890');
  fireEvent.click(row);
  const panel = screen.getByTestId('ide-input-data') as HTMLTextAreaElement;
  await waitFor(() => expect(panel.value).toContain('ABC1D23'));
  expect(panel.value).toContain('preto');
  expect(panel.value).toContain('placa');
});

it('F2: "Sintetizar amostra" monta o esqueleto a partir do schema', async () => {
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'veiculo', display_name: 'Veículo', title_property: 'placa', count: 0,
    properties: [
      { key: 'placa', type: 'string', label: 'Placa', is_title: true },
      { key: 'velocidade', type: 'number', label: 'Velocidade', is_title: false },
      { key: 'ativo', type: 'boolean', label: 'Ativo', is_title: false },
      { key: 'tags', type: 'array', label: 'Tags', is_title: false },
    ],
    links: [], actions: [],
  });
  Ontology.listNodes.mockResolvedValue([]);
  render(<SandboxIDE nodeType="veiculo" />);
  await waitFor(() => expect(Ontology.objectTypeSchema).toHaveBeenCalledWith('veiculo'));
  // espera o schema CARREGAR (props renderizadas) antes de sintetizar — senão o
  // synthesize roda com schema ainda null e monta {} (corrida latente do teste).
  await screen.findByTestId('ide-schema-prop-placa');
  fireEvent.click(screen.getByTestId('ide-synthesize-sample'));
  const panel = screen.getByTestId('ide-input-data') as HTMLTextAreaElement;
  const skeleton = JSON.parse(panel.value);
  expect(skeleton).toEqual({ placa: '', velocidade: 0, ativo: false, tags: [] });
});

it('F2: o Run passa input_data quando o painel de input não está vazio', async () => {
  Sandbox.execute.mockResolvedValue({ session_id: 's', status: 'completed', exit_code: 0, stdout: 'ok', stderr: '', duration_ms: 1, code_hash: 'h' });
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'veiculo', display_name: 'Veículo', title_property: 'placa', count: 1,
    properties: [{ key: 'placa', type: 'string', label: 'Placa', is_title: true }],
    links: [], actions: [],
  });
  Ontology.listNodes.mockResolvedValue([
    { id: 'abcdef1234567890', name: 'Carro A', node_type: 'veiculo', properties: { placa: 'ABC1D23' }, schema_definition: {}, description: '', version: 1, created_by: 'u', signed_hash: null, created_at: '', updated_at: null },
  ]);
  render(<SandboxIDE nodeType="veiculo" />);
  fireEvent.click(await screen.findByTestId('ide-sample-abcdef1234567890'));
  await waitFor(() => expect((screen.getByTestId('ide-input-data') as HTMLTextAreaElement).value).toContain('ABC1D23'));
  fireEvent.click(screen.getByTestId('ide-run'));
  await waitFor(() => expect(Sandbox.execute).toHaveBeenCalled());
  const args = Sandbox.execute.mock.calls[0][0];
  expect(typeof args.input_data).toBe('string');
  expect(JSON.parse(args.input_data)).toEqual({ placa: 'ABC1D23' });
});

// ─── F3 — preview FIEL input→output + tempo ──────────────────────────────────

it('F3: com transformerSlug + amostras, "Pré-visualizar" chama previewBatch e renderiza saída + agregados + tempo', async () => {
  mockVeiculoContext();
  Functions.previewBatch.mockResolvedValue({
    per_object: [
      { input_keys: ['placa', 'velocidade'], output: { placa: 'ABC1D23', acima: true }, output_schema: { placa: 'string', acima: 'boolean' }, exit_code: 0, duration_ms: 11, ok: true, error: null },
      { input_keys: ['placa', 'velocidade'], output: { placa: 'XYZ9W87', acima: false }, output_schema: { placa: 'string', acima: 'boolean' }, exit_code: 0, duration_ms: 9, ok: true, error: null },
    ],
    rows_in: 2, rows_out: 2, total_ms: 20, avg_ms: 10,
    output_schema: { placa: 'string', acima: 'boolean' },
    declared_output: null, output_violations: [], strict_output: false,
  });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  await screen.findByTestId('ide-sample-abcdef1234567890');
  fireEvent.click(screen.getByTestId('ide-preview'));
  await waitFor(() => expect(Functions.previewBatch).toHaveBeenCalled());
  const [slug, body] = Functions.previewBatch.mock.calls[0];
  expect(slug).toBe('normalize-text');
  expect(body.draft).toBe(true);
  expect(body.inputs_list).toEqual([
    { placa: 'ABC1D23', velocidade: 80 },
    { placa: 'XYZ9W87', velocidade: 60 },
  ]);
  const panel = await screen.findByTestId('ide-preview-panel');
  // saída por objeto
  expect(panel).toHaveTextContent('ABC1D23');
  expect(panel).toHaveTextContent('acima');
  // agregados rows_in → rows_out + tempo
  const agg = screen.getByTestId('ide-preview-aggregates');
  expect(agg).toHaveTextContent('2');
  expect(agg).toHaveTextContent('20');
  expect(agg).toHaveTextContent('10');
  // modo fiel sinalizado
  expect(screen.getByTestId('ide-preview-mode')).toHaveTextContent('ide.previewModeFaithful');
});

it('F3: sem transformerSlug, o preview usa Sandbox.execute (modo rascunho)', async () => {
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'veiculo', display_name: 'Veículo', title_property: 'placa', count: 1,
    properties: [{ key: 'placa', type: 'string', label: 'Placa', is_title: true }],
    links: [], actions: [],
  });
  Ontology.listNodes.mockResolvedValue([
    { id: 'abcdef1234567890', name: 'Carro A', node_type: 'veiculo', properties: { placa: 'ABC1D23' }, schema_definition: {}, description: '', version: 1, created_by: 'u', signed_hash: null, created_at: '', updated_at: null },
  ]);
  Sandbox.execute.mockResolvedValue({ session_id: 's', status: 'completed', exit_code: 0, stdout: 'saida rascunho', stderr: '', duration_ms: 7, code_hash: 'h' });
  render(<SandboxIDE nodeType="veiculo" />);
  fireEvent.click(await screen.findByTestId('ide-sample-abcdef1234567890'));
  await waitFor(() => expect((screen.getByTestId('ide-input-data') as HTMLTextAreaElement).value).toContain('ABC1D23'));
  fireEvent.click(screen.getByTestId('ide-preview'));
  await waitFor(() => expect(Sandbox.execute).toHaveBeenCalled());
  expect(Functions.previewBatch).not.toHaveBeenCalled();
  // modo rascunho sinalizado
  expect(screen.getByTestId('ide-preview-mode')).toHaveTextContent('ide.previewModeDraft');
  expect(await screen.findByTestId('ide-preview-panel')).toHaveTextContent('saida rascunho');
});

it('F3 retrocompat: sem amostras (sem nodeType), o botão de preview de lote fica desabilitado', async () => {
  render(<SandboxIDE transformerSlug="normalize-text" />);
  await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled());
  expect((screen.getByTestId('ide-preview') as HTMLButtonElement).disabled).toBe(true);
});

// ─── F4 — contrato de SAÍDA: schema inferido + diff + aviso ───────────────────

it('F4: o painel de esquema de saída lista os tipos inferidos (chave · tipo)', async () => {
  mockVeiculoContext();
  Functions.previewBatch.mockResolvedValue({
    per_object: [
      { input_keys: ['placa', 'velocidade'], output: { placa: 'ABC1D23', acima: true }, output_schema: { placa: 'string', acima: 'boolean' }, exit_code: 0, duration_ms: 11, ok: true, error: null },
    ],
    rows_in: 1, rows_out: 1, total_ms: 11, avg_ms: 11,
    output_schema: { placa: 'string', acima: 'boolean' },
    declared_output: null, output_violations: [], strict_output: false,
  });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  await screen.findByTestId('ide-sample-abcdef1234567890');
  fireEvent.click(screen.getByTestId('ide-preview'));
  await waitFor(() => expect(Functions.previewBatch).toHaveBeenCalled());
  const out = await screen.findByTestId('ide-output-schema');
  expect(out).toHaveTextContent('placa');
  expect(out).toHaveTextContent('string');
  expect(out).toHaveTextContent('acima');
  expect(out).toHaveTextContent('boolean');
  // diff: 'acima' é chave ADICIONADA (não estava na entrada placa/velocidade).
  expect(screen.getByTestId('ide-output-schema-prop-acima')).toHaveTextContent('ide.diffAdded');
  // 'velocidade' estava na entrada e sumiu → REMOVIDA.
  expect(screen.getByTestId('ide-output-schema-prop-velocidade')).toHaveTextContent('ide.diffRemoved');
});

it('F4: output_violations não-vazio mostra o aviso; strict_output mostra o aviso de bloqueio', async () => {
  mockVeiculoContext();
  Functions.previewBatch.mockResolvedValue({
    per_object: [
      { input_keys: ['placa'], output: { placa: 123 }, output_schema: { placa: 'number' }, exit_code: 0, duration_ms: 5, ok: true, error: null },
    ],
    rows_in: 1, rows_out: 1, total_ms: 5, avg_ms: 5,
    output_schema: { placa: 'number' },
    declared_output: { placa: 'string' },
    output_violations: ['placa: esperado string, obteve number'],
    strict_output: true,
  });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  await screen.findByTestId('ide-sample-abcdef1234567890');
  fireEvent.click(screen.getByTestId('ide-preview'));
  await waitFor(() => expect(Functions.previewBatch).toHaveBeenCalled());
  const warn = await screen.findByTestId('ide-output-violations');
  expect(warn).toHaveTextContent('placa: esperado string, obteve number');
  // strict → texto de bloqueio.
  expect(screen.getByTestId('ide-output-violations-strict')).toHaveTextContent('ide.violationsStrict');
});

it('F4: declared_output null → sem aviso de contrato', async () => {
  mockVeiculoContext();
  Functions.previewBatch.mockResolvedValue({
    per_object: [
      { input_keys: ['placa'], output: { placa: 'ABC1D23' }, output_schema: { placa: 'string' }, exit_code: 0, duration_ms: 5, ok: true, error: null },
    ],
    rows_in: 1, rows_out: 1, total_ms: 5, avg_ms: 5,
    output_schema: { placa: 'string' },
    declared_output: null, output_violations: [], strict_output: false,
  });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  await screen.findByTestId('ide-sample-abcdef1234567890');
  fireEvent.click(screen.getByTestId('ide-preview'));
  await waitFor(() => expect(Functions.previewBatch).toHaveBeenCalled());
  await screen.findByTestId('ide-output-schema');
  expect(screen.queryByTestId('ide-output-violations')).not.toBeInTheDocument();
});

it('F3/F4 retrocompat: sem props, não há botão de preview de lote nem painéis de saída', async () => {
  render(<SandboxIDE />);
  await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled());
  // O preview de lote é contextual; sem nodeType/slug não aparece.
  expect(screen.queryByTestId('ide-preview-panel')).not.toBeInTheDocument();
  expect(screen.queryByTestId('ide-output-schema')).not.toBeInTheDocument();
  expect(Functions.previewBatch).not.toHaveBeenCalled();
});

// ─── F5 — salvar amostra como teste + rodar testes na IDE ─────────────────────

it('F5: "Salvar como teste" chama createTest com o inputData atual como inputs', async () => {
  mockVeiculoContext();
  Functions.tests.mockResolvedValue([]);
  Functions.createTest.mockResolvedValue({ id: 't1', name: 'acima', inputs: {}, expected_contains: [], assertions: [], last_status: 'never_run', last_output: null });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  // Carrega uma amostra real → preenche o inputData.
  fireEvent.click(await screen.findByTestId('ide-sample-abcdef1234567890'));
  await waitFor(() => expect((screen.getByTestId('ide-input-data') as HTMLTextAreaElement).value).toContain('ABC1D23'));
  // Abre o painel de testes e o form.
  fireEvent.click(screen.getByTestId('ide-tests-toggle'));
  fireEvent.click(screen.getByTestId('ide-test-save-toggle'));
  fireEvent.change(screen.getByTestId('ide-test-name'), { target: { value: 'acima do limite' } });
  fireEvent.click(screen.getByTestId('ide-test-save'));
  await waitFor(() => expect(Functions.createTest).toHaveBeenCalled());
  const [slug, body] = Functions.createTest.mock.calls[0];
  expect(slug).toBe('normalize-text');
  expect(body.name).toBe('acima do limite');
  expect(body.inputs).toEqual({ placa: 'ABC1D23', velocidade: 80 });
});

it('F5: a lista de testes mostra o last_status e "Rodar testes" chama runAllTests', async () => {
  mockVeiculoContext();
  Functions.tests.mockResolvedValue([
    { id: 't1', name: 'caso ok', inputs: {}, expected_contains: [], assertions: [], last_status: 'pass', last_output: null },
    { id: 't2', name: 'caso ruim', inputs: {}, expected_contains: [], assertions: [], last_status: 'fail', last_output: null },
    { id: 't3', name: 'caso novo', inputs: {}, expected_contains: [], assertions: [], last_status: 'never_run', last_output: null },
  ]);
  Functions.runAllTests.mockResolvedValue({ total: 3, passed: 2, failed: 1, results: [] });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  fireEvent.click(await screen.findByTestId('ide-tests-toggle'));
  await waitFor(() => expect(Functions.tests).toHaveBeenCalledWith('normalize-text'));
  // last_status por teste (ícone com aria-label).
  expect(await screen.findByTestId('ide-test-t1-pass')).toBeInTheDocument();
  expect(screen.getByTestId('ide-test-t2-fail')).toBeInTheDocument();
  expect(screen.getByTestId('ide-test-t3-never_run')).toBeInTheDocument();
  // Rodar todos → resumo passed/failed.
  fireEvent.click(screen.getByTestId('ide-test-run-all'));
  await waitFor(() => expect(Functions.runAllTests).toHaveBeenCalledWith('normalize-text'));
  const summary = await screen.findByTestId('ide-test-summary');
  expect(summary).toHaveTextContent('2');
  expect(summary).toHaveTextContent('1');
});

it('F5: "Rodar" por teste chama runTest e atualiza o status do item', async () => {
  mockVeiculoContext();
  Functions.tests.mockResolvedValue([
    { id: 't1', name: 'caso', inputs: {}, expected_contains: [], assertions: [], last_status: 'never_run', last_output: null },
  ]);
  Functions.runTest.mockResolvedValue({ id: 't1', name: 'caso', inputs: {}, expected_contains: [], assertions: [], last_status: 'pass', last_output: 'ok' });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  fireEvent.click(await screen.findByTestId('ide-tests-toggle'));
  fireEvent.click(await screen.findByTestId('ide-test-run-t1'));
  await waitFor(() => expect(Functions.runTest).toHaveBeenCalledWith('normalize-text', 't1'));
  expect(await screen.findByTestId('ide-test-t1-pass')).toBeInTheDocument();
});

// ─── F6 — asserções por campo + histórico ────────────────────────────────────

it('F6: o builder adiciona uma linha {field,op,value} e ela vai no createTest', async () => {
  mockVeiculoContext();
  Functions.tests.mockResolvedValue([]);
  Functions.previewBatch.mockResolvedValue({
    per_object: [{ input_keys: ['placa'], output: { placa: 'ABC1D23', acima: true }, output_schema: { placa: 'string', acima: 'boolean' }, exit_code: 0, duration_ms: 5, ok: true, error: null }],
    rows_in: 1, rows_out: 1, total_ms: 5, avg_ms: 5,
    output_schema: { placa: 'string', acima: 'boolean' },
    declared_output: null, output_violations: [], strict_output: false,
  });
  Functions.createTest.mockResolvedValue({ id: 't1', name: 'x', inputs: {}, expected_contains: [], assertions: [], last_status: 'never_run', last_output: null });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  // Roda o preview → popula o output_schema → o dropdown de campo ganha opções.
  fireEvent.click(await screen.findByTestId('ide-sample-abcdef1234567890'));
  fireEvent.click(screen.getByTestId('ide-preview'));
  await waitFor(() => expect(Functions.previewBatch).toHaveBeenCalled());
  // Abre o painel de testes + form + builder.
  fireEvent.click(screen.getByTestId('ide-tests-toggle'));
  fireEvent.click(screen.getByTestId('ide-test-save-toggle'));
  fireEvent.change(screen.getByTestId('ide-test-name'), { target: { value: 'asserção' } });
  fireEvent.click(screen.getByTestId('ide-assertion-add'));
  // O campo é um dropdown populado pelo output_schema.
  fireEvent.change(screen.getByTestId('ide-assertion-field-0'), { target: { value: 'acima' } });
  fireEvent.change(screen.getByTestId('ide-assertion-op-0'), { target: { value: 'eq' } });
  fireEvent.change(screen.getByTestId('ide-assertion-value-0'), { target: { value: 'true' } });
  fireEvent.click(screen.getByTestId('ide-test-save'));
  await waitFor(() => expect(Functions.createTest).toHaveBeenCalled());
  const [, body] = Functions.createTest.mock.calls[0];
  expect(body.assertions).toEqual([{ field: 'acima', op: 'eq', value: true }]);
});

it('F6: op=type usa um dropdown de tipos como value', async () => {
  mockVeiculoContext();
  Functions.tests.mockResolvedValue([]);
  Functions.createTest.mockResolvedValue({ id: 't1', name: 'x', inputs: {}, expected_contains: [], assertions: [], last_status: 'never_run', last_output: null });
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  fireEvent.click(await screen.findByTestId('ide-sample-abcdef1234567890'));
  await waitFor(() => expect((screen.getByTestId('ide-input-data') as HTMLTextAreaElement).value).toContain('ABC1D23'));
  fireEvent.click(screen.getByTestId('ide-tests-toggle'));
  fireEvent.click(screen.getByTestId('ide-test-save-toggle'));
  fireEvent.change(screen.getByTestId('ide-test-name'), { target: { value: 'tipo' } });
  fireEvent.click(screen.getByTestId('ide-assertion-add'));
  fireEvent.change(screen.getByTestId('ide-assertion-field-0'), { target: { value: 'placa' } });
  fireEvent.change(screen.getByTestId('ide-assertion-op-0'), { target: { value: 'type' } });
  // value vira dropdown de tipos.
  fireEvent.change(screen.getByTestId('ide-assertion-value-0'), { target: { value: 'string' } });
  fireEvent.click(screen.getByTestId('ide-test-save'));
  await waitFor(() => expect(Functions.createTest).toHaveBeenCalled());
  const [, body] = Functions.createTest.mock.calls[0];
  expect(body.assertions).toEqual([{ field: 'placa', op: 'type', value: 'string' }]);
});

it('F6: o histórico lista os runs (verdict + ator)', async () => {
  mockVeiculoContext();
  Functions.tests.mockResolvedValue([]);
  Functions.testRuns.mockResolvedValue([
    { verdict: 'pass', test_name: 'caso ok', test_id: 't1', actor: 'ferreira', at: '2026-06-05T10:00:00Z' },
    { verdict: 'fail', test_name: 'caso ruim', test_id: 't2', actor: 'silva', at: '2026-06-04T09:00:00Z' },
  ]);
  render(<SandboxIDE nodeType="veiculo" transformerSlug="normalize-text" />);
  fireEvent.click(await screen.findByTestId('ide-tests-toggle'));
  fireEvent.click(screen.getByTestId('ide-test-history-toggle'));
  await waitFor(() => expect(Functions.testRuns).toHaveBeenCalledWith('normalize-text'));
  const hist = await screen.findByTestId('ide-test-history');
  expect(hist).toHaveTextContent('caso ok');
  expect(hist).toHaveTextContent('ferreira');
  expect(hist).toHaveTextContent('caso ruim');
  expect(hist).toHaveTextContent('silva');
});

it('F5/F6 retrocompat: sem transformerSlug, a seção de testes fica desabilitada e não aparece', async () => {
  render(<SandboxIDE nodeType="veiculo" />);
  await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled());
  // O toggle existe mas está desabilitado (hint), e o painel não renderiza.
  const toggle = screen.getByTestId('ide-tests-toggle') as HTMLButtonElement;
  expect(toggle.disabled).toBe(true);
  fireEvent.click(toggle);
  expect(screen.queryByTestId('ide-tests-panel')).not.toBeInTheDocument();
  expect(Functions.tests).not.toHaveBeenCalled();
});

it('F5/F6 retrocompat geral: sem props, sem toggle de testes ativo e sem chamadas de teste', async () => {
  render(<SandboxIDE />);
  await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled());
  // O toggle aparece (na toolbar) mas desabilitado; nenhuma chamada de teste.
  expect((screen.getByTestId('ide-tests-toggle') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByTestId('ide-tests-panel')).not.toBeInTheDocument();
  expect(Functions.tests).not.toHaveBeenCalled();
  expect(Functions.createTest).not.toHaveBeenCalled();
});

// ─── O3c — contrato BATCH (nó de código do pipeline) ─────────────────────────
// O sandbox roda o source CRU: a Function lê input.json {rows} e imprime {rows}
// (contrato de _apply_code_step). A IDE em contract='batch' semeia o esqueleto
// batch, prima o input com as linhas reais e roda o preview rows-aware.
describe('O3c — contrato BATCH', () => {
  it('semeia o esqueleto BATCH (input.json {rows} → print {rows}), nunca o per-object', async () => {
    render(<SandboxIDE contract="batch" batchColumns={['cnpj', 'uf']} batchSampleRows={[{ cnpj: '00', uf: 'SP' }]} />);
    const ed = (await screen.findByTestId('monaco')) as HTMLTextAreaElement;
    await waitFor(() => expect(ed.value).toContain('input.json'));
    expect(ed.value).toContain('print(json.dumps({"rows"');
    expect(ed.value).toContain('cnpj'); // colunas reais da entrada citadas
    expect(ed.value).not.toContain('def transform(obj)'); // não é o per-object
    expect(ed.value).not.toContain('AegisClient'); // não é o DEFAULT_CODE
  });

  it('prima o painel de input com {rows:[...]} e o Run passa esse input_data', async () => {
    Sandbox.execute.mockResolvedValue({ session_id: 's', status: 'completed', exit_code: 0, stdout: 'ok', stderr: '', duration_ms: 1, code_hash: 'h' });
    render(<SandboxIDE contract="batch" batchColumns={['cnpj']} batchSampleRows={[{ cnpj: '00' }, { cnpj: '11' }]} />);
    const panel = (await screen.findByTestId('ide-input-data')) as HTMLTextAreaElement;
    await waitFor(() => expect(panel.value).toContain('rows'));
    expect(JSON.parse(panel.value)).toEqual({ rows: [{ cnpj: '00' }, { cnpj: '11' }] });
    fireEvent.click(screen.getByTestId('ide-run'));
    await waitFor(() => expect(Sandbox.execute).toHaveBeenCalled());
    expect(JSON.parse(Sandbox.execute.mock.calls[0][0].input_data)).toEqual({ rows: [{ cnpj: '00' }, { cnpj: '11' }] });
  });

  it('com Function salva, o preview fiel manda inputs_list=[{rows:[...]}] (espelha _apply_code_step)', async () => {
    Functions.get.mockResolvedValue({ slug: 'code_x', display_name: 'Código', language: 'python', version: 1, source: 'import json\nprint(json.dumps({"rows": []}))\n' });
    Functions.previewBatch.mockResolvedValue({
      per_object: [{ input_keys: ['rows'], output: { rows: [{ cnpj: '00' }] }, output_schema: { rows: 'array' }, exit_code: 0, duration_ms: 4, ok: true, error: null }],
      rows_in: 1, rows_out: 1, total_ms: 4, avg_ms: 4, output_schema: { rows: 'array' }, declared_output: null, output_violations: [], strict_output: false,
    });
    render(<SandboxIDE contract="batch" transformerSlug="code_x" batchColumns={['cnpj']} batchSampleRows={[{ cnpj: '00' }]} />);
    await waitFor(() => expect((screen.getByTestId('ide-input-data') as HTMLTextAreaElement).value).toContain('cnpj'));
    fireEvent.click(screen.getByTestId('ide-preview'));
    await waitFor(() => expect(Functions.previewBatch).toHaveBeenCalled());
    const [slug, body] = Functions.previewBatch.mock.calls[0];
    expect(slug).toBe('code_x');
    expect(body.inputs_list).toEqual([{ rows: [{ cnpj: '00' }] }]); // 1 entrada embrulhando TODAS as linhas
  });

  it('retrocompat: contract padrão ("object") ignora batchColumns e mantém o DEFAULT_CODE', async () => {
    render(<SandboxIDE batchColumns={['cnpj']} batchSampleRows={[{ cnpj: '00' }]} />);
    await waitFor(() => expect(Codegen.sdkSymbols).toHaveBeenCalled());
    const ed = screen.getByTestId('monaco') as HTMLTextAreaElement;
    expect(ed.value).toContain('AegisClient'); // sem contract='batch', nada muda
    expect(ed.value).not.toContain('input.json');
    expect(screen.queryByTestId('ide-input-panel')).not.toBeInTheDocument();
  });
});

// #1 — "Gerar com AIP" mantém o HEADER (imports + comentários de contrato)
// intocável e troca só o corpo. Cobre mergeGeneratedIntoHeader (função pura).
describe('mergeGeneratedIntoHeader (#1 header intocável)', () => {
  const SKELETON = [
    'from aegis import AegisClient',
    '',
    'c = AegisClient()  # autentica como o operador (token efêmero do sandbox)',
    '',
    '# Transformador de "PerfilInstagram".',
    '# ENTRADA (cada objeto vindo da Coleta) tem estas propriedades:',
    '#   - username (text)',
    '# SAÍDA: retorne um dict gravando o resultado na propriedade "contexto_gerado".',
    '',
    'def transform(obj):',
    '    props = obj.get("properties", {})',
    '    return {"contexto_gerado": None}',
    '',
  ].join('\n');

  it('preserva o header de contrato byte-idêntico e troca só a função', () => {
    const gen = 'def transform(rows):\n    return [r for r in rows if r]\n';
    const out = mergeGeneratedIntoHeader(SKELETON, gen);
    // comentários de contrato INTOCÁVEIS
    expect(out).toContain('# Transformador de "PerfilInstagram".');
    expect(out).toContain('# ENTRADA (cada objeto vindo da Coleta) tem estas propriedades:');
    expect(out).toContain('# SAÍDA: retorne um dict gravando o resultado na propriedade "contexto_gerado".');
    expect(out).toContain('from aegis import AegisClient');
    // corpo NOVO entrou; corpo VELHO saiu
    expect(out).toContain('def transform(rows):');
    expect(out).not.toContain('def transform(obj):');
    expect(out).not.toContain('"contexto_gerado": None');
    // header vem ANTES do corpo
    expect(out.indexOf('# ENTRADA')).toBeLessThan(out.indexOf('def transform(rows):'));
  });

  it('adiciona import novo do gerado após os imports, sem tocar nos comentários', () => {
    const gen = 'from aegis import inference\n\ndef transform(rows):\n    return inference.run(rows)\n';
    const out = mergeGeneratedIntoHeader(SKELETON, gen);
    expect(out).toContain('from aegis import inference'); // import novo adicionado
    expect(out).toContain('from aegis import AegisClient'); // import original mantido
    expect(out).toContain('# ENTRADA (cada objeto vindo da Coleta) tem estas propriedades:'); // contrato intocável
    // o import novo fica ANTES dos comentários de contrato (na seção de imports)
    expect(out.indexOf('from aegis import inference')).toBeLessThan(out.indexOf('# Transformador'));
  });

  it('sem def/class no atual (script solto) → substitui pelo gerado', () => {
    const current = 'from aegis import AegisClient\n\ntipos = AegisClient().ontology.osdk_manifest()\nprint(tipos)\n';
    const gen = 'def main():\n    return 1\n';
    expect(mergeGeneratedIntoHeader(current, gen)).toBe(gen);
  });
});
