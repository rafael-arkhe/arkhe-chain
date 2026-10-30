'use client';

/**
 * Object Action Button — Sprint L7 (2026-05-23).
 *
 * Botão que dispara uma `ActionType` da plataforma com um input vindo de
 * variables/literal. Suporta Plan/Act mode (dry-run) antes do execute
 * real (pesquisa R2 Slate · widgets/platform.md + read-write/writeback.md).
 *
 * Fluxo:
 *   - Operador clica → opcional preview do `/plan` (deny_reason, requer
 *     aprovação, requires_markings).
 *   - Confirma → POST /platform/v23/action-types/{id}/execute.
 *   - Resultado vira variable opcional via `result_target` + emite
 *     `action.execute.success` / `action.execute.error`.
 *
 * Config:
 *   - action_id: string         id da ActionType
 *   - label?: string            rótulo do botão (default "Executar ação")
 *   - input?: object | string   payload literal (ou external_id var → resolve)
 *   - input_source?: string     se setado, usa `variables[input_source]` como input
 *   - confirm?: boolean         exige Plan/Act preview (default false)
 *   - result_target?: string    grava result no binding
 *   - variant?: 'primary' | 'danger' | 'ghost' (default 'primary')
 */
import * as React from 'react';
import { Loader2, AlertCircle, CheckCircle2, ShieldAlert, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ActionTypes } from '@/lib/api';
import type { ActionPlanResult, ActionExecuteResult, FormFieldSpec } from '@/lib/api';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { FormFieldRow } from './form-field-row';
import { parseMissingInputError, humanizeApiError } from '@/lib/workshop/missing-inputs';

type Cfg = {
  action_id?: string;
  label?: string;
  input?: Record<string, unknown> | string;
  input_source?: string;
  confirm?: boolean;
  result_target?: string;
  variant?: 'primary' | 'danger' | 'ghost';
  note?: string;
};

