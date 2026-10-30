'use client';

/**
 * Pilot Chat — Wave H.3 (2026-05-23).
 *
 * "Modo Conversa" da página /pilots (Roteiros): split chat + plano editável.
 *   - Esquerda: PilotChatPanel — chat mínimo inline (sem dependência do
 *     aip-agent backend, que pode estar offline). O assistente sugere
 *     plano + edita plano via heurística determinística (palavras-chave
 *     casam contra Pilots.templates()).
 *   - Direita: PilotPlanPanel — timeline vertical de passos em FORM
 *     (não JSON textarea). Lê ActionType.input_schema p/ renderizar
 *     campos tipados quando disponível; senão cai pra um único textarea
 *     de inputs nomeados (key:value).
 *
 * Live polling 3s pra atualizar a situação do PilotRun em curso (após
 * Submit). Bloco "Quem aprova" usa usersApi.list() do IAM.
 *
 * Botão "Pré-visualizar" chama ActionTypes.plan() — mesmo que pilots/start
 * (Sprint L6) — pra pré-validar quem executa / pede aprovação / nega.
 *
 * ADD alongside — toggle no topo da página /pilots troca entre Conversa
 * e Avançado (JSON builder original). Ambos chamam os MESMOS endpoints.
 */
import * as React from 'react';
import {
  Send,
  Sparkles as _Sparkles, // intentionally unused — re-exported lib type only; we never render Sparkles per DS rule
  Workflow,
  Loader2,
  Play,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ClipboardCheck,
  Users,
  CheckCircle2,
  PlayCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ActionTypes,
  Pilots,
  type ActionTypeOut,
  type PilotRunOut,
  type PilotStepIn,
  type PilotTemplate,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { usersApi, type UserOut } from '@/lib/iam/api';

// Suprime warning de import não-usado pro Sparkles (banned por DS rule).
void _Sparkles;

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

/** Mapeia situação crua do backend para rótulo amigável em pt-BR. */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    SUCCESS: 'Concluído',
    FAILED: 'Falhou',
    PAUSED: 'Aguardando aprovação',
    PENDING_APPROVAL: 'Aguardando aprovação',
    POLICY_DENIED: 'Bloqueado por política',
    RUNNING: 'Em andamento',
  };
  if (map[status]) return map[status];
  return status
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PlanStep {
  uid: string;
  title: string;
  action_id: string;
  /** Para FORM mode: pares key/value derivados do esquema da ação. */
  fields: Array<{ key: string; value: string; type: string }>;
  note: string;
}

function newPlanStep(): PlanStep {
  return {
    uid: `s-${Math.random().toString(36).slice(2, 10)}`,
    title: '',
    action_id: '',
    fields: [],
    note: '',
  };
}

/** Materializa fields dinâmicos a partir de ActionType.input_schema. */
function fieldsFromSchema(
  schema: Record<string, unknown> | undefined,
  seed?: Record<string, unknown>,
): PlanStep['fields'] {
  if (!schema || typeof schema !== 'object') return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== 'object') return [];
  return Object.entries(props).map(([key, def]) => {
    const d = def as { type?: string };
    const seedV = seed?.[key];
    return {
      key,
      value: seedV === undefined ? '' : String(seedV),
      type: d.type || 'string',
    };
  });
}

function fieldsToInput(fields: PlanStep['fields']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.key.trim()) continue;
    const raw = f.value.trim();
    if (f.type === 'number' || f.type === 'integer') {
      const n = Number(raw);
      out[f.key] = Number.isFinite(n) ? n : raw;
    } else if (f.type === 'boolean') {
      out[f.key] = raw === 'true';
    } else {
      out[f.key] = raw;
    }
  }
  return out;
}

