'use client';

/**
 * Vega Chart — Wave G.3 (2026-05-23).
 *
 * Renderiza um gráfico declarativo via Vega-Lite spec JSON. Pesquisa
 * R2 `slate/widgets/chart.md` + `visualization.md`.
 *
 * Estratégia:
 *   1. Lazy import dinâmico de `vega-embed` (se instalado).
 *   2. Fallback SVG estático que aceita specs simples de `bar | line` —
 *      assim o widget renderiza ALGO útil mesmo sem o pacote npm.
 *      O operador vê um aviso "vega-embed nao instalado" sob o canvas
 *      pra entender o gap honestamente.
 *
 * Themes: lê `prefers-color-scheme: dark` e injeta o tema oficial do
 * Vega quando disponível.
 *
 * Config:
 *   - spec:    Vega-Lite spec (object ou string JSON). Quando "data"
 *              tem `values: []`, é usado direto.
 *   - source?: external_id de variable. Quando declarado, substitui
 *              `spec.data.values` pelos valores da variable (array).
 *   - title?:  cabeçalho acima do chart.
 *   - height?: px (default 240).
 */
import * as React from 'react';
import { BarChart3 } from 'lucide-react';

import { type WidgetRenderProps } from '../WorkshopV2Renderer';
import { useT } from '@/lib/i18n/provider';
import { getField } from './_row';

type VegaSpec = Record<string, unknown> & {
  data?: { values?: unknown[]; [k: string]: unknown };
  mark?: string | { type?: string };
  encoding?: Record<string, { field?: string; type?: string }>;
};

/** Tipos de gráfico que o construtor gera (sem o operador escrever JSON). */
type ChartPreset =
  | 'bar'
  | 'line'
  | 'area'
  | 'scatter'
  | 'pie'
  | 'donut'
  | 'heatmap'
  | 'advanced';

type Cfg = {
  /** Tipo de gráfico. 'advanced' = usa o campo `spec` (Vega-Lite cru). */
  preset?: ChartPreset;
  x_field?: string;
  y_field?: string;
  color_field?: string;
  /** Agregação do eixo de medida (heatmap/contagem). */
  aggregate?: 'count' | 'sum' | 'mean' | 'none';
  spec?: VegaSpec | string;
  source?: string;
  title?: string;
  height?: number;
};

/**
 * F3: gera um spec Vega-Lite a partir das escolhas do operador (tipo + campos),
 * pra ele NUNCA precisar escrever JSON. Cobre os tipos que a pesquisa Foundry
 * lista como o ponto do Vega (pizza/rosca pra distribuição, heatmap pra
 * densidade 2D, dispersão pra correlação) + barra/linha/área.
 */
const VL5_SCHEMA = 'https://vega.github.io/schema/vega-lite/v5.json';

function buildSpecFromPreset(cfg: Cfg): VegaSpec | null {
  const preset = cfg.preset;
  if (!preset || preset === 'advanced') return null;
  const x = cfg.x_field?.trim();
  const y = cfg.y_field?.trim();
  const color = cfg.color_field?.trim();
  const agg = cfg.aggregate && cfg.aggregate !== 'none' ? cfg.aggregate : undefined;
  // medida y: ou um campo agregado, ou count() quando não há y.
  const yEnc: Record<string, unknown> = y
    ? { field: y, type: 'quantitative', ...(agg ? { aggregate: agg } : {}) }
    : { aggregate: 'count', type: 'quantitative' };

  if (preset === 'pie' || preset === 'donut') {
    if (!x && !color) return null;
    const cat = color || x;
    return {
      $schema: VL5_SCHEMA,
      mark: { type: 'arc', ...(preset === 'donut' ? { innerRadius: 60 } : {}) },
      encoding: {
        theta: yEnc as { field?: string; type?: string },
        color: { field: cat, type: 'nominal' },
      },
    };
  }
  if (preset === 'heatmap') {
    if (!x || !color) return null;
    return {
      $schema: VL5_SCHEMA,
      mark: 'rect',
      encoding: {
        x: { field: x, type: 'nominal' },
        y: { field: color, type: 'nominal' },
        color: yEnc as { field?: string; type?: string },
      },
    };
  }
  if (preset === 'scatter') {
    if (!x || !y) return null;
    return {
      $schema: VL5_SCHEMA,
      mark: 'point',
      encoding: {
        x: { field: x, type: 'quantitative' },
        y: { field: y, type: 'quantitative' },
        ...(color ? { color: { field: color, type: 'nominal' } } : {}),
      },
    };
  }
  // bar | line | area
  if (!x) return null;
  return {
    $schema: VL5_SCHEMA,
    mark: preset,
    encoding: {
      x: { field: x, type: 'nominal' },
      y: yEnc as { field?: string; type?: string },
      ...(color ? { color: { field: color, type: 'nominal' } } : {}),
    },
  };
}

function parseSpec(raw: VegaSpec | string | undefined): VegaSpec | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const out = JSON.parse(raw);
      if (out && typeof out === 'object') return out as VegaSpec;
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === 'object') return raw as VegaSpec;
  return null;
}

