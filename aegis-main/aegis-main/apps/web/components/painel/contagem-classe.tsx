'use client';

import { Car, Eye, ScanFace } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { detectionClassLabel, detectionKindLabel } from '@/lib/i18n/detection';
import { useCctvStats } from '@/lib/data/cctv-stats-store';

const KIND_ICON: Record<string, typeof Car> = {
  object: Car,
  lpr: Eye,
  face: ScanFace,
};

const KIND_COLOR: Record<string, string> = {
  object: 'text-warning',
  lpr: 'text-primary',
  face: 'text-danger',
};

/**
 * Widget do Painel: contagem agregada por modalidade/classe (objeto/LPR/face).
 * Vem de /api/v1/cctv/stats/by_class via store COMPARTILHADO (#12) — 1 poller
 * global (30s), pausado quando a aba está oculta. Janela 24h (1440 min): em
 * operação real as detecções são esparsas — janela curta deixa o widget quase
 * sempre zerado e PARECE quebrado; 24h mostra atividade de verdade. (#5)
 */
export function ContagemPorClasse() {
  const t = useT();
  const { stats, live } = useCctvStats();

  // Robustez: stats pode existir sem by_class (resposta parcial/carregando) →
  // Object.keys(undefined) lançaria. Guarda o campo, não só o objeto.
  const kinds = stats?.by_class ? Object.keys(stats.by_class).sort() : [];

  return (
    <div
      data-testid="contagem-por-classe"
      className="bg-panel-light border border-border-light flex flex-col h-full overflow-hidden"
    >
      <div className="h-9 border-b border-border-light flex items-center px-3 gap-2 shrink-0">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider">
          {t('contagem.titulo')} · 24h
        </h2>
        <span
          className={cn(
            'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
            live ? 'border-success text-success' : 'border-warning text-warning',
          )}
        >
          {live ? t('common.online') : t('common.offline')}
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted-on-light">
          {t('contagem.total')}: {stats?.total ?? 0}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {kinds.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-muted-on-light italic">
            {t('contagem.vazio')}
          </div>
        )}
        {kinds.map((kind) => {
          const Icon = KIND_ICON[kind] || Car;
          const classes = Object.entries(stats!.by_class[kind])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
          const totalKind = stats!.by_kind[kind] || 0;
          return (
            <section key={kind} className="border-b border-border-light/60 px-3 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={cn('w-3.5 h-3.5', KIND_COLOR[kind])} strokeWidth={1.5} />
                <p className="text-[11px] font-semibold uppercase tracking-wider">
                  {detectionKindLabel(t, kind)}
                </p>
                <span className="ml-auto text-[12px] font-mono font-semibold">{totalKind}</span>
              </div>
              <ul className="space-y-1">
                {classes.map(([cls, count]) => (
                  <li key={cls} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono truncate w-32">{detectionClassLabel(t, cls)}</span>
                    <div className="flex-1 h-2 bg-raised-light relative">
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0',
                          kind === 'object' ? 'bg-warning' : kind === 'lpr' ? 'bg-primary' : 'bg-danger',
                        )}
                        style={{ width: `${(count / totalKind) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-muted-on-light w-8 text-right">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