function resolveInput(
  cfg: Cfg,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  // Prioridade: input_source (resolve da variable) > input literal > {}
  if (cfg.input_source && cfg.input_source in variables) {
    const v = variables[cfg.input_source];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  if (cfg.input && typeof cfg.input === 'object' && !Array.isArray(cfg.input)) {
    return cfg.input;
  }
  if (typeof cfg.input === 'string') {
    try {
      const parsed = JSON.parse(cfg.input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore — input string mal formado vira {}
    }
  }
  return {};
}

export function ObjectActionButton({
  config,
  variables,
  setBinding,
  emit,
}: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const actionId = cfg.action_id?.trim() ?? '';
  const variant = cfg.variant ?? 'primary';

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<ActionPlanResult | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  // Gate de entrada: missing-input/param/signature NUNCA vira JSON cru → form inline.
  const [gate, setGate] = React.useState<{ fields: FormFieldSpec[]; values: Record<string, unknown>; message: string } | null>(null);

  if (!actionId) {
    return (
      <div
        className="border border-border-light bg-white p-3 text-[11px] text-muted-on-light"
        data-testid="object-action-button-empty"
      >
        Configure `action_id` no Inspector para vincular este botão a uma ação.
      </div>
    );
  }

  const runExecute = async (extra?: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const base = resolveInput(cfg, variables ?? {});
      const input = extra ? { ...base, ...extra } : base;
      const res: ActionExecuteResult = await ActionTypes.execute(
        actionId,
        input,
        cfg.note,
      );
      setGate(null);
      if (cfg.result_target) {
        setBinding(cfg.result_target, res.output);
      }
      const ok = res.status === 'SUCCESS';
      if (ok) {
        setSuccess(`Ação executada (id ${res.execution_id ?? '—'})`);
        emit?.('action.execute.success', {
          action_id: actionId,
          execution_id: res.execution_id,
          output: res.output,
        });
      } else if (res.status === 'PENDING_APPROVAL') {
        setSuccess(`Pendente de aprovação (id ${res.approval_id ?? '—'})`);
        emit?.('action.execute.pending', {
          action_id: actionId,
          approval_id: res.approval_id,
        });
      } else if (res.status === 'POLICY_DENIED') {
        setError('Política negou a execução.');
        emit?.('action.execute.error', {
          action_id: actionId,
          reason: 'POLICY_DENIED',
        });
      } else {
        setError(`Falhou (status ${res.status}).`);
        emit?.('action.execute.error', {
          action_id: actionId,
          reason: res.status,
        });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const miss = parseMissingInputError(raw);
      if (miss && !miss.needsSelection && miss.fields.length) {
        setGate((g) => ({
          fields: miss.fields,
          values: g?.values ?? Object.fromEntries(miss.fields.map((f) => [f.key, ''])),
          message: miss.message,
        }));
      } else {
        setError(miss?.message || humanizeApiError(raw));
      }
      emit?.('action.execute.error', { action_id: actionId, reason: raw });
    } finally {
      setBusy(false);
      setConfirming(false);
      setPlan(null);
    }
  };

  const handleClick = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    setSuccess(null);
    if (!cfg.confirm) {
      await runExecute();
      return;
    }
    // Plan mode: pede preview antes de executar.
    setBusy(true);
    try {
      const input = resolveInput(cfg, variables ?? {});
      const p = await ActionTypes.plan([{ action_id: actionId, input }]);
      setPlan(p);
      setConfirming(true);
    } catch (e) {
      setError(humanizeApiError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="border border-border-light bg-white p-3 flex flex-col gap-2"
      data-testid="object-action-button"
    >
      <button
        type="button"
        disabled={busy || confirming}
        onClick={handleClick}
        data-testid="object-action-button-trigger"
        className={cn(
          'h-8 px-3 text-[11px] border flex items-center justify-center gap-1.5 transition-colors',
          busy && 'opacity-60 cursor-wait',
          variant === 'danger'
            ? 'bg-danger text-white border-danger hover:opacity-90'
            : variant === 'ghost'
              ? 'bg-canvas-light border-border-light hover:border-primary'
              : 'bg-primary text-white border-primary hover:bg-primary-hover',
        )}
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
        ) : (
          <Play className="w-3 h-3" strokeWidth={1.5} />
        )}
        <span>{cfg.label ?? 'Executar ação'}</span>
      </button>

      {confirming && plan && (
        <div
          data-testid="object-action-button-plan"
          className="border border-border-light bg-canvas-light p-2 text-[11px] flex flex-col gap-1"
        >
          <p className="font-mono text-[10px] text-muted-on-light uppercase tracking-wider">
            Pré-visualização Plan/Act
          </p>
          {plan.steps.map((s) => (
            <div key={s.action_id} className="flex items-center gap-1.5">
              {s.will_execute ? (
                <CheckCircle2
                  className="w-3 h-3 text-primary"
                  strokeWidth={1.5}
                />
              ) : s.will_request_approval ? (
                <ShieldAlert
                  className="w-3 h-3 text-warning"
                  strokeWidth={1.5}
                />
              ) : (
                <AlertCircle
                  className="w-3 h-3 text-danger"
                  strokeWidth={1.5}
                />
              )}
              <span className="font-mono">{s.action_name}</span>
              <span className="text-muted-on-light">
                {s.will_execute
                  ? '→ executa agora'
                  : s.will_request_approval
                    ? '→ requer aprovação'
                    : `→ negado (${s.deny_reason ?? 'desconhecido'})`}
              </span>
            </div>
          ))}
          <div className="flex gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => void runExecute()}
              data-testid="object-action-button-confirm"
              className="h-6 px-2 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setPlan(null);
              }}
              data-testid="object-action-button-cancel"
              className="h-6 px-2 text-[11px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {gate && (
        <div
          className="border border-border-light bg-canvas-light p-2.5 flex flex-col gap-2"
          data-testid="object-action-button-gate"
        >
          <p className="text-[11px] text-muted-on-light">{gate.message}</p>
          {gate.fields.map((f) => (
            <FormFieldRow
              key={f.key}
              field={f}
              value={gate.values[f.key] ?? ''}
              effectiveRequired
              onChange={(v) =>
                setGate((g) => (g ? { ...g, values: { ...g.values, [f.key]: v } } : g))
              }
            />
          ))}
          <button
            type="button"
            disabled={
              busy ||
              gate.fields.some((f) => {
                const v = gate.values[f.key];
                return v === undefined || v === null || v === '';
              })
            }
            onClick={() => void runExecute(gate.values)}
            data-testid="object-action-button-gate-run"
            className="h-7 px-3 self-start text-[11px] border bg-primary text-white border-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Executar
          </button>
        </div>
      )}
      {error && !gate && (
        <p
          className="text-[10px] text-danger flex items-center gap-1"
          data-testid="object-action-button-error"
        >
          <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
          {error}
        </p>
      )}
      {success && !error && (
        <p
          className="text-[10px] text-primary flex items-center gap-1"
          data-testid="object-action-button-success"
        >
          <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
          {success}
        </p>
      )}
    </div>
  );
}

registerWidget('object_action_button', ObjectActionButton, {
  group: 'content',
  label: 'Botão de ação',
  description:
    'Dispara uma ação da plataforma com pré-visualização Plan/Act opcional. Grava o resultado em uma variável e emite eventos de sucesso/erro.',
  icon: 'play',
  defaultColSpan: 4,
  mockConfig: {
    action_id: 'demo-action',
    label: 'Notificar BPM',
    confirm: true,
    variant: 'primary',
  },
  mockVariables: {},
  previewWidth: 320,
  previewHeight: 120,
  config_schema: [
    {
      name: 'action_id',
      label: 'Ação',
      field: 'action-type',
    },
    {
      name: 'label',
      label: 'Rótulo do botão',
      field: 'string',
      placeholder: 'Executar ação',
    },
    {
      name: 'input_source',
      label: 'Variável com o payload (objeto)',
      field: 'variable-ref',
    },
    {
      name: 'confirm',
      label: 'Pedir pré-visualização Plan/Act',
      field: 'boolean',
    },
    {
      name: 'result_target',
      label: 'Gravar resultado na variável',
      field: 'variable-ref',
    },
    {
      name: 'variant',
      label: 'Estilo',
      field: 'select',
      options: [
        { value: 'primary', label: 'Primário' },
        { value: 'danger', label: 'Crítico' },
        { value: 'ghost', label: 'Discreto' },
      ],
      default: 'primary',
    },
    {
      name: 'note',
      label: 'Observação da execução',
      field: 'string',
      placeholder: 'Justificativa registrada na auditoria',
    },
  ],
});
