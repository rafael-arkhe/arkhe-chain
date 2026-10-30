'use client';

/**
 * Pré-voo do "Montar dossiê" (#10) — antes de cruzar nada, o operador VÊ o que vai
 * acontecer: a entidade, as fontes EXATAS que serão consultadas (preview do
 * entity_fanout._plan_calls via Entities.dossierPlan) e declara a finalidade (LGPD,
 * obrigatória — gate inline). Sem isto o botão era um salto no escuro. Ícones neutros.
 */
import * as React from 'react';
import { FileSearch, Loader2, X, Info } from 'lucide-react';

import { Entities } from '@/lib/api';
import { kindLabel, type DossierKind } from '@/lib/buscar/classify';
import type { AccessPurpose } from '@/lib/buscar/access-purposes';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { SelectField } from '@/components/buscar/select-field';

type PlanSource = { tool: string; label: string };

export function DossiePreflightModal({
  open,
  kind,
  value,
  properties,
  purposes,
  defaultPurpose,
  defaultCaseId,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  kind: DossierKind;
  value: string;
  properties?: Record<string, string>;
  purposes: AccessPurpose[];
  defaultPurpose?: string;
  defaultCaseId?: string;
  onConfirm: (decision: { purpose: string; caseId: string }) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [purpose, setPurpose] = React.useState(defaultPurpose ?? '');
  const [caseId, setCaseId] = React.useState(defaultCaseId ?? '');
  const [plan, setPlan] = React.useState<PlanSource[] | null>(null);
  const [planErr, setPlanErr] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPurpose(defaultPurpose ?? '');
    setCaseId(defaultCaseId ?? '');
    setPlan(null);
    setPlanErr(false);
    let cancelled = false;
    Entities.dossierPlan({ kind, value, properties })
      .then((r) => {
        if (!cancelled) setPlan(r.sources || []);
      })
      .catch(() => {
        if (!cancelled) setPlanErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, value, properties, defaultPurpose, defaultCaseId]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = !!purpose.trim();
  const fieldCls =
    'w-full h-9 px-2 bg-canvas-light border border-border-light text-[12px] outline-none focus:border-primary';

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-4"
      data-testid="dossie-preflight"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg bg-white border border-border-light shadow-xl max-h-[90vh] flex flex-col">
        <div className="h-11 px-4 border-b border-border-light flex items-center gap-2 shrink-0">
          <FileSearch className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold text-text-on-light">{t('buscar.preflight.title')}</span>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('common.close')}
            className="ml-auto w-7 h-7 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Entidade */}
          <div className="border border-border-light bg-canvas-light p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('buscar.preflight.entity')}</p>
            <p className="text-[13px] text-text-on-light font-mono mt-0.5 break-words">{value || '—'}</p>
            <p className="text-[11px] text-muted-on-light mt-0.5">{t('buscar.preflight.detectedType')}: {kindLabel(kind)}</p>
          </div>

          {/* O que faz */}
          <p className="text-[12px] text-muted-on-light leading-relaxed">
            {t('buscar.preflight.explainBefore')}{' '}
            <span className="text-text-on-light font-semibold">{t('buscar.preflight.explainHighlight')}</span> {t('buscar.preflight.explainAfter')}
          </p>

          {/* Preview de fontes (exato) */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1.5">
              {t('buscar.preflight.sourcesLabel')}{plan ? ` (${plan.length})` : ''}
            </p>
            {plan === null && !planErr && (
              <p className="text-[11px] text-muted-on-light italic flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> {t('buscar.preflight.calculatingPlan')}
              </p>
            )}
            {planErr && (
              <p className="text-[11px] text-muted-on-light italic">
                {t('buscar.preflight.planError')}
              </p>
            )}
            {plan && plan.length > 0 && (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1" data-testid="dossie-plan-list">
                {plan.map((s) => (
                  <li
                    key={s.tool}
                    className="text-[11px] text-text-on-light flex items-center gap-1.5 border border-border-light bg-canvas-light px-2 py-1"
                  >
                    <span className="w-1 h-1 bg-muted-on-light shrink-0" />
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
            {plan && plan.length === 0 && (
              <p className="text-[11px] text-muted-on-light italic">
                {t('buscar.preflight.noSpecificSources')}
              </p>
            )}
          </div>

          {/* Finalidade — gate LGPD inline */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-text-on-light font-semibold flex items-center gap-1">
              {t('buscar.preflight.purposeLabel')} <span className="text-danger">*</span>
              <span
                className="inline-flex cursor-help"
                title={t('buscar.preflight.purposeTooltip')}
              >
                <Info className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
              </span>
            </label>
            <div className="mt-1">
              <SelectField
                name="finalidade"
                testId="dossie-finalidade"
                value={purpose}
                onChange={setPurpose}
                options={purposes}
                emptyLabel={t('buscar.preflight.purposePlaceholder')}
                popoverZIndex={70}
              />
            </div>
            {!canConfirm && (
              <p className="text-[10px] text-muted-on-light mt-1">
                {t('buscar.preflight.purposeRequiredHint')}
              </p>
            )}
          </div>

          {/* Caso */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              {t('buscar.preflight.caseLabel')} <span className="text-muted-on-light/70">{t('buscar.preflight.optional')}</span>
            </label>
            <input
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder={t('buscar.preflight.casePlaceholder')}
              data-testid="dossie-caso"
              className={`${fieldCls} mt-1`}
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3 text-[12px] bg-white text-text-on-light border border-border-light hover:border-primary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ purpose: purpose.trim(), caseId: caseId.trim() })}
            disabled={!canConfirm}
            data-testid="dossie-confirmar"
            className="h-9 px-4 text-[12px] font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <FileSearch className="w-4 h-4" strokeWidth={1.5} />
            {t('buscar.preflight.confirm')}{plan && plan.length > 0 ? ` · ${plan.length} ${t('buscar.preflight.sourcesWord')}` : ''}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
