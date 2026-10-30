'use client';

/**
 * camara_demandas — ranking das MAIORES demandas com ATIVAÇÃO: barra de demanda
 * (tamanho) com preenchimento de ATENDIMENTO (oferta×demanda) + TENDÊNCIA ano-a-ano
 * (↑/↓ X%). A DIREÇÃO vem do ícone; a cor fica neutra na alta e verde só na melhora
 * — evita o "mar de vermelho" (feedback do dono). Dado do camara.dashboard.
 */
import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { TimeFrameToggle, type TFWin } from './camara-gargalos';

type WinTrend = { pct: number; de?: string; para?: string };
type Dem = {
  categoria: string; total: number; atendido_pct: number; pendentes_pct?: number;
  tendencia?: number | null; tendencias?: Record<string, WinTrend>;
};
type Cfg = { title?: string; demandas?: Dem[] };

function TrendMini({ t }: { t?: number | null }) {
  if (t == null) return null;
  const up = t > 3, down = t < -3;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls = down ? 'text-success' : 'text-muted-on-light';
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums ${cls}`}
      title={up ? 'subindo (piora)' : down ? 'caindo (melhora)' : 'estável'}>
      <Icon className="w-3 h-3" strokeWidth={2} aria-hidden />{t > 0 ? '+' : ''}{t}%
    </span>
  );
}

function Demandas({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const dem = cfg.demandas ?? [];
  const max = Math.max(...dem.map((d) => d.total), 1);
  const [win, setWin] = React.useState<TFWin>('mes');
  return (
    <div className="bg-white border border-border-light flex flex-col">
      <div className="min-h-8 px-3 py-1.5 border-b border-border-light bg-raised-light/40 shrink-0 flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-on-light">
          {cfg.title ?? 'Maiores demandas'}
        </span>
        <TimeFrameToggle win={win} setWin={setWin} />
      </div>
      {dem.length === 0 ? (
        <div className="p-4 text-[11px] text-muted-on-light italic">Rode Organizar + Montar dashboard.</div>
      ) : (
        <div className="p-2 flex flex-col gap-1.5">
          {dem.map((d, i) => {
            const pct = Math.max(0, Math.min(100, Math.round(d.atendido_pct)));
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-[9px] text-muted-on-light w-4 tabular-nums">{i + 1}</span>
                  <span className="flex-1 truncate text-text-on-light" title={d.categoria}>{d.categoria}</span>
                  <TrendMini t={d.tendencias?.[win]?.pct ?? d.tendencia} />
                  <span className="font-mono text-[12px] text-text-on-light tabular-nums w-10 text-right">{d.total}</span>
                </div>
                {/* barra: comprimento = DEMANDA relativa; parte cheia = % ATENDIDO */}
                <div
                  className="ml-6 h-2 bg-raised-light"
                  title={`${d.total} pedidos · ${pct}% atendidos${d.pendentes_pct != null ? ` · ${d.pendentes_pct}% pend./neg.` : ''}`}
                >
                  <div className="h-full bg-primary/20 relative" style={{ width: `${Math.round((100 * d.total) / max)}%` }}>
                    <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[9px] text-muted-on-light mt-1 leading-tight">
            Barra = volume da demanda · parte cheia = % atendido · seta = tendência 2 últimos anos.
          </p>
        </div>
      )}
    </div>
  );
}

registerWidget('camara_demandas', Demandas, {
  group: 'content',
  label: 'Maiores demandas (câmara)',
  description: 'Ranking de demandas com barra de volume, atendimento e tendência ano-a-ano.',
  icon: 'bar-chart-3',
  defaultColSpan: 11,
  config_schema: [{ name: 'title', label: 'Título', field: 'string' as const }],
  mockConfig: {
    title: 'Maiores demandas · demanda × atendimento',
    demandas: [
      { categoria: 'Saúde', total: 526, atendido_pct: 89, pendentes_pct: 11, tendencia: 41 },
      { categoria: 'Educação', total: 429, atendido_pct: 89, pendentes_pct: 11, tendencia: 12 },
      { categoria: 'Iluminação Pública', total: 228, atendido_pct: 96, pendentes_pct: 4, tendencia: -8 },
    ],
  },
  mockVariables: {},
});
