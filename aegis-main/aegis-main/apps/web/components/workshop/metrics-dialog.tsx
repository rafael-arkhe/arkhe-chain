'use client';

/**
 * MetricsDialog — Sprint E3 + PE1/PE2/PE4 do Parity Audit (2026-05-20).
 *
 * Modal standalone (igual VersionsDialog) que abre via botão "Métricas"
 * no toolbar do editor. Mostra agregação de eventos de uso vindos do
 * endpoint `/workshop/apps/{id}/metrics?period={7d|30d|90d}`.
 *
 * Estrutura visual (sharp Palantir, sem rounded-*):
 *   - Header: título + period dropdown (7d/30d/90d) + X
 *   - Timeseries mini-chart (PE1): linha 180px com hover tooltip
 *   - Segmented control (PE2): Views / Actions
 *   - Overview card: total_events grande + chip delta_pct (verde/vermelho)
 *   - Sections — filtradas pelo modo:
 *       · Views: by_event_type (page_view+tab_view+overlay_view) + by_page + by_overlay
 *       · Actions: by_action
 *   - Empty state global quando total_events = 0
 *   - Footer (PE4): toggle "Habilitar coleta de telemetria neste painel"
 *
 * Ingest do lado do widget vive em WorkshopV2Renderer (page_view debounced,
 * overlay_view ao abrir, action_submit quando trigger=click roda actions,
 * tab_view quando widget Tabs troca de aba).
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Loader2,
  Minus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Workshop, type WorkshopMetrics } from '@/lib/workshop/client';
import type { WorkshopApp } from '@/lib/workshop/types';

type Period = '7d' | '30d' | '90d';
type Mode = 'views' | 'actions';

const PERIOD_LABEL: Record<Period, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  page_view: 'Visualizar página',
  tab_view: 'Trocar de aba',
  overlay_view: 'Abrir janela',
  action_submit: 'Executar ação',
};

/** Sprint PE2: tipos de evento considerados "view" (não-ação). */
const VIEW_EVENT_TYPES = new Set(['page_view', 'tab_view', 'overlay_view']);

