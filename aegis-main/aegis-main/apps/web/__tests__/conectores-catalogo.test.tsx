/**
 * Sprint 1 — form "Adicionar conector" CATALOG-DRIVEN (2026-06-11).
 *
 * Cobre: o seletor de skill é um dropdown populado pelo catálogo real
 * (GET /governance/agents/skills) filtrado por isConnectorSkill + prontas
 * (native; clawhub requer ativação) — nunca digitar a key na mão; escolher
 * camera.detect_tick renderiza o FORM DINÂMICO do param_schema (int→número,
 * bool→toggle, string→texto, enum→select; defaults pré-preenchidos); o submit
 * POSTa pelo trilho genérico (Agent worker + SkillBinding com a config);
 * connector.http continua o default e sem regressão (form HTTP idêntico).
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
    list: jest.fn(), register: jest.fn(), registerSkill: jest.fn(), test: jest.fn(),
    run: jest.fn(), schedulerTick: jest.fn(), syncPreview: jest.fn(), update: jest.fn(),
    runs: jest.fn(), retryRun: jest.fn(),
  },
  Skills: { catalog: jest.fn() },
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Markings: { list: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));

const { Connectors, Skills, Ontology, Markings } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
};

// Catálogo REAL (shape do GET /governance/agents/skills): native = pronta;
// clawhub = requer ativação; skills que não são de conector ficam fora.
const CATALOG = [
  {
    skill_key: 'connector.http', label: 'Conector HTTP',
    description: 'Conecta QUALQUER API HTTP e ingere os registros pra ontologia.',
    category: 'ingestion', source: 'native', platforms: [], requires_secrets: [],
    param_schema: [
      { key: 'base_url', label: 'URL base', param_type: 'string', required: true, default: null, description: '', enum_values: [] },
    ],
  },
  {
    skill_key: 'camera.detect_tick', label: 'Detecção contínua de câmeras',
    description: 'Roda a detecção por IA nas câmeras com detecção ativa ligada.',
    category: 'vision', source: 'native', platforms: [], requires_secrets: [],
    param_schema: [
      // Tarefa C — min/max ESTRUTURADOS no catálogo (espelham o clamp do servidor).
      { key: 'frames', label: 'Quadros por câmera', param_type: 'int', required: false, default: 4, description: 'Quantos quadros (1 a 16).', enum_values: [], min: 1, max: 16 },
      { key: 'frame_stride', label: 'Intervalo entre quadros', param_type: 'int', required: false, default: 8, description: '', enum_values: [], min: 1, max: 120 },
      { key: 'max_cameras', label: 'Máximo de câmeras por execução', param_type: 'int', required: false, default: 10, description: '', enum_values: [], min: 1, max: 100 },
      { key: 'push', label: 'Envio automático das detecções', param_type: 'bool', required: false, default: true, description: '', enum_values: [] },
    ],
  },
  {
    skill_key: 'connector.files', label: 'Conector de arquivos',
    description: 'Ingere arquivos de um diretório remoto.',
    category: 'ingestion', source: 'native', platforms: [], requires_secrets: [],
    param_schema: [
      { key: 'root', label: 'Diretório raiz', param_type: 'string', required: true, default: null, description: '', enum_values: [] },
      { key: 'mode', label: 'Modo de leitura', param_type: 'enum', required: false, default: 'incremental', description: '', enum_values: ['full', 'incremental'] },
    ],
  },
  // NÃO-conector: nunca aparece no seletor.
  {
    skill_key: 'vision.count_objects', label: 'Contagem de objetos',
    description: '', category: 'vision', source: 'native', platforms: [],
    requires_secrets: [], param_schema: [],
  },
  // clawhub (requer ativação) — não está pronta: fora do seletor.
  {
    skill_key: 'connector.scraper', label: 'Raspador de páginas',
    description: '', category: 'ingestion', source: 'clawhub', platforms: [],
    requires_secrets: [], param_schema: [],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  Connectors.list.mockResolvedValue([]);
  Skills.catalog.mockResolvedValue(CATALOG);
  Ontology.listNodeTypes.mockResolvedValue([{ name: 'endereco', label: 'Endereço', count: 1 }]);
  Ontology.objectTypeSchema.mockResolvedValue({
    kind: 'endereco', display_name: 'Endereço', title_property: 'name', count: 1,
    properties: [{ key: 'id', label: 'ID', type: 'string' }], links: [], actions: [],
  });
  Markings.list.mockResolvedValue([{ slug: 'OFICIAL', display_name: 'Oficial', active: true }]);
});

async function openForm() {
  render(<ConectoresWorkspace />);
  await waitFor(() => expect(Connectors.list).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('conectores-novo'));
  await screen.findByTestId('conectores-form');
}

async function pickSkill(key: string) {
  await openForm();
  // espera o catálogo popular o dropdown (fail-soft enquanto carrega).
  // Tarefa E: skills curadas no dict exibem via skills.<key>.label (o useT
  // mockado é identidade → a chave aparece crua aqui).
  await screen.findByRole('option', { name: 'skills.camera.detect_tick.label' });
  fireEvent.change(screen.getByTestId('cf-skill'), { target: { value: key } });
}

it('(a) seletor de skill lista o catálogo filtrado (conectores prontos) com label + descrição', async () => {
  await openForm();
  const sel = (await screen.findByTestId('cf-skill')) as HTMLSelectElement;
  expect(sel.tagName).toBe('SELECT'); // nunca digitar a key na mão
  // Tarefa E: skill curada no dict resolve via skills.<key>.label (useT
  // identidade → chave crua); skill SEM par no dict (connector.files) segue
  // exibindo o label do catálogo — backend continua a fonte p/ skills novas.
  await screen.findByRole('option', { name: 'skills.camera.detect_tick.label' });
  expect(screen.getByRole('option', { name: 'Conector de arquivos' })).toBeInTheDocument();
  const values = Array.from(sel.options).map((o) => o.value);
  expect(values).toEqual(expect.arrayContaining(['connector.http', 'camera.detect_tick', 'connector.files']));
  // não-conector e clawhub (não pronta) ficam FORA
  expect(values).not.toContain('vision.count_objects');
  expect(values).not.toContain('connector.scraper');
  expect(screen.queryByRole('option', { name: 'Contagem de objetos' })).toBeNull();
  expect(screen.queryByRole('option', { name: 'Raspador de páginas' })).toBeNull();
  // default = connector.http, com a descrição do display layer visível
  // (curada no dict → skills.connector.http.desc; useT identidade)
  expect(sel.value).toBe('connector.http');
  expect(screen.getByTestId('cf-skill-desc')).toHaveTextContent(
    'skills.connector.http.desc',
  );
});

it('(b) escolher camera.detect_tick renderiza o form dinâmico do param_schema com defaults', async () => {
  await pickSkill('camera.detect_tick');
  // int → input numérico com default pré-preenchido
  const frames = screen.getByTestId('cf-skill-param-field-frames') as HTMLInputElement;
  expect(frames.type).toBe('number');
  expect(frames.value).toBe('4');
  expect((screen.getByTestId('cf-skill-param-field-frame_stride') as HTMLInputElement).value).toBe('8');
  expect((screen.getByTestId('cf-skill-param-field-max_cameras') as HTMLInputElement).value).toBe('10');
  // bool → toggle com default ligado
  const push = screen.getByTestId('cf-skill-param-field-push') as HTMLInputElement;
  expect(push.type).toBe('checkbox');
  expect(push.checked).toBe(true);
  // campos específicos do connector.http SOMEM (form é da skill escolhida)
  expect(screen.queryByTestId('cf-base-url')).toBeNull();
  expect(screen.queryByTestId('cf-auth-mode')).toBeNull();
  expect(screen.queryByTestId('cf-pag-mode')).toBeNull();
  // nome + agendamento continuam como hoje
  expect(screen.getByTestId('cf-slug')).toBeInTheDocument();
  expect(screen.getByTestId('cf-cron')).toBeInTheDocument();
  // descrição acompanha a skill escolhida (Tarefa E: curada no dict →
  // skills.camera.detect_tick.desc; useT identidade mostra a chave)
  expect(screen.getByTestId('cf-skill-desc')).toHaveTextContent('skills.camera.detect_tick.desc');
});

it('(b2) string → texto e enum → select com default pré-selecionado', async () => {
  await pickSkill('connector.files');
  const root = screen.getByTestId('cf-skill-param-field-root') as HTMLInputElement;
  expect(root.type).toBe('text');
  const mode = screen.getByTestId('cf-skill-param-field-mode') as HTMLSelectElement;
  expect(mode.tagName).toBe('SELECT');
  expect(Array.from(mode.options).map((o) => o.value)).toEqual(expect.arrayContaining(['full', 'incremental']));
  expect(mode.value).toBe('incremental');
});

it('(b3) Tarefa C — input numérico carrega min/max estruturados do param_schema', async () => {
  await pickSkill('camera.detect_tick');
  const frames = screen.getByTestId('cf-skill-param-field-frames') as HTMLInputElement;
  expect(frames.type).toBe('number');
  expect(frames.min).toBe('1');
  expect(frames.max).toBe('16');
  const stride = screen.getByTestId('cf-skill-param-field-frame_stride') as HTMLInputElement;
  expect(stride.min).toBe('1');
  expect(stride.max).toBe('120');
  const maxCams = screen.getByTestId('cf-skill-param-field-max_cameras') as HTMLInputElement;
  expect(maxCams.min).toBe('1');
  expect(maxCams.max).toBe('100');
});

it('(c3) Tarefa C — valor fora do min/max bloqueia o submit com mensagem honesta', async () => {
  await pickSkill('camera.detect_tick');
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'detec-cams' } });
  fireEvent.change(screen.getByTestId('cf-skill-param-field-frames'), { target: { value: '32' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await screen.findByTestId('conectores-error');
  expect(screen.getByTestId('conectores-error')).toHaveTextContent('conectores.err.param_range');
  expect(Connectors.registerSkill).not.toHaveBeenCalled();
  // corrigir o valor pro range libera o submit
  Connectors.registerSkill.mockResolvedValue({ id: 'a9', slug: 'detec-cams' });
  fireEvent.change(screen.getByTestId('cf-skill-param-field-frames'), { target: { value: '16' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await waitFor(() => expect(Connectors.registerSkill).toHaveBeenCalled());
  expect(Connectors.registerSkill).toHaveBeenCalledWith(expect.objectContaining({
    config: expect.objectContaining({ frames: 16 }),
  }));
});

it('(c) submit POSTa skill key + config dos params pelo trilho genérico', async () => {
  Connectors.registerSkill.mockResolvedValue({ id: 'a9', slug: 'detec-cams' });
  await pickSkill('camera.detect_tick');
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'detec-cams' } });
  fireEvent.change(screen.getByTestId('cf-cron'), { target: { value: '15min' } });
  // ajusta um int e desliga o bool — o config reflete o que o operador vê
  fireEvent.change(screen.getByTestId('cf-skill-param-field-frames'), { target: { value: '6' } });
  fireEvent.click(screen.getByTestId('cf-skill-param-field-push'));
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await waitFor(() => expect(Connectors.registerSkill).toHaveBeenCalled());
  expect(Connectors.registerSkill).toHaveBeenCalledWith(expect.objectContaining({
    slug: 'detec-cams',
    skill_key: 'camera.detect_tick',
    cron_preset: '15min',
    config: { frames: 6, frame_stride: 8, max_cameras: 10, push: false },
  }));
  // o trilho do connector.http NÃO é usado
  expect(Connectors.register).not.toHaveBeenCalled();
  // lista recarrega após registrar
  await waitFor(() => expect(Connectors.list.mock.calls.length).toBeGreaterThanOrEqual(2));
});

it('(c2) param obrigatório vazio bloqueia o submit com erro claro', async () => {
  await pickSkill('connector.files');
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'arquivos' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await screen.findByTestId('conectores-error');
  expect(screen.getByTestId('conectores-error')).toHaveTextContent('conectores.err.required_param');
  expect(Connectors.registerSkill).not.toHaveBeenCalled();
});

it('(d) connector.http é o default e mantém o form HTTP + trilho register intactos', async () => {
  Connectors.register.mockResolvedValue({ id: 'a1', slug: 'cep' });
  await openForm();
  expect((screen.getByTestId('cf-skill') as HTMLSelectElement).value).toBe('connector.http');
  // form HTTP completo presente
  expect(screen.getByTestId('cf-base-url')).toBeInTheDocument();
  expect(screen.getByTestId('cf-auth-mode')).toBeInTheDocument();
  expect(screen.getByTestId('cf-pag-mode')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('cf-slug'), { target: { value: 'cep' } });
  fireEvent.change(screen.getByTestId('cf-base-url'), { target: { value: 'https://api.x' } });
  await screen.findByRole('option', { name: 'Endereço' });
  fireEvent.change(screen.getByTestId('cf-node-type'), { target: { value: 'endereco' } });
  fireEvent.click(screen.getByTestId('conectores-registrar'));
  await waitFor(() => expect(Connectors.register).toHaveBeenCalled());
  expect(Connectors.register.mock.calls[0][0]).toEqual(expect.objectContaining({
    slug: 'cep', base_url: 'https://api.x', node_type: 'endereco',
  }));
  expect(Connectors.registerSkill).not.toHaveBeenCalled();
});

it('catálogo indisponível → fail-soft: o dropdown ainda oferece connector.http', async () => {
  Skills.catalog.mockRejectedValue(new Error('offline'));
  await openForm();
  const sel = (await screen.findByTestId('cf-skill')) as HTMLSelectElement;
  expect(Array.from(sel.options).map((o) => o.value)).toContain('connector.http');
  expect(sel.value).toBe('connector.http');
  expect(screen.getByTestId('cf-base-url')).toBeInTheDocument();
});

// ── trilho HTTP real (mock de fetch): Agent worker + SkillBinding ───────────
describe('Connectors.registerSkill — POSTs reais do trilho governance/agents', () => {
  it('cria o Agent (kind=worker, cron_preset) e binda a skill com a config', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 'a9', slug: 'detec-cams' }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ skill_key: 'camera.detect_tick', active: true, config: {} }) });
    const realFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { Connectors: RealConnectors } = jest.requireActual('@/lib/api') as typeof import('@/lib/api');
      await RealConnectors.registerSkill({
        slug: 'detec-cams', display_name: 'Detecção contínua',
        skill_key: 'camera.detect_tick', cron_preset: '15min',
        config: { frames: 6, frame_stride: 8, max_cameras: 10, push: false },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url1, init1] = fetchMock.mock.calls[0];
      expect(url1).toBe('/api/governance/agents');
      expect(JSON.parse((init1 as RequestInit).body as string)).toEqual(expect.objectContaining({
        slug: 'detec-cams', display_name: 'Detecção contínua', kind: 'worker',
        config: { cron_preset: '15min' },
      }));
      const [url2, init2] = fetchMock.mock.calls[1];
      expect(url2).toBe('/api/governance/agents/a9/skills');
      expect(JSON.parse((init2 as RequestInit).body as string)).toEqual({
        skill_key: 'camera.detect_tick', active: true,
        config: { frames: 6, frame_stride: 8, max_cameras: 10, push: false },
      });
    } finally {
      global.fetch = realFetch;
    }
  });
});
