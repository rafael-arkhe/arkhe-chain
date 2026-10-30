'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Workshop } from '@/lib/workshop/client';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { cn } from '@/lib/cn';
import { FormFieldRow } from './form-field-row';
import type { FormFieldSpec } from '@/lib/api';
import { parseMissingInputError, humanizeApiError } from '@/lib/workshop/missing-inputs';
import { confirmModal } from '@/components/dialog/confirm-dialog';

type Cfg = {
  title?: string;
  buttons?: Array<{
    label: string;
    action_id: string;
    variant?: 'primary' | 'danger' | 'ghost';
    params?: Record<string, unknown>;
  }>;
};

/** Estado do gate: ação esperando o operador preencher os params livres no clique. */
type Gate = {
  actionId: string;
  baseParams: Record<string, unknown>;
  label: string;
  fields: FormFieldSpec[];
  values: Record<string, unknown>;
  message?: string;
};

/**
 * Botões que ou:
 *   1. Emitem evento `click` com payload `{ button_id, params }` (Sprint 2
 *      events system — wire via `node.events`), OU
 *   2. Invocam ActionType do backend (comportamento legado).
 *
 * Quando o widget tem `events` declarados no node, o emit roda PRIMEIRO
 * (set_variable, open_overlay, etc); se ainda quiser invocar ActionType,
 * o action_id continua sendo enviado pro backend depois.
 *
 * GATE de params (WAVE 0): se a ação tem um param OBRIGATÓRIO livre (ex.: o
 * destinatário de um compartilhar-link) que não foi resolvido do objeto
 * selecionado, o backend devolve 422 estruturado — aqui abrimos um form inline
 * (FormFieldRow) p/ o operador preencher e re-disparamos. `missing_required_params`
 * NUNCA chega como erro cru ao operador.
 */