function pickValuesFromSource(
  variables: Record<string, unknown>,
  source: string | undefined,
): unknown[] | null {
  if (!source) return null;
  const raw = variables[source];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
    return (raw as { rows: unknown[] }).rows;
  }
  return null;
}

function usePrefersDark(): boolean {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}

/**
 * Carrega vega-embed por import dinâmico (code-split: o bundle pesado do Vega
 * só baixa quando um vega_chart renderiza). F3: pacote instalado → o bundler
 * resolve normalmente; só cai pro fallback SVG se o chunk falhar em runtime.
 */
async function loadVegaEmbed(): Promise<((el: HTMLElement, spec: VegaSpec, opts: Record<string, unknown>) => Promise<unknown>) | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import('vega-embed')) as any;
    return (mod?.default ?? mod) as (
      el: HTMLElement,
      spec: VegaSpec,
      opts: Record<string, unknown>,
    ) => Promise<unknown>;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Fallback SVG renderer — bar + line                                         */
/* -------------------------------------------------------------------------- */

interface FallbackProps {
  spec: VegaSpec;
  values: Record<string, unknown>[];
  width: number;
  height: number;
  dark: boolean;
}

function FallbackChart({ spec, values, width, height, dark }: FallbackProps) {
  const t = useT();
  const enc = spec.encoding ?? {};
  const xField = enc.x?.field ?? 'x';
  const yField = enc.y?.field ?? 'y';
  const markType =
    typeof spec.mark === 'string'
      ? spec.mark
      : spec.mark?.type ?? 'bar';

  const series = values
    .map((r) => ({ x: String(getField(r, xField) ?? ''), y: Number(getField(r, yField) ?? 0) }))
    .filter((d) => Number.isFinite(d.y));

  if (series.length === 0) {
    return (
      <p
        className="text-caption text-muted-on-light italic p-3"
        data-testid="vega-chart-no-data"
      >
        {t('vega.noData')}
      </p>
    );
  }

  const padding = { top: 16, right: 12, bottom: 28, left: 36 };
  const innerW = Math.max(50, width - padding.left - padding.right);
  const innerH = Math.max(40, height - padding.top - padding.bottom);

  const yMax = Math.max(...series.map((d) => d.y), 1);
  const yScale = (v: number) => innerH - (v / yMax) * innerH;

  const fg = dark ? '#E8EDF4' : '#0F172A';
  const muted = dark ? '#94A3B8' : '#64748B';
  const grid = dark ? '#1E293B' : '#E2E8F0';
  const accent = '#2D77BE';

  return (
    <svg
      data-testid="vega-chart-svg"
      data-mark={markType}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t('vega.chartAria').replace('{mark}', markType)}
    >
      <g transform={`translate(${padding.left},${padding.top})`}>
        {/* Y grid (3 lines) */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={innerW}
            y1={innerH - innerH * t}
            y2={innerH - innerH * t}
            stroke={grid}
            strokeWidth={1}
          />
        ))}
        {/* axes */}
        <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={muted} strokeWidth={1} />
        <line x1={0} x2={0} y1={0} y2={innerH} stroke={muted} strokeWidth={1} />
        {markType === 'line' ? (
          <polyline
            fill="none"
            stroke={accent}
            strokeWidth={1.5}
            points={series
              .map((d, i) => {
                const cx = (i + 0.5) * (innerW / series.length);
                return `${cx},${yScale(d.y)}`;
              })
              .join(' ')}
          />
        ) : (
          series.map((d, i) => {
            const barW = (innerW / series.length) * 0.7;
            const cx = (i + 0.5) * (innerW / series.length);
            const x = cx - barW / 2;
            const y = yScale(d.y);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={innerH - y}
                fill={accent}
              />
            );
          })
        )}
        {/* x labels (cada N pra não amassar) */}
        {series.map((d, i) => {
          const cx = (i + 0.5) * (innerW / series.length);
          const skip = Math.ceil(series.length / 8);
          if (i % skip !== 0) return null;
          return (
            <text
              key={i}
              x={cx}
              y={innerH + 14}
              fontSize={9}
              textAnchor="middle"
              fill={muted}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {d.x}
            </text>
          );
        })}
        {/* Y max label */}
        <text
          x={-6}
          y={4}
          fontSize={9}
          textAnchor="end"
          fill={muted}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {yMax.toLocaleString('pt-BR')}
        </text>
        <text
          x={-6}
          y={innerH + 3}
          fontSize={9}
          textAnchor="end"
          fill={muted}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          0
        </text>
      </g>
      <g>
        {/* visually-hidden title for screen readers */}
        <title>{`${t('vega.chartAria').replace('{mark}', markType)} · ${series.length}`}</title>
      </g>
      <style>{`text { fill: ${fg}; }`}</style>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget                                                                     */
/* -------------------------------------------------------------------------- */

