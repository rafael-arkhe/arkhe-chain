'use client';

/**
 * Autopilot Workbench — Wave H.3 (2026-05-23).
 *
 * "Modo Workbench" para a página Autopilot: layout 3-pane com
 *   - Esquerda: lista de runs persistidos (Autopilot.listMine)
 *   - Centro: Kanban 4 colunas (Queued / Running / Done / Failed)
 *             com animated dashed lines entre cards via CSS keyframes
 *   - Direita: detalhe do step selecionado (steps_ran + budget meters)
 *
 * ADD alongside conforme memória `feedback_no_deprecation_of_existing_code`.
 * O fluxo original 2-pane (configurador esquerda · execução direita) continua
 * disponível pelo toggle no topo da página.
 *
 * Pause/Resume: backend (`/platform/v23/autopilot/{id}`) NÃO suporta
 * pause/resume ainda; mostramos botões desabilitados com tooltip
 * "Não suportado ainda" (memória `feedback_propose_before_execute` — sem
 * teatro de fake actions).
 */
import * as React from 'react';
import {
  CircuitBoard,
  CheckCircle2,
  AlertCircle,
  TimerOff,
  Flag,
  Pause,
  Play,
  Loader2,
  RefreshCw,
  Inbox,
  ListOrdered,
  Activity,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Autopilot,
  type AutopilotListItem,
  type AutopilotRunOut,
  type AutopilotStepOut,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { formatDataHoraBR } from '@/lib/datetime';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

/** Mapeia status do AutopilotRunOut em coluna do Kanban. */
function statusColumn(status: string): 'queued' | 'running' | 'done' | 'failed' {
  if (status === 'PENDING' || status === 'QUEUED') return 'queued';
  if (status === 'RUNNING') return 'running';
  if (status === 'SUCCESS' || status === 'TERMINATED') return 'done';
  if (status === 'BUDGET_EXHAUSTED') return 'done';
  return 'failed';
}

const COLUMNS = [
  { id: 'queued' as const, label: 'Em fila', icon: Inbox, tone: 'border-muted-on-light/30 text-muted-on-light' },
  { id: 'running' as const, label: 'Executando', icon: Activity, tone: 'border-primary/40 text-primary' },
  { id: 'done' as const, label: 'Concluído', icon: CheckCircle2, tone: 'border-success/40 text-success' },
  { id: 'failed' as const, label: 'Falha', icon: AlertCircle, tone: 'border-danger/40 text-danger' },
];

export function AutopilotWorkbench({ refreshKey }: { refreshKey: number }) {
  const [runs, setRuns] = React.useState<AutopilotListItem[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<AutopilotRunOut | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const refresh = React.useCallback(() => {
    setErr(null);
    Autopilot.listMine(50)
      .then((rs) => setRuns(rs))
      .catch((e) => setErr(humanise(e)));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  // Polling 3s pra live (Wave H.3 — memória `feedback_aip_e2e_real_llm`: real
  // refresh, sem WebSocket fake). Para se nenhum run estiver RUNNING.
  React.useEffect(() => {
    const hasRunning = (runs ?? []).some((r) => r.status === 'RUNNING');
    if (!hasRunning) return;
    const t = window.setInterval(refresh, 3000);
    return () => window.clearInterval(t);
  }, [runs, refresh]);

  async function selectRun(id: string) {
    if (selectedId === id) return;
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await Autopilot.get(id);
      setDetail(r);
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setDetailLoading(false);
    }
  }

  const grouped = React.useMemo(() => {
    const map: Record<'queued' | 'running' | 'done' | 'failed', AutopilotListItem[]> = {
      queued: [],
      running: [],
      done: [],
      failed: [],
    };
    for (const r of runs ?? []) {
      map[statusColumn(r.status)].push(r);
    }
    return map;
  }, [runs]);

  return (
    <div
      className="grid grid-cols-12 gap-0 min-h-[calc(100vh-260px)]"
      data-testid="autopilot-workbench"
    >
      {/* ESQ — Lista */}
      <aside
        className="col-span-3 border-r border-border-light bg-white overflow-y-auto"
        data-testid="autopilot-workbench-list"
      >
        <header className="px-3 py-2 border-b border-border-light flex items-center justify-between bg-canvas-light">
          <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold flex items-center gap-1">
            <ListOrdered className="w-3 h-3" strokeWidth={1.5} />
            Runs ({runs?.length ?? 0})
          </h3>
          <button
            type="button"
            onClick={refresh}
            className="text-muted-on-light hover:text-text-on-light p-1"
            aria-label="Atualizar"
            data-testid="autopilot-workbench-refresh"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </header>
        {err && (
          <p className="px-3 py-2 text-[10.5px] font-mono text-danger" data-testid="autopilot-workbench-error">
            {err}
          </p>
        )}
        {runs !== null && runs.length === 0 && (
          <p className="px-3 py-3 text-[11px] text-muted-on-light">
            Nenhum autopilot ainda. Dispare um pelo Modo Avançado.
          </p>
        )}
        <ul data-testid="autopilot-workbench-runs">
          {(runs ?? []).map((r) => {
            const active = selectedId === r.autopilot_run_id;
            return (
              <li key={r.autopilot_run_id}>
                <button
                  type="button"
                  onClick={() => void selectRun(r.autopilot_run_id)}
                  data-active={active ? 'true' : 'false'}
                  data-testid={`autopilot-workbench-run-${r.autopilot_run_id}`}
                  className={
                    'w-full text-left px-3 py-2 border-b border-border-light hover:bg-canvas-light ' +
                    (active ? 'bg-primary/5 border-l-2 border-l-primary' : '')
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <FinalStatusInline status={r.status} />
                    <span className="text-[11.5px] font-semibold text-text-on-light truncate flex-1 min-w-0">
                      {r.goal}
                    </span>
                  </div>
                  <p className="text-[9.5px] font-mono text-muted-on-light mt-0.5">
                    {formatDataHoraBR(r.started_at)} · {r.steps_ran} step{r.steps_ran === 1 ? '' : 's'}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* CENTRO — Kanban */}
      <section
        className="col-span-6 bg-canvas-light overflow-x-auto"
        data-testid="autopilot-workbench-kanban"
      >
        <div className="grid grid-cols-4 gap-0 h-full">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            return (
              <div
                key={col.id}
                className="border-r border-border-light bg-white flex flex-col"
                data-testid={`autopilot-kanban-col-${col.id}`}
              >
                <header
                  className={'px-3 py-2 border-b-2 ' + col.tone + ' flex items-center gap-2 bg-canvas-light'}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="text-[10.5px] uppercase tracking-wider font-semibold">
                    {col.label}
                  </span>
                  <span className="text-[10px] font-mono text-muted-on-light ml-auto">
                    {grouped[col.id].length}
                  </span>
                </header>
                <ul className="p-2 space-y-2 flex-1 ah3-kanban-col">
                  {grouped[col.id].map((r, i) => (
                    <li
                      key={r.autopilot_run_id}
                      className="bg-white border border-border-light p-2 cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => void selectRun(r.autopilot_run_id)}
                      data-testid={`autopilot-kanban-card-${r.autopilot_run_id}`}
                      data-position={i}
                    >
                      <p className="text-[11px] font-semibold text-text-on-light truncate">
                        {r.goal}
                      </p>
                      <p className="text-[9.5px] font-mono text-muted-on-light mt-0.5">
                        {r.action_name} · {r.steps_ran}/{Math.max(r.steps_ran, 1)}
                      </p>
                      {r.status === 'RUNNING' && (
                        <div
                          className="mt-1.5 ah3-dashed-progress"
                          aria-hidden="true"
                          data-testid={`autopilot-kanban-card-${r.autopilot_run_id}-progress`}
                        />
                      )}
                      <p className="text-[9px] font-mono text-muted-on-light mt-1 truncate">
                        {r.autopilot_run_id.slice(0, 8)} · {Math.round(r.elapsed_s * 10) / 10}s
                      </p>
                    </li>
                  ))}
                  {grouped[col.id].length === 0 && (
                    <li className="text-[10.5px] text-muted-on-light italic px-1">
                      vazio
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* DIR — Detalhe */}
      <aside
        className="col-span-3 border-l border-border-light bg-white overflow-y-auto"
        data-testid="autopilot-workbench-detail"
      >
        <header className="px-3 py-2 border-b border-border-light bg-canvas-light flex items-center gap-2">
          <CircuitBoard className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            Detalhe
          </h3>
        </header>
        {detailLoading && (
          <p className="px-3 py-3 text-[11px] font-mono text-muted-on-light flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            Carregando…
          </p>
        )}
        {!selectedId && !detailLoading && (
          <p className="px-3 py-3 text-[11px] text-muted-on-light" data-testid="autopilot-workbench-no-selection">
            Selecione um run na lista à esquerda ou clique num card no Kanban.
          </p>
        )}
        {detail && (
          <div className="p-3 space-y-3" data-testid="autopilot-workbench-detail-body">
            <p className="text-[12px] font-semibold text-text-on-light">
              {detail.goal}
            </p>
            <p className="text-[10.5px] font-mono text-muted-on-light italic">
              {detail.reason}
            </p>

            <BudgetMeter
              label="Steps"
              current={detail.steps_ran}
              max={Math.max(detail.steps_ran, 1)}
              testid="autopilot-workbench-budget-steps"
            />
            <BudgetMeter
              label="Tempo"
              current={Math.round(detail.elapsed_s * 10) / 10}
              max={Math.max(detail.elapsed_s, 1)}
              unit="s"
              testid="autopilot-workbench-budget-time"
            />

            <div
              className="border border-border-light bg-canvas-light px-2 py-1.5 space-y-1"
              data-testid="autopilot-workbench-controls"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                Controles
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled
                  title="Não suportado ainda"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-mono border border-border-light bg-canvas-light text-muted-on-light cursor-not-allowed"
                  data-testid="autopilot-workbench-pause"
                  aria-label="Pausar (não suportado ainda)"
                >
                  <Pause className="w-3 h-3" strokeWidth={1.5} />
                  Pausar
                </button>
                <button
                  type="button"
                  disabled
                  title="Não suportado ainda"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-mono border border-border-light bg-canvas-light text-muted-on-light cursor-not-allowed"
                  data-testid="autopilot-workbench-resume"
                  aria-label="Retomar (não suportado ainda)"
                >
                  <Play className="w-3 h-3" strokeWidth={1.5} />
                  Retomar
                </button>
              </div>
              <p className="text-[9.5px] text-muted-on-light leading-snug">
                Backend ainda não expõe pause/resume — botões ficam desabilitados
                até endpoint estar disponível.
              </p>
            </div>

            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1.5">
                Steps ({detail.steps.length})
              </h4>
              <ol className="space-y-1.5" data-testid="autopilot-workbench-steps">
                {detail.steps.map((s) => (
                  <StepRow key={s.step_index} step={s} runId={detail.autopilot_run_id} />
                ))}
                {detail.steps.length === 0 && (
                  <li className="text-[10.5px] text-muted-on-light italic">
                    Loop não rodou nenhum step.
                  </li>
                )}
              </ol>
            </div>
          </div>
        )}
      </aside>

      {/* CSS injection for the animated dashed lines (no global stylesheet
          edits — keeps the Wave H.3 effect self-contained). */}
      <style jsx global>{`
        @keyframes ah3-dashed-flow {
          to {
            background-position: 12px 0;
          }
        }
        .ah3-dashed-progress {
          height: 2px;
          width: 100%;
          background-image: linear-gradient(
            90deg,
            transparent 0,
            transparent 4px,
            currentColor 4px,
            currentColor 8px
          );
          background-size: 12px 100%;
          color: rgb(99 102 241);
          animation: ah3-dashed-flow 0.6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ah3-dashed-progress {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function StepRow({ step, runId }: { step: AutopilotStepOut; runId: string }) {
  const tone =
    step.status === 'SUCCESS'
      ? 'border-success/40 text-success bg-success/5'
      : 'border-danger/40 text-danger bg-danger/5';
  return (
    <li
      className="bg-white border border-border-light p-2"
      data-testid={`autopilot-workbench-step-${runId}-${step.step_index}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-text-on-light">
          #{step.step_index + 1}
        </span>
        <span className={`text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 border ${tone}`}>
          {step.status}
        </span>
        <span className="text-[9.5px] font-mono text-muted-on-light">
          {step.duration_ms ?? 0} ms
        </span>
      </div>
      {step.output && Object.keys(step.output).length > 0 && (
        <pre className="text-[10px] font-mono mt-1 text-text-on-light whitespace-pre-wrap break-all bg-canvas-light border border-border-light p-1.5 max-h-32 overflow-auto">
          {JSON.stringify(step.output, null, 2)}
        </pre>
      )}
    </li>
  );
}

function BudgetMeter({
  label,
  current,
  max,
  unit,
  testid,
}: {
  label: string;
  current: number;
  max: number;
  unit?: string;
  testid: string;
}) {
  const pct = Math.min(100, Math.max(0, max === 0 ? 0 : (current / max) * 100));
  const tone = pct >= 90 ? 'bg-danger' : pct >= 60 ? 'bg-warning' : 'bg-primary';
  return (
    <div data-testid={testid}>
      <div className="flex items-center justify-between text-[10.5px] font-mono text-muted-on-light mb-1">
        <span>{label}</span>
        <span>
          {current}
          {unit ?? ''} / {max}
          {unit ?? ''}
        </span>
      </div>
      <div className="w-full h-1.5 bg-canvas-light border border-border-light overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FinalStatusInline({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; cls: string }> = {
    SUCCESS: {
      icon: <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />,
      cls: 'text-success',
    },
    TERMINATED: { icon: <Flag className="w-3 h-3" strokeWidth={1.5} />, cls: 'text-primary' },
    BUDGET_EXHAUSTED: {
      icon: <TimerOff className="w-3 h-3" strokeWidth={1.5} />,
      cls: 'text-warning',
    },
    FAILED: { icon: <AlertCircle className="w-3 h-3" strokeWidth={1.5} />, cls: 'text-danger' },
    RUNNING: { icon: <Activity className="w-3 h-3" strokeWidth={1.5} />, cls: 'text-primary' },
  };
  const c = cfg[status] ?? { icon: null, cls: 'text-muted-on-light' };
  return <span className={c.cls}>{c.icon}</span>;
}
