'use client';

/**
 * LlmUsagePanel — Orçamento de IA (bloco único): uso e custo do mês em R$ +
 * projeção + breakdown por modelo + TETO de tokens. Funde o antigo card de teto
 * (LlmBudgetCard) aqui — uma seção coesa em vez de dois elementos pequenos.
 *
 * Estética: sharp, ícones neutros (AudioLines), JetBrains Mono nos dados, R$,
 * strings via useT(). Quem tem llm.budget.write ajusta o teto; os demais só veem.
 */
import * as React from 'react';
import { AudioLines, RefreshCw, Check, Loader2 } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { useCan } from '@/lib/auth/useAuth';
import { aipModelLabel } from '@/lib/aip/modelLabels';
import { LlmBudget, type LlmUsageDetail, type LlmBudgetStatus } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { cn } from '@/lib/cn';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const intBR = (n: number): string => n.toLocaleString('pt-BR');

export function LlmUsagePanel() {
  const t = useT();
  const canWrite = useCan('llm.budget.write');
  const [data, setData] = React.useState<LlmUsageDetail | null>(null);
  const [budget, setBudget] = React.useState<LlmBudgetStatus | null>(null);
  const [capInput, setCapInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [usage, b] = await Promise.all([LlmBudget.usage(), LlmBudget.get()]);
      setData(usage);
      setBudget(b);
      setCapInput(b.cap ? String(b.cap) : '');
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const saveCap = React.useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      const raw = capInput.trim();
      const n = raw ? parseInt(raw, 10) : null;
      const b = await LlmBudget.set(n !== null && Number.isFinite(n) && n > 0 ? n : null);
      setBudget(b);
      setCapInput(b.cap ? String(b.cap) : '');
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setSaving(false);
    }
  }, [capInput, saving]);

  const tiles = data
    ? [
        { key: 'month', label: t('usage.monthCost'), value: brl(data.month_cost_brl), accent: true },
        { key: 'proj', label: t('usage.projected'), value: brl(data.projected_month_brl) },
        { key: 'calls', label: t('usage.calls'), value: intBR(data.month_calls) },
        { key: 'avg', label: t('usage.avgPerCall'), value: brl(data.avg_cost_per_call_brl) },
      ]
    : [];

  const pct =
    budget && budget.cap ? Math.min(100, Math.round((budget.tokens_used / budget.cap) * 100)) : null;

  return (
    <div className="bg-white border border-border-light" data-testid="llm-usage-panel">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-light">
        <AudioLines className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">{t('budget.title')}</span>
        <Button variant="ghost" size="sm" onClick={load} className="h-6 ml-auto" data-testid="llm-usage-refresh">
          <RefreshCw className={cn('w-3 h-3 text-muted-on-light', loading && 'animate-spin')} strokeWidth={1.5} />
        </Button>
      </div>

      {err && (
        <div className="px-3 py-2 text-[11px] font-mono text-danger" data-testid="llm-usage-error">
          {err}
        </div>
      )}

      {!data && !err && (
        <div className="px-3 py-4 text-[11px] text-muted-on-light italic">{t('common.loading')}</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border-light">
            {tiles.map(({ key, label, value, accent }) => (
              <div key={key} className="px-3 py-2.5" data-testid={`usage-tile-${key}`}>
                <span className="text-[9px] uppercase tracking-wider text-muted-on-light">{label}</span>
                <p
                  className={cn(
                    'text-[16px] font-mono font-semibold leading-tight mt-0.5',
                    accent ? 'text-primary' : 'text-text-on-light',
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <p className="px-3 py-1.5 text-[10px] text-muted-on-light bg-canvas-light border-t border-border-light">
            {t('usage.projectionNote').replace('{daily}', brl(data.daily_avg_brl))}
          </p>

          {/* TETO de tokens (fundido do antigo card de orçamento). */}
          <div className="px-3 py-2 border-t border-border-light space-y-1.5" data-testid="llm-cap">
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-on-light">
              <span className="font-medium text-text-on-light">{t('budget.capLabel')}</span>
              <InfoTip text={t('budget.hint')} />
              <span className="ml-auto">
                {t('budget.used')}: <span className="font-mono text-text-on-light">{intBR(budget?.tokens_used ?? 0)}</span>
                {budget?.cap != null ? (
                  <>
                    {' / '}
                    <span className="font-mono text-text-on-light">{intBR(budget.cap)}</span> {t('budget.tokensMonth')}
                  </>
                ) : (
                  <> · {t('budget.unlimited')}</>
                )}
              </span>
            </div>
            {pct != null && (
              <div className="h-1.5 w-full bg-panel-light border border-border-light" data-testid="llm-cap-bar">
                <div
                  className={cn('h-full', budget?.exceeded ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {budget?.exceeded && (
              <div className="text-[10.5px] text-danger" data-testid="llm-cap-exceeded">
                {t('budget.exceeded')}
              </div>
            )}
            {canWrite && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <input
                  type="number"
                  min={0}
                  value={capInput}
                  onChange={(e) => setCapInput(e.target.value)}
                  placeholder={t('budget.capPlaceholder')}
                  className="h-7 w-40 px-2 text-[11px] bg-white border border-border-light focus:border-primary outline-none"
                  data-testid="llm-cap-input"
                />
                <Button onClick={saveCap} disabled={saving} className="h-7 text-[11px]" data-testid="llm-cap-save">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <Check className="w-3 h-3" strokeWidth={1.5} />}
                  {t('budget.save')}
                </Button>
              </div>
            )}
          </div>

          {data.by_model.length > 0 && (
            <div className="overflow-x-auto border-t border-border-light" data-testid="usage-by-model">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-muted-on-light border-b border-border-light">
                    <th className="px-3 py-1.5 font-medium">{t('usage.colModel')}</th>
                    <th className="px-3 py-1.5 font-medium text-right">{t('usage.colCalls')}</th>
                    <th className="px-3 py-1.5 font-medium text-right">{t('usage.colTokens')}</th>
                    <th className="px-3 py-1.5 font-medium text-right">{t('usage.colCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_model.map((m) => (
                    <tr key={m.model} className="border-b border-border-light last:border-0" data-testid={`usage-row-${m.model}`}>
                      <td className="px-3 py-1.5 text-text-on-light">{aipModelLabel(m.model) || m.model}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-text-on-light">{intBR(m.calls)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-on-light">{intBR(m.tokens_input + m.tokens_output)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-text-on-light">{m.has_price ? brl(m.cost_brl) : t('usage.noPrice')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
