/**
 * components/dados/modelos-workspace — catálogo de Modelos no hub Dados.
 *
 * Cobertura:
 *  1. Render inicial chama AIPModels.catalog.
 *  2. Cards com codinome AIP (aipModelLabel) + capabilities.
 *  3. Filtro por origem chama catalog(provider).
 *  4. Filtro por capability filtra client-side.
 *  5. Badge "próprio"/"catálogo" reflete source.
 *  6. Empty state quando filtro elimina tudo.
 *  7. PREÇO em R$ (com markup) renderiza no card; "sob consulta" quando sem pricing.
 *  8. UI tokens: zero rounded-*, zero hex inline.
 *  9. Provider Groq escondido; provider real exibido como "AIP Cloud".
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModelosWorkspace } from '@/components/dados/modelos-workspace';

jest.mock('@/lib/api', () => ({ AIPModels: { catalog: jest.fn() } }));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));
jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: () => ({
    principal: { username: 'admin', roles: ['admin'], permissions: ['aip.models.read'] },
    loading: false,
  }),
  useCan: () => true,
}));
// Os cards de configuração + painel de uso batem em outras APIs — fora do escopo
// deste teste de catálogo; renderizam vazio.
jest.mock('@/components/aip/model-defaults-card', () => ({ ModelDefaultsCard: () => null }));
jest.mock('@/components/aip/stt-default-card', () => ({ SttDefaultCard: () => null }));
jest.mock('@/components/aip/byom-models-card', () => ({ ByomModelsCard: () => null }));
jest.mock('@/components/aip/llm-usage-panel', () => ({ LlmUsagePanel: () => null }));
// useT traduz via DICT real (pt-BR) p/ asseverar o texto visível.
jest.mock('@/lib/i18n/provider', () => {
  const { DICT } = jest.requireActual('@/lib/i18n/dict');
  return { useT: () => (k: string) => DICT[k]?.['pt-BR'] ?? k };
});

const api = jest.requireMock('@/lib/api') as { AIPModels: { catalog: jest.Mock } };

const mixtral = {
  id: 'mistralai/mixtral-8x22b-instruct',
  label: 'Mixtral 8x22B',
  provider: 'openrouter',
  capabilities: ['tool_use', 'streaming'],
  context_window: 65536,
  source: 'preset' as const,
  description: 'Eval winner.',
  model_slug: 'mistralai/mixtral-8x22b-instruct',
  pricing: {
    input_brl_mtok: 1.3,
    output_brl_mtok: 3.9,
    input_usd_mtok: 2,
    output_usd_mtok: 6,
    markup_pct: 25,
    usd_brl: 5.19,
    fx_source: 'awesomeapi',
    currency: 'BRL',
  },
};
const byomClaude = {
  id: 'anthropic/claude-opus-4-7',
  label: 'Custom Claude',
  provider: 'anthropic',
  capabilities: ['reasoning', 'vision'],
  context_window: 200000,
  source: 'byom' as const,
  description: null,
  model_slug: 'anthropic/claude-opus-4-7',
  pricing: null, // sob consulta
};
const groqWhisper = {
  id: 'preset-groq-whisper',
  label: 'Whisper Large v3 (Groq)',
  provider: 'groq',
  capabilities: ['audio'],
  context_window: 0,
  source: 'preset' as const,
  description: null,
  model_slug: null,
  pricing: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.AIPModels.catalog.mockResolvedValue([mixtral, byomClaude, groqWhisper]);
});

test('1. render inicial chama catalog', async () => {
  render(<ModelosWorkspace />);
  await waitFor(() => expect(api.AIPModels.catalog).toHaveBeenCalled());
});

test('2. cards com codinome AIP + capacidades no subtítulo (não o tier genérico)', async () => {
  render(<ModelosWorkspace />);
  await waitFor(() => {
    expect(screen.getByText('AIP-Ipiranga-22B')).toBeInTheDocument();
    expect(screen.getByText('AIP-Concilio-Ultra')).toBeInTheDocument();
    // subtítulo = capacidades reais (ferramentas/visão/…), nunca "Avançado"
    expect(screen.getAllByText(/ferramentas|visão|raciocínio/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Avançado|Equilibrado/)).toBeNull();
  });
});

test('4. filtro por capability filtra client-side', async () => {
  render(<ModelosWorkspace />);
  await waitFor(() => expect(api.AIPModels.catalog).toHaveBeenCalled());
  fireEvent.change(screen.getByTestId('modelos-capability-filter'), {
    target: { value: 'reasoning' },
  });
  await waitFor(() => {
    expect(screen.queryByTestId('model-card-anthropic/claude-opus-4-7')).toBeInTheDocument();
    expect(screen.queryByTestId('model-card-mistralai/mixtral-8x22b-instruct')).toBeNull();
  });
});

test('5. flagship AIP carrega "Destaque"; BYOM carrega "próprio"; catálogo comum sem badge', async () => {
  render(<ModelosWorkspace />);
  await waitFor(() => {
    // mixtral = Ipiranga (topo de linha AIP) → Destaque
    expect(screen.getByTestId('model-featured-mistralai/mixtral-8x22b-instruct')).toBeInTheDocument();
    // BYOM → próprio
    expect(
      screen.getByTestId('model-card-anthropic/claude-opus-4-7').textContent,
    ).toContain('próprio');
    // nada de tag "catálogo" repetida
    expect(screen.queryByText('catálogo')).toBeNull();
  });
});

test('6. empty state quando filtro elimina tudo', async () => {
  api.AIPModels.catalog.mockResolvedValue([]);
  render(<ModelosWorkspace />);
  await waitFor(() => expect(screen.getByTestId('modelos-empty')).toBeInTheDocument());
});

test('7. preço em R$ no card + "sob consulta"; legenda NUNCA cita markup', async () => {
  render(<ModelosWorkspace />);
  await waitFor(() => {
    const priced = screen.getByTestId('model-price-mistralai/mixtral-8x22b-instruct');
    expect(priced.textContent).toContain('1,30'); // entrada R$1,30/Mtok
    expect(priced.textContent).toContain('3,90'); // saída R$3,90/Mtok
    const unpriced = screen.getByTestId('model-price-anthropic/claude-opus-4-7');
    expect(unpriced.textContent).toMatch(/sob consulta/i);
  });
  // A legenda NÃO expõe markup/margem/lucro do AEGIS (memory).
  const legend = screen.getByTestId('modelos-price-legend').textContent || '';
  expect(legend).not.toMatch(/margem|markup|lucro/i);
});

test('8. UI tokens: zero rounded-*, zero hex inline', async () => {
  const { container } = render(<ModelosWorkspace />);
  await waitFor(() => expect(api.AIPModels.catalog).toHaveBeenCalled());
  const html = container.outerHTML;
  expect(html).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/);
  expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
});

test('9. Groq escondido; provider real como "AIP Cloud", id cru nunca visível', async () => {
  const { container } = render(<ModelosWorkspace />);
  await waitFor(() => expect(screen.getByText('AIP-Ipiranga-22B')).toBeInTheDocument());
  expect(screen.queryByTestId('model-card-preset-groq-whisper')).toBeNull();
  const html = container.outerHTML.toLowerCase();
  expect(html).not.toContain('groq');
  expect(html).not.toContain('whisper');
  expect(screen.getAllByText('AIP Cloud').length).toBeGreaterThan(0);
  expect(screen.queryByText('mistralai/mixtral-8x22b-instruct')).toBeNull();
  expect(screen.queryByText('openrouter')).toBeNull();
});

test('10. classificação de soberania: aberto = AIP Cloud, proprietário = Nuvem externa', async () => {
  api.AIPModels.catalog.mockResolvedValue([
    mixtral, // mistralai → aberto
    {
      id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'openrouter', capabilities: ['tool_use'],
      context_window: 128000, source: 'preset' as const, description: null,
      model_slug: 'openai/gpt-4o', pricing: null,
    },
  ]);
  render(<ModelosWorkspace />);
  await waitFor(() => {
    expect(screen.getByTestId('model-cloud-mistralai/mixtral-8x22b-instruct').textContent).toBe('AIP Cloud');
    expect(screen.getByTestId('model-cloud-openai/gpt-4o').textContent).toBe('Nuvem externa');
  });
});

test('11. proprietário = marca original (nome+desc+logo); aberto = codinome AIP', async () => {
  api.AIPModels.catalog.mockResolvedValue([
    mixtral, // aberto → codinome + nota AIP
    {
      id: 'openai/gpt-4o', label: 'gpt-4o', provider: 'openrouter', capabilities: ['tool_use'],
      context_window: 128000, source: 'preset' as const,
      display_name: 'OpenAI: GPT-4o', description: 'GPT-4o é o modelo da OpenAI.',
      model_slug: 'openai/gpt-4o', pricing: null,
    },
  ]);
  render(<ModelosWorkspace />);
  await waitFor(() => {
    const gpt = screen.getByTestId('model-card-openai/gpt-4o');
    expect(gpt.textContent).toContain('OpenAI: GPT-4o');         // nome ORIGINAL
    expect(gpt.querySelector('[data-testid="brand-icon-openai"]')).toBeTruthy(); // LOGO
    // descrição vem da nota curada pt-BR, NUNCA o texto cru em inglês do provedor
    expect(gpt.textContent).not.toContain('GPT-4o é o modelo');
    // aberto continua com codinome AIP + narrativa, nunca o slug cru
    const mix = screen.getByTestId('model-card-mistralai/mixtral-8x22b-instruct');
    expect(mix.textContent).toContain('AIP-Ipiranga-22B');
    expect(mix.textContent).toMatch(/Ipiranga|1822/);
  });
});