export function MetricsDialog({
  app,
  open,
  onClose,
  onAppChange,
}: {
  app: WorkshopApp;
  open: boolean;
  onClose: () => void;
  /**
   * Sprint PE4: notifica o pai (editor) quando o operador liga/desliga
   * telemetria — o pai precisa atualizar seu `app` state em memória pra
   * que `WorkshopV2Renderer` veja a mudança sem F5.
   */
  onAppChange?: (next: WorkshopApp) => void;
}) {
  const [period, setPeriod] = React.useState<Period>('7d');
  const [mode, setMode] = React.useState<Mode>('views');
  const [data, setData] = React.useState<WorkshopMetrics | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Sprint PE4: toggle local + estado de saving (botão fica disabled
  // enquanto request roda; rollback em erro).
  const metricsEnabled = app.metrics_enabled !== false;
  const [savingEnabled, setSavingEnabled] = React.useState(false);
  const [enableError, setEnableError] = React.useState<string | null>(null);

  const reload = React.useCallback(
    async (p: Period) => {
      setLoading(true);
      setError(null);
      try {
        const res = await Workshop.getMetrics(app.id, p);
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar métricas.');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [app.id],
  );

  React.useEffect(() => {
    if (open) void reload(period);
  }, [open, period, reload]);

  const onToggleEnabled = React.useCallback(
    async (next: boolean) => {
      setSavingEnabled(true);
      setEnableError(null);
      try {
        const updated = await Workshop.update(app.id, { metrics_enabled: next });
        onAppChange?.(updated);
        // Recarrega métricas pra refletir banner imediato.
        await reload(period);
      } catch (e) {
        setEnableError(
          e instanceof Error
            ? e.message
            : 'Falha ao atualizar configuração de telemetria.',
        );
      } finally {
        setSavingEnabled(false);
      }
    },
    [app.id, onAppChange, period, reload],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-6"
      data-testid="metrics-dialog-root"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 ds-overlay"
      />
      <div
        role="dialog"
        aria-label="Métricas de uso"
        className="relative bg-canvas-light border border-border-light shadow-2xl w-[720px] max-h-[88vh] flex flex-col overflow-hidden"
      >
        <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <BarChart3 className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
            Métricas de uso
          </p>
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono">
              Período
            </span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              data-testid="metrics-period-select"
              className="h-7 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-primary outline-none focus:border-primary"
            >
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
              <option value="90d">90 dias</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="metrics-dialog-close"
            className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {!metricsEnabled && (
            <div
              data-testid="metrics-disabled-banner"
              className="m-3 px-3 py-2 text-[11px] bg-warning/10 border border-warning/40 text-text-on-light"
            >
              Telemetria desligada — eventos novos não são gravados. Ative
              abaixo pra retomar a coleta neste painel.
            </div>
          )}
          {loading && (
            <div className="px-4 py-12 text-center text-[11px] text-muted-on-light flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Carregando métricas…
            </div>
          )}
          {error && !loading && (
            <div className="m-3 px-3 py-2 text-[11px] bg-danger/5 border border-danger/40 text-danger">
              {error}
            </div>
          )}
          {!loading && !error && data && (
            <MetricsBody
              data={data}
              period={period}
              mode={mode}
              onModeChange={setMode}
            />
          )}
        </div>

        <footer className="px-3 py-2 border-t border-border-light bg-raised-light/40 flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 flex-1 cursor-pointer">
            <input
              type="checkbox"
              checked={metricsEnabled}
              disabled={savingEnabled}
              onChange={(e) => void onToggleEnabled(e.target.checked)}
              data-testid="metrics-enable-toggle"
              className="accent-primary"
            />
            <span className="text-[11px] text-text-on-light">
              Habilitar coleta de telemetria neste painel
            </span>
            {savingEnabled && (
              <Loader2
                className="w-3 h-3 animate-spin text-muted-on-light"
                strokeWidth={1.5}
              />
            )}
          </label>
          {enableError && (
            <span className="text-[10px] text-danger truncate" title={enableError}>
              {enableError}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            data-testid="metrics-dialog-footer-close"
            className="h-7 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function MetricsBody({
  data,
  period,
  mode,
  onModeChange,
}: {
  data: WorkshopMetrics;
  period: Period;
  mode: Mode;
  onModeChange: (m: Mode) => void;
}) {
  const total = data.total_events;
  const hasSeries = Array.isArray(data.timeseries) && data.timeseries.length > 0;

  if (total === 0) {
    return (
      <div className="px-4 py-12 text-center" data-testid="metrics-empty">
        <p className="text-[12px] text-text-on-light font-semibold">
          Sem eventos registrados no período.
        </p>
        <p className="text-[10.5px] text-muted-on-light/80 mt-1">
          {PERIOD_LABEL[period]} · A telemetria começa a contar a partir do
          primeiro acesso ao painel.
        </p>
      </div>
    );
  }

  // Sprint PE2: by_event_type filtrado por modo.
  const eventTypeRows = Object.entries(data.by_event_type)
    .filter(([k]) =>
      mode === 'views' ? VIEW_EVENT_TYPES.has(k) : k === 'action_submit',
    )
    .map(([k, count]) => ({
      label: EVENT_TYPE_LABEL[k] ?? k,
      count,
    }));

  return (
    <div className="px-3 py-3 flex flex-col gap-3">
      {hasSeries && (
        <MetricsTimeseries
          data={data.timeseries ?? []}
          bucket={data.timeseries_bucket ?? 'day'}
        />
      )}
      <ModeSegmented mode={mode} onChange={onModeChange} />
      <Overview data={data} period={period} />
      {mode === 'views' ? (
        <>
          <Section
            title="Tipos de visualização"
            rows={eventTypeRows}
            emptyHint="Sem visualizações registradas."
            testId="metrics-section-event-types"
          />
          <Section
            title="Páginas visitadas"
            rows={data.by_page}
            emptyHint="Nenhuma página com tráfego no período."
            testId="metrics-section-pages"
          />
          <Section
            title="Janelas (overlays) abertas"
            rows={data.by_overlay}
            emptyHint="Nenhuma janela acionada no período."
            testId="metrics-section-overlays"
          />
        </>
      ) : (
        <>
          <Section
            title="Tipos de ação"
            rows={eventTypeRows}
            emptyHint="Sem ações registradas."
            testId="metrics-section-event-types"
          />
          <Section
            title="Ações executadas"
            rows={data.by_action}
            emptyHint="Nenhum botão/ação acionado neste período."
            testId="metrics-section-actions"
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ModeSegmented — PE2 (2026-05-20)                                           */
/* -------------------------------------------------------------------------- */
function ModeSegmented({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Modo de métricas"
      className="inline-flex border border-border-light bg-canvas-light self-start"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'views'}
        onClick={() => onChange('views')}
        data-testid="metrics-mode-views"
        className={cn(
          'h-7 px-3 text-[11px] uppercase tracking-wider font-mono border-r border-border-light',
          mode === 'views'
            ? 'bg-primary text-white'
            : 'bg-canvas-light text-muted-on-light hover:text-text-on-light',
        )}
      >
        Visualizações
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'actions'}
        onClick={() => onChange('actions')}
        data-testid="metrics-mode-actions"
        className={cn(
          'h-7 px-3 text-[11px] uppercase tracking-wider font-mono',
          mode === 'actions'
            ? 'bg-primary text-white'
            : 'bg-canvas-light text-muted-on-light hover:text-text-on-light',
        )}
      >
        Ações
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MetricsTimeseries — PE1 (2026-05-20) / PF2 (2026-05-20, hourly + smooth)   */
/* -------------------------------------------------------------------------- */
/**
 * Mini SVG line chart. 180px altura, full width. Eixo Y auto-scale baseado
 * em max(count); eixo X = datas (ou horas quando bucket=hour). Hover
 * tooltip mostra a data/hora formatada + count. PF2: curva renderizada via
 * cubic-bezier (Catmull-Rom-ish) ao invés de segmentos lineares.
 */
function MetricsTimeseries({
  data,
  bucket,
}: {
  data: { date: string; count: number }[];
  bucket: 'hour' | 'day' | 'week';
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(640);
  const [hover, setHover] = React.useState<number | null>(null);

  // Measure container width responsively.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const HEIGHT = 180;
  const PAD = { top: 12, right: 8, bottom: 22, left: 28 };
  const innerW = Math.max(20, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const max = data.reduce((acc, d) => Math.max(acc, d.count), 0);
  const yMax = max === 0 ? 1 : max;
  const n = data.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  const x = (i: number) => PAD.left + stepX * i;
  // Min height: garante 1.5px de barra/altura mesmo quando count=0 ou
  // muito pequeno comparado a yMax — operador percebe o ponto na linha.
  const MIN_VISIBLE = 1.5;
  const y = (count: number) => {
    const raw = PAD.top + innerH - (count / yMax) * innerH;
    if (count === 0) return PAD.top + innerH - MIN_VISIBLE;
    return Math.min(raw, PAD.top + innerH - MIN_VISIBLE);
  };

  const points = data.map((d, i) => ({ x: x(i), y: y(d.count) }));
  const pathD = smoothPath(points);

  const areaD =
    n > 1
      ? `${pathD} L ${x(n - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`
      : '';

  // Labels do eixo X: primeiro, último, e meio quando há > 4 pontos.
  // Pra bucket=hour com 168 pontos (7d * 24h), também mostra 25% e 75%.
  const tickIndices = new Set<number>();
  if (n > 0) {
    tickIndices.add(0);
    tickIndices.add(n - 1);
    if (n > 4) tickIndices.add(Math.floor((n - 1) / 2));
    if (n > 24) {
      tickIndices.add(Math.floor((n - 1) * 0.25));
      tickIndices.add(Math.floor((n - 1) * 0.75));
    }
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0 || stepX === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left - PAD.left;
    const idx = Math.round(localX / stepX);
    if (idx >= 0 && idx < n) setHover(idx);
  };
  const onLeave = () => setHover(null);

  const fmtAxis = (iso: string) => formatBucketDate(iso, bucket, 'axis');
  const fmtTooltip = (iso: string) => formatBucketDate(iso, bucket, 'tooltip');

  const hovered = hover != null ? data[hover] : null;

  return (
    <section
      data-testid="metrics-timeseries"
      className="border border-border-light bg-canvas-light"
    >
      <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-mono font-semibold text-text-on-light flex-1">
          Evolução {bucket === 'hour' ? 'por hora' : bucket === 'week' ? 'semanal' : 'diária'}
        </p>
        {hovered && (
          <p
            className="text-[10px] font-mono text-text-on-light tabular-nums"
            data-testid="metrics-timeseries-hover"
          >
            {fmtTooltip(hovered.date)} · {hovered.count.toLocaleString('pt-BR')}
          </p>
        )}
      </header>
      <div ref={containerRef} className="px-2 py-2">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="block w-full"
        >
          {/* Grid: 4 linhas horizontais (0, 25, 50, 75, 100% de yMax). */}
          {[0, 0.25, 0.5, 0.75, 1].map((p) => {
            const ly = PAD.top + innerH - p * innerH;
            return (
              <g key={p}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + innerW}
                  y1={ly}
                  y2={ly}
                  stroke="currentColor"
                  className="text-border-light"
                  strokeWidth={1}
                  strokeDasharray={p === 0 ? '0' : '2 2'}
                />
                <text
                  x={PAD.left - 4}
                  y={ly}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="text-[9px] fill-muted-on-light font-mono"
                >
                  {Math.round(yMax * p).toLocaleString('pt-BR')}
                </text>
              </g>
            );
          })}
          {/* Eixo X — datas/horas */}
          {Array.from(tickIndices).map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="text-[9px] fill-muted-on-light font-mono"
            >
              {fmtAxis(data[i].date)}
            </text>
          ))}
          {/* Área sob a curva (smooth) */}
          {n > 1 && (
            <path
              d={areaD}
              className="fill-primary/15"
              stroke="none"
            />
          )}
          {/* Linha principal (smooth) */}
          {n > 0 && (
            <path
              d={pathD}
              className="stroke-primary fill-none"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Pontos — só desenha quando há poucos buckets pra não poluir
              o chart hourly (168 pontos em 7d). */}
          {n <= 32 &&
            data.map((d, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(d.count)}
                r={hover === i ? 3 : 2}
                className={cn(
                  'stroke-primary',
                  hover === i ? 'fill-primary' : 'fill-canvas-light',
                )}
                strokeWidth={1.2}
              />
            ))}
          {/* Hover marker — sempre visível, inclusive em hourly. */}
          {hover != null && n > 32 && (
            <circle
              cx={x(hover)}
              cy={y(data[hover].count)}
              r={3}
              className="stroke-primary fill-primary"
              strokeWidth={1.2}
            />
          )}
          {/* Hover crosshair */}
          {hover != null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="currentColor"
              className="text-primary/40"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          )}
        </svg>
      </div>
    </section>
  );
}

/**
 * Constrói `path` SVG cubic-bezier suave passando por todos os pontos.
 * Usa control points derivados de Catmull-Rom (alpha=0.5) — curvatura
 * limitada pra evitar overshoot quando há mudanças bruscas (zero → pico).
 *
 * Retorna `M x0,y0 C cx1,cy1 cx2,cy2 x1,y1 ...` ou string vazia quando
 * `points.length === 0`. Para 1 ponto, retorna apenas o `M`. Para 2+
 * pontos, encadeia segmentos cubic com tensão suave.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  const TENSION = 0.5; // 0 = corda reta, 1 = curva muito ampla
  const parts: string[] = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * TENSION;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * TENSION;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * TENSION;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * TENSION;
    parts.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    );
  }
  return parts.join(' ');
}

/**
 * Formata o `date` do bucket de timeseries dependendo da granularidade.
 *   - `hour`: backend manda ISO completo (`2026-05-21T01:00:00+00:00`).
 *             Eixo X → `HH:00`. Tooltip → `DD/MM HH:00`.
 *   - `day` / `week`: backend manda `YYYY-MM-DD`. Eixo X → `DD/MM`.
 *             Tooltip → `DD/MM` (já legível).
 */
function formatBucketDate(
  iso: string,
  bucket: 'hour' | 'day' | 'week',
  variant: 'axis' | 'tooltip',
): string {
  if (bucket === 'hour') {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const hh = d.getHours().toString().padStart(2, '0');
    if (variant === 'axis') return `${hh}:00`;
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dd}/${mm} ${hh}:00`;
  }
  // YYYY-MM-DD → DD/MM (pt-BR curto).
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const dayPart = parts[2].slice(0, 2);
  return `${dayPart}/${parts[1]}`;
}

function Overview({
  data,
  period,
}: {
  data: WorkshopMetrics;
  period: Period;
}) {
  const delta = data.delta_pct;
  const hasDelta = delta !== null && Number.isFinite(delta);
  const arrow = hasDelta && delta! > 0
    ? ArrowUp
    : hasDelta && delta! < 0
      ? ArrowDown
      : Minus;
  const ArrowIcon = arrow;
  const tone =
    hasDelta && delta! > 0
      ? 'text-success bg-success/10 border-success/40'
      : hasDelta && delta! < 0
        ? 'text-danger bg-danger/10 border-danger/40'
        : 'text-muted-on-light bg-raised-light border-border-light';
  return (
    <article className="border border-border-light bg-raised-light/40 px-3 py-3 flex items-end gap-4">
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
          Total de eventos · {PERIOD_LABEL[period]}
        </p>
        <p
          className="text-[28px] font-mono font-semibold text-text-on-light leading-none"
          data-testid="metrics-overview-total"
        >
          {data.total_events.toLocaleString('pt-BR')}
        </p>
        <p className="text-[10.5px] text-muted-on-light mt-1">
          Período anterior: {data.total_previous.toLocaleString('pt-BR')}
        </p>
      </div>
      <div
        className={cn(
          'h-7 px-2 inline-flex items-center gap-1 border text-[11px] font-mono font-semibold',
          tone,
        )}
        data-testid="metrics-overview-delta"
      >
        <ArrowIcon className="w-3 h-3" strokeWidth={1.5} />
        {hasDelta ? `${delta! > 0 ? '+' : ''}${delta!.toFixed(1)}%` : '—'}
      </div>
    </article>
  );
}

function Section({
  title,
  rows,
  emptyHint,
  testId,
}: {
  title: string;
  rows: { label: string; count: number }[];
  emptyHint: string;
  testId: string;
}) {
  const max = rows.reduce((acc, r) => Math.max(acc, r.count), 0);
  return (
    <section
      data-testid={testId}
      className="border border-border-light bg-canvas-light"
    >
      <header className="h-7 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center">
        <p className="text-[10px] uppercase tracking-[0.16em] font-mono font-semibold text-text-on-light flex-1">
          {title}
        </p>
        <p className="text-[10px] text-muted-on-light font-mono">
          {rows.length}
        </p>
      </header>
      <div className="divide-y divide-border-light/60">
        {rows.length === 0 && (
          <p className="px-2.5 py-2 text-[11px] text-muted-on-light italic">
            {emptyHint}
          </p>
        )}
        {rows.map((r, i) => {
          const pct = max > 0 ? (r.count / max) * 100 : 0;
          return (
            <div
              key={`${r.label}-${i}`}
              className="px-2.5 py-1.5 flex items-center gap-2"
            >
              <p
                className="text-[11px] text-text-on-light truncate"
                style={{ flexBasis: '40%' }}
                title={r.label}
              >
                {r.label}
              </p>
              <div className="flex-1 h-2.5 bg-raised-light border border-border-light relative">
                <div
                  className="absolute inset-y-0 left-0 bg-primary/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] font-mono text-muted-on-light tabular-nums w-12 text-right">
                {r.count.toLocaleString('pt-BR')}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
