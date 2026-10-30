/**
 * F2 (unificação de eventos) — fonte única dos triggers REAIS.
 *
 * Antes, o editor de Eventos oferecia chaves de um catálogo abstrato
 * (`widget.click`, `consulta.executou`…) que NENHUM widget emite — então o
 * operador configurava reações que nunca disparavam (o renderer casa
 * `node.events[].trigger === <string emitido>` por igualdade exata). Aqui
 * declaramos, por tipo de widget, EXATAMENTE os triggers que o widget chama em
 * `emit(...)` (verificado por grep nos widgets), e os metadados (label pt-BR/
 * en-US + campos do payload) re-chaveados pros triggers reais.
 *
 * Regra: `on_load` é IMPLÍCITO a todos os widgets (o framework dispara no
 * mount) — não entra no mapa por-widget, é sempre oferecido pelo editor.
 */
import type { EventTrigger } from './types';

/** Triggers que cada tipo de widget realmente EMITE (fora `on_load`). */
export const WIDGET_EMITS: Record<string, EventTrigger[]> = {
  button_group: ['click'],
  object_list: ['select_change'],
  object_picker: ['select_change'],
  object_table: ['select_change', 'value_change'],
  object_table_v2: ['select_change', 'value_change'],
  globe_live: ['select_change'],
  map_live: ['select_change'],
  network_graph: ['select_change'],
  relation_list: ['select_change'],
  dropdown: ['value_change'],
  date_picker: ['value_change'],
  filter_pills: ['value_change'],
  text_input: ['value_change'],
  vision_count: ['value_change'],
  // 4A — rodar/pausar conector concluído (payload: value = run|active|inactive,
  // target = slug do agente).
  connector_status: ['value_change'],
  exploration_search: ['value_change'],
  media_uploader: ['value_change'],
  instance_editor: ['value_change'],
  exploration_filter_pills: ['painel.filter.changed'],
  search_input: ['search.changed'],
  object_action_button: [
    'action.execute.success',
    'action.execute.pending',
    'action.execute.error',
  ],
  form_builder: ['form.submit.success', 'form.submit.error', 'form.submit.denied'],
  query_result: ['query.success', 'query.error'],
};

/** `on_load` está sempre disponível, em qualquer widget. */
export const ALWAYS_TRIGGER: EventTrigger = 'on_load';

/**
 * Metadados por trigger real: chave i18n do label + campos que o payload
 * carrega (alimentam o seletor "de" do set_variable — o operador escolhe de
 * QUE campo do payload ler, sem digitar). Verificado nas chamadas emit().
 */
export interface TriggerMeta {
  /** Chave i18n (events.trigger.<id>) — resolvida via useT() no editor. */
  labelKey: string;
  /** Campos disponíveis no payload do evento (pro from: do set_variable). */
  payload: string[];
}

export const TRIGGER_META: Record<EventTrigger, TriggerMeta> = {
  click: { labelKey: 'events.trigger.click', payload: [] },
  select_change: {
    labelKey: 'events.trigger.select_change',
    payload: ['selected', 'selected_id'],
  },
  value_change: { labelKey: 'events.trigger.value_change', payload: ['value', 'target'] },
  on_load: { labelKey: 'events.trigger.on_load', payload: [] },
  'action.execute.success': {
    labelKey: 'events.trigger.action_success',
    payload: ['action_id', 'execution_id', 'output'],
  },
  'action.execute.pending': {
    labelKey: 'events.trigger.action_pending',
    payload: ['action_id', 'approval_id'],
  },
  'action.execute.error': {
    labelKey: 'events.trigger.action_error',
    payload: ['action_id', 'reason'],
  },
  'form.submit.success': {
    labelKey: 'events.trigger.form_success',
    payload: ['form_key', 'submission_id', 'result'],
  },
  'form.submit.error': {
    labelKey: 'events.trigger.form_error',
    payload: ['form_key', 'reason'],
  },
  'form.submit.denied': {
    labelKey: 'events.trigger.form_denied',
    payload: ['form_key', 'reason'],
  },
  'query.success': {
    labelKey: 'events.trigger.query_success',
    payload: ['function_id', 'output', 'version'],
  },
  'query.error': { labelKey: 'events.trigger.query_error', payload: ['function_id', 'reason'] },
  'search.changed': { labelKey: 'events.trigger.search_changed', payload: ['value', 'target'] },
  'painel.filter.changed': {
    labelKey: 'events.trigger.filter_changed',
    payload: ['active', 'by_group', 'target'],
  },
};

/**
 * Triggers oferecidos pelo editor de Eventos para um tipo de widget:
 * os emitidos pelo widget + `on_load` (sempre). Ordem estável.
 */
export function emittedTriggers(widgetType: string | undefined): EventTrigger[] {
  const specific = (widgetType && WIDGET_EMITS[widgetType]) || [];
  return [...specific, ALWAYS_TRIGGER];
}
