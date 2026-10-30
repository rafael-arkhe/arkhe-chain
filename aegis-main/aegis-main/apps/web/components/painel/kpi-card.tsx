import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FormatColor } from '@/lib/workshop/format-rules';

/**
 * Backlog #8: cor do número grande resolvida por "Regras de cor"
 * (format_rules) avaliadas no wrapper Workshop via
 * `resolveFormatColor`. `null`/ausente = comportamento atual (cor default).
 * `unavailable` tem prioridade (mantém o número "—" apagado).
 */
const VALUE_COLOR_CLS: Record<FormatColor, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

type Props = {
  label: string;
  value: number | string | null;
  delta?: number | null;
  hint?: string;
  /**
   * Quando true, o card é marcado como "sem dados" (valor "—" + badge).
   * Usado quando o endpoint backing está IAM-gated e sem token.
   */
  unavailable?: boolean;
  /**
   * Cor resolvida por regra de formatação (limiar). Colore só o número
   * grande; o delta mantém a semântica de tendência própria.
   */
  valueColor?: FormatColor | null;
};

export function KpiCard({ label, value, delta, hint, unavailable, valueColor }: Props) {
  const Trend = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  const trendColor =
    delta == null || delta === 0
      ? 'text-muted-on-light'
      : delta > 0
        ? 'text-success'
        : 'text-danger';

  const displayValue = unavailable ? '—' : value ?? '—';

  return (
    <div
      className={cn(
        'bg-panel-light border px-4 py-3 flex flex-col',
        unavailable ? 'border-border-light/60' : 'border-border-light',
      )}
      title={unavailable ? 'Sem dados no ontology · requer autenticação ou seed' : undefined}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex-1">{label}</p>
        {unavailable && (
          <span className="text-[8px] font-mono text-warning border border-warning px-1 uppercase tracking-wide">
            n/d
          </span>
        )}
      </div>
      <p
        data-testid="kpi-value"
        className={cn(
          'text-[28px] font-semibold font-mono leading-none mt-1',
          unavailable
            ? 'text-muted-on-light/70'
            : valueColor
              ? VALUE_COLOR_CLS[valueColor]
              : undefined,
        )}
        data-value-color={!unavailable && valueColor ? valueColor : undefined}
      >
        {displayValue}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <Trend className={cn('w-3 h-3', trendColor)} strokeWidth={2} />
        <span className={cn('font-mono', trendColor)}>
          {!unavailable && delta != null ? `${delta > 0 ? '+' : ''}${delta}%` : '—'}
        </span>
        <span className="text-muted-on-light opacity-70">{hint || 'vs. 7d'}</span>
      </div>
    </div>
  );
}