function ButtonGroup({ appId, config, bindings, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);

  const labelFor = (actionId: string) =>
    cfg.buttons?.find((b) => b.action_id === actionId)?.label || 'Ação';

  const invoke = async (
    actionId: string,
    params: Record<string, unknown>,
  ): Promise<'ok' | 'gated' | 'error'> => {
    try {
      await Workshop.invokeAction(appId, actionId, {
        params: { ...params, ...bindings },
      });
      return 'ok';
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // NUNCA vaza erro cru de missing-input/param/signature → vira form inline.
      const miss = parseMissingInputError(raw);
      if (miss && !miss.needsSelection && miss.fields.length) {
        setGate({
          actionId,
          baseParams: params,
          label: labelFor(actionId),
          fields: miss.fields,
          values: {},
          message: miss.message,
        });
        return 'gated';
      }
      // sem seleção (ação contextual) → mensagem orientando a selecionar; senão
      // mensagem humana (NUNCA JSON cru).
      setErr(miss?.message || humanizeApiError(raw));
      return 'error';
    }
  };

  // Dispara a ação de fato (após confirmação, se destrutiva). Emite o trigger de
  // click (set_variable/open_overlay/refresh_all já fiados) e invoca o backend.
  const fire = async (actionId: string, params: Record<string, unknown>) => {
    setBusy(actionId);
    setErr(null);
    setOk(null);
    setGate(null);
    const variant = cfg.buttons?.find((b) => b.action_id === actionId)?.variant;
    emit?.('click', { button_id: actionId, params });
    if (!actionId.startsWith('__local_')) {
      const res = await invoke(actionId, params);
      if (res === 'ok') {
        setOk(`${labelFor(actionId)}: concluído.`);
        // refresca lista/detalhe (re-dispara o trigger já fiado p/ refresh_all).
        emit?.('click', { button_id: actionId, params });
        // DESTRUTIVA (delete) bem-sucedida → sinaliza p/ fechar o drawer de detalhe
        // (o objeto não existe mais). O overlay fia close_overlay neste trigger.
        if (variant === 'danger') emit?.('action.destroyed', { button_id: actionId });
      }
    } else {
      setOk(`${labelFor(actionId)}: concluído.`);
    }
    setBusy(null);
  };

  const click = async (actionId: string, params: Record<string, unknown> = {}) => {
    setErr(null);
    setOk(null);
    setGate(null);
    const variant = cfg.buttons?.find((b) => b.action_id === actionId)?.variant;
    // Ação DESTRUTIVA (danger) → confirma via confirmModal (portal compartilhado,
    // NUNCA diálogo nativo nem painel inline) antes de disparar (irreversível).
    if (variant === 'danger') {
      const okConfirm = await confirmModal({
        title: `${labelFor(actionId)}?`,
        description: 'Esta ação não pode ser desfeita.',
        tone: 'danger',
        confirmLabel: 'Confirmar',
      });
      if (!okConfirm) return;
    }
    void fire(actionId, params);
  };

  const submitGate = async () => {
    if (!gate) return;
    setBusy(gate.actionId);
    setErr(null);
    const merged = { ...gate.baseParams, ...gate.values };
    const res = await invoke(gate.actionId, merged);
    if (res === 'ok') {
      setGate(null);
      setOk(`${gate.label}: concluído.`);
      emit?.('click', { button_id: gate.actionId, params: merged });
    }
    setBusy(null);
  };

  return (
    <div className="bg-white border border-border-light p-3 flex flex-col gap-2">
      {cfg.title && (
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          {cfg.title}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(cfg.buttons ?? []).map((b, i) => (
          <button
            key={b.action_id ?? b.label ?? `btn-${i}`}
            type="button"
            disabled={busy === b.action_id}
            onClick={() => void click(b.action_id, b.params)}
            className={cn(
              'h-7 px-3 text-[11px] border transition-colors',
              busy === b.action_id && 'opacity-50 cursor-wait',
              b.variant === 'danger'
                ? 'bg-danger text-white border-danger hover:opacity-90'
                : b.variant === 'ghost'
                  ? 'bg-raised-light border-border-light hover:border-primary'
                  : 'bg-primary text-white border-primary hover:bg-primary-hover',
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      {gate && (
        <div className="border border-border-light bg-raised-light p-3 flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            {gate.label}
          </p>
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
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={
                busy === gate.actionId ||
                gate.fields.some((f) => {
                  const v = gate.values[f.key];
                  return v === undefined || v === null || v === '';
                })
              }
              onClick={submitGate}
              className={cn(
                'h-7 px-3 text-[11px] border transition-colors',
                'bg-primary text-white border-primary hover:bg-primary-hover',
                busy === gate.actionId && 'opacity-50 cursor-wait',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              Executar
            </button>
            <button
              type="button"
              onClick={() => setGate(null)}
              className="h-7 px-3 text-[11px] border bg-raised-light border-border-light hover:border-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-[10px] text-danger">{err}</p>}
      {ok && !err && !gate && (
        <p className="text-[10px] text-success flex items-center gap-1">
          <Check className="w-3 h-3" strokeWidth={2} />
          {ok}
        </p>
      )}
    </div>
  );
}
registerWidget('button_group', ButtonGroup, {
  group: 'content',
  label: 'Grupo de botões',
  description: 'Conjunto de botões que disparam ações do painel (aprovar, recusar, abrir overlay, etc).',
  icon: 'square-mouse-pointer',
  defaultColSpan: 5,
  mockConfig: {
    title: 'Ações',
    buttons: [
      { label: 'Aprovar', action_id: 'approve', variant: 'primary' },
      { label: 'Recusar', action_id: 'deny', variant: 'danger' },
      { label: 'Mais info', action_id: 'info', variant: 'ghost' },
    ],
  },
  config_schema: [
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho do grupo de botões (opcional).',
      field: 'string',
    },
    {
      name: 'buttons',
      label: 'Botões',
      description:
        'Cada botão tem um rótulo, a Ação que dispara (escolhida do catálogo) e um estilo.',
      field: 'button-list',
    },
  ],
});