function VegaChart({ config, variables }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  // F3: tipo de gráfico escolhido (construtor) tem prioridade; 'advanced' (ou
  // ausência de preset) cai no spec Vega-Lite cru (escape hatch p/ exóticos).
  const spec =
    cfg.preset && cfg.preset !== 'advanced'
      ? buildSpecFromPreset(cfg)
      : parseSpec(cfg.spec);
  const dark = usePrefersDark();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // F3: div-FOLHA dedicado ao vega-embed. React NUNCA renderiza filhos aqui →
  // o vega muta só este nó; sem conflito de removeChild com a reconciliação.
  const vegaHostRef = React.useRef<HTMLDivElement | null>(null);
  // Resultado do embed (tem .finalize()) — limpa a view anterior em re-render.
  const vegaResultRef = React.useRef<{ finalize?: () => void } | null>(null);
  const [vegaAvailable, setVegaAvailable] = React.useState<boolean | null>(null);
  const [width, setWidth] = React.useState(420);
  const height = typeof cfg.height === 'number' ? cfg.height : 240;

  // Measure container width pra fallback SVG ser responsivo.
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth || 420);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Resolve dados — preferência: source variable; fallback spec.data.values.
  const resolved: VegaSpec | null = React.useMemo(() => {
    if (!spec) return null;
    const next: VegaSpec = { ...spec };
    const fromSource = pickValuesFromSource(variables ?? {}, cfg.source);
    if (fromSource) {
      next.data = { ...(next.data ?? {}), values: fromSource };
    }
    return next;
  }, [spec, cfg.source, variables]);

  // Tenta carregar vega-embed e renderizar nativo (no div-folha vegaHostRef).
  React.useEffect(() => {
    let cancelled = false;
    if (!resolved || !vegaHostRef.current) return undefined;
    (async () => {
      const embed = await loadVegaEmbed();
      if (cancelled || !vegaHostRef.current) return;
      if (!embed) {
        setVegaAvailable(false);
        return;
      }
      // Finaliza a view anterior antes de re-embutir (evita acúmulo de DOM).
      try { vegaResultRef.current?.finalize?.(); } catch { /* noop */ }
      vegaResultRef.current = null;
      setVegaAvailable(true);
      try {
        const res = (await embed(vegaHostRef.current, resolved, {
          actions: false,
          theme: dark ? 'dark' : undefined,
        })) as { finalize?: () => void };
        if (cancelled) {
          try { res?.finalize?.(); } catch { /* noop */ }
        } else {
          vegaResultRef.current = res;
        }
      } catch {
        setVegaAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
      // Cleanup: o vega remove seus próprios nós do host (React não os gerencia).
      try { vegaResultRef.current?.finalize?.(); } catch { /* noop */ }
      vegaResultRef.current = null;
    };
  }, [resolved, dark]);

  if (!spec) {
    return (
      <div
        className="bg-white border border-border-light p-3 text-caption text-muted-on-light italic flex items-center gap-2"
        data-testid="vega-chart-empty"
      >
        <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
        {t('vega.configure')}
      </div>
    );
  }

  const values =
    (resolved?.data?.values as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div
      className="bg-white border border-border-light flex flex-col"
      data-testid="vega-chart-widget"
    >
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <BarChart3 className="w-3 h-3 text-primary" strokeWidth={1.5} />
          <p className="text-caption uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
            {cfg.title}
          </p>
        </header>
      )}
      <div
        ref={containerRef}
        className="p-2"
        data-testid="vega-chart-canvas"
        style={{ minHeight: height }}
      >
        {/* Host FOLHA do vega-embed: SEM filhos JSX → o vega muta só este nó,
            React não reconcilia o interior (fim do removeChild). */}
        <div ref={vegaHostRef} data-testid="vega-chart-host" />
        {/* Fallback SVG é IRMÃO (não filho do host) — some quando o vega monta. */}
        {vegaAvailable !== true && (
          <FallbackChart
            spec={resolved!}
            values={Array.isArray(values) ? (values as Record<string, unknown>[]) : []}
            width={Math.max(120, width - 16)}
            height={height}
            dark={dark}
          />
        )}
      </div>
      {vegaAvailable === false && (
        <p
          data-testid="vega-chart-fallback-notice"
          className="px-2.5 py-1 text-[10px] font-mono text-muted-on-light border-t border-border-light bg-canvas-light"
        >
          {t('vega.fallbackNotice')}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

// PERF #5 (2026-06-28): o auto-registro top-level (`registerWidget('vega_chart',
// …)`) e o `MOCK_SPEC` saíram daqui pra `vega-chart.lazy.tsx` + `vega-chart.meta.ts`.
// Assim importar ESTE módulo NÃO arrasta o widget pro grafo eager da Home — o
// barrel registra o `vega_chart` via `next/dynamic` (ssr:false) com a META leve,
// e o bundle pesado do Vega só baixa quando um `vega_chart` renderiza.
export { VegaChart, FallbackChart as VegaChartFallback, buildSpecFromPreset };
