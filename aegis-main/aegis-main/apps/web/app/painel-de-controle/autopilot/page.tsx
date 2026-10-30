'use client';

/**
 * Rotinas — Painel de Controle.
 *
 * Uma rotina repete UMA ação automática num laço com limites de segurança
 * (quantas vezes + por quanto tempo) e, opcionalmente, uma condição de
 * parada. Encerra ao concluir, ao falhar, ao atingir o limite ou ao casar
 * a condição de parada.
 *
 * Backend: POST /platform/v23/autopilot/run · GET /platform/v23/autopilot/{id}
 * · GET /platform/v23/autopilot (histórico). Contratos inalterados.
 *
 * ── Redesign visual ──────────────────────────────────────────────────────
 * A configuração vira UMA FRASE legível com controles inline, em vez de uma
 * pilha de campos rotulados:
 *
 *     Repetir   [ uma ação ▾ ]
 *     até        (•) o resultado disser [ ok ]   ( ) terminar sozinho   …
 *     no máximo   ●——— 10 vezes    ·    ●—— 60 s
 *                          [ ▶ Iniciar rotina ]
 *
 * Em execução / depois: um ANEL de progresso (SVG) mostra repetições usadas
 * vs limite + tempo, com estado final em pt-BR claro (Concluída / Falhou /
 * Atingiu o limite / Parou na condição). Os passos viram uma lista compacta;
 * o JSON cru fica atrás de "Detalhes técnicos".
 *
 * "Avançado" guarda a entrada JSON da ação (caminho de poder, fora do
 * caminho comum). "Quadro" mantém a visão Kanban (AutopilotWorkbench).
 */
