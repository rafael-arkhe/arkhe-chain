/**
 * Plano A (fatia 4) — RefactorDiffArtifact: the inline confirm-and-apply diff
 * card in the AIP Architect chat.
 *
 * Additive diffs apply with one click (onApply(false)); destructive diffs
 * (removes/retypes) show a warning and a distinct confirm button that applies
 * with allow_destructive=true. Empty diffs show nothing to do; once applied,
 * the buttons give way to a success note.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { RefactorDiffArtifact } from '@/components/solution-designer/RefactorDiffArtifact';
import type { RefactorResult, RefactorBlueprintDiff } from '@/lib/api';

function emptyDiff(): RefactorBlueprintDiff {
  return {
    added_types: [],
    removed_types: [],
    updated_types: [],
    added_links: [],
    removed_links: [],
    added_actions: [],
    removed_actions: [],
  };
}

function result(over: Partial<RefactorResult> = {}): RefactorResult {
  return {
    diff: emptyDiff(),
    is_destructive: false,
    is_empty: false,
    applied: {
      added_types: 0, updated_types: 0, removed_types: 0,
      added_links: 0, removed_links: 0, added_actions: 0, removed_actions: 0,
    },
    gated: false,
    failures: [],
    lineage_event_ids: [],
    blueprint_hash: 'h',
    ...over,
  };
}

test('additive diff renders adds and applies without confirmation', () => {
  const onApply = jest.fn();
  const r = result({
    diff: {
      ...emptyDiff(),
      added_types: [{ kind: 'Visitante', rationale: '', properties: [] }],
      updated_types: [{
        kind: 'Morador',
        added_properties: [{ key: 'telefone', type: 'text', label: 'Telefone', rationale: '' }],
        removed_properties: [],
        changed_properties: [],
        relabeled_properties: [],
      }],
    },
  });
  render(<RefactorDiffArtifact result={r} onApply={onApply} />);

  expect(screen.getByTestId('refactor-added-type-Visitante')).toBeInTheDocument();
  expect(screen.getByTestId('refactor-added-prop-Morador-telefone')).toBeInTheDocument();
  // Non-destructive → plain apply, no confirm, no warning.
  expect(screen.queryByTestId('refactor-confirm-destructive')).not.toBeInTheDocument();
  expect(screen.queryByTestId('refactor-destructive-warn')).not.toBeInTheDocument();

  fireEvent.click(screen.getByTestId('refactor-apply'));
  expect(onApply).toHaveBeenCalledWith(false);
});

test('destructive diff warns and applies only on explicit confirm', () => {
  const onApply = jest.fn();
  const r = result({
    is_destructive: true,
    diff: {
      ...emptyDiff(),
      updated_types: [{
        kind: 'Morador',
        added_properties: [],
        removed_properties: ['cpf'],
        changed_properties: [],
        relabeled_properties: [],
      }],
    },
  });
  render(<RefactorDiffArtifact result={r} onApply={onApply} />);

  expect(screen.getByTestId('refactor-removed-prop-Morador-cpf')).toBeInTheDocument();
  expect(screen.getByTestId('refactor-destructive-warn')).toBeInTheDocument();
  // The plain apply button is replaced by the destructive confirm.
  expect(screen.queryByTestId('refactor-apply')).not.toBeInTheDocument();

  fireEvent.click(screen.getByTestId('refactor-confirm-destructive'));
  expect(onApply).toHaveBeenCalledWith(true);
});

test('retyped property renders a from→to change line', () => {
  const r = result({
    is_destructive: true,
    diff: {
      ...emptyDiff(),
      updated_types: [{
        kind: 'Morador',
        added_properties: [],
        removed_properties: [],
        changed_properties: [{ key: 'idade', from_type: 'text', to_type: 'number' }],
        relabeled_properties: [],
      }],
    },
  });
  render(<RefactorDiffArtifact result={r} onApply={jest.fn()} />);
  const line = screen.getByTestId('refactor-changed-prop-Morador-idade');
  expect(line).toHaveTextContent('text → number');
});

test('empty diff shows nothing-to-do and no apply button', () => {
  render(<RefactorDiffArtifact result={result({ is_empty: true })} onApply={jest.fn()} />);
  expect(screen.getByTestId('refactor-empty')).toBeInTheDocument();
  expect(screen.queryByTestId('refactor-apply')).not.toBeInTheDocument();
  expect(screen.queryByTestId('refactor-confirm-destructive')).not.toBeInTheDocument();
});

test('appliedNote replaces the action buttons with a success note', () => {
  const r = result({
    diff: { ...emptyDiff(), added_types: [{ kind: 'Visitante', rationale: '', properties: [] }] },
  });
  render(<RefactorDiffArtifact result={r} onApply={jest.fn()} appliedNote="Estrutura atualizada: 1 alteração aplicada." />);
  expect(screen.getByTestId('refactor-applied-note')).toBeInTheDocument();
  expect(screen.queryByTestId('refactor-apply')).not.toBeInTheDocument();
});
