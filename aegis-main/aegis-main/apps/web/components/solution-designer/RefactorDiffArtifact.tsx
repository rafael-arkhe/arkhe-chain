'use client';

/**
 * Plano A (2026-06-02) — the refactor diff artifact rendered inline in the AIP
 * Architect chat. It turns a {@link RefactorResult} into an at-a-glance,
 * confirm-and-apply card: additions in green, removals in red, retypes in
 * amber. Additive edits apply with one click; a destructive proposal (removes /
 * retypes — which hard-delete data) gates behind an explicit confirm button.
 *
 * Controlled: the parent owns the API call via {@link onApply} and feeds back
 * `applying` / `appliedNote`, so this stays a pure, testable view. Sharp
 * Palantir styling (no rounded), every visible string via useT().
 */
import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Minus,
  Plus,
} from 'lucide-react';

import type { RefactorResult } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';

type Tone = 'add' | 'remove' | 'change' | 'neutral';

const TONE: Record<Tone, { text: string; border: string; Icon: typeof Plus }> = {
  add: { text: 'text-success', border: 'border-success/40', Icon: Plus },
  remove: { text: 'text-danger', border: 'border-danger/40', Icon: Minus },
  change: { text: 'text-warning', border: 'border-warning/50', Icon: ArrowRight },
  neutral: { text: 'text-muted-on-light', border: 'border-border-light', Icon: ArrowRight },
};

function Line({
  tone,
  label,
  value,
  testid,
}: {
  tone: Tone;
  label: string;
  value: string;
  testid: string;
}) {
  const { text, Icon } = TONE[tone];
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-[11px]" data-testid={testid}>
      <Icon className={`w-3 h-3 shrink-0 ${text}`} strokeWidth={1.5} />
      <span className="text-muted-on-light">{label}</span>
      <span className="font-mono text-text-on-light">{value}</span>
    </div>
  );
}

export function RefactorDiffArtifact({
  result,
  onApply,
  applying = false,
  appliedNote = null,
}: {
  result: RefactorResult;
  onApply: (allowDestructive: boolean) => void | Promise<void>;
  applying?: boolean;
  appliedNote?: string | null;
}) {
  const t = useT();
  const { diff, is_destructive, is_empty } = result;

  if (is_empty) {
    return (
      <div
        className="px-3 py-3 m-2 border border-border-light bg-panel-light"
        data-testid="refactor-artifact"
      >
        <p className="text-[11px] text-muted-on-light" data-testid="refactor-empty">
          {t('solutions.refactorEmpty')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`m-2 border ${is_destructive ? 'border-danger/40' : 'border-success/40'} bg-white`}
      data-testid="refactor-artifact"
    >
      <div className="px-3 py-2 border-b border-border-light">
        <p className="text-[11px] font-medium text-text-on-light">
          {t('solutions.refactorTitle')}
        </p>
      </div>

      <div className="py-1">
        {diff.added_types.map((tpe) => (
          <Line
            key={`at-${tpe.kind}`}
            tone="add"
            label={t('solutions.refactorAddedType')}
            value={tpe.kind}
            testid={`refactor-added-type-${tpe.kind}`}
          />
        ))}
        {diff.removed_types.map((kind) => (
          <Line
            key={`rt-${kind}`}
            tone="remove"
            label={t('solutions.refactorRemovedType')}
            value={kind}
            testid={`refactor-removed-type-${kind}`}
          />
        ))}

        {diff.updated_types.map((td) => (
          <React.Fragment key={`ut-${td.kind}`}>
            {td.added_properties.map((p) => (
              <Line
                key={`ap-${td.kind}-${p.key}`}
                tone="add"
                label={t('solutions.refactorAddedProp')}
                value={`${td.kind}.${p.key}`}
                testid={`refactor-added-prop-${td.kind}-${p.key}`}
              />
            ))}
            {td.removed_properties.map((key) => (
              <Line
                key={`rp-${td.kind}-${key}`}
                tone="remove"
                label={t('solutions.refactorRemovedProp')}
                value={`${td.kind}.${key}`}
                testid={`refactor-removed-prop-${td.kind}-${key}`}
              />
            ))}
            {td.changed_properties.map((c) => (
              <Line
                key={`cp-${td.kind}-${c.key}`}
                tone="change"
                label={t('solutions.refactorRetypedProp')}
                value={`${td.kind}.${c.key}: ${c.from_type} → ${c.to_type}`}
                testid={`refactor-changed-prop-${td.kind}-${c.key}`}
              />
            ))}
            {td.relabeled_properties.map((key) => (
              <Line
                key={`lp-${td.kind}-${key}`}
                tone="neutral"
                label={t('solutions.refactorRelabeledProp')}
                value={`${td.kind}.${key}`}
                testid={`refactor-relabeled-prop-${td.kind}-${key}`}
              />
            ))}
          </React.Fragment>
        ))}

        {diff.added_links.map((l) => (
          <Line
            key={`al-${l.source_kind}-${l.relation}-${l.target_kind}`}
            tone="add"
            label={t('solutions.refactorAddedLink')}
            value={`${l.source_kind} → ${l.relation} → ${l.target_kind}`}
            testid={`refactor-added-link-${l.source_kind}-${l.relation}-${l.target_kind}`}
          />
        ))}
        {diff.removed_links.map((key) => (
          <Line
            key={`rl-${key}`}
            tone="remove"
            label={t('solutions.refactorRemovedLink')}
            value={key.split('|').join(' → ')}
            testid={`refactor-removed-link-${key}`}
          />
        ))}

        {diff.added_actions.map((a) => (
          <Line
            key={`aa-${a.name}`}
            tone="add"
            label={t('solutions.refactorAddedAction')}
            value={a.name}
            testid={`refactor-added-action-${a.name}`}
          />
        ))}
        {diff.removed_actions.map((name) => (
          <Line
            key={`ra-${name}`}
            tone="remove"
            label={t('solutions.refactorRemovedAction')}
            value={name}
            testid={`refactor-removed-action-${name}`}
          />
        ))}
      </div>

      {appliedNote ? (
        <div
          className="flex items-center gap-1.5 px-3 py-2 border-t border-border-light text-[11px] text-success"
          data-testid="refactor-applied-note"
        >
          <Check className="w-3 h-3" strokeWidth={1.5} />
          {appliedNote}
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-border-light">
          {is_destructive && (
            <div
              className="flex items-start gap-1.5 mb-2 text-[11px] text-danger"
              data-testid="refactor-destructive-warn"
            >
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={1.5} />
              <span>{t('solutions.refactorDestructiveWarn')}</span>
            </div>
          )}
          <button
            type="button"
            disabled={applying}
            onClick={() => onApply(is_destructive)}
            data-testid={is_destructive ? 'refactor-confirm-destructive' : 'refactor-apply'}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] border ${
              is_destructive
                ? 'border-danger text-white bg-danger hover:bg-danger/90'
                : 'border-primary text-white bg-primary hover:bg-primary-hover'
            } disabled:opacity-50`}
          >
            {applying && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
            {is_destructive
              ? t('solutions.refactorConfirmDestructive')
              : t('solutions.refactorApplyAdditive')}
          </button>
        </div>
      )}
    </div>
  );
}
