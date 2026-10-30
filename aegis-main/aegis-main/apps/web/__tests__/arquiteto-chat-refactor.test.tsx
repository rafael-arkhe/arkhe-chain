/**
 * Plano A (fatia 4b) — ArquitetoChat wiring of the refactor diff artifact.
 *
 * After the AIP proposes a plan and a plan already exists on the canvas, the
 * pending-proposal guard offers "Apply to existing structure". That previews
 * the refactor (read-only diff), renders the {@link RefactorDiffArtifact}, and
 * applies it — additive in one click. Inference + Solutions are mocked.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ArquitetoChat } from '@/components/solution-designer/ArquitetoChat';
import { apiFetch } from '@/lib/api/client';

jest.mock('@/lib/api', () => ({
  Solutions: {
    designGraphViaTask: jest.fn(),
    refactorPreview: jest.fn(),
    refactorApply: jest.fn(),
  },
}));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

const { Solutions } = jest.requireMock('@/lib/api') as {
  Solutions: Record<string, jest.Mock>;
};
const mockApiFetch = apiFetch as unknown as jest.Mock;

const PLAN_JSON = {
  problem: 'gestão de condomínio: moradores e unidades',
  domain: 'condominio',
  end_product: 'painel',
  source_data: 'existing',
  build_preference: 'low_code',
  requirements: 'cadastro de moradores e vínculo com unidades',
};
const PLAN_BLOCK =
  'Plano consolidado.\n\n```aegis:plano\n' + JSON.stringify(PLAN_JSON) + '\n```';

const BP = {
  id: 'bp-1', problem: 'x', domain: 'condominio', summary: 's', backend: 'llm',
  ontology_types: [], proposed_links: [], logic_functions: [], action_types: [],
  workspace_layout: [], created_at: '', created_by: '',
};
const GRAPH = {
  nodes: [{ id: 'c1', kind: 'concept', phase: 'ontologia', title: 'Ontologia', config: {} }],
  edges: [],
  wizard: { domain: 'condominio', _blueprint: BP },
  title: 'Condomínio',
};

const emptyDiff = {
  added_types: [], removed_types: [], updated_types: [],
  added_links: [], removed_links: [], added_actions: [], removed_actions: [],
};
const PREVIEW = {
  diff: { ...emptyDiff, added_types: [{ kind: 'Visitante', rationale: '', properties: [] }] },
  is_destructive: false, is_empty: false,
  applied: { added_types: 0, updated_types: 0, removed_types: 0, added_links: 0, removed_links: 0, added_actions: 0, removed_actions: 0 },
  gated: false, failures: [], lineage_event_ids: [], blueprint_hash: 'h',
};
const APPLIED = {
  ...PREVIEW,
  applied: { ...PREVIEW.applied, added_types: 1 },
  lineage_event_ids: ['ev-1'],
};

beforeEach(() => jest.clearAllMocks());

async function reachPendingProposal() {
  mockApiFetch.mockResolvedValueOnce({ final_text: PLAN_BLOCK, model: 'mistralai/mixtral-8x22b-instruct' });
  Solutions.designGraphViaTask.mockResolvedValueOnce(GRAPH);
  render(
    <ArquitetoChat open onOpenChange={jest.fn()} onGenerated={jest.fn()} hasCurrentDiagram />,
  );
  fireEvent.change(screen.getByTestId('arquiteto-input'), {
    target: { value: 'cadastro de moradores e unidades do condomínio' },
  });
  fireEvent.click(screen.getByTestId('arquiteto-send'));
  await waitFor(() => expect(Solutions.designGraphViaTask).toHaveBeenCalled());
  // A plan already on the canvas → proposal is pending (guard with options).
  return screen.findByTestId('arquiteto-refactor-trigger');
}

test('offers "apply to existing" on the pending guard and previews the refactor', async () => {
  Solutions.refactorPreview.mockResolvedValueOnce(PREVIEW);
  const trigger = await reachPendingProposal();
  fireEvent.click(trigger);

  await waitFor(() => expect(Solutions.refactorPreview).toHaveBeenCalledWith(BP));
  expect(await screen.findByTestId('refactor-artifact')).toBeInTheDocument();
  expect(screen.getByTestId('refactor-added-type-Visitante')).toBeInTheDocument();
  // The diagram overwrite guard is resolved once we chose to refactor.
  expect(screen.queryByTestId('arquiteto-overwrite-guard')).not.toBeInTheDocument();
});

test('applies the additive refactor and shows the applied note', async () => {
  Solutions.refactorPreview.mockResolvedValueOnce(PREVIEW);
  Solutions.refactorApply.mockResolvedValueOnce(APPLIED);
  const trigger = await reachPendingProposal();
  fireEvent.click(trigger);

  const apply = await screen.findByTestId('refactor-apply');
  fireEvent.click(apply);

  await waitFor(() => expect(Solutions.refactorApply).toHaveBeenCalledWith(BP, false));
  expect(await screen.findByTestId('refactor-applied-note')).toBeInTheDocument();
});
