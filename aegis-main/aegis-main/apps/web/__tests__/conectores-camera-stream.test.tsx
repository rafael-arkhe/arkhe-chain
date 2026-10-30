/**
 * Tarefa B — camera.stream na central de conectores com DROPDOWN de câmeras.
 *
 * O param 'camera' declara dynamic_source='cameras' no catálogo; o form de
 * binding (criação) E o modal Configurar renderizam um select populado via
 * Cctv.streams.list() — operador nunca digita identificador. O submit envia o
 * ID do stream; com o backend de câmeras fora, degrada pra input livre com
 * hint (a skill resolve id/URL/nome igual).
 *
 * Cobre:
 *  (a) camera.stream aparece no seletor de skills da central (é conector);
 *  (b) escolher camera.stream → campo 'camera' é SELECT populado; submit envia
 *      o id pelo trilho genérico (registerSkill);
 *  (c) Cctv fora → fallback input livre; o valor digitado viaja no submit;
 *  (d) modal Configurar usa o MESMO select, pré-selecionado com o binding.
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
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Connectors: {
    list: jest.fn(), register: jest.fn(), registerSkill: jest.fn(), test: jest.fn(),
    run: jest.fn(), schedulerTick: jest.fn(), syncPreview: jest.fn(), update: jest.fn(),
    runs: jest.fn(), retryRun: jest.fn(), bindings: jest.fn(),
  },
  ActionTypes: { list: jest.fn(), execute: jest.fn() },
  Skills: { catalog: jest.fn() },
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Markings: { list: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn() } },
}));

const { Connectors, ActionTypes, Skills, Ontology, Markings } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
  ActionTypes: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
};
const { Cctv } = jest.requireMock('@/lib/api/cctv') as {
  Cctv: { streams: { list: jest.Mock } };
};

// Catálogo real (GET /governance/agents/skills): o param 'camera' declara
// dynamic_source='cameras' (SkillParamRow serializa — guarda backend em
// tests/unit/test_camera_param_dynamic_source.py do ontology-module).
const CATALOG = [
  {
    skill_key: 'connector.http', label: 'Conector HTTP', description: '',
    category: 'ingestion', source: 'native', platforms: [], requires_secrets: [],
    param_schema: [],
  },
  {
    skill_key: 'camera.stream', label: 'Câmera (sensor dedicado)',
    description: 'Liga UMA câmera como conector dedicado.',
    category: 'vision', source: 'native', platforms: [], requires_secrets: [],
    param_schema: [
      { key: 'camera', label: 'Câmera', param_type: 'string', required: true, default: null, description: '', enum_values: [], placeholder: 'id, URL ou nome da câmera', dynamic_source: 'cameras' },
      { key: 'frames', label: 'Quadros por execução', param_type: 'int', required: false, default: 4, description: '', enum_values: [], min: 1, max: 16 },
      { key: 'push', label: 'Envio automático das detecções', param_type: 'bool', required: false, default: true, description: '', enum_values: [] },
    ],
  },
];

const STREAMS = [
  { id: 'cam-1', name: 'Portaria Norte', url: 'rtsp://a/1', status: 'online' },
  { id: 'cam-2', name: 'Garagem', url: 'rtsp://a/2', status: 'online' },
];

beforeEach(() => {
  jest.clearAllMocks();
  Connectors.list.mockResolvedValue([]);
  Skills.catalog.mockResolvedValue(CATALOG);
  Cctv.streams.list.mockResolvedValue(STREAMS);
  // form HTTP default (aberto antes de escolher camera.stream) carrega estes:
  Ontology.listNodeTypes.mockResolvedValue([]);
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'x', display_name: 'X', title_property: 'id', count: 0,
    properties: [], links: [], actions: [],
  });
  Markings.list.mockResolvedValue([]);
});

async function openForm() {
  render(<ConectoresWorkspace />);
  await waitFor(() => expect(Connectors.list).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('conectores-novo'));
  await screen.findByTestId('conectores-form');
}

async function pickCameraStream() {
  await openForm();
  // espera o catálogo popular o seletor de skill
  await screen.findByRole('option', { name: 'skills.camera.stream.label' });
  fireEvent.change(screen.getByTestId('cf-skill'), { target: { value: 'camera.stream' } });
}

it('(a) camera.stream aparece no seletor de skills da central (é conector)', async () => {
  await openForm();
  const sel = (await screen.findByTestId('cf-skill')) as HTMLSelectElement;
  await screen.findByRole('option', { name: 'skills.camera.stream.label' });
  expect(Array.from(sel.options).map((o) => o.value)).toContain('camera.stream');
});

it('(b) campo camera é SELECT populado com as câmeras; submit envia o ID', async () => {
  Connectors.registerSkill.mockResolvedValue({ id: 'a7', slug: 'cam-portaria' });
  await pickCameraStream();
  // dropdown populado via Cctv.streams.list (label = nome; value = id)
  const cam = await waitFor(() => {
    const el = screen.getByTestId('cf-skill-param-field-camera') as HTMLSelectElement;
    expect(el.tagName).toBe('SELECT');
    expect(el.disabled).toBe(false);
    return el;
  });
  expect(Array.from(cam.options).map((o) => o.text)).toEqual(
    expect.arrayContaining(['Portaria Norte', 'Garagem']),
  );
  fireEvent.change(cam, { target: { value: 'cam-1' } });
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'cam-portaria' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await waitFor(() => expect(Connectors.registerSkill).toHaveBeenCalled());
  expect(Connectors.registerSkill).toHaveBeenCalledWith(expect.objectContaining({
    skill_key: 'camera.stream',
    config: expect.objectContaining({ camera: 'cam-1', frames: 4, push: true }),
  }));
});

it('(b2) camera obrigatória vazia bloqueia o submit com mensagem honesta', async () => {
  await pickCameraStream();
  await waitFor(() => {
    expect((screen.getByTestId('cf-skill-param-field-camera') as HTMLSelectElement).disabled).toBe(false);
  });
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'cam-x' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await screen.findByTestId('conectores-error');
  expect(screen.getByTestId('conectores-error')).toHaveTextContent('conectores.err.required_param');
  expect(Connectors.registerSkill).not.toHaveBeenCalled();
});

it('(c) Cctv fora → fallback input livre com hint; o valor digitado viaja', async () => {
  Cctv.streams.list.mockRejectedValue(new Error('503'));
  Connectors.registerSkill.mockResolvedValue({ id: 'a8', slug: 'cam-manual' });
  await pickCameraStream();
  const input = await waitFor(() => {
    const el = screen.getByTestId('cf-skill-param-field-camera');
    expect(el.tagName).toBe('INPUT');
    return el as HTMLInputElement;
  });
  expect(screen.getByTestId('cf-skill-param-field-camera-hint')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'rtsp://cam/3' } });
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'cam-manual' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await waitFor(() => expect(Connectors.registerSkill).toHaveBeenCalled());
  expect(Connectors.registerSkill).toHaveBeenCalledWith(expect.objectContaining({
    config: expect.objectContaining({ camera: 'rtsp://cam/3' }),
  }));
});

it('(d) modal Configurar usa o MESMO select, pré-selecionado com o binding', async () => {
  const AGENT = {
    id: 'a1', slug: 'cam-portaria', display_name: 'Câmera Portaria', kind: 'worker',
    status: 'active', config: {}, created_at: '', skill_keys: ['camera.stream'],
    schedule: '15min',
  };
  Connectors.list.mockResolvedValue([AGENT]);
  Connectors.bindings.mockResolvedValue([
    { id: 'b1', skill_key: 'camera.stream', config: { camera: 'cam-2', frames: 6 }, active: true },
  ]);
  ActionTypes.list.mockResolvedValue([
    { id: 'at-1', code_ref: 'aegis.connector.configure' },
  ]);
  ActionTypes.execute.mockResolvedValue({ status: 'SUCCESS', output: { ok: true } });

  render(<ConectoresWorkspace />);
  const btn = await screen.findByTestId('conector-configurar-cam-portaria');
  fireEvent.click(btn);
  await screen.findByTestId('conector-configurar-modal');
  const cam = await waitFor(() => {
    const el = screen.getByTestId('cf-cfg-field-camera') as HTMLSelectElement;
    expect(el.tagName).toBe('SELECT');
    expect(el.disabled).toBe(false);
    return el;
  });
  // pré-selecionado com a config atual do binding
  expect(cam.value).toBe('cam-2');
  // trocar a câmera e aplicar → action governada recebe o NOVO id
  fireEvent.change(cam, { target: { value: 'cam-1' } });
  fireEvent.click(screen.getByTestId('conector-configurar-submit'));
  await waitFor(() => expect(ActionTypes.execute).toHaveBeenCalled());
  expect(ActionTypes.execute).toHaveBeenCalledWith('at-1', expect.objectContaining({
    connector: 'cam-portaria',
    params: expect.objectContaining({ camera: 'cam-1' }),
  }));
});
