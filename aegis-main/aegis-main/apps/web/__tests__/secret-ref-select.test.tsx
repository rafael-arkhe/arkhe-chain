/**
 * Fase 3b — SecretRefSelect: o operador ESCOLHE/CADASTRA o segredo do conector
 * a partir do Vault, em vez de digitar `namespace/slug` às cegas (régua: nunca
 * input técnico manual). O valor cifrado nunca volta; o ref é `namespace/slug`.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

import { SecretRefSelect } from '@/components/dados/secret-ref-select';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({
  Vault: {
    listSecrets: jest.fn(),
    upsertSkillSecret: jest.fn(),
    ref: (s: { namespace: string; slug: string }) => `${s.namespace}/${s.slug}`,
  },
}));
import { Vault } from '@/lib/api';

const SECRETS = [
  {
    id: 's1', namespace: 'conector', slug: 'api-x', display_name: 'API X',
    description: '', scope_skill_key: null, scope_agent_id: null, kind: 'text', last_used_at: null,
  },
];

beforeEach(() => jest.clearAllMocks());

test('lista os segredos do Vault e seleciona o ref (sem digitar)', async () => {
  (Vault.listSecrets as jest.Mock).mockResolvedValue(SECRETS);
  const onChange = jest.fn();
  render(<SecretRefSelect value="" onChange={onChange} />);
  await screen.findByRole('option', { name: 'API X (conector/api-x)' });
  fireEvent.change(screen.getByTestId('cf-secret-ref-select'), { target: { value: 'conector/api-x' } });
  expect(onChange).toHaveBeenCalledWith('conector/api-x');
});

test('cadastrar segredo inline → upsertSkillSecret → onChange com o novo ref', async () => {
  (Vault.listSecrets as jest.Mock).mockResolvedValue([]);
  (Vault.upsertSkillSecret as jest.Mock).mockResolvedValue({
    id: 's2', namespace: 'conector', slug: 'chave-nova', display_name: 'Chave nova',
    description: '', scope_skill_key: null, scope_agent_id: null, kind: 'text', last_used_at: null,
  });
  const onChange = jest.fn();
  render(<SecretRefSelect value="" onChange={onChange} />);
  await act(async () => { await Promise.resolve(); }); // carrega a lista (vazia)
  fireEvent.click(screen.getByTestId('cf-secret-ref-add'));
  fireEvent.change(screen.getByTestId('cf-secret-ref-name'), { target: { value: 'Chave nova' } });
  fireEvent.change(screen.getByTestId('cf-secret-ref-value'), { target: { value: 'segredo-123' } });
  await act(async () => { fireEvent.click(screen.getByTestId('cf-secret-ref-save')); await Promise.resolve(); });
  await waitFor(() => expect(Vault.upsertSkillSecret).toHaveBeenCalled());
  // grava no Vault (valor cifrado no servidor) e vincula pelo ref namespace/slug
  expect(Vault.upsertSkillSecret).toHaveBeenCalledWith(expect.objectContaining({
    namespace: 'conector', display_name: 'Chave nova', value: 'segredo-123',
  }));
  expect(onChange).toHaveBeenCalledWith('conector/chave-nova');
});

test('sem permissão de listar o Vault → fallback honesto (entrada de ref)', async () => {
  (Vault.listSecrets as jest.Mock).mockRejectedValue(new Error('403'));
  render(<SecretRefSelect value="conector/x" onChange={jest.fn()} />);
  const fb = (await screen.findByTestId('cf-secret-ref-fallback')) as HTMLInputElement;
  expect(fb.value).toBe('conector/x');
});
