'use client';

/**
 * AipGuideModal — guia visual do AIP (modal de ajuda do painel "AIP").
 *
 * Objetivo: destravar o operador ("entendi como uso e como tiro o melhor disso")
 * com o máximo de representação visual e o mínimo de texto-parede. Seis blocos:
 * o ciclo, as quatro fases, como pedir bem (bom × vago), refinar sem perder,
 * construir, e exemplos prontos copiáveis.
 *
 * Regras honradas: toda string via useT() (pt-BR + en-US); ícones lucide sérios
 * (sem emoji, sem Sparkles, sem Bot); bordas retas (sem rounded); sem nomes de
 * produto externos; rolagem com scrollbar oculta.
 */
import * as React from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Database,
  FolderKanban,
  GitMerge,
  Hammer,
  Layers,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Network,
  Replace,
  SlidersHorizontal,
  Target,
  Undo2,
  Workflow,
  X,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/** Cabeçalho de seção: ícone em caixa reta + título + divisória fina. */
function SectionHead({ icon: Ic, title }: { icon: Icon; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="flex items-center justify-center w-6 h-6 border border-border-light bg-panel-light text-text-on-light shrink-0">
        <Ic className="w-3.5 h-3.5" strokeWidth={1.5} />
      </span>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-on-light">
        {title}
      </h3>
      <span className="flex-1 h-px bg-border-light" />
    </div>
  );
}

/** Caixa de passo (ícone + rótulo + descrição) usada nos fluxos. */
function StepBox({
  icon: Ic,
  label,
  desc,
  accent = 'text-text-on-light',
}: {
  icon: Icon;
  label: string;
  desc?: string;
  accent?: string;
}) {
  return (
    <div className="flex-1 min-w-[120px] border border-border-light bg-white p-3">
      <span className={cn('flex items-center justify-center w-7 h-7 border border-border-light bg-panel-light mb-2', accent)}>
        <Ic className="w-4 h-4" strokeWidth={1.5} />
      </span>
      <div className="text-[12px] font-semibold text-text-on-light leading-tight">{label}</div>
      {desc ? <div className="text-[11px] text-muted-on-light mt-0.5 leading-snug">{desc}</div> : null}
    </div>
  );
}

/** Seta entre passos (some quando os passos quebram em coluna). */
function FlowArrow() {
  return (
    <ArrowRight
      className="hidden sm:block w-4 h-4 text-muted-on-light shrink-0 self-center"
      strokeWidth={1.5}
      aria-hidden
    />
  );
}

