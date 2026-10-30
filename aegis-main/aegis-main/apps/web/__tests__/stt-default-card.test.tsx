/**
 * components/aip/stt-default-card — serviço de transcrição (STT) padrão do tenant.
 *
 * Cobertura:
 *  1. lê AIPModels.defaults() e reflete a seleção atual (groq → "Groq Whisper").
 *  2. trocar p/ OpenAI grava setDefault({purpose:'stt', provider:'openai', model:'whisper-1'}).
 *  3. "Desligado" grava {provider:'stub', model:'stub'} (sem DELETE).
 *  4. selo de jurisdição honesto (EUA) p/ Groq; "sem transcrição" p/ Desligado.
 *  5. UI tokens: zero rounded-(sm..full), zero hex inline.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SttDefaultCard } from '@/components/aip/stt-default-card';

jest.mock('@/lib/api', () => ({
  AIPModels: { defaults: jest.fn(), setDefault: jest.fn() },
}));
jest.mock('@/lib/i18n/provider', () => {
  const { DICT } = jest.requireActual('@/lib/i18n/dict');
  return { useT: () => (k: string) => DICT[k]?.['pt-BR'] ?? k };
});

const api = jest.requireMock('@/lib/api') as {
  AIPModels: { defaults: jest.Mock; setDefault: jest.Mock };
};

const sttDefault = (provider: string, model: string) => ({
  purpose: 'stt', provider, model, source: 'tenant', provider_id: null, jurisdictions: [], country: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  api.AIPModels.defaults.mockResolvedValue([sttDefault('groq', 'whisper-large-v3')]);
  api.AIPModels.setDefault.mockImplementation(async (b: any) => sttDefault(b.provider, b.model));
});

test('1. reflete a seleção atual (groq) vinda de defaults()', async () => {
  render(<SttDefaultCard />);
  await waitFor(() => expect(api.AIPModels.defaults).toHaveBeenCalled());
  const select = (await screen.findByTestId('stt-default-select')) as HTMLSelectElement;
  expect(select.value).toBe('groq');
});

test('2. trocar p/ OpenAI grava purpose=stt provider=openai model=whisper-1', async () => {
  render(<SttDefaultCard />);
  const select = (await screen.findByTestId('stt-default-select')) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: 'openai' } });
  await waitFor(() =>
    expect(api.AIPModels.setDefault).toHaveBeenCalledWith({
      purpose: 'stt', provider: 'openai', model: 'whisper-1',
    }),
  );
});

test('3. Desligado grava provider=stub model=stub (sem DELETE)', async () => {
  api.AIPModels.defaults.mockResolvedValue([sttDefault('groq', 'whisper-large-v3')]);
  render(<SttDefaultCard />);
  const select = (await screen.findByTestId('stt-default-select')) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: 'stub' } });
  await waitFor(() =>
    expect(api.AIPModels.setDefault).toHaveBeenCalledWith({
      purpose: 'stt', provider: 'stub', model: 'stub',
    }),
  );
});

test('4. selo de jurisdição honesto (EUA) p/ Groq; "sem transcrição" p/ Desligado', async () => {
  api.AIPModels.defaults.mockResolvedValue([sttDefault('groq', 'whisper-large-v3')]);
  render(<SttDefaultCard />);
  await waitFor(() =>
    expect(screen.getByTestId('stt-default-jurisdiction').textContent).toMatch(/EUA/),
  );
  fireEvent.change(screen.getByTestId('stt-default-select'), { target: { value: 'stub' } });
  await waitFor(() =>
    expect(screen.getByTestId('stt-default-jurisdiction').textContent).toMatch(/sem transcrição/),
  );
});

test('5. UI tokens: zero rounded-*, zero hex inline', async () => {
  const { container } = render(<SttDefaultCard />);
  await waitFor(() => expect(api.AIPModels.defaults).toHaveBeenCalled());
  const html = container.outerHTML;
  expect(html).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/);
  expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
});

test('6. default ausente/stub cai em Desligado por segurança', async () => {
  api.AIPModels.defaults.mockResolvedValue([]); // nenhuma entrada stt
  render(<SttDefaultCard />);
  const select = (await screen.findByTestId('stt-default-select')) as HTMLSelectElement;
  expect(select.value).toBe('stub');
});
