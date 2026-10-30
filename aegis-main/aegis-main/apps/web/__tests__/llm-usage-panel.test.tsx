/**
 * components/aip/llm-usage-panel — Orçamento de IA (uso/custo R$ + projeção).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { LlmUsagePanel } from '@/components/aip/llm-usage-panel';

jest.mock('@/lib/api', () => ({
  LlmBudget: { usage: jest.fn(), get: jest.fn(), set: jest.fn() },
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
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));

const api = jest.requireMock('@/lib/api') as {
  LlmBudget: { usage: jest.Mock; get: jest.Mock; set: jest.Mock };
};

const detail = {
  currency: 'BRL',
  month_start: '2026-06-01T00:00:00+00:00',
  month_cost_brl: 60.18,
  month_calls: 321,
  month_tokens: 2_330_043,
  avg_cost_per_call_brl: 0.1875,
  last_30d_cost_brl: 60.18,
  daily_avg_brl: 2.01,
  projected_month_brl: 60.18,
  markup_pct: 25,
  usd_brl: 5.19,
  fx_source: 'awesomeapi',
  by_model: [
    {
      model: 'mistralai/mixtral-8x22b-instruct',
      calls: 320,
      tokens_input: 1_500_000,
      tokens_output: 800_000,
      cost_brl: 60.18,
      has_price: true,
    },
    {
      model: 'byom:abc',
      calls: 1,
      tokens_input: 100,
      tokens_output: 50,
      cost_brl: 0,
      has_price: false,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.LlmBudget.usage.mockResolvedValue(detail);
  api.LlmBudget.get.mockResolvedValue({
    period_start: '2026-06-01T00:00:00+00:00',
    tokens_used: 2_330_043,
    cap: 5_000_000,
    remaining: 2_669_957,
    exceeded: false,
  });
  api.LlmBudget.set.mockResolvedValue({
    period_start: '2026-06-01T00:00:00+00:00',
    tokens_used: 2_330_043,
    cap: 9_000_000,
    remaining: 6_669_957,
    exceeded: false,
  });
});

test('tiles de gasto/projeção/chamadas/médio em R$', async () => {
  render(<LlmUsagePanel />);
  await waitFor(() => {
    expect(screen.getByTestId('usage-tile-month').textContent).toContain('60,18');
    expect(screen.getByTestId('usage-tile-proj').textContent).toContain('60,18');
    expect(screen.getByTestId('usage-tile-calls').textContent).toContain('321');
    expect(screen.getByTestId('usage-tile-avg').textContent).toMatch(/0,1[89]/);
  });
});

test('breakdown por modelo: codinome + custo R$ / sob consulta', async () => {
  render(<LlmUsagePanel />);
  await waitFor(() => {
    const row = screen.getByTestId('usage-row-mistralai/mixtral-8x22b-instruct');
    expect(row.textContent).toContain('AIP-Ipiranga-22B'); // codinome, nunca o slug cru
    expect(row.textContent).toContain('60,18');
    const byom = screen.getByTestId('usage-row-byom:abc');
    expect(byom.textContent).toMatch(/sob consulta/i);
  });
});

test('nota de projeção cita run-rate 30d e NUNCA o markup/margem (memory)', async () => {
  render(<LlmUsagePanel />);
  await waitFor(() => {
    const txt = screen.getByTestId('llm-usage-panel').textContent || '';
    expect(txt).toMatch(/30 dias/);
    expect(txt).not.toMatch(/margem|markup|lucro/i);
  });
});

test('teto de tokens FUNDIDO no mesmo painel (uso + teto juntos)', async () => {
  const { fireEvent } = await import('@testing-library/react');
  render(<LlmUsagePanel />);
  await waitFor(() => {
    // a barra do teto e o input convivem com os tiles de custo
    expect(screen.getByTestId('llm-cap')).toBeInTheDocument();
    expect(screen.getByTestId('llm-cap-bar')).toBeInTheDocument();
    expect(screen.getByTestId('usage-tile-month')).toBeInTheDocument();
  });
  // ajustar o teto chama LlmBudget.set
  fireEvent.change(screen.getByTestId('llm-cap-input'), { target: { value: '9000000' } });
  fireEvent.click(screen.getByTestId('llm-cap-save'));
  await waitFor(() => expect(api.LlmBudget.set).toHaveBeenCalledWith(9_000_000));
});
