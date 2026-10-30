'use client';

/**
 * Events Panel — F2 (unificação de eventos, 2026-06-06).
 *
 * REESCRITO: opera sobre `node.events` (WidgetEvent[]) — o ÚNICO modelo que o
 * WorkshopV2Renderer executa de verdade. Antes este painel gravava em
 * `widget.config.on_events` (WidgetEventListener[]) que NENHUM runtime lia →
 * o operador configurava reações que nunca disparavam. Agora:
 *   - a coluna "Quando" lista só os triggers que ESTE widget REALMENTE emite
 *     (emittedTriggers, fonte: widget-emits.ts) + `on_load` (sempre);
 *   - a coluna "Faça" usa seletores POPULADOS (variáveis/janelas/páginas do app)
 *     — zero digitação de identificador técnico.
 *
 * Lê como uma frase: "QUANDO isto acontecer NESTE widget, FAÇA isto."
 * Sem hex inline, sem rounded-*, sem emoji. i18n via useT().
 */
import * as React from 'react';
import { Plus, Trash2, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import type {
  EventAction,
  EventTrigger,
  LayoutNode,
  WidgetEvent,
  WorkshopOverlay,
  WorkshopPage,
  WorkshopVariable,
} from '@/lib/workshop/types';
import { TRIGGER_META, emittedTriggers } from '@/lib/workshop/widget-emits';

/* -------------------------------------------------------------------------- */

const ACTION_OPTIONS: { value: EventAction; labelKey: string }[] = [
  { value: 'set_variable', labelKey: 'events.action.set_variable' },
  { value: 'refresh_variable', labelKey: 'events.action.refresh_variable' },
  { value: 'refresh_all', labelKey: 'events.action.refresh_all' },
  { value: 'copy_variable', labelKey: 'events.action.copy_variable' },
  { value: 'open_overlay', labelKey: 'events.action.open_overlay' },
  { value: 'close_overlay', labelKey: 'events.action.close_overlay' },
  { value: 'switch_page', labelKey: 'events.action.switch_page' },
  { value: 'navigate', labelKey: 'events.action.navigate' },
  { value: 'if', labelKey: 'events.action.if' },
];

export interface EventsPanelProps {
  /** Widget atualmente selecionado no canvas (null = nenhum). */
  selectedNode: LayoutNode | null;
  /** Recebe o array `events` completo já atualizado; o editor grava em node.events. */
  onChangeNode: (events: WidgetEvent[]) => void;
  /** Variáveis do app — populam os seletores de alvo (sem digitar id). */
  variables: WorkshopVariable[];
  /** Janelas (overlays) do app — populam open/close_overlay. */
  overlays: WorkshopOverlay[];
  /** Páginas do app — populam switch_page. */
  pages: WorkshopPage[];
}

export function EventsPanel({
  selectedNode,
  onChangeNode,
  variables,
  overlays,
  pages,
}: EventsPanelProps) {
  const t = useT();
  const [editingIdx, setEditingIdx] = React.useState<number | null>(null);

  const events = selectedNode?.events ?? [];
  const triggers = emittedTriggers(selectedNode?.widget.type);

  const addReaction = (trigger: EventTrigger) => {
    if (!selectedNode) return;
    const next: WidgetEvent[] = [
      ...events,
      { trigger, action: 'set_variable', params: {} },
    ];
    onChangeNode(next);
    setEditingIdx(next.length - 1);
  };
  const removeReaction = (idx: number) => {
    if (!selectedNode) return;
    onChangeNode(events.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };
  const patchReaction = (idx: number, patch: Partial<WidgetEvent>) => {
    if (!selectedNode) return;
    onChangeNode(events.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const triggerLabel = (trig: EventTrigger) =>
    t(TRIGGER_META[trig]?.labelKey ?? trig);

  return (
    <div className="flex flex-col h-full" data-testid="events-panel">
      <div className="px-3 py-2.5 border-b border-border-light bg-raised-light flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold flex-1">
          {t('events.panel.title')}
        </p>
        {selectedNode && (
          <span className="text-caption font-mono text-muted-on-light truncate max-w-[40%]">
            {selectedNode.widget.type}
          </span>
        )}
      </div>

      {!selectedNode ? (
        <p className="text-caption text-muted-on-light italic px-3 py-4" data-testid="events-no-widget">
          {t('events.panel.selectWidget')}
        </p>
      ) : (
        <div className="flex-1 grid grid-cols-3 min-h-0">
          {/* Coluna 1: QUANDO (triggers reais deste widget) */}
          <section
            className="border-r border-border-light flex flex-col min-h-0"
            data-testid="events-when-column"
          >
            <div className="px-2 py-2 border-b border-border-light bg-canvas-light">
              <p className="text-caption uppercase tracking-wider text-muted-on-light font-semibold">
                {t('events.panel.when')}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1" data-testid="events-when-list">
              {triggers.length === 1 && triggers[0] === 'on_load' && (
                <p className="text-caption text-muted-on-light italic px-1 pb-1" data-testid="events-only-onload">
                  {t('events.panel.onlyOnLoad')}
                </p>
              )}
              {triggers.map((trig) => {
                const meta = TRIGGER_META[trig];
                return (
                  <div
                    key={trig}
                    data-testid={`events-trigger-${trig}`}
                    className="border border-border-light bg-white px-2 py-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="text-small text-text-on-light flex-1 leading-tight">
                        {triggerLabel(trig)}
                      </p>
                      <button
                        type="button"
                        onClick={() => addReaction(trig)}
                        aria-label={t('events.panel.addReaction')}
                        data-testid={`events-add-${trig}`}
                        className="h-5 w-5 flex items-center justify-center text-primary hover:bg-primary/10 border border-border-light shrink-0"
                      >
                        <Plus className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </div>
                    {meta && meta.payload.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {meta.payload.map((p) => (
                          <span
                            key={p}
                            className="text-caption font-mono text-muted-on-light border border-border-light px-1"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Coluna 2: REAÇÕES (node.events deste widget) */}
          <section
            className="border-r border-border-light flex flex-col min-h-0"
            data-testid="events-reactions-column"
          >
            <div className="px-2 py-2 border-b border-border-light bg-canvas-light">
              <p className="text-caption uppercase tracking-wider text-muted-on-light font-semibold">
                {t('events.panel.reactions')}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5" data-testid="events-reactions-list">
              {events.length === 0 ? (
                <p className="text-caption text-muted-on-light italic px-1 py-3">
                  {t('events.panel.noReactions')}
                </p>
              ) : (
                <ul className="space-y-1">
                  {events.map((ev, i) => (
                    <li
                      key={i}
                      data-testid={`events-reaction-row-${i}`}
                      className={cn(
                        'border bg-white px-2 py-1.5 flex items-center gap-1.5',
                        editingIdx === i ? 'border-primary' : 'border-border-light',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingIdx(i)}
                        className="flex-1 min-w-0 text-left"
                        data-testid={`events-reaction-${i}-pick`}
                      >
                        <p className="text-small text-text-on-light truncate">
                          {triggerLabel(ev.trigger)}
                        </p>
                        <p className="text-caption text-muted-on-light truncate flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                          {t(
                            ACTION_OPTIONS.find((a) => a.value === ev.action)?.labelKey ??
                              ev.action,
                          )}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeReaction(i)}
                        aria-label={t('events.panel.remove')}
                        data-testid={`events-reaction-${i}-remove`}
                        className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger border border-border-light hover:border-danger shrink-0"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Coluna 3: FAÇA (editor da reação) */}
          <section className="flex flex-col min-h-0" data-testid="events-do-column">
            <div className="px-2 py-2 border-b border-border-light bg-canvas-light">
              <p className="text-caption uppercase tracking-wider text-muted-on-light font-semibold">
                {t('events.panel.do')}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {editingIdx != null && events[editingIdx] ? (
                <ReactionEditor
                  event={events[editingIdx]}
                  triggers={triggers}
                  variables={variables}
                  overlays={overlays}
                  pages={pages}
                  onPatch={(patch) => patchReaction(editingIdx, patch)}
                />
              ) : (
                <p className="text-caption text-muted-on-light italic">
                  {t('events.panel.pickReaction')}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor de uma reação                                                       */
/* -------------------------------------------------------------------------- */

function ReactionEditor({
  event,
  triggers,
  variables,
  overlays,
  pages,
  onPatch,
}: {
  event: WidgetEvent;
  triggers: EventTrigger[];
  variables: WorkshopVariable[];
  overlays: WorkshopOverlay[];
  pages: WorkshopPage[];
  onPatch: (patch: Partial<WidgetEvent>) => void;
}) {
  const t = useT();
  const params = event.params ?? {};
  const setParams = (next: Record<string, unknown>) => onPatch({ params: next });

  return (
    <div className="space-y-3" data-testid="events-do-form">
      {/* Gatilho */}
      <Labeled label={t('events.panel.whenField')}>
        <select
          value={event.trigger}
          onChange={(e) => onPatch({ trigger: e.target.value as EventTrigger })}
          data-testid="events-do-trigger"
          className="w-full h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary"
        >
          {triggers.map((trig) => (
            <option key={trig} value={trig}>
              {t(TRIGGER_META[trig]?.labelKey ?? trig)}
            </option>
          ))}
        </select>
      </Labeled>

      {/* Ação */}
      <Labeled label={t('events.panel.actionField')}>
        <select
          value={event.action}
          onChange={(e) => onPatch({ action: e.target.value as EventAction })}
          data-testid="events-do-action"
          className="w-full h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </Labeled>

      <ActionParams
        trigger={event.trigger}
        action={event.action}
        params={params}
        variables={variables}
        overlays={overlays}
        pages={pages}
        onChange={setParams}
      />
    </div>
  );
}

/** Editor de parâmetros — só seletores populados (zero id digitado). */
function ActionParams({
  trigger,
  action,
  params,
  variables,
  overlays,
  pages,
  onChange,
  depth = 0,
}: {
  trigger: EventTrigger;
  action: EventAction;
  params: Record<string, unknown>;
  variables: WorkshopVariable[];
  overlays: WorkshopOverlay[];
  pages: WorkshopPage[];
  onChange: (p: Record<string, unknown>) => void;
  depth?: number;
}) {
  const t = useT();
  const set = (k: string, v: unknown) => {
    const next = { ...params };
    if (v === '' || v == null) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const payloadFields = TRIGGER_META[trigger]?.payload ?? [];

  if (action === 'set_variable') {
    const fromField = typeof params.from === 'string' ? params.from : '';
    return (
      <div className="space-y-2">
        <VariableSelect
          label={t('events.param.target')}
          value={String(params.target ?? '')}
          variables={variables}
          onChange={(v) => set('target', v)}
          testId="events-param-target"
        />
        <Labeled label={t('events.param.valueSource')}>
          <select
            value={fromField ? `from:${fromField}` : 'literal'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'literal') {
                const next = { ...params };
                delete next.from;
                onChange(next);
              } else {
                const next = { ...params };
                next.from = v.slice('from:'.length);
                delete next.value;
                onChange(next);
              }
            }}
            data-testid="events-param-value-source"
            className="w-full h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary"
          >
            <option value="literal">{t('events.param.fixedValue')}</option>
            {payloadFields.map((f) => (
              <option key={f} value={`from:${f}`}>
                {t('events.param.fromPayload')}: {f}
              </option>
            ))}
          </select>
        </Labeled>
        {!fromField && (
          <Labeled label={t('events.param.value')}>
            <input
              type="text"
              value={String(params.value ?? '')}
              onChange={(e) => set('value', e.target.value)}
              data-testid="events-param-value"
              className="w-full h-6 px-1.5 text-small bg-white border border-border-light outline-none focus:border-primary"
            />
          </Labeled>
        )}
      </div>
    );
  }
  if (action === 'refresh_variable') {
    return (
      <VariableSelect
        label={t('events.param.target')}
        value={String(params.target ?? '')}
        variables={variables}
        onChange={(v) => set('target', v)}
        testId="events-param-target"
      />
    );
  }
  if (action === 'copy_variable') {
    return (
      <div className="space-y-2">
        <VariableSelect
          label={t('events.param.source')}
          value={String(params.source ?? '')}
          variables={variables}
          onChange={(v) => set('source', v)}
          testId="events-param-source"
        />
        <VariableSelect
          label={t('events.param.target')}
          value={String(params.target ?? '')}
          variables={variables}
          onChange={(v) => set('target', v)}
          testId="events-param-target"
        />
      </div>
    );
  }
  if (action === 'open_overlay' || action === 'close_overlay') {
    return (
      <Labeled label={t('events.param.overlay')}>
        <select
          value={String(params.overlay_id ?? '')}
          onChange={(e) => set('overlay_id', e.target.value)}
          data-testid="events-param-overlay"
          className="w-full h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary"
        >
          <option value="">{t('events.param.choose')}</option>
          {overlays.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title || o.id}
            </option>
          ))}
        </select>
      </Labeled>
    );
  }
  if (action === 'switch_page') {
    return (
      <Labeled label={t('events.param.page')}>
        <select
          value={String(params.page_id ?? '')}
          onChange={(e) => set('page_id', e.target.value)}
          data-testid="events-param-page"
          className="w-full h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary"
        >
          <option value="">{t('events.param.choose')}</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label || p.id}
            </option>
          ))}
        </select>
      </Labeled>
    );
  }
  if (action === 'navigate') {
    return (
      <div className="space-y-2">
        <Labeled label={t('events.param.url')}>
          <input
            type="text"
            value={String(params.url ?? '')}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://…"
            data-testid="events-param-url"
            className="w-full h-6 px-1.5 text-small bg-white border border-border-light outline-none focus:border-primary"
          />
        </Labeled>
        <Labeled label={t('events.param.openIn')}>
          <select
            value={params.target === '_self' ? '_self' : '_blank'}
            onChange={(e) => set('target', e.target.value)}
            data-testid="events-param-open-in"
            className="w-full h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary"
          >
            <option value="_blank">{t('events.param.newTab')}</option>
            <option value="_self">{t('events.param.sameTab')}</option>
          </select>
        </Labeled>
      </div>
    );
  }
  if (action === 'if') {
    if (depth >= 2) {
      return (
        <p className="text-caption text-muted-on-light italic">
          {t('events.param.ifTooDeep')}
        </p>
      );
    }
    const thenBranch = Array.isArray(params.then) ? (params.then as WidgetEvent[]) : [];
    const elseBranch = Array.isArray(params.else) ? (params.else as WidgetEvent[]) : [];
    return (
      <div className="space-y-2">
        <Labeled label={t('events.param.condition')}>
          <input
            type="text"
            value={String(params.expression ?? '')}
            onChange={(e) => set('expression', e.target.value)}
            placeholder="ex.: selected_id != null"
            data-testid="events-param-expression"
            className="w-full h-6 px-1.5 text-small font-mono bg-white border border-border-light outline-none focus:border-primary"
          />
        </Labeled>
        <BranchEditor
          label={t('events.param.then')}
          branch={thenBranch}
          trigger={trigger}
          variables={variables}
          overlays={overlays}
          pages={pages}
          depth={depth}
          onChange={(b) => set('then', b)}
        />
        <BranchEditor
          label={t('events.param.else')}
          branch={elseBranch}
          trigger={trigger}
          variables={variables}
          overlays={overlays}
          pages={pages}
          depth={depth}
          onChange={(b) => set('else', b)}
        />
      </div>
    );
  }
  // refresh_all — sem parâmetros
  return (
    <p className="text-caption text-muted-on-light italic" data-testid="events-param-none">
      {t('events.param.none')}
    </p>
  );
}

function BranchEditor({
  label,
  branch,
  trigger,
  variables,
  overlays,
  pages,
  depth,
  onChange,
}: {
  label: string;
  branch: WidgetEvent[];
  trigger: EventTrigger;
  variables: WorkshopVariable[];
  overlays: WorkshopOverlay[];
  pages: WorkshopPage[];
  depth: number;
  onChange: (b: WidgetEvent[]) => void;
}) {
  const t = useT();
  const add = () =>
    onChange([...branch, { trigger, action: 'set_variable', params: {} }]);
  const patch = (i: number, p: Partial<WidgetEvent>) =>
    onChange(branch.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  const remove = (i: number) => onChange(branch.filter((_, idx) => idx !== i));
  return (
    <div className="border border-border-light p-1.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <p className="text-caption uppercase tracking-wider text-muted-on-light font-semibold flex-1">
          {label}
        </p>
        <button
          type="button"
          onClick={add}
          aria-label={t('events.panel.addReaction')}
          className="h-5 w-5 flex items-center justify-center text-primary hover:bg-primary/10 border border-border-light"
        >
          <Plus className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
      {branch.map((e, i) => (
        <div key={i} className="border border-border-light/60 p-1.5 space-y-1 bg-canvas-light">
          <div className="flex items-center gap-1.5">
            <select
              value={e.action}
              onChange={(ev) => patch(i, { action: ev.target.value as EventAction })}
              className="h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary flex-1 min-w-0"
            >
              {ACTION_OPTIONS.filter((a) => a.value !== 'if' || depth < 1).map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={t('events.panel.remove')}
              className="h-5 w-5 flex items-center justify-center text-muted-on-light hover:text-danger border border-border-light hover:border-danger shrink-0"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
          <ActionParams
            trigger={trigger}
            action={e.action}
            params={e.params ?? {}}
            variables={variables}
            overlays={overlays}
            pages={pages}
            onChange={(p) => patch(i, { params: p })}
            depth={depth + 1}
          />
        </div>
      ))}
    </div>
  );
}

function VariableSelect({
  label,
  value,
  variables,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  variables: WorkshopVariable[];
  onChange: (v: string) => void;
  testId?: string;
}) {
  const t = useT();
  return (
    <Labeled label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full h-6 px-1 text-small bg-white border border-border-light outline-none focus:border-primary"
      >
        <option value="">{t('events.param.choose')}</option>
        {variables.map((v) => (
          <option key={v.external_id} value={v.external_id}>
            {v.label || v.external_id}
          </option>
        ))}
      </select>
    </Labeled>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-caption uppercase tracking-wider text-muted-on-light font-semibold block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