export function AipGuideModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useT();
  const [copied, setCopied] = React.useState<string | null>(null);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = React.useCallback((key: string, text: string) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard indisponível (ex.: contexto sem permissão) — silencioso */
    }
    setCopied(key);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1500);
  }, []);

  React.useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const examples: Array<{ key: string; icon: Icon; label: string; text: string }> = [
    {
      key: 'condo',
      icon: Building2,
      label: t('solutions.helpExampleCondoLabel'),
      text: t('solutions.helpExampleCondo'),
    },
    {
      key: 'portaria',
      icon: LayoutDashboard,
      label: t('solutions.helpExamplePortariaLabel'),
      text: t('solutions.helpExamplePortaria'),
    },
    {
      key: 'seg',
      icon: Network,
      label: t('solutions.helpExampleSegLabel'),
      text: t('solutions.helpExampleSeg'),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl h-[88vh] flex flex-col p-0 gap-0"
        data-testid="aip-guide-modal"
      >
        <DialogHeader className="px-5 py-4 border-b border-border-light">
          <DialogTitle className="text-[15px] font-semibold text-text-on-light">
            {t('solutions.helpTitle')}
          </DialogTitle>
          <p className="text-[12px] text-muted-on-light">{t('solutions.helpSubtitle')}</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-5 space-y-7">
          {/* 1 — O ciclo */}
          <section data-testid="aip-guide-cycle">
            <SectionHead icon={SlidersHorizontal} title={t('solutions.helpCycleTitle')} />
            <div className="flex flex-col sm:flex-row gap-2">
              <StepBox icon={MessageSquareText} accent="text-primary" label={t('solutions.helpCycle1')} desc={t('solutions.helpCycle1d')} />
              <FlowArrow />
              <StepBox icon={Workflow} accent="text-primary" label={t('solutions.helpCycle2')} desc={t('solutions.helpCycle2d')} />
              <FlowArrow />
              <StepBox icon={SlidersHorizontal} accent="text-primary" label={t('solutions.helpCycle3')} desc={t('solutions.helpCycle3d')} />
              <FlowArrow />
              <StepBox icon={Hammer} accent="text-primary" label={t('solutions.helpCycle4')} desc={t('solutions.helpCycle4d')} />
            </div>
          </section>

          {/* 2 — As quatro fases */}
          <section data-testid="aip-guide-phases">
            <SectionHead icon={Workflow} title={t('solutions.helpPhasesTitle')} />
            <div className="flex flex-col sm:flex-row gap-2">
              <StepBox icon={Database} label={t('solutions.helpPhaseColeta')} desc={t('solutions.helpPhaseColetaD')} />
              <FlowArrow />
              <StepBox icon={Cpu} label={t('solutions.helpPhaseProc')} desc={t('solutions.helpPhaseProcD')} />
              <FlowArrow />
              <StepBox icon={Network} label={t('solutions.helpPhaseOnto')} desc={t('solutions.helpPhaseOntoD')} />
              <FlowArrow />
              <StepBox icon={LayoutDashboard} label={t('solutions.helpPhaseApp')} desc={t('solutions.helpPhaseAppD')} />
            </div>
          </section>

          {/* 3 — Como pedir bem */}
          <section data-testid="aip-guide-ask">
            <SectionHead icon={Target} title={t('solutions.helpAskTitle')} />
            <p className="text-[12px] text-muted-on-light mb-3">{t('solutions.helpAskIntro')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[
                { icon: Target, l: t('solutions.helpAskProduct'), d: t('solutions.helpAskProductD') },
                { icon: Database, l: t('solutions.helpAskSource'), d: t('solutions.helpAskSourceD') },
                { icon: ListChecks, l: t('solutions.helpAskMonitor'), d: t('solutions.helpAskMonitorD') },
                { icon: Code2, l: t('solutions.helpAskCode'), d: t('solutions.helpAskCodeD') },
              ].map(({ icon: Ic, l, d }) => (
                <div key={l} className="border border-border-light bg-panel-light p-2.5">
                  <Ic className="w-4 h-4 text-text-on-light mb-1.5" strokeWidth={1.5} />
                  <div className="text-[11px] font-semibold text-text-on-light leading-tight">{l}</div>
                  <div className="text-[10px] text-muted-on-light mt-0.5 leading-snug">{d}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="border border-danger/40 bg-danger/5 p-3" data-testid="aip-guide-vague">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <X className="w-3.5 h-3.5 text-danger" strokeWidth={2} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-danger">
                    {t('solutions.helpAskVagueLabel')}
                  </span>
                </div>
                <p className="text-[12px] text-text-on-light font-mono leading-snug">
                  {t('solutions.helpAskVague')}
                </p>
              </div>
              <div className="border border-success/50 bg-success/5 p-3" data-testid="aip-guide-good">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Check className="w-3.5 h-3.5 text-success" strokeWidth={2} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-success">
                    {t('solutions.helpAskGoodLabel')}
                  </span>
                </div>
                <p className="text-[12px] text-text-on-light font-mono leading-snug">
                  {t('solutions.helpAskGood')}
                </p>
              </div>
            </div>
          </section>

          {/* 4 — Refinar sem perder */}
          <section data-testid="aip-guide-refine">
            <SectionHead icon={GitMerge} title={t('solutions.helpRefineTitle')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { icon: GitMerge, l: t('solutions.arquitetoMergeBtn'), d: t('solutions.helpRefineMergeD'), accent: 'text-primary border-primary/50 bg-primary/5' },
                { icon: Replace, l: t('solutions.arquitetoOverwriteBtn'), d: t('solutions.helpRefineOverwriteD'), accent: 'text-text-on-light border-border-light bg-white' },
                { icon: X, l: t('solutions.arquitetoKeepBtn'), d: t('solutions.helpRefineKeepD'), accent: 'text-text-on-light border-border-light bg-white' },
                { icon: Undo2, l: t('solutions.helpRefineUndo'), d: t('solutions.helpRefineUndoD'), accent: 'text-text-on-light border-border-light bg-white' },
              ].map(({ icon: Ic, l, d, accent }) => (
                <div key={l} className={cn('flex items-center gap-2.5 border p-2.5', accent)}>
                  <Ic className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <span className="text-[12px] font-semibold">{l}</span>
                    <span className="text-[11px] text-muted-on-light"> — {d}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 5 — Construir */}
          <section data-testid="aip-guide-build">
            <SectionHead icon={Hammer} title={t('solutions.helpBuildTitle')} />
            <div className="flex flex-wrap items-stretch gap-1.5 mb-2">
              {[
                { icon: Building2, l: t('solutions.helpBuildSpace'), d: t('solutions.helpBuildSpaceD') },
                { icon: FolderKanban, l: t('solutions.helpBuildOp') },
                { icon: Layers, l: t('solutions.helpBuildRoom') },
                { icon: LayoutDashboard, l: t('solutions.helpBuildPages') },
              ].map(({ icon: Ic, l, d }, i, arr) => (
                <React.Fragment key={l}>
                  <div className="flex items-center gap-2 border border-border-light bg-white px-3 py-2">
                    <Ic className="w-4 h-4 text-text-on-light shrink-0" strokeWidth={1.5} />
                    <div className="leading-tight">
                      <div className="text-[12px] font-semibold text-text-on-light">{l}</div>
                      {d ? <div className="text-[10px] text-muted-on-light">{d}</div> : null}
                    </div>
                  </div>
                  {i < arr.length - 1 ? (
                    <ChevronRight className="w-4 h-4 text-muted-on-light self-center" strokeWidth={1.5} aria-hidden />
                  ) : null}
                </React.Fragment>
              ))}
            </div>
            <p className="text-[11px] text-muted-on-light">{t('solutions.helpBuildNote')}</p>
          </section>

          {/* 6 — Exemplos prontos */}
          <section data-testid="aip-guide-examples">
            <SectionHead icon={ListChecks} title={t('solutions.helpExamplesTitle')} />
            <p className="text-[12px] text-muted-on-light mb-3">{t('solutions.helpExamplesHint')}</p>
            <div className="space-y-2">
              {examples.map(({ key, icon: Ic, label, text }) => (
                <div key={key} className="border border-border-light bg-panel-light p-3" data-testid={`aip-guide-example-${key}`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-on-light">
                      <Ic className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {label}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(key, text)}
                      className="flex items-center gap-1 h-6 px-2 text-[10px] border border-border-light text-text-on-light hover:bg-white shrink-0"
                      data-testid={`aip-guide-copy-${key}`}
                    >
                      {copied === key ? (
                        <Check className="w-3 h-3 text-success" strokeWidth={2} />
                      ) : (
                        <Copy className="w-3 h-3" strokeWidth={1.5} />
                      )}
                      {copied === key ? t('solutions.helpCopied') : t('solutions.helpCopy')}
                    </button>
                  </div>
                  <p className="text-[12px] text-text-on-light font-mono leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
