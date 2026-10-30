/**
 * Tarefa H (2026-06-11) — botão "Configurar" da central de conectores usa a
 * ACTION GOVERNADA ``aegis.connector.configure`` (trilho de invoke da
 * plataforma: ActionTypes.list → casa por code_ref → ActionTypes.execute),
 * NUNCA o PATCH cru de governança.
 *
 * Cobre:
 *  - botão abre modal (dialog REAL, nunca nativo) com o MESMO form dinâmico do
 *    param_schema da skill, PRÉ-PREENCHIDO com a config atual do binding;
 *  - submit invoca a action com {connector, params} corretos (só chaves do
 *    param_schema viajam; chave fora do schema fica de fora) e atualiza a listagem;
 *  - mensagens de clamp do servidor renderizadas como avisos;
 *  - PENDING_APPROVAL (confirm-mode/4-olhos) vira mensagem honesta na linha;
 *  - sem connectors.manage → botão não existe (useCan).
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
// Tarefa H — gate de permissão do botão Configurar (padrão useCan).
const mockCan = jest.fn((_key: string) => true);
jest.mock('@/lib/auth/useAuth', () => ({ useCan: (k: string) => mockCan(k) }));
jest.mock('@/lib/api', () => ({
  Connectors: {
    list: jest.fn(), register: jest.fn(), registerSkill: jest.fn(), test: jest.fn(),
    run: jest.fn(), schedulerTick: jest.fn(), syncPreview: jest.fn(), update: jest.fn(),
    runs: jest.fn(), retryRun: jest.fn(), bindings: jest.fn(),
  },
  // Trilho de actions da plataforma (o MESMO client do resto da UI).
  ActionTypes: { list: jest.fn(), execute: jest.fn() },
  Skills: { catalog: jest.fn() },
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Markings: { list: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));

const { Connectors, ActionTypes, Skills, Ontology, Markings } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
  ActionTypes: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
};

const CONN = {
  id: 'a1', slug: 'detec', display_name: 'Detecção contínua', kind: 'worker',
  status: 'active', config: {}, created_at: '', skill_keys: ['camera.detect_tick'],
  schedule: '15min',
};

// Catálogo real (GET /governance/agents/skills): param_schema declarado da skill
// dirige o form do modal — o MESMO SchemaForm do form de criação.
const CATALOG = [
  {
    skill_key: 'camera.detect_tick', label: 'Detecção contínua de câmeras',
    description: '', category: 'vision', source: 'native', platforms: [],
    requires_secrets: [],
    param_schema: [
      { key: 'frames', label: 'Quadros por câmera', param_type: 'int', required: false, default: 4, description: '', enum_values: [], min: 1, max: 16 },
      { key: 'push', label: 'Envio automático', param_type: 'bool', required: false, default: true, description: '', enum_values: [] },
    ],
  },
];

// ActionType GLOBAL seedada no backend (ensure_builtin_action_types):
// resolvida por code_ref via o trilho da plataforma — nunca id chumbado.
const CONFIGURE_AT = {
  id: 'at-configure', tenant_id: null, name: 'connector.configure',
  description: '', input_schema: { x_target_kind: 'conector' }, output_schema: {},
  code_ref: 'aegis.connector.configure', requires_markings: [], requires_clearances: [],
  timeout_seconds: 60, auto_approvable: false, validations: [], version: 1, created_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCan.mockReturnValue(true);
  Connectors.list.mockResolvedValue([CONN]);
  // Config ATUAL vem do binding real do agente (inclui chave fora do schema —
  // ela NÃO pode viajar no submit).
  Connectors.bindings.mockResolvedValue([
    { id: 'b1', skill_key: 'camera.detect_tick', config: { frames: 6, push: false, node_type: 'leitura' }, active: true },
  ]);
  Skills.catalog.mockResolvedValue(CATALOG);
  ActionTypes.list.mockResolvedValue([CONFIGURE_AT]);
  ActionTypes.execute.mockResolvedValue({
    execution_id: 'e1', status: 'SUCCESS',
    output: { ok: true, action: 'connector.configure', result: { applied: ['frames', 'push'], clamped: [] } },
    duration_ms: 5, lineage_event_id: 'l1',
  });
  Ontology.listNodeTypes.mockResolvedValue([]);
  Ontology.objectTypeSchema.mockResolvedValue({ kind: 'x', display_name: 'X', title_property: 'name', count: 0, properties: [], links: [], actions: [] });
  Markings.list.mockResolvedValue([]);
});

async function openModal() {
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-detec');
  fireEvent.click(screen.getByTestId('conector-configurar-detec'));
  await screen.findByTestId('conector-configurar-modal');
}

it('Configurar abre modal com o form do param_schema PRÉ-PREENCHIDO com a config atual', async () => {
  await openModal();
  await waitFor(() => expect(Connectors.bindings).toHaveBeenCalledWith('a1'));
  // form dinâmico = o MESMO SchemaForm, dirigido pelo param_schema da skill
  const frames = (await screen.findByTestId('cf-cfg-field-frames')) as HTMLInputElement;
  await waitFor(() => expect(frames.value).toBe('6'));
  const push = screen.getByTestId('cf-cfg-field-push') as HTMLInputElement;
  expect(push.checked).toBe(false);
  // nunca diálogo nativo: é um dialog real
  expect(screen.getByTestId('conector-configurar-modal')).toHaveAttribute('aria-modal', 'true');
});

it('submit invoca a ACTION governada com {connector, params} (só chaves do schema) e atualiza a listagem', async () => {
  await openModal();
  const frames = (await screen.findByTestId('cf-cfg-field-frames')) as HTMLInputElement;
  await waitFor(() => expect(frames.value).toBe('6'));
  fireEvent.change(frames, { target: { value: '12' } });
  fireEvent.click(screen.getByTestId('conector-configurar-submit'));
  // trilho da plataforma: resolve a ActionType por code_ref e executa por id
  await waitFor(() => expect(ActionTypes.execute).toHaveBeenCalledWith(
    'at-configure',
    { connector: 'detec', params: { frames: 12, push: false } },
  ));
  // node_type (chave do binding FORA do param_schema) não viaja
  const sent = ActionTypes.execute.mock.calls[0][1];
  expect(sent.params).not.toHaveProperty('node_type');
  // listagem atualiza (re-lê o espelho) e o modal fecha (sem clamps)
  await waitFor(() => expect(Connectors.list).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByTestId('conector-configurar-modal')).toBeNull());
  expect(screen.getByTestId('conector-res-detec')).toHaveTextContent('conectores.configure.applied');
});

it('mensagens de clamp do servidor são renderizadas como avisos (modal permanece aberto)', async () => {
  ActionTypes.execute.mockResolvedValue({
    execution_id: 'e2', status: 'SUCCESS',
    output: {
      ok: true, action: 'connector.configure',
      result: { applied: ['frames'], clamped: ['Quadros por câmera (frames): 99 → 16 (máx. declarado).'] },
    },
    duration_ms: 5, lineage_event_id: 'l2',
  });
  await openModal();
  const frames = (await screen.findByTestId('cf-cfg-field-frames')) as HTMLInputElement;
  await waitFor(() => expect(frames.value).toBe('6'));
  fireEvent.click(screen.getByTestId('conector-configurar-submit'));
  const clamps = await screen.findByTestId('conector-configurar-clamps');
  expect(clamps).toHaveTextContent('conectores.configure.clamped');
  expect(clamps).toHaveTextContent('Quadros por câmera (frames): 99 → 16 (máx. declarado).');
  // a listagem ainda atualiza (a config FOI aplicada, só que clampada)
  await waitFor(() => expect(Connectors.list).toHaveBeenCalledTimes(2));
});

it('PENDING_APPROVAL (confirm-mode/4-olhos) fecha o modal e mostra mensagem honesta na linha', async () => {
  ActionTypes.execute.mockResolvedValue({
    execution_id: null, status: 'PENDING_APPROVAL',
    output: { approval_id: 'ap1' }, duration_ms: 0, lineage_event_id: 'l3',
    approval_id: 'ap1',
  });
  await openModal();
  const frames = (await screen.findByTestId('cf-cfg-field-frames')) as HTMLInputElement;
  await waitFor(() => expect(frames.value).toBe('6'));
  fireEvent.click(screen.getByTestId('conector-configurar-submit'));
  await waitFor(() => expect(screen.queryByTestId('conector-configurar-modal')).toBeNull());
  expect(screen.getByTestId('conector-res-detec')).toHaveTextContent('conectores.configure.pending');
});

it('valor fora do min/max declarado bloqueia o submit client-side (defesa em profundidade)', async () => {
  await openModal();
  const frames = (await screen.findByTestId('cf-cfg-field-frames')) as HTMLInputElement;
  await waitFor(() => expect(frames.value).toBe('6'));
  fireEvent.change(frames, { target: { value: '99' } });
  fireEvent.click(screen.getByTestId('conector-configurar-submit'));
  expect(await screen.findByTestId('conector-configurar-err')).toHaveTextContent('conectores.err.param_range');
  expect(ActionTypes.execute).not.toHaveBeenCalled();
});

it('sem connectors.manage → botão Configurar não existe', async () => {
  mockCan.mockReturnValue(false);
  render(<ConectoresWorkspace />);
  await screen.findByTestId('conector-card-detec');
  expect(mockCan).toHaveBeenCalledWith('connectors.manage');
  expect(screen.queryByTestId('conector-configurar-detec')).toBeNull();
});
