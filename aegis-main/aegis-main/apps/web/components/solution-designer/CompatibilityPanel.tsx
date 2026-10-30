'use client';

/**
 * F4 — quando a operação reusa TIPOS EXISTENTES, mostra a compatibilidade com a
 * ontologia atual: o que falta (campos a adicionar), o que diverge (tipo mudou),
 * o que sobra, e as relações a criar. Reusa `_blueprint_diff` via
 * `Solutions.refactorPreview` (read-only). Vive no nó Ontologia.
 */
import * as React from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { Solutions, type SolutionBlueprint } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { compatSummary, type CompatSummary } from './compat-summary';

export function CompatibilityPanel({ blueprint }: { blueprint: SolutionBlueprint | null }) {
  const t = useT();
  const [summary, setSummary] = React.useState<CompatSummary | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!blueprint || typeof Solutions.refactorPreview !== 'function') {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Solutions.refactorPreview(blueprint)
      .then((r) => {
        if (!cancelled) setSummary(compatSummary(r?.diff));
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blueprint]);

  if (loading) {
    return (
      <p
        data-testid="compat-loading"
        className="text-[10px] text-muted-on-light flex items-center gap-1.5"
      >
        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
      </p>
    );
  }
  if (!summary || !summary.hasAny) {
    return (
      <p
        data-testid="compat-clean"
        className="text-[10px] text-success flex items-center gap-1.5"
      >
        <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} /> {t('solutions.compatClean')}
      </p>
    );
  }

  return (
    <div className="border border-border-light bg-canvas-light p-2 space-y-2" data-testid="compat-panel">
      <p className="text-[10px] uppercase tracking-wider text-text-on-light font-semibold flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 text-warning" strokeWidth={1.5} />
        {t('solutions.compatTitle')}
      </p>
      {/* #2 (fix do operador) — explica O QUE significa e O QUE FAZER (o operador
          via "Relações a criar" e ficava perdido: "e agora?"). Reassegura que o
          build aplica tudo; os Tipos vêm das etapas (Coleta + Processamento). */}
      <p className="text-[10px] text-muted-on-light leading-snug" data-testid="compat-intro">
        {t('solutions.compatIntro')}
      </p>
      {summary.conflicts.map((c) => (
        <div
          key={c.kind}
          data-testid={`compat-type-${c.kind}`}
          className={
            'border px-2 py-1.5 space-y-0.5 ' +
            (c.destructive ? 'border-warning/40 bg-warning/5' : 'border-primary/40 bg-primary/5')
          }
        >
          <p className="text-[11px] font-semibold text-text-on-light">{c.kind}</p>
          {c.missing.length > 0 && (
            <p className="text-[10px] text-text-on-light">
              <span className="text-muted-on-light">{t('solutions.compatMissing')}: </span>
              <span className="font-mono">{c.missing.join(', ')}</span>
            </p>
          )}
          {c.divergent.length > 0 && (
            <p className="text-[10px] text-warning">
              <span className="text-muted-on-light">{t('solutions.compatDivergent')}: </span>
              <span className="font-mono">
                {c.divergent.map((d) => `${d.key} (${d.from}→${d.to})`).join(', ')}
              </span>
            </p>
          )}
          {c.extra.length > 0 && (
            <p className="text-[10px] text-muted-on-light">
              {t('solutions.compatExtra')}: <span className="font-mono">{c.extra.join(', ')}</span>
            </p>
          )}
        </div>
      ))}
      {summary.relationsToCreate.length > 0 && (
        <div data-testid="compat-relations" className="space-y-0.5">
          <p className="text-[10px] text-muted-on-light">{t('solutions.compatRelations')}:</p>
          {summary.relationsToCreate.map((r, i) => (
            <p key={`${r.source}-${r.relation}-${r.target}-${i}`} className="text-[10px] font-mono text-text-on-light">
              {r.source} —{r.relation}→ {r.target}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
