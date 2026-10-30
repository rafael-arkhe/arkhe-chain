/**
 * components/aip/byom-models-card — registro de modelo próprio (BYOM) com chave no Vault.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ByomModelsCard } from '@/components/aip/byom-models-card';

jest.mock('@/lib/api', () => ({
  AIPModels: { list: jest.fn(), register: jest.fn(), unregister: jest.fn() },
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
  AIPModels: { list: jest.Mock; register: jest.Mock; unregister: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  api.AIPModels.list.mockResolvedValue([
    {
      id: 'm1',
      name: 'openai/gpt-4o',
      provider: 'openai',
      endpoint_url: 'https://api.openai.com/v1',
      has_credential: true,
      context_window: 128000,
      capabilities: ['tool_use'],
      active: true,
      created_at: '2026-06-09',
    },
  ]);
  api.AIPModels.register.mockResolvedValue({ id: 'm2', name: 'x', provider: 'custom', endpoint_url: null, has_credential: true, context_window: 0, capabilities: [], active: true, created_at: '' });
});

test('lista modelos BYOM com badge de credencial', async () => {
  render(<ByomModelsCard />);
  await waitFor(() => {
    expect(screen.getByTestId('byom-row-m1').textContent).toContain('openai/gpt-4o');
    expect(screen.getByTestId('byom-cred-m1')).toBeInTheDocument(); // tem credencial no Vault
  });
});

test('campo de chave é password (write-only) e o registro envia api_key', async () => {
  render(<ByomModelsCard />);
  await waitFor(() => expect(screen.getByTestId('byom-add')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('byom-add'));
  const key = screen.getByTestId('byom-api-key') as HTMLInputElement;
  expect(key.type).toBe('password'); // a chave nunca aparece em claro
  fireEvent.change(screen.getByTestId('byom-name'), { target: { value: 'minha/modelo' } });
  fireEvent.change(screen.getByTestId('byom-endpoint'), { target: { value: 'https://meu/v1' } });
  fireEvent.change(key, { target: { value: 'sk-secreta' } });
  fireEvent.click(screen.getByTestId('byom-cap-tool_use'));
  fireEvent.click(screen.getByTestId('byom-save'));
  await waitFor(() => {
    expect(api.AIPModels.register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'minha/modelo',
        endpoint_url: 'https://meu/v1',
        api_key: 'sk-secreta',
        capabilities: ['tool_use'],
      }),
    );
  });
});
