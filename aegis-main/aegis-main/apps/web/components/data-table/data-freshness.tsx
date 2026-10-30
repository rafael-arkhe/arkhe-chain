'use client';

/**
 * <DataFreshness /> — Sprint L1.4 (2026-05-23).
 *
 * Indicador "última atualização" para widgets/tabelas operacionais.
 * Atualiza-se sozinho a cada N segundos (default 30) com tempo relativo
 * pt-BR ("há 12s", "há 5min", "há 2h", "ontem"), e expõe timestamp
 * absoluto no tooltip.
 *
 * Sinal de cor:
 *  - stale-warning  → > stale-after-s  (default 60s) → warning
 *  - stale-critical → > critical-after-s (default 300s) → danger
 *
 * Foundry baseline: "Sempre indique freshness em widgets de séries
 * temporais e dashboards de monitoramento."
 *
 * Uso:
 *   <DataFreshness updatedAt={data.fetched_at} />
 *   <DataFreshness updatedAt={iso} staleAfterS={120} criticalAfterS={600} />
 */
import * as React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDataHoraBR } from '@/lib/datetime';

interface Props {
  updatedAt: string | Date | null | undefined;
  staleAfterS?: number;
  criticalAfterS?: number;
  intervalMs?: number;
  showIcon?: boolean;
  prefix?: string;
  className?: string;
}

function relTimePtBR(deltaS: number): string {
  if (deltaS < 5) return 'agora';
  if (deltaS < 60) return `há ${Math.floor(deltaS)}s`;
  if (deltaS < 3_600) return `há ${Math.floor(deltaS / 60)}min`;
  if (deltaS < 86_400) return `há ${Math.floor(deltaS / 3_600)}h`;
  if (deltaS < 172_800) return 'ontem';
  return `há ${Math.floor(deltaS / 86_400)} dias`;
}

export function DataFreshness({
  updatedAt,
  staleAfterS = 60,
  criticalAfterS = 300,
  intervalMs = 30_000,
  showIcon = true,
  prefix = 'Atualizado',
  className,
}: Props) {
  const [, force] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  if (!updatedAt) {
    return (
      <span
        data-testid="data-freshness"
        data-state="unknown"
        className={cn(
          'inline-flex items-center gap-1.5 text-[11px] text-muted-on-light',
          className,
        )}
        title="Sem dados de atualização"
      >
        {showIcon && <Clock className="w-3 h-3" />}
        <span>Sem dados</span>
      </span>
    );
  }

  const ts = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  const deltaS = Math.max(0, (Date.now() - ts.getTime()) / 1_000);
  const isCritical = deltaS > criticalAfterS;
  const isStale = !isCritical && deltaS > staleAfterS;
  const state = isCritical ? 'critical' : isStale ? 'stale' : 'fresh';

  const tone =
    state === 'critical'
      ? 'text-danger'
      : state === 'stale'
      ? 'text-warning'
      : 'text-muted-on-light';

  let absoluteTitle = '';
  try {
    absoluteTitle = formatDataHoraBR(ts);
  } catch {
    absoluteTitle = ts.toISOString();
  }

  return (
    <span
      data-testid="data-freshness"
      data-state={state}
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] tabular-nums',
        tone,
        className,
      )}
      title={`${prefix} em ${absoluteTitle}`}
      aria-label={`${prefix} ${relTimePtBR(deltaS)} (${absoluteTitle})`}
    >
      {showIcon && <Clock className="w-3 h-3" />}
      <span>
        {prefix} {relTimePtBR(deltaS)}
      </span>
    </span>
  );
}