import * as React from 'react';
import {
  CircuitBoard,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TimerOff,
  Flag,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { AUTOMACAO_TABS } from '@/components/control-panel/hub-tabs';
import { CpErrorState } from '@/components/control-panel/cp-skeleton';
import { AutopilotWorkbench } from '@/components/wave-h3/autopilot-workbench';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ActionTypes,
  Autopilot,
  type ActionTypeOut,
  type AutopilotListItem,
  type AutopilotRunOut,
  type AutopilotTerminator,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { formatDataHoraBR } from '@/lib/datetime';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

/** Modo da condição "até" — escolha visual única (segmented). */
type StopMode = 'self' | 'contains' | 'eq';

/** Modo da página: frase visual (default) vs Kanban. */
type AutopilotView = 'routine' | 'workbench';

export default function AutopilotPage() {
  return (
    <RequirePerm perm="ontology.actions.execute">
      <AutopilotInner />
    </RequirePerm>
  );
}

function AutopilotInner() {
  const [view, setView] = React.useState<AutopilotView>('routine');
  const [workbenchKey, setWorkbenchKey] = React.useState(0);

  const [actions, setActions] = React.useState<ActionTypeOut[] | null>(null);
  const [actionsErr, setActionsErr] = React.useState<string | null>(null);

  const [actionId, setActionId] = React.useState('');
  const [inputText, setInputText] = React.useState('{}');

  // Condição "até" — escolha única e visual.
  const [stopMode, setStopMode] = React.useState<StopMode>('self');
  const [termContains, setTermContains] = React.useState('');
  const [termPath, setTermPath] = React.useState('');
  const [termValue, setTermValue] = React.useState('');

  // Limites — pré-preenchidos com defaults sensatos (caminho feliz = zero
  // input extra).
  const [maxSteps, setMaxSteps] = React.useState(10);
  const [maxDuration, setMaxDuration] = React.useState(60);

  // Avançado — entrada JSON da ação fica fora do caminho comum.
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const [running, setRunning] = React.useState(false);
  const [runErr, setRunErr] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<AutopilotRunOut | null>(null);

  // Histórico persistido (GET /platform/v23/autopilot) — sobrevive ao reload.
  const [archive, setArchive] = React.useState<AutopilotListItem[] | null>(null);
  const [archiveErr, setArchiveErr] = React.useState<string | null>(null);

  const refreshActions = React.useCallback(() => {
    setActionsErr(null);
    ActionTypes.list()
      .then(setActions)
      .catch((e) => setActionsErr(humanise(e)));
  }, []);

  const refreshArchive = React.useCallback(() => {
    setArchiveErr(null);
    Autopilot.listMine(50)
      .then(setArchive)
      .catch((e) => setArchiveErr(humanise(e)));
  }, []);

  React.useEffect(() => {
    refreshActions();
    refreshArchive();
  }, [refreshActions, refreshArchive]);

  /** Backend recusa actions non-auto-approvable — só elas entram no picker. */
  const eligibleActions = React.useMemo(
    () => (actions ?? []).filter((a) => a.auto_approvable),
    [actions],
  );

  const selectedAction = React.useMemo(
    () => eligibleActions.find((a) => a.id === actionId) ?? null,
    [eligibleActions, actionId],
  );

  async function runRoutine() {
    setRunErr(null);
    if (!actionId || !selectedAction) {
      setRunErr('Escolha uma ação para repetir.');
      return;
    }

    // O backend exige um objetivo (≥3 chars). Derivamos da ação escolhida —
    // o operador não precisa digitar nada no caminho feliz.
    const goal = `Repetir a ação ${selectedAction.name} até concluir`;

    let payload: Record<string, unknown> = {};
    try {
      payload = inputText.trim() ? JSON.parse(inputText) : {};
    } catch {
      setRunErr('A entrada (JSON) em Avançado está inválida.');
      setAdvancedOpen(true);
      return;
    }

    let terminator: AutopilotTerminator | undefined;
    if (stopMode === 'contains') {
      if (!termContains.trim()) {
        setRunErr('Diga qual texto o resultado precisa conter para parar.');
        return;
      }
      terminator = { output_contains: termContains.trim() };
    } else if (stopMode === 'eq') {
      if (!termPath.trim()) {
        setRunErr('Diga qual campo observar para parar (ex.: status).');
        return;
      }
      // Tenta JSON (number/bool/null); cai para string literal.
      let parsedValue: unknown = termValue;
      try {
        parsedValue = JSON.parse(termValue);
      } catch {
        /* string literal */
      }
      terminator = {
        output_eq_path: termPath.trim(),
        output_eq_value: parsedValue,
      };
    }

    setRunning(true);
    setRun(null);
    try {
      const r = await Autopilot.run({
        goal,
        action_id: actionId,
        input: payload,
        max_steps: maxSteps,
        max_duration_s: maxDuration,
        terminator,
      });
      setRun(r);
      refreshArchive();
      setWorkbenchKey((k) => k + 1);
    } catch (e) {
      setRunErr(humanise(e));
    } finally {
      setRunning(false);
    }
  }

  const noEligible = actions !== null && eligibleActions.length === 0;

  return (
    <div data-testid="autopilot-page">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <CircuitBoard className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            Rotinas
          </span>
        }
        subtitle="Monte uma rotina como uma frase: repetir uma ação até concluir, com os limites de segurança que você definir."
        actions={
          <div
            role="tablist"
            aria-label="Modo de uso das rotinas"
            className="inline-flex border border-border-light bg-canvas-light"
            data-testid="autopilot-mode-toggle"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'routine'}
              onClick={() => setView('routine')}
              data-testid="autopilot-mode-routine"
              className={
                'px-3 py-1.5 text-[11.5px] uppercase tracking-wider font-semibold transition-colors ' +
                (view === 'routine'
                  ? 'bg-primary text-white'
                  : 'text-muted-on-light hover:text-text-on-light')
              }
            >
              Rotina
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'workbench'}
              onClick={() => setView('workbench')}
              data-testid="autopilot-mode-workbench"
              className={
                'px-3 py-1.5 text-[11.5px] uppercase tracking-wider font-semibold border-l border-border-light transition-colors ' +
                (view === 'workbench'
                  ? 'bg-primary text-white'
                  : 'text-muted-on-light hover:text-text-on-light')
              }
            >
              Quadro
            </button>
          </div>
        }
      />
      <CpHubSubnav group="Automação" tabs={AUTOMACAO_TABS} />

      {view === 'workbench' && <AutopilotWorkbench refreshKey={workbenchKey} />}

      {view === 'routine' && (
        <div className="p-6 space-y-6">
          {actionsErr && (
            <CpErrorState
              title="Falha ao carregar o catálogo de ações"
              description={actionsErr}
              retry={refreshActions}
              diagnostic={{
                path: '/platform/v23/action-types',
                message: actionsErr,
              }}
            />
          )}

          {/* ───────────────── A FRASE (composer visual) ───────────────── */}
          {noEligible ? (
            <NoEligibleNotice />
          ) : (
            <section
              className="bg-white border border-border-light p-6"
              data-testid="autopilot-composer"
            >
              <div className="space-y-5 max-w-[760px]">
                {/* Linha 1 — Repetir [ação] */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <SentenceWord>Repetir</SentenceWord>
                  <select
                    value={actionId}
                    onChange={(e) => setActionId(e.target.value)}
                    disabled={actions === null}
                    aria-label="Ação a repetir"
                    data-testid="autopilot-action"
                    className="h-9 min-w-[260px] bg-canvas-light border-b-2 border-primary px-2 text-[14px] font-semibold text-text-on-light rounded-none focus:outline-none focus:border-primary-hover disabled:opacity-50"
                  >
                    <option value="">escolha uma ação…</option>
                    {eligibleActions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedAction?.description && (
                  <p
                    className="text-[11.5px] text-muted-on-light -mt-2"
                    data-testid="autopilot-action-desc"
                  >
                    {selectedAction.description}
                  </p>
                )}

                {/* Linha 2 — até [condição] (escolha visual única) */}
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <SentenceWord className="pt-2">até</SentenceWord>
                  <div
                    role="radiogroup"
                    aria-label="Condição para parar a rotina"
                    data-testid="autopilot-stop-mode"
                    className="flex flex-col gap-2"
                  >
                    <StopChoice
                      checked={stopMode === 'self'}
                      onSelect={() => setStopMode('self')}
                      testid="autopilot-stop-self"
                      label="terminar sozinho"
                      hint="repete até atingir o limite, sem condição extra"
                    />
                    <StopChoice
                      checked={stopMode === 'contains'}
                      onSelect={() => setStopMode('contains')}
                      testid="autopilot-stop-contains"
                      label="o resultado disser"
                    >
                      {stopMode === 'contains' && (
                        <Input
                          value={termContains}
                          onChange={(e) => setTermContains(e.target.value)}
                          placeholder="ok"
                          aria-label="Texto que o resultado precisa conter"
                          data-testid="autopilot-term-contains"
                          className="h-8 w-40 bg-canvas-light"
                        />
                      )}
                    </StopChoice>
                    <StopChoice
                      checked={stopMode === 'eq'}
                      onSelect={() => setStopMode('eq')}
                      testid="autopilot-stop-eq"
                      label="um campo"
                    >
                      {stopMode === 'eq' && (
                        <>
                          <Input
                            value={termPath}
                            onChange={(e) => setTermPath(e.target.value)}
                            placeholder="status"
                            aria-label="Nome do campo a observar"
                            data-testid="autopilot-term-path"
                            className="h-8 w-32 bg-canvas-light"
                          />
                          <span className="text-[13px] text-muted-on-light">
                            for
                          </span>
                          <Input
                            value={termValue}
                            onChange={(e) => setTermValue(e.target.value)}
                            placeholder="concluído"
                            aria-label="Valor esperado do campo"
                            data-testid="autopilot-term-value"
                            className="h-8 w-32 bg-canvas-light"
                          />
                        </>
                      )}
                    </StopChoice>
                  </div>
                </div>

                {/* Linha 3 — no máximo [N vezes] · [T s] */}
                <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
                  <SentenceWord className="pt-1">no máximo</SentenceWord>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    <LimitSlider
                      value={maxSteps}
                      min={1}
                      max={200}
                      onChange={setMaxSteps}
                      testid="autopilot-max-steps"
                      label={`${maxSteps} ${maxSteps === 1 ? 'vez' : 'vezes'}`}
                    />
                    <span className="text-[13px] text-muted-on-light pb-1">
                      ·
                    </span>
                    <LimitSlider
                      value={maxDuration}
                      min={5}
                      max={3600}
                      onChange={setMaxDuration}
                      testid="autopilot-max-duration"
                      label={`${maxDuration} s`}
                    />
                  </div>
                </div>

                {/* Avançado — entrada JSON da ação (caminho de poder) */}
                <div className="border border-border-light">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((o) => !o)}
                    aria-expanded={advancedOpen}
                    data-testid="autopilot-advanced-toggle"
                    className="w-full flex items-center justify-between px-3 py-2 bg-canvas-light text-[10px] uppercase tracking-wider text-muted-on-light font-semibold hover:text-text-on-light transition-colors"
                  >
                    Avançado
                    {advancedOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                    )}
                  </button>
                  {advancedOpen && (
                    <div className="p-3 space-y-1 border-t border-border-light">
                      <label
                        htmlFor="autopilot-input"
                        className="text-[10px] uppercase tracking-wider text-muted-on-light"
                      >
                        Entrada da ação (JSON, opcional)
                      </label>
                      <textarea
                        id="autopilot-input"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        rows={4}
                        spellCheck={false}
                        data-testid="autopilot-input"
                        className="w-full font-mono text-[11px] bg-canvas-light border border-border-light px-2 py-1.5 rounded-none focus:border-primary outline-none"
                      />
                      <p className="text-[10.5px] text-muted-on-light">
                        Deixe vazio para usar a ação sem parâmetros. Os mesmos
                        parâmetros são reaproveitados em cada repetição.
                      </p>
                    </div>
                  )}
                </div>

                {runErr && (
                  <div
                    className="px-3 py-2 text-[12px] text-danger bg-danger/5 border border-danger/30"
                    data-testid="autopilot-error"
                  >
                    {runErr}
                  </div>
                )}

                {/* Ação primária */}
                <div className="pt-1">
                  <Button
                    variant="success"
                    size="lg"
                    onClick={runRoutine}
                    disabled={running}
                    className="h-11 text-[14px]"
                    data-testid="autopilot-run"
                  >
                    {running ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                        Iniciando rotina…
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" strokeWidth={1.5} />
                        Iniciar rotina
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* ───────────────── EM EXECUÇÃO / RESULTADO ───────────────── */}
          {(running || run) && (
            <section
              className="bg-white border border-border-light p-6"
              data-testid="autopilot-output"
            >
              {running && !run && (
                <div
                  className="flex items-center gap-3"
                  data-testid="autopilot-running"
                >
                  <ProgressRing
                    current={0}
                    max={maxSteps}
                    spinning
                    testid="autopilot-progress-ring"
                  />
                  <div>
                    <p className="text-[14px] font-semibold text-text-on-light">
                      Em execução
                    </p>
                    <p className="text-[12px] text-muted-on-light">
                      A rotina começou. Os resultados aparecem aqui em segundos.
                    </p>
                  </div>
                </div>
              )}

              {run && (
                <div className="space-y-5" data-testid="autopilot-run-detail">
                  <div className="flex items-start gap-5 flex-wrap">
                    <ProgressRing
                      current={run.steps_ran}
                      max={maxSteps}
                      status={run.status}
                      testid="autopilot-progress-ring"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <FinalStatusBadge
                        status={run.status}
                        testid="autopilot-status-badge"
                      />
                      <p className="text-[13px] text-text-on-light font-semibold">
                        {run.steps_ran}{' '}
                        {run.steps_ran === 1 ? 'repetição' : 'repetições'}
                        {' · '}
                        {Math.round(run.elapsed_s * 10) / 10}s
                      </p>
                      <p className="text-[12px] text-muted-on-light">
                        {plainReason(run.status)}
                      </p>
                      <p className="text-[10px] font-mono text-muted-on-light">
                        início {formatDataHoraBR(run.started_at)} · fim{' '}
                        {formatDataHoraBR(run.finished_at)}
                      </p>
                    </div>
                  </div>

                  {/* Passos como lista compacta */}
                  <div>
                    <h3 className="text-[11px] uppercase tracking-wider text-muted-on-light font-mono mb-2">
                      Repetições ({run.steps.length})
                    </h3>
                    {run.steps.length === 0 ? (
                      <p className="text-[11px] text-muted-on-light">
                        A rotina não chegou a executar nenhuma repetição.
                      </p>
                    ) : (
                      <ol className="space-y-1.5" data-testid="autopilot-steps">
                        {run.steps.map((s) => (
                          <li
                            key={s.step_index}
                            className="bg-canvas-light border border-border-light p-2"
                            data-testid={`autopilot-step-${s.step_index}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11.5px] font-semibold text-text-on-light">
                                #{s.step_index + 1}
                              </span>
                              <span
                                className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 border ${
                                  s.status === 'SUCCESS'
                                    ? 'border-success/40 text-success bg-success/5'
                                    : 'border-danger/40 text-danger bg-danger/5'
                                }`}
                              >
                                {s.status === 'SUCCESS' ? 'OK' : 'Falhou'}
                              </span>
                              <span className="text-[10px] font-mono text-muted-on-light">
                                {s.duration_ms ?? 0} ms
                              </span>
                            </div>
                            {s.output && Object.keys(s.output).length > 0 && (
                              <details className="mt-1.5 text-[10.5px] text-muted-on-light">
                                <summary className="cursor-pointer hover:text-text-on-light select-none">
                                  Detalhes técnicos
                                </summary>
                                <pre className="font-mono mt-1.5 text-text-on-light whitespace-pre-wrap break-all bg-white border border-border-light p-1.5">
                                  {JSON.stringify(s.output, null, 2)}
                                </pre>
                              </details>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ───────────────── HISTÓRICO ───────────────── */}
          <section
            className="bg-white border border-border-light p-6"
            data-testid="autopilot-archive"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-text-on-light">
                Histórico
              </h2>
              <span className="text-[10px] font-mono text-muted-on-light">
                {archive?.length ?? 0}{' '}
                {(archive?.length ?? 0) === 1 ? 'rotina' : 'rotinas'}
              </span>
            </div>

            {archiveErr && (
              <p
                className="text-[10.5px] font-mono text-danger"
                data-testid="autopilot-archive-error"
              >
                {archiveErr}
              </p>
            )}

            {archive !== null && archive.length === 0 ? (
              <p className="text-[11px] text-muted-on-light">
                Nenhuma rotina ainda. A primeira que você iniciar fica
                registrada aqui.
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="autopilot-archive-list">
                {(archive ?? []).map((a) => (
                  <li
                    key={a.autopilot_run_id}
                    className="bg-canvas-light border border-border-light p-2"
                    data-testid={`autopilot-archive-${a.autopilot_run_id}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <FinalStatusBadge status={a.status} />
                      <span className="text-[11.5px] font-semibold text-text-on-light truncate flex-1 min-w-0">
                        {a.goal}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-on-light mt-1">
                      {formatDataHoraBR(a.started_at)} · {a.steps_ran}{' '}
                      {a.steps_ran === 1 ? 'repetição' : 'repetições'} ·{' '}
                      {Math.round(a.elapsed_s * 10) / 10}s · {a.initiated_by}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/** Palavra fixa da frase ("Repetir", "até", "no máximo"). */
function SentenceWord({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[14px] text-muted-on-light shrink-0 ${className}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/** Uma opção da escolha "até" (radio visual sharp). */
function StopChoice({
  checked,
  onSelect,
  label,
  hint,
  testid,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  testid: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={onSelect}
        data-testid={testid}
        className={
          'inline-flex items-center gap-2 px-2 py-1 border text-[13px] transition-colors ' +
          (checked
            ? 'border-primary bg-primary/5 text-text-on-light'
            : 'border-border-light text-muted-on-light hover:text-text-on-light hover:border-muted-on-light')
        }
      >
        <span
          aria-hidden
          className={
            'w-3 h-3 border flex items-center justify-center ' +
            (checked ? 'border-primary' : 'border-muted-on-light')
          }
        >
          {checked && <span className="w-1.5 h-1.5 bg-primary" />}
        </span>
        {label}
      </button>
      {children}
      {hint && !children && (
        <span className="text-[11px] text-muted-on-light">{hint}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/** Slider de limite com rótulo inline grande e legível. */
function LimitSlider({
  value,
  min,
  max,
  onChange,
  label,
  testid,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  testid: string;
}) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-primary"
        data-testid={testid}
      />
      <span className="text-[14px] font-semibold text-text-on-light tabular-nums min-w-[72px]">
        {label}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * Anel de progresso (SVG) — repetições usadas vs limite. Sem rounded-*; o
 * arredondamento vem do traço circular do SVG, permitido pela DS.
 */
function ProgressRing({
  current,
  max,
  status,
  spinning,
  testid,
}: {
  current: number;
  max: number;
  status?: string;
  spinning?: boolean;
  testid: string;
}) {
  const size = 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max <= 0 ? 0 : Math.min(1, Math.max(0, current / max));
  const dash = spinning ? circ * 0.25 : circ * pct;
  const tone =
    status === 'FAILED'
      ? 'text-danger'
      : status === 'BUDGET_EXHAUSTED'
        ? 'text-warning'
        : status === 'TERMINATED'
          ? 'text-primary'
          : status === 'SUCCESS'
            ? 'text-success'
            : 'text-primary';
  return (
    <div
      className="shrink-0 relative"
      style={{ width: size, height: size }}
      data-testid={testid}
      role="img"
      aria-label={
        spinning
          ? 'Rotina em execução'
          : `${current} de ${max} repetições usadas`
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={spinning ? 'animate-spin' : ''}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#D7DBDF"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={tone}
          stroke="currentColor"
        />
      </svg>
      {!spinning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[18px] font-semibold text-text-on-light tabular-nums leading-none">
            {current}
          </span>
          <span className="text-[10px] font-mono text-muted-on-light leading-none mt-0.5">
            / {max}
          </span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function NoEligibleNotice() {
  return (
    <section
      className="bg-white border border-border-light p-6"
      data-testid="autopilot-no-eligible"
    >
      <h2 className="text-[14px] font-semibold text-text-on-light">
        Nenhuma ação automática disponível
      </h2>
      <p className="mt-1 text-[12px] text-muted-on-light max-w-prose">
        Uma rotina só pode repetir ações marcadas como automáticas. Marque ao
        menos uma ação como automática para montar uma rotina.
      </p>
      <a
        href="/painel-de-controle/acoes"
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:text-primary-hover"
        data-testid="autopilot-no-eligible-link"
      >
        Abrir Ações
        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
      </a>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/** Texto pt-BR claro explicando por que a rotina parou. */
function plainReason(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'A rotina concluiu todas as repetições sem erro.';
    case 'TERMINATED':
      return 'A rotina parou porque a condição que você definiu foi atendida.';
    case 'BUDGET_EXHAUSTED':
      return 'A rotina atingiu o limite que você definiu e parou em segurança.';
    case 'FAILED':
      return 'Uma das repetições falhou e a rotina foi interrompida.';
    default:
      return 'A rotina foi encerrada.';
  }
}

/* -------------------------------------------------------------------------- */
function FinalStatusBadge({
  status,
  testid,
}: {
  status: string;
  /** Opcional para evitar colisão de testid entre o run ativo e o histórico. */
  testid?: string;
}) {
  const config: Record<
    string,
    { icon: React.ReactNode; cls: string; label: string }
  > = {
    SUCCESS: {
      icon: <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />,
      cls: 'border-success/40 text-success bg-success/5',
      label: 'Concluída',
    },
    TERMINATED: {
      icon: <Flag className="w-3.5 h-3.5" strokeWidth={1.5} />,
      cls: 'border-primary/40 text-primary bg-primary/5',
      label: 'Parou na condição',
    },
    BUDGET_EXHAUSTED: {
      icon: <TimerOff className="w-3.5 h-3.5" strokeWidth={1.5} />,
      cls: 'border-warning/40 text-warning bg-warning/5',
      label: 'Atingiu o limite',
    },
    FAILED: {
      icon: <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />,
      cls: 'border-danger/40 text-danger bg-danger/5',
      label: 'Falhou',
    },
  };
  const c = config[status] ?? {
    icon: null,
    cls: 'border-border-light text-muted-on-light bg-canvas-light',
    label: titleCase(status),
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 border ${c.cls}`}
      data-testid={testid}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

/** Fallback humanizado pra estados não mapeados (ex.: "running" → "Running"). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}
