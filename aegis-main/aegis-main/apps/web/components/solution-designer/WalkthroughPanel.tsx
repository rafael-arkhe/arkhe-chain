'use client';

/**
 * WalkthroughPanel — the AIP Architect "Walkthrough panel" (M4 #9).
 *
 * After a diagram is saved, "Gerar plano guiado" calls the backend, which
 * builds a Tour (Fase H WorkspaceUpdate) from the graph. This panel renders
 * the resulting pages with Next/Previous navigation. It does NOT reimplement
 * tour state — it consumes the Tour produced by the reused system.
 */
import * as React from 'react';
import { Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Solutions, type SolutionWalkthrough } from '@/lib/api';

export function WalkthroughPanel({
  diagramId,
  onClose,
}: {
  diagramId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const [data, setData] = React.useState<SolutionWalkthrough | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const [err, setErr] = React.useState<string | null>(null);

  async function build() {
    if (!diagramId) return;
    setErr(null);
    setLoading(true);
    try {
      const r = await Solutions.buildWalkthrough(diagramId);
      setData(r);
      setIdx(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const pages = data?.pages || [];
  const page = pages[idx];

  return (
    <div
      className="h-full border-l border-border-light bg-white flex flex-col"
      data-testid="solutions-walkthrough"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-light">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {t('solutions.walkthrough')}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="text-muted-on-light hover:text-text-on-light"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-auto scrollbar-hide p-3">
        {!data && (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-on-light">
              {t('solutions.walkthroughIntro')}
            </p>
            <Button
              variant="success"
              className="h-8 text-[11px]"
              onClick={build}
              disabled={loading || !diagramId}
              data-testid="walkthrough-build"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : null}
              {t('solutions.buildWalkthrough')}
            </Button>
            {!diagramId && (
              <p className="text-[10.5px] text-muted-on-light">
                {t('solutions.walkthroughNeedSave')}
              </p>
            )}
          </div>
        )}

        {err && (
          <div className="px-2 py-1.5 text-[10.5px] font-mono text-danger bg-danger/5 border border-danger/30">
            {err}
          </div>
        )}

        {data && page && (
          <div data-testid="walkthrough-page">
            <p className="text-[9px] font-mono text-muted-on-light">
              {idx + 1} / {pages.length}
            </p>
            <p className="text-[13px] font-semibold text-text-on-light mt-1">
              {page.title}
            </p>
            <p className="text-[11.5px] text-text-on-light mt-2 leading-relaxed">
              {page.description}
            </p>
          </div>
        )}
      </div>

      {data && pages.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border-light">
          <Button
            variant="outline"
            className="h-7 text-[10.5px]"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            data-testid="walkthrough-prev"
          >
            <ChevronLeft className="w-3 h-3" strokeWidth={1.5} />
            {t('solutions.previous')}
          </Button>
          <Button
            variant="outline"
            className="h-7 text-[10.5px]"
            disabled={idx >= pages.length - 1}
            onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}
            data-testid="walkthrough-next"
          >
            {t('solutions.next')}
            <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </div>
  );
}
