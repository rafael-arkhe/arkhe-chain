/**
 * components/aip/model-defaults-card — modelo padrão por finalidade.
 * O seletor detalhado (ModelSelect) é mockado para um botão simples.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModelDefaultsCard } from '@/components/aip/model-defaults-card';

jest.mock('@/lib/api', () => ({
  AIPModels: { defaults: jest.fn(), catalog: jest.fn(), setDefault: jest.fn() },
  Compute: { list: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/i18n/provider', () => {
  const { DICT } = jest.requireActual('@/lib/i18n/dict');
  return { useT: () => (k: string) => DICT[k]?.['pt-BR'] ?? k };
});
// ModelSelect (SearchableSelect rico) → botão que escolhe o 1º modelo + expõe o
// codinome do default atual (currentSlug) como o componente real faz no placeholder.
jest.mock('@/components/aip/model-select', () => {
  const { aipModelLabel } = jest.requireActual('@/lib/aip/modelLabels');
  return {
    ModelSelect: ({ models, onPick, currentSlug, testId }: any) => (
      <button data-testid={testId} onClick={() => models[0] && onPick(models[0])}>
        {currentSlug ? aipModelLabel(currentSlug) || currentSlug : 'escolher'}
      </button>
    ),
  };
});

const api = jest.requireMock('@/lib/api') as {
  AIPModels: { defaults: jest.Mock; catalog: jest.Mock; setDefault: jest.Mock };
  Compute: { list: jest.Mock };
};

const catalog = [
  {
    id: 'preset-openrouter-qwen-72b',
    label: 'Qwen 2.5 72B',
    provider: 'openrouter',
    capabilities: [],
    context_window: 32768,
    source: 'preset',
    description: null,
    model_slug: 'qwen/qwen-2.5-72b-instruct',
    pricing: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.AIPModels.catalog.mockResolvedValue(catalog);
  api.AIPModels.defaults.mockResolvedValue([
    { purpose: 'agent', provider: 'openrouter', model: 'mistralai/mixtral-8x22b-instruct', source: 'hardcoded', provider_id: null, jurisdictions: [], country: null },
  ]);
  api.AIPModels.setDefault.mockResolvedValue({
    purpose: 'agent', provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', source: 'tenant', provider_id: null, jurisdictions: [], country: null,
  });
});

test('uma linha por finalidade, incluindo Geração de código e Áudio', async () => {
  render(<ModelDefaultsCard />);
  await waitFor(() => {
    for (const p of ['codegen', 'planning', 'agent', 'chat', 'embedding', 'coleta', 'visao', 'audio']) {
      expect(screen.getByTestId(`model-default-row-${p}`)).toBeInTheDocument();
    }
  });
  // a linha de Áudio mostra a label traduzida (pt-BR), nunca a chave crua.
  expect(screen.getByTestId('model-default-row-audio').textContent).toContain('Áudio');
});

test('finalidade Áudio: escolher modelo salva o SLUG com purpose=audio', async () => {
  render(<ModelDefaultsCard />);
  await waitFor(() => expect(screen.getByTestId('model-default-select-audio')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('model-default-select-audio'));
  await waitFor(() => {
    expect(api.AIPModels.setDefault).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'audio', model: 'qwen/qwen-2.5-72b-instruct', provider: 'openrouter' }),
    );
  });
});

test('escolher modelo salva o SLUG (model_slug), nunca o catalog-id', async () => {
  render(<ModelDefaultsCard />);
  await waitFor(() => expect(screen.getByTestId('model-default-select-agent')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('model-default-select-agent'));
  await waitFor(() => {
    expect(api.AIPModels.setDefault).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'agent', model: 'qwen/qwen-2.5-72b-instruct', provider: 'openrouter' }),
    );
  });
});

test('mostra o default atual como codinome (nunca o slug cru)', async () => {
  render(<ModelDefaultsCard />);
  await waitFor(() => {
    expect(screen.getByTestId('model-default-row-agent').textContent).toContain('AIP-Ipiranga-22B');
    expect(screen.getByTestId('model-default-row-agent').textContent).not.toContain('mistralai/');
  });
});

test('vincular provedor soberano salva provider_id e PRESERVA o modelo + mostra o selo', async () => {
  api.Compute.list.mockResolvedValue([
    { id: 'prov-1', slug: 'edge-sp', display_name: 'Datacenter SP', vendor: 'x', provider_kind: 'edge', base_url: null, country: 'BR', jurisdictions: ['LGPD'], capabilities: [], cert_metadata: {}, pricing_hint: null, enabled: true, has_credential: true, validation_status: null, created_at: '' },
  ]);
  api.AIPModels.defaults.mockResolvedValue([
    { purpose: 'agent', provider: 'openrouter', model: 'mistralai/mixtral-8x22b-instruct', source: 'tenant', provider_id: 'prov-1', jurisdictions: ['LGPD'], country: 'BR' },
  ]);
  render(<ModelDefaultsCard />);
  // o seletor de soberania aparece e o selo de jurisdição é exibido
  await waitFor(() => expect(screen.getByTestId('model-default-sovereignty-agent')).toBeInTheDocument());
  expect(screen.getByTestId('model-default-jurisdiction-agent').textContent).toMatch(/LGPD/);
  // re-vincular mantém o MODELO atual e envia o provider_id
  fireEvent.change(screen.getByTestId('model-default-sovereignty-agent'), { target: { value: 'prov-1' } });
  await waitFor(() => {
    expect(api.AIPModels.setDefault).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'agent', model: 'mistralai/mixtral-8x22b-instruct', provider_id: 'prov-1' }),
    );
  });
});