export function PilotChatPanel() {
  const [actions, setActions] = React.useState<ActionTypeOut[] | null>(null);
  const [templates, setTemplates] = React.useState<PilotTemplate[] | null>(null);
  const [users, setUsers] = React.useState<UserOut[] | null>(null);
  const [usersErr, setUsersErr] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Olá. Descreva o que você quer fazer (ex.: "Triar ocorrência e despachar") ou peça um modelo pronto. Eu monto os passos do roteiro à direita pra você revisar.',
    },
  ]);
  const [input, setInput] = React.useState('');
  const [thinking, setThinking] = React.useState(false);

  const [goal, setGoal] = React.useState('');
  const [plan, setPlan] = React.useState<PlanStep[]>([newPlanStep()]);
  const [approver, setApprover] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<PilotRunOut | null>(null);
  const [planResult, setPlanResult] = React.useState<
    Awaited<ReturnType<typeof ActionTypes.plan>> | null
  >(null);
  const [planning, setPlanning] = React.useState(false);

  // Live polling 3s quando o run está em andamento ou aguardando aprovação.
  React.useEffect(() => {
    if (!run || run.status === 'SUCCESS' || run.status === 'FAILED') return;
    const t = window.setInterval(async () => {
      try {
        const r = await Pilots.get(run.pilot_run_id);
        setRun(r);
      } catch {
        // silent — operador pode atualizar manualmente
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [run]);

  React.useEffect(() => {
    ActionTypes.list().then(setActions).catch(() => setActions([]));
    Pilots.templates().then(setTemplates).catch(() => setTemplates([]));
    usersApi
      .list()
      .then(setUsers)
      .catch((e) => setUsersErr(humanise(e)));
  }, []);

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((cur) => [...cur, userMsg]);
    setInput('');
    setThinking(true);

    // Heurística determinística — casa palavras-chave em templates.
    setTimeout(() => {
      const reply = handleAssistantTurn(text);
      setMessages((cur) => [...cur, reply.message]);
      if (reply.template) {
        applyTemplate(reply.template);
      }
      setThinking(false);
    }, 250);
  }

  function handleAssistantTurn(text: string): {
    message: ChatMessage;
    template?: PilotTemplate;
  } {
    const t = text.toLowerCase();
    const matched = (templates ?? []).find((tpl) => {
      const haystack = `${tpl.label} ${tpl.description} ${tpl.goal}`.toLowerCase();
      return haystack
        .split(/\s+/)
        .some((token) => token.length > 3 && t.includes(token));
    });
    if (matched) {
      return {
        message: {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `Sugerindo o modelo "${matched.label}". Carreguei ${matched.steps.length} passo(s) à direita — revise, ajuste e clique em Pré-visualizar para conferir antes de executar.`,
        },
        template: matched,
      };
    }
    return {
      message: {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content:
          'Não encontrei um modelo pronto pra isso. Você pode (1) montar os passos manualmente à direita, ou (2) pedir um modelo pelo nome — ex.: "triagem", "pessoa", "LPR", "evidência", "briefing".',
      },
    };
  }

  function applyTemplate(tpl: PilotTemplate) {
    setGoal(tpl.goal);
    setPlan(
      tpl.steps.map((s) => {
        const matchedAction =
          (actions ?? []).find(
            (a) =>
              s.action_code_ref_hint &&
              a.code_ref.toLowerCase().includes(s.action_code_ref_hint.toLowerCase()),
          ) ?? null;
        return {
          uid: `s-${Math.random().toString(36).slice(2, 10)}`,
          title: s.title,
          action_id: matchedAction?.id ?? '',
          fields: matchedAction
            ? fieldsFromSchema(matchedAction.input_schema, s.input_hint)
            : Object.entries(s.input_hint).map(([k, v]) => ({
                key: k,
                value: String(v),
                type: 'string',
              })),
          note: s.note,
        };
      }),
    );
  }

  function updateStep(uid: string, patch: Partial<PlanStep>) {
    setPlan((cur) => cur.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  }

  function onActionChange(uid: string, actionId: string) {
    const a = (actions ?? []).find((x) => x.id === actionId);
    setPlan((cur) =>
      cur.map((s) =>
        s.uid === uid
          ? {
              ...s,
              action_id: actionId,
              // Regen fields a partir do esquema da nova ação, mantendo
              // valores anteriores quando o key bater.
              fields: a
                ? fieldsFromSchema(
                    a.input_schema,
                    Object.fromEntries(s.fields.map((f) => [f.key, f.value])),
                  )
                : s.fields,
            }
          : s,
      ),
    );
  }

  function addStep() {
    setPlan((cur) => [...cur, newPlanStep()]);
  }
  function removeStep(uid: string) {
    setPlan((cur) => (cur.length <= 1 ? cur : cur.filter((s) => s.uid !== uid)));
  }

  function buildPilotSteps(): PilotStepIn[] {
    return plan.map((s) => ({
      action_id: s.action_id,
      input: fieldsToInput(s.fields),
      note: s.note || undefined,
    }));
  }

  async function dryRun() {
    setSubmitErr(null);
    setPlanResult(null);
    if (plan.some((s) => !s.action_id)) {
      setSubmitErr('Selecione uma ação em todos os passos antes de pré-visualizar.');
      return;
    }
    setPlanning(true);
    try {
      const steps = buildPilotSteps().map((s) => ({
        action_id: s.action_id,
        input: s.input,
      }));
      const r = await ActionTypes.plan(steps);
      setPlanResult(r);
    } catch (e) {
      setSubmitErr(humanise(e));
    } finally {
      setPlanning(false);
    }
  }

  async function submitPilot() {
    setSubmitErr(null);
    if (goal.trim().length < 3) {
      setSubmitErr('Descreva o objetivo (mínimo 3 caracteres).');
      return;
    }
    if (plan.some((s) => !s.action_id)) {
      setSubmitErr('Selecione uma ação em todos os passos.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await Pilots.start(goal.trim(), buildPilotSteps());
      setRun(r);
      setMessages((cur) => [
        ...cur,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `Roteiro iniciado — situação: ${statusLabel(r.status)}.${r.status === 'PAUSED' ? ' Aguardando aprovação de uma pessoa.' : ''} Atualizo a situação automaticamente.`,
        },
      ]);
    } catch (e) {
      setSubmitErr(humanise(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-0 min-h-[calc(100vh-260px)]"
      data-testid="pilot-chat-pane"
    >
      {/* ESQUERDA — Chat */}
      <section
        className="border-r border-border-light bg-white flex flex-col"
        data-testid="pilot-chat-panel"
      >
        <header className="px-4 py-3 border-b border-border-light bg-canvas-light flex items-center gap-2">
          <Workflow className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h3 className="text-[12px] font-semibold text-text-on-light">
            Monte seu roteiro conversando
          </h3>
        </header>
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          data-testid="pilot-chat-messages"
          aria-live="polite"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')
              }
            >
              <div
                className={
                  'max-w-[85%] px-3 py-2 text-[12px] border ' +
                  (m.role === 'user'
                    ? 'bg-primary/5 border-primary/30 text-text-on-light'
                    : 'bg-canvas-light border-border-light text-text-on-light')
                }
                data-testid={`pilot-chat-msg-${m.role}`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="px-3 py-2 text-[11px] text-muted-on-light bg-canvas-light border border-border-light flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                planejando…
              </div>
            </div>
          )}
        </div>
        <footer className="border-t border-border-light p-3 space-y-2">
          <div className="flex gap-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Descreva o que quer realizar…"
              className="bg-white h-9 text-[12px] flex-1"
              data-testid="pilot-chat-input"
              aria-label="Mensagem para o planejador"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
              className="h-9 text-[12px]"
              data-testid="pilot-chat-send"
              aria-label="Enviar mensagem"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
              Enviar
            </Button>
          </div>
          {templates && templates.length > 0 && (
            <div className="flex flex-wrap gap-1" data-testid="pilot-chat-templates">
              <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mr-1 self-center">
                Modelos prontos:
              </span>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    applyTemplate(tpl);
                    setMessages((cur) => [
                      ...cur,
                      {
                        id: `a-${Date.now()}`,
                        role: 'assistant',
                        content: `Carreguei o modelo "${tpl.label}". Revise os passos à direita.`,
                      },
                    ]);
                  }}
                  className="text-[10.5px] px-1.5 py-0.5 border border-border-light bg-white text-text-on-light hover:bg-canvas-light"
                  data-testid={`pilot-chat-template-${tpl.id}`}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          )}
        </footer>
      </section>

      {/* DIREITA — Passos do roteiro (editáveis) */}
      <section
        className="bg-canvas-light overflow-y-auto"
        data-testid="pilot-plan-panel"
      >
        <header className="px-4 py-3 border-b border-border-light bg-white flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-text-on-light">
            Passos do roteiro
          </h3>
          {run && (
            <span
              className={
                'text-[10px] px-2 py-0.5 border ' +
                (run.status === 'SUCCESS'
                  ? 'border-success/40 text-success bg-success/5'
                  : run.status === 'FAILED'
                    ? 'border-danger/40 text-danger bg-danger/5'
                    : 'border-primary/40 text-primary bg-primary/5')
              }
              data-testid="pilot-chat-run-status"
            >
              {statusLabel(run.status)}
            </span>
          )}
        </header>
        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Objetivo
            </Label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Triar ocorrência e despachar viatura mais próxima"
              className="bg-white h-9 text-[12px]"
              data-testid="pilot-chat-goal"
            />
          </div>

          <div
            className="bg-white border border-border-light p-3 space-y-1.5"
            data-testid="pilot-chat-approvers"
          >
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
              <Users className="w-3 h-3" strokeWidth={1.5} />
              Quem aprova
            </Label>
            {usersErr && (
              <p className="text-[10.5px] font-mono text-danger">{usersErr}</p>
            )}
            <select
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              className="h-8 bg-white border border-border-light px-2 text-[12px] w-full rounded-none focus:border-primary outline-none"
              data-testid="pilot-chat-approver-select"
              aria-label="Quem aprova"
            >
              <option value="">— sem sugestão —</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name || u.username} · {u.username}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-on-light leading-snug">
              Quem aprova de verdade é decidido pela política de acesso na
              hora. Aqui é só uma sugestão, que fica registrada.
            </p>
          </div>

          <ol className="space-y-2" data-testid="pilot-chat-plan">
            {plan.map((s, idx) => {
              const selected = (actions ?? []).find((a) => a.id === s.action_id);
              return (
                <li
                  key={s.uid}
                  className="bg-white border border-border-light p-3 space-y-2"
                  data-testid={`pilot-chat-step-${idx}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                      Passo {idx + 1}
                    </span>
                    <Input
                      value={s.title}
                      onChange={(e) => updateStep(s.uid, { title: e.target.value })}
                      placeholder="Nome do passo"
                      className="bg-canvas-light h-7 text-[11.5px] flex-1"
                      data-testid={`pilot-chat-step-${idx}-title`}
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(s.uid)}
                      disabled={plan.length <= 1}
                      className="text-danger hover:bg-danger/10 disabled:opacity-30 p-1"
                      aria-label="Remover passo"
                      data-testid={`pilot-chat-step-${idx}-remove`}
                    >
                      ×
                    </button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                      O que fazer
                    </Label>
                    <select
                      value={s.action_id}
                      onChange={(e) => onActionChange(s.uid, e.target.value)}
                      className="h-8 bg-white border border-border-light px-2 text-[12px] w-full rounded-none focus:border-primary outline-none"
                      data-testid={`pilot-chat-step-${idx}-action`}
                    >
                      <option value="">— selecione —</option>
                      {(actions ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.auto_approvable ? ' · automático' : ' · requer aprovação'}
                        </option>
                      ))}
                    </select>
                    {selected && (
                      <p className="text-[10px] font-mono text-muted-on-light">
                        {selected.code_ref}
                      </p>
                    )}
                  </div>

                  {s.fields.length > 0 && (
                    <div
                      className="space-y-1"
                      data-testid={`pilot-chat-step-${idx}-fields`}
                    >
                      <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                        Informações do passo
                      </Label>
                      <table className="w-full text-[11px]">
                        <tbody>
                          {s.fields.map((f, i) => (
                            <tr key={i}>
                              <td className="py-0.5 pr-2 text-muted-on-light font-mono w-1/3 align-top">
                                {f.key}
                                <span className="ml-1 text-[9px] text-muted-on-light">
                                  ({f.type})
                                </span>
                              </td>
                              <td className="py-0.5">
                                <Input
                                  value={f.value}
                                  onChange={(e) => {
                                    const next = s.fields.slice();
                                    next[i] = { ...next[i], value: e.target.value };
                                    updateStep(s.uid, { fields: next });
                                  }}
                                  className="bg-canvas-light h-6 text-[11px] font-mono"
                                  data-testid={`pilot-chat-step-${idx}-field-${f.key}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {selected && s.fields.length === 0 && (
                    <p className="text-[10.5px] text-muted-on-light italic">
                      Este passo não precisa de informações extras.
                    </p>
                  )}

                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                      Nota (opcional)
                    </Label>
                    <Input
                      value={s.note}
                      onChange={(e) => updateStep(s.uid, { note: e.target.value })}
                      placeholder="Motivo da execução…"
                      className="bg-canvas-light h-7 text-[11.5px]"
                      data-testid={`pilot-chat-step-${idx}-note`}
                    />
                  </div>
                </li>
              );
            })}
          </ol>

          <Button
            variant="outline"
            onClick={addStep}
            className="h-8 text-[12px]"
            data-testid="pilot-chat-add-step"
          >
            + Adicionar passo
          </Button>

          {submitErr && (
            <div
              className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30 flex items-center gap-2"
              data-testid="pilot-chat-error"
            >
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
              {submitErr}
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-border-light">
            <Button
              variant="outline"
              onClick={() => void dryRun()}
              disabled={planning}
              className="h-9 text-[12px]"
              data-testid="pilot-chat-dryrun"
            >
              {planning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <PlayCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              Pré-visualizar
            </Button>
            <Button
              variant="success"
              onClick={() => void submitPilot()}
              disabled={submitting}
              className="h-9 text-[12px]"
              data-testid="pilot-chat-submit"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              Executar roteiro
            </Button>
          </div>

          {planResult && (
            <div
              className="bg-white border border-primary/30 p-3"
              data-testid="pilot-chat-plan-result"
            >
              <p className="text-[11px] font-semibold text-text-on-light mb-2">
                Pré-visualização
              </p>
              <ul className="space-y-1 text-[11px]">
                <li>
                  <span className="text-success">●</span> vão executar:{' '}
                  {planResult.will_execute}/{planResult.total}
                </li>
                <li>
                  <span className="text-primary">●</span> vão pedir aprovação:{' '}
                  {planResult.will_request_approval}/{planResult.total}
                </li>
                <li>
                  <span className="text-danger">●</span> serão bloqueadas:{' '}
                  {planResult.will_deny}/{planResult.total}
                </li>
              </ul>
            </div>
          )}

          {run && <PilotRunTimeline run={run} />}
        </div>
      </section>
    </div>
  );
}

function PilotRunTimeline({ run }: { run: PilotRunOut }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div
      className="bg-white border border-border-light"
      data-testid="pilot-chat-run-timeline"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-canvas-light"
        data-testid="pilot-chat-run-toggle"
      >
        <span className="text-[11.5px] font-semibold text-text-on-light">
          Execução · {run.pilot_run_id.slice(0, 8)}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
        )}
      </button>
      {open && (
        <ol className="border-t border-border-light divide-y divide-border-light">
          {run.steps.map((step) => (
            <li
              key={step.step_index}
              className="px-3 py-2 flex items-center gap-2"
              data-testid={`pilot-chat-run-step-${step.step_index}`}
            >
              <span className="text-[11px] font-mono w-6">
                #{step.step_index + 1}
              </span>
              {step.status === 'SUCCESS' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" strokeWidth={1.5} />
              )}
              {step.status === 'PENDING_APPROVAL' && (
                <ClipboardCheck className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
              )}
              {step.status === 'FAILED' && (
                <AlertCircle className="w-3.5 h-3.5 text-danger" strokeWidth={1.5} />
              )}
              <span className="text-[11.5px] text-text-on-light truncate flex-1">
                {step.action_name}
              </span>
              <span
                className={
                  'text-[10px] px-1.5 py-0.5 border ' +
                  (step.status === 'SUCCESS'
                    ? 'border-success/40 text-success bg-success/5'
                    : step.status === 'FAILED'
                      ? 'border-danger/40 text-danger bg-danger/5'
                      : 'border-primary/40 text-primary bg-primary/5')
                }
              >
                {statusLabel(step.status)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
