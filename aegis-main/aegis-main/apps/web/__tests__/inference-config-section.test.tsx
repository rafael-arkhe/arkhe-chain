/**
 * InferenceConfigSection — a inferência do nó de Processamento: modelo (catálogo
 * real) + prompt editável (default do que o AIP propôs). Salva em
 * config.inference_model / inference_prompt → materialize → agente aip.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { InferenceConfigSection } from '@/components/solution-designer/InferenceConfigSection';

jest.mock('@/lib/i18n/provider', () => ({ useT: () => (k: string) => k }));
jest.mock('@/lib/api', () => ({
  AIPModels: { defaults: jest.fn() },
}));
jest.mock('@/lib/aip/modelLabels', () => ({
  aipModelLabel: (id: string) => id,
  aipModelNote: () => '',
  isHiddenProvider: (p: string) => p === 'groq',
}));

const { AIPModels } = jest.requireMock('@/lib/api') as { AIPModels: Record<string, jest.Mock> };

const procNode = { id: 'p1', kind: 'concept', phase: 'processamento', title: 'Processamento', config: {} };

beforeEach(() => {
  jest.clearAllMocks();
  // Fase 3c: o nó usa o modelo padrão da finalidade "Agentes" (não escolhe modelo cru).
  AIPModels.defaults.mockResolvedValue([
    { purpose: 'agent', provider: 'openrouter', model: 'mistralai/mixtral-8x22b-instruct', source: 'tenant', provider_id: null, jurisdictions: [], country: null },
  ]);
});

it('mostra o modelo padrão de Agentes (read-only, sem picker) + prompt default do AIP', async () => {
  render(<InferenceConfigSection node={procNode as never} onPatchNode={jest.fn()}
    proposedPrompt="Analise bio + 5 posts e gere perfil." />);
  await waitFor(() => expect(AIPModels.defaults).toHaveBeenCalled());
  expect(await screen.findByTestId('inference-model-central')).toBeInTheDocument();
  expect(screen.getByTestId('inference-model-name').textContent).toContain('mistralai/mixtral-8x22b-instruct');
  expect(screen.getByTestId('inference-model-configure')).toBeInTheDocument();
  expect(screen.queryByTestId('inference-model')).not.toBeInTheDocument(); // picker antigo sumiu
  expect((screen.getByTestId('inference-prompt') as HTMLTextAreaElement).value).toContain('Analise bio');
});

it('editar prompt grava inference_prompt (o nó não grava mais inference_model)', async () => {
  const onPatchNode = jest.fn();
  render(<InferenceConfigSection node={procNode as never} onPatchNode={onPatchNode} proposedPrompt="X" />);
  await waitFor(() => expect(AIPModels.defaults).toHaveBeenCalled());
  fireEvent.change(screen.getByTestId('inference-prompt'), { target: { value: 'novo prompt' } });
  expect(onPatchNode).toHaveBeenCalledWith('p1', { config: expect.objectContaining({ inference_prompt: 'novo prompt' }) });
});

it('campos do objeto de entrada viram chips clicáveis que inserem {{campo}} no template (fix #2)', async () => {
  const onPatchNode = jest.fn();
  render(
    <InferenceConfigSection
      node={procNode as never}
      onPatchNode={onPatchNode}
      proposedPrompt=""
      inputProps={[{ key: 'username', type: 'string' }, { key: 'biografia', type: 'string' }]}
    />,
  );
  const chips = await screen.findAllByTestId('inference-object-field-chip');
  // o operador VÊ quais variáveis existem (antes só citava {{VARIAVEL}})
  expect(chips.map((c) => c.getAttribute('data-field'))).toEqual(['username', 'biografia']);
  // clicar no chip insere {{username}} no template
  fireEvent.click(chips[0]);
  expect(onPatchNode).toHaveBeenCalledWith('p1', {
    config: expect.objectContaining({ inference_prompt: expect.stringContaining('{{username}}') }),
  });
});

it('sem Tipo de entrada definido → estado vazio orienta (nunca {{VARIAVEL}} sem contexto)', async () => {
  render(<InferenceConfigSection node={procNode as never} onPatchNode={jest.fn()} proposedPrompt="" />);
  expect(await screen.findByTestId('inference-object-fields-empty')).toBeInTheDocument();
  expect(screen.queryByTestId('inference-object-field-chip')).not.toBeInTheDocument();
});
