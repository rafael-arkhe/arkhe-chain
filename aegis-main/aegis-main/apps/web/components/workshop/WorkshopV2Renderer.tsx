'use client';

/**
 * Workshop v2 layout renderer (security-app port).
 *
 * Diferente do web-app, aqui o registry de widgets é DINÂMICO —
 * cada widget chama `registerWidget(type, Component)` em algum lugar
 * (geralmente top-level dos arquivos de widget). O renderer só itera
 * o layout, dispara o componente registrado, e thread variables +
 * bindings.
 *
 * Bindings persistem na URL como `?var.<external_id>=<json>` — copy
 * paste de links + navegação back/forward funcionam.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useEvaluatedApp } from '@/lib/workshop/runtime';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';
import { evaluateCondition } from '@/lib/workshop/condition-eval';
import { Workshop, isPersistedAppId } from '@/lib/workshop/client';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';
import type {
  LayoutNode,
  ResolvedVariableMap,
  WorkshopApp,
  WorkshopOverlay,
  WorkshopPage,
  WidgetEvent,
  EventAction,
  EventTrigger,
} from '@/lib/workshop/types';

// ── Widget registry --------------------------------------------------------

export interface WidgetRenderProps {
  appId: string;
  config: Record<string, unknown>;
  /** Map external_id → resolved value (sem markings). */
  variables: Record<string, unknown>;
  /** State local de bindings (Filter List selection, etc.). */
  bindings: Record<string, unknown>;
  setBinding: (externalId: string, value: unknown) => void;
  /**
   * Emite um logical trigger (`click`, `select_change`, `value_change`,
   * `on_load`). O renderer despacha pros `node.events[]` declarativos
   * matching, executando `set_variable` / `open_overlay` / etc.
   *
   * `payload` é livre — actions com `params.from` lêem dele
   * (ex: `set_variable.params.from = 'selected'` lê `payload.selected`).
   *
   * Sprint 2 do Workshop parity roadmap. Quando ausente (compatibilidade
   * com widgets antigos), é um no-op.
   */
  emit?: (trigger: string, payload?: Record<string, unknown>) => void;
}

type WidgetComponent = React.ComponentType<WidgetRenderProps>;

/**
 * Grupos da paleta. Domínios específicos (home/ficha/parlamentar/detalhe)
 * vêm primeiro pra dar destaque; genéricos no fim pra customizações.
 *
 *   - `home`        — Dashboard operacional (KPIs, alertas, câmeras, timeline)
 *   - `ficha`       — Ficha de entidade (identificação, históricos, CCTV)
 *   - `parlamentar` — Dossiê parlamentar (CEAP, citações, integridade)
 *   - `detalhe`     — Painel detalhe de busca (cabeçalho, meta, ações, payload)
 *   - `data`        — Genéricos: tabelas, listas, contadores bindados
 *   - `viz`         — Genéricos: KPI, timeline, mini-mapa
 *   - `content`     — Texto, abas, botões, layouts
 *   - `agent`       — Widgets que disparam LLM
 */
export type WidgetGroup =
  | 'home'
  | 'ficha'
  | 'parlamentar'
  | 'detalhe'
  | 'data'
  | 'viz'
  | 'content'
  | 'agent';

/**
 * Tipos primitivos suportados pelo Inspetor visual.
 * - `string`         input texto livre
 * - `number`         input numérico (com min/max/step)
 * - `boolean`        toggle/checkbox
 * - `select`         dropdown com options[]
 * - `lat-lng`        par lat/lng (dois inputs lado a lado)
 * - `variable-ref`   dropdown das variables externas do app
 */
export type FieldKind =
  | 'string'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'lat-lng'
  | 'variable-ref'
  /**
   * Sprint G (closure UX 2026-05-21): variable + path autocomplete.
   * Operador escolhe a variable num dropdown e opcionalmente um sufixo
   * `.properties.<key>` / `.id` / `.name`. Valor final é string
   * `<external_id>` ou `<external_id>.path.parts`.
   */
  | 'variable-path'
  /**
   * Sprint G: dropdown carregando `/ontology/node-types` em vez de input
   * text livre. Operador escolhe da lista; fallback manual quando endpoint
   * falha. Aplicado em config_schema.node_type / object_type.
   */
  | 'node-type'
  /**
   * Sprint F3 do Parity Audit (2026-05-21): editor visual de
   * `format_rules`. Renderiza linhas `[field?] [op] [threshold]
   * [color]` com toggle "Avançado (JSON)". Aceita tanto array de
   * regras quanto string JSON serializada — sempre devolve string.
   */
  | 'format-rules'
  /**
   * Onda K.2 (2026-05-23): editor VISUAL dos campos do Form Widget.
   * Renderiza `FormFieldsEditor` (add/remove/reordenar + tipo por
   * dropdown + validação + regras condicionais). Devolve `FormFieldSpec[]`.
   * JAMAIS JSON manual.
   */
  | 'form-fields'
  /**
   * Onda K.2: dropdown de permissão do catálogo IAM (`/iam/permissions`).
   * Usado pela política `requires_perm` do Form Widget. Nunca texto livre.
   */
  | 'perm-key'
  /**
   * Onda K.2: dropdown de ActionType (`/action-types`) para write-back
   * via ação no Form Widget. Nunca texto livre.
   */
  | 'action-type'
  /**
   * Débito Onda 4 (OSDK, 2026-05-30): picker de PROPERTY do Object Type,
   * validado em DESIGN-TIME contra o contrato (`GET /ontology/object-types/{kind}`
   * via `Ontology.objectTypeSchema`). Lista as properties TIPADAS do tipo num
   * dropdown (ou checklist com `multi`) — fim do "bind no escuro" em texto
   * livre. O tipo vem do campo IRMÃO declarado em `typeFrom` (um campo
   * `node-type` cujo valor É o kind, OU uma variável objectSet cujo
   * `spec.object_type` resolve o kind). Fallback manual quando o tipo não está
   * escolhido ou é legado (sem contrato).
   */
  | 'property'
  /**
   * Propagação OSDK (2026-05-30): builder visual de uma LISTA DE COLUNAS
   * estruturadas (`{field,label?,width?}[]`) — substitui o textarea de JSON
   * cru do object_table. Cada linha escolhe a property pelo contrato
   * (PropertyFieldPicker, kind via `typeFrom`). Devolve sempre um array.
   */
  | 'object-columns'
  /**
   * Propagação OSDK (2026-05-30): builder visual de GRUPOS de campos
   * (`{title,fields:{key,label?,type?}[]}[]`) — substitui o JSON cru do
   * object_view. Cada campo escolhe a key pelo contrato. Devolve array.
   */
  | 'object-groups'
  /**
   * F2 (2026-06-06): editor VISUAL de uma lista de BOTÕES (button_group) —
   * `{label, action_id, variant}[]`. Cada linha: rótulo (texto), Ação
   * (ActionTypePicker, dropdown do catálogo /action-types — nunca id digitado),
   * variante (primary/danger/ghost). Substitui o textarea de JSON cru
   * ("Botões (formato JSON)… Editor visual chega em fase futura").
   */
  | 'button-list'
  /**
   * F2: editor VISUAL de uma lista de OPÇÕES (tabs / filter_pills) — substitui o
   * JSON cru. `itemShape='pills'` → `{value,label,group?}`; `itemShape='tabs'` →
   * `{id,label,content?}`. Sempre devolve array.
   */
  | 'option-list';

export interface PropFieldDef {
  /** Chave do props (path single-level). */
  name: string;
  /** Label visível (curto, sentence case). */
  label: string;
  /** Descrição opcional — vira hint abaixo do input. */
  description?: string;
  /** Default usado quando o operador NÃO setou nada ainda. */
  default?: unknown;
  /** Tipo do field. */
  field: FieldKind;
  /** Pra `select`: opções enumeradas. */
  options?: { value: string; label: string }[];
  /** Pra `number`. */
  min?: number;
  max?: number;
  step?: number;
  /** Unidade que aparece como sufixo dentro do input (ex.: "m", "°"). */
  unit?: string;
  /** Placeholder. */
  placeholder?: string;
  /**
   * Para `field: 'property'` — nome do campo IRMÃO (mesmo config_schema) que
   * define o Object Type a partir do qual listar as properties: um campo
   * `node-type` (valor é o kind) OU um campo variable-ref/path cuja variável
   * objectSet tem `spec.object_type`. Sem `typeFrom`, ou tipo não resolvível,
   * o picker cai no input manual.
   */
  typeFrom?: string;
  /**
   * Para `field: 'property'` — quando `true`, o valor é `string[]` (checklist
   * multi-seleção das properties). Default: single (dropdown, valor `string`).
   */
  multi?: boolean;
  /**
   * Para `field: 'option-list'` — forma do item: `'pills'` (`{value,label,group?}`,
   * filter_pills) ou `'tabs'` (`{id,label,content?}`). Default: 'pills'.
   */
  itemShape?: 'pills' | 'tabs';
}

export interface WidgetMeta {
  /** Categoria pra agrupamento na paleta. Default: 'data'. */
  group: WidgetGroup;
  /** Label legível (default: o `type`). */
  label?: string;
  /** Descrição curta (1 frase). */
  description?: string;
  /** Nome de ícone do lucide-react (default: 'square'). */
  icon?: string;
  /** col_span sugerido quando o widget é adicionado pela paleta. */
  defaultColSpan?: number;
  /**
   * Schema de configuração pro Inspetor visual. Quando presente, o
   * editor renderiza inputs nativos por field. Quando ausente, cai
   * pro textarea JSON (fallback compatível com widgets antigos).
   */
  config_schema?: PropFieldDef[];
  /**
   * F2 (unificação de eventos): triggers que ESTE widget realmente EMITE em
   * runtime. É a fonte de verdade do editor de Eventos — a coluna "Quando" só
   * oferece os triggers que de fato disparam (acaba com o catálogo abstrato
   * cujas chaves nunca casavam com o trigger real → evento que nunca executa).
   * `on_load` é implícito a TODOS os widgets (o framework dispara no mount) e
   * NÃO precisa ser listado aqui. Widget sem emits ([] ou ausente) não dispara
   * nada além de on_load (ex.: metric_card).
   */
  emits?: EventTrigger[];
  /**
   * Agrupamento em abas para a view da `/ficha/{id}`. Quando o widget
   * está dentro de uma seed de ficha, o `FichaWorkshopShell` lê este
   * campo do registry e organiza os nodes em abas — sem afetar o
   * editor (que continua mostrando blocos individuais).
   *
   * Convencionado:
   *   - "identidade"  → identificação + endereços
   *   - "historico"   → antecedentes + mandados + veículos
   *   - "atividade"   → linha do tempo + cidades + observações CCTV
   */
  fichaTab?: 'identidade' | 'historico' | 'atividade' | string;
  /**
   * Variables de exemplo pro modo editor — quando o widget depende de
   * dados de runtime (result, properties, etc), o editor injeta esses
   * mocks pra que o operador veja o widget renderizando dados
   * realistas em vez do placeholder "aparece quando…".
   *
   * Quando presente (ou `mockConfig`), o `EditorPreviewFrame` suprime
   * a "água" — o widget já está renderizando algo fiel ao runtime.
   */
  mockVariables?: Record<string, unknown>;
  /**
   * Props de exemplo para a paleta — preview de widgets config-driven
   * (ex: KPI usa `cfg.label`). No canvas o config real vem do nó; a
   * paleta NÃO tem nó então usa esse fallback.
   */
  mockConfig?: Record<string, unknown>;
  /**
   * Quando `true`, widget some da paleta mas continua registrado (renderiza
   * em layouts antigos). Use pra aliases legados sem duplicar visualmente.
   */
  hidden?: boolean;
  /**
   * Auto-refresh — recarrega o widget periodicamente. Adicionado em
   * Sprint 1 (Workshop parity roadmap). O renderer monta um wrapper
   * que faz remount via `key` bump a cada N segundos. Útil pra widgets
   * com polling interno (alertas, contagem por classe) e pra dashboards
   * que precisam ficar "vivos" sem o operador apertar F5.
   *
   * - `intervalSeconds: 0` (default) = sem refresh
   * - Configurável também no Inspetor (override por instância via
   *   `node.layout.refresh_seconds`).
   */
  autoRefresh?: { intervalSeconds: number };
  /**
   * Largura natural (px) do widget no preview do popover. Default 320.
   *
   * Atoms (KPI, identificação, cards): 320 é OK.
   * Macros (Dashboard layout, kpis_row, timeline_row): use 800-1200 pra
   * mostrar a estrutura legível. O popover escala pra caber na viewport.
   */
  previewWidth?: number;
  /**
   * Altura explícita (px) do container do preview. Necessário pra widgets
   * que usam `h-full` na raiz (eles colapsam quando o pai não tem altura
   * definida — caso típico do `bg-panel-light h-full` dos painéis).
   * Default: auto (deixa o widget escolher).
   */
  previewHeight?: number;
}

interface RegistryEntry {
  Component: WidgetComponent;
  meta: WidgetMeta;
}

const REGISTRY = new Map<string, RegistryEntry>();

export function registerWidget(
  type: string,
  Component: WidgetComponent,
  meta: Partial<WidgetMeta> = {},
) {
  REGISTRY.set(type, {
    Component,
    meta: {
      group: meta.group ?? 'data',
      label: meta.label,
      description: meta.description,
      icon: meta.icon,
      defaultColSpan: meta.defaultColSpan,
      config_schema: meta.config_schema,
      emits: meta.emits,
      fichaTab: meta.fichaTab,
      mockVariables: meta.mockVariables,
      mockConfig: meta.mockConfig,
      hidden: meta.hidden,
      previewWidth: meta.previewWidth,
      previewHeight: meta.previewHeight,
      autoRefresh: meta.autoRefresh,
    },
  });
}

export function getRegisteredWidgetTypes(): string[] {
  return Array.from(REGISTRY.keys());
}

export function getRegisteredWidgets(): { type: string; meta: WidgetMeta }[] {
  return Array.from(REGISTRY.entries()).map(([type, e]) => ({
    type,
    meta: e.meta,
  }));
}

export function getWidgetComponent(type: string): WidgetComponent | null {
  return REGISTRY.get(type)?.Component ?? null;
}

export function getWidgetMeta(type: string): WidgetMeta | null {
  return REGISTRY.get(type)?.meta ?? null;
}

// ── URL bindings helpers ---------------------------------------------------

export function readBindingsFromURL(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, unknown> = {};
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of params) {
    if (!k.startsWith('var.')) continue;
    const external = k.slice(4);
    try {
      out[external] = JSON.parse(v);
    } catch {
      out[external] = v;
    }
  }
  return out;
}

export function writeBindingsToURL(bindings: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  // remove vars antigas
  for (const k of Array.from(params.keys())) {
    if (k.startsWith('var.')) params.delete(k);
  }
  for (const [k, v] of Object.entries(bindings)) {
    if (v == null || v === '') continue;
    params.set(`var.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', next);
}

// ── Renderer principal ----------------------------------------------------

type Props = {
  app: WorkshopApp;
  /** Overrides extras de variáveis (URL `?var.*` SÃO somados automaticamente). */
  overrideOverrides?: Record<string, unknown>;
  /** Se true, sem padding interno (modo embed/kiosk). */
  flat?: boolean;
  /**
   * Provedor de avaliação injetável (default = endpoint autenticado). A
   * superfície pública `/m/{token}` injeta o provedor token-scoped — MESMO
   * renderer/engine, só muda QUEM resolve os dados (superfície + token).
   */
  evaluator?: (
    appId: string,
    opts: { overrides: Record<string, unknown> },
  ) => Promise<{ variables: ResolvedVariableMap }>;
};

function variablesAsMap(resolved: ResolvedVariableMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resolved)) out[k] = v.value;
  return out;
}

export function WorkshopV2Renderer({ app, overrideOverrides = {}, flat = false, evaluator }: Props) {
  // Semeia os DEFAULTS das variáveis static já na 1ª render (lazy init) — assim um
  // object set que resolve ${var} (ex.: filtro de período) NÃO dá UnresolvedBinding/422
  // na 1ª query, antes de qualquer interação. Bindings de UI/URL sobrescrevem depois.
  const [bindings, setBindings] = useState<Record<string, unknown>>(() => {
    const seed: Record<string, unknown> = {};
    for (const v of app.variables ?? []) {
      const ext = v.external_id || v.id;
      if (v.kind === 'static' && ext) {
        const val = (v.spec as { value?: unknown } | undefined)?.value;
        if (val !== undefined) seed[ext] = val;
      }
    }
    return seed;
  });
  /** Set de overlays abertos — Sprint 2. */
  const [openOverlays, setOpenOverlays] = useState<Set<string>>(new Set());
  /** Bumper pra forçar refresh manual de variable (Sprint 2 — refresh_variable). */
  const [refreshTick, setRefreshTick] = useState<Record<string, number>>({});

  // hidrata da URL na 1ª render
  useEffect(() => {
    setBindings((b) => ({ ...readBindingsFromURL(), ...b }));
  }, []);
  // grava na URL quando bindings mudam
  useEffect(() => {
    writeBindingsToURL(bindings);
  }, [bindings]);

  const setBinding = useCallback((external: string, value: unknown) => {
    setBindings((prev) => ({ ...prev, [external]: value }));
  }, []);

  const openOverlay = useCallback(
    (id: string) => {
      setOpenOverlays((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Sprint B3: bidirecional — atualiza a variável quando declarada.
      const overlay = (app.overlays ?? []).find((o) => o.id === id);
      if (overlay?.open_variable) {
        setBinding(overlay.open_variable, !overlay.open_variable_invert);
      }
      // Sprint E3: ingest fire-and-forget — só pra apps persistidos.
      // Sprint PE4: respeita o opt-out de telemetria por painel.
      if (isPersistedAppId(app.id) && app.metrics_enabled !== false) {
        Workshop.logUsageEvent(app.id, { event_type: 'overlay_view', overlay_id: id });
      }
    },
    [app.overlays, app.id, app.metrics_enabled, setBinding],
  );

  const closeOverlay = useCallback(
    (id: string) => {
      setOpenOverlays((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const overlay = (app.overlays ?? []).find((o) => o.id === id);
      if (overlay?.open_variable) {
        setBinding(overlay.open_variable, !!overlay.open_variable_invert);
      }
    },
    [app.overlays, setBinding],
  );

  // Sprint B3: hidrata estado de overlays a partir das variáveis declaradas
  // (variable → overlay). Quando uma var muda externamente (URL routing, etc),
  // overlay correspondente abre/fecha.
  useEffect(() => {
    for (const o of app.overlays ?? []) {
      if (!o.open_variable) continue;
      const raw = bindings[o.open_variable];
      if (typeof raw !== 'boolean') continue;
      const shouldBeOpen = o.open_variable_invert ? !raw : raw;
      const isOpen = openOverlays.has(o.id);
      if (shouldBeOpen && !isOpen) {
        setOpenOverlays((prev) => {
          const next = new Set(prev);
          next.add(o.id);
          return next;
        });
      } else if (!shouldBeOpen && isOpen) {
        setOpenOverlays((prev) => {
          const next = new Set(prev);
          next.delete(o.id);
          return next;
        });
      }
    }
  }, [bindings, app.overlays, openOverlays]);

  const refreshVariable = useCallback((target: string) => {
    setRefreshTick((prev) => ({ ...prev, [target]: (prev[target] ?? 0) + 1 }));
  }, []);

  const refreshAll = useCallback(() => {
    // Tier A: bump um contador global → overrides muda → useEvaluatedApp recalcula.
    setRefreshTick((prev) => ({ ...prev, __all__: (prev.__all__ ?? 0) + 1 }));
  }, []);

  // Auto-refresh "ao vivo" (sem F5): re-avalia a página inteira a cada
  // `refresh_seconds` (declarado na config da página). Reusa refreshAll (bump do
  // refreshKey → useEvaluatedApp recalcula, atualizando os KPIs que leem as
  // variables do pai). Só liga quando o intervalo é declarado (default = uma vez
  // no mount). Pausa com a aba oculta (não gasta à toa).
  const autoRefreshSec = app.refresh_seconds ?? 0;
  useEffect(() => {
    if (!autoRefreshSec || autoRefreshSec <= 0) return;
    const ms = Math.max(5, autoRefreshSec) * 1000;
    const h = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshAll();
    }, ms);
    return () => clearInterval(h);
  }, [autoRefreshSec, refreshAll]);

  const getBinding = useCallback(
    (external: string): unknown => bindings[external],
    [bindings],
  );

  // Sprint B2: variable-backed active page resolution (pre-computed pra
  // poder ser injetado no EventCtx que dispatchEvent passa pra runAction).
  const pagesForSwitch = useMemo<WorkshopPage[]>(
    () =>
      app.pages && app.pages.length > 0
        ? app.pages
        : [{ id: '__main__', label: 'Principal', layout: app.layout }],
    [app.pages, app.layout],
  );
  // Sprint B2: backend ainda não tem coluna dedicada pra `active_page_variable`.
  // Persistimos dentro do `layout` JSONB (campo livre) como segunda opção;
  // ler primeiro do top-level pra forward-compat se backend ganhar a coluna.
  const activePageBindingKeyForSwitch =
    app.active_page_variable
    ?? ((app.layout as { active_page_variable?: string } | null | undefined)
      ?.active_page_variable);
  const switchPage = useCallback(
    (pageId: string) => {
      setBinding('__active_page__', pageId);
      if (activePageBindingKeyForSwitch) {
        const target = pagesForSwitch.find((p) => p.id === pageId);
        const valueToWrite = target?.url_slug || target?.id || pageId;
        setBinding(activePageBindingKeyForSwitch, valueToWrite);
      }
    },
    [setBinding, activePageBindingKeyForSwitch, pagesForSwitch],
  );

  /**
   * Despacha um trigger emitido por widget pros eventos declarativos
   * matching no node. Executa em ordem; sem await entre actions
   * (similar ao Foundry: action seguinte vê estado da anterior sem
   * esperar downstream recomputes terminarem).
   */
  const dispatchEvent = useCallback(
    (
      events: WidgetEvent[] | undefined,
      trigger: string,
      payload: Record<string, unknown> | undefined,
      nodeId?: string,
    ) => {
      if (!events || events.length === 0) return;
      const matching = events.filter((e) => e.trigger === trigger);
      if (matching.length === 0) return;
      // Sprint E3: ingest action_submit quando trigger 'click' resulta em
      // ações sendo executadas. action_id = payload.button_id (button-group)
      // OU params.target da primeira action OU node_id como fallback.
      // Sprint PE4: respeita opt-out de telemetria.
      if (
        trigger === 'click'
        && isPersistedAppId(app.id)
        && app.metrics_enabled !== false
      ) {
        const firstParams = matching[0].params ?? {};
        const actionId =
          (typeof payload?.button_id === 'string' && payload.button_id) ||
          (typeof firstParams.target === 'string' && firstParams.target) ||
          nodeId ||
          null;
        Workshop.logUsageEvent(app.id, {
          event_type: 'action_submit',
          action_id: actionId,
        });
      }
      for (const ev of matching) {
        runAction(ev.action, ev.params ?? {}, payload ?? {}, {
          setBinding,
          getBinding,
          openOverlay,
          closeOverlay,
          refreshVariable,
          refreshAll,
          switchPage,
        });
      }
    },
    [app.id, app.metrics_enabled, setBinding, getBinding, openOverlay, closeOverlay, refreshVariable, refreshAll, switchPage],
  );

  // overrides reais (apenas variables válidas) — `__refresh_tick__` é frontend-only:
  // entra como dep de `useEvaluatedApp` via `refreshKey`, NUNCA no payload do POST /evaluate
  // (o backend rejeita chaves não declaradas com 400).
  const overrides = useMemo(
    () => ({ ...bindings, ...overrideOverrides }),
    [bindings, overrideOverrides],
  );
  const refreshKey = useMemo(() => JSON.stringify(refreshTick), [refreshTick]);

  const hasVariables = (app.variables?.length ?? 0) > 0;
  // SÓ variáveis DECLARADAS podem ir como override no POST /evaluate — o backend
  // rejeita chaves não declaradas com 400. Bindings de UI (troca de página
  // `__active_page__`, filtros, `__refresh_tick__`) NÃO são variáveis: se vazarem,
  // o evaluate 400 → status='error' → early-return → "Rendered fewer hooks"
  // ao trocar de aba. Filtramos aqui pra só mandar overrides de variável real.
  const declaredVarIds = useMemo(
    () => new Set((app.variables ?? []).map((v) => v.external_id || v.id)),
    [app.variables],
  );
  const evalOverrides = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (declaredVarIds.has(k)) out[k] = v;
    }
    return out;
  }, [overrides, declaredVarIds]);
  const evaluated = useEvaluatedApp(hasVariables ? app.id : null, evalOverrides, refreshKey, evaluator);
  const variables = useMemo(() => {
    if (hasVariables) return variablesAsMap(evaluated.variables);
    return { ...overrides };
  }, [hasVariables, evaluated.variables, overrides]);

  // Sprint 3: multi-page support — `pagesForSwitch` já calculado acima.
  // Sprint B2: variable-backed active page resolution.
  //   1. `app.active_page_variable` (declared) → bindings[<var>] string
  //   2. internal `__active_page__` binding (toggle clique direto)
  //   3. page.is_default (do PageSettings popover)
  //   4. fallback pages[0]
  // O valor da var pode casar com `page.id` OU `page.url_slug` (slug wins).
  const pages = pagesForSwitch;
  const externalActivePage =
    activePageBindingKeyForSwitch && typeof bindings[activePageBindingKeyForSwitch] === 'string'
      ? (bindings[activePageBindingKeyForSwitch] as string)
      : undefined;
  const internalActivePage =
    typeof bindings.__active_page__ === 'string' && bindings.__active_page__
      ? (bindings.__active_page__ as string)
      : undefined;
  const defaultPage = pages.find((p) => p.is_default);
  const activePageId =
    externalActivePage ?? internalActivePage ?? defaultPage?.id ?? pages[0].id;
  const activePage =
    pages.find((p) => p.id === activePageId)
    ?? pages.find((p) => p.url_slug === activePageId)
    ?? pages[0];
  const showHeader = pages.length > 1;
  const cols = activePage.layout?.columns ?? 3;

  // Sprint E3: page_view ingest com debounce de 1s.
  // Evita spam quando operador troca rápido entre tabs/páginas. Só pra
  // apps com UUID real (seed.* / local.app.* ficam de fora — ver
  // `isPersistedAppId`). Backend rejeita IDs locais.
  const activePageIdForLog = activePage.id;
  const metricsEnabledForLog = app.metrics_enabled !== false;
  useEffect(() => {
    if (!isPersistedAppId(app.id)) return;
    if (!metricsEnabledForLog) return;
    const timer = setTimeout(() => {
      Workshop.logUsageEvent(app.id, {
        event_type: 'page_view',
        page_id: activePageIdForLog,
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [app.id, activePageIdForLog, metricsEnabledForLog]);

  // Erro renderizado SÓ DEPOIS de TODOS os hooks (rules-of-hooks). Early-return
  // antes de hooks causava "Rendered fewer hooks than expected" em qualquer erro
  // de /evaluate (não só na troca de aba).
  if (evaluated.status === 'error') {
    return (
      <div
        data-testid="workshop-renderer-error"
        className="p-4 border border-danger bg-danger/10 text-[12px] text-danger font-mono"
      >
        Não foi possível carregar os dados deste painel. {humanizeApiError(evaluated.error ?? '')}
      </div>
    );
  }

  return (
    <>
      {/* Header de páginas (só quando multi-page). */}
      {showHeader && (
        <header
          data-testid="workshop-pages-header"
          className="border-b border-border-light bg-panel-light px-4 flex items-stretch overflow-x-auto"
        >
          {pages.map((p) => {
            const isActive = p.id === activePage.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => switchPage(p.id)}
                data-testid={`page-tab-${p.id}`}
                className={cn(
                  'h-9 px-4 text-[11px] uppercase tracking-[0.16em] font-mono transition-colors relative whitespace-nowrap',
                  isActive
                    ? 'text-text-on-light after:absolute after:bottom-0 after:inset-x-3 after:h-[2px] after:bg-primary'
                    : 'text-muted-on-light hover:text-text-on-light',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </header>
      )}
      <div
        data-testid="workshop-renderer"
        className={flat ? '' : 'p-4'}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '0.75rem' }}
      >
        {(activePage.layout?.root ?? []).map((node) => (
          <RenderNode
            key={node.id}
            node={node}
            appId={app.id}
            variables={variables}
            bindings={bindings}
            setBinding={setBinding}
            dispatchEvent={dispatchEvent}
          />
        ))}
      </div>
      {/* Overlays — só renderiza os abertos. Cada overlay tem seu
          próprio layout-tree (sub-árvore de widgets). */}
      {(app.overlays ?? [])
        .filter((o) => openOverlays.has(o.id))
        .map((overlay) => (
          <OverlayHost
            key={overlay.id}
            overlay={overlay}
            appId={app.id}
            variables={variables}
            bindings={bindings}
            setBinding={setBinding}
            dispatchEvent={dispatchEvent}
            onClose={() => closeOverlay(overlay.id)}
          />
        ))}
    </>
  );
}

/**
 * Wrapper que adapta o `EventCtx.getBinding` (lookup dinâmico) pra interface
 * de `bindings: Record<string, unknown>` esperada pelo `evaluateCondition`.
 * Usa Proxy lazy — só puxa via getBinding quando o parser realmente acessa.
 */
function evalConditionViaCtx(expression: string, ctx: EventCtx): boolean {
  if (!expression?.trim()) return false;
  const proxy = new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        return ctx.getBinding(prop);
      },
    },
  );
  return evaluateCondition(expression, proxy as Record<string, unknown>);
}

// -- Event runner -------------------------------------------------------- //
type EventCtx = {
  setBinding: (external: string, value: unknown) => void;
  getBinding: (external: string) => unknown;
  openOverlay: (id: string) => void;
  closeOverlay: (id: string) => void;
  refreshVariable: (target: string) => void;
  refreshAll: () => void;
  /** Sprint B2: troca de página bidirecional (sincroniza
   *  `__active_page__` + `active_page_variable` se declarada). */
  switchPage: (pageId: string) => void;
};

function runAction(
  action: EventAction,
  params: Record<string, unknown>,
  payload: Record<string, unknown>,
  ctx: EventCtx,
  depth = 0,
): void {
  // F2: trava de profundidade — `if` recursa em `then`/`else`; sem teto um
  // evento autoral mal-formado (if dentro de if dentro de if…) trava a UI.
  if (depth >= 16) return;
  switch (action) {
    case 'set_variable': {
      const target = typeof params.target === 'string' ? params.target : null;
      if (!target) return;
      // Resolve value: literal `value` OU `from` (lê do payload).
      let value: unknown = params.value;
      if (typeof params.from === 'string' && params.from in payload) {
        value = payload[params.from];
      }
      ctx.setBinding(target, value);
      return;
    }
    case 'refresh_variable': {
      const target = typeof params.target === 'string' ? params.target : null;
      if (target) ctx.refreshVariable(target);
      return;
    }
    case 'refresh_all': {
      // Tier A: recarrega todas as variables do módulo (re-evaluate).
      ctx.refreshAll();
      return;
    }
    case 'copy_variable': {
      // Tier A: copia bindings[source] → bindings[target].
      const source = typeof params.source === 'string' ? params.source : null;
      const target = typeof params.target === 'string' ? params.target : null;
      if (!source || !target) return;
      ctx.setBinding(target, ctx.getBinding(source));
      return;
    }
    case 'open_overlay': {
      const id = typeof params.overlay_id === 'string' ? params.overlay_id : null;
      if (id) ctx.openOverlay(id);
      return;
    }
    case 'close_overlay': {
      const id = typeof params.overlay_id === 'string' ? params.overlay_id : null;
      if (id) ctx.closeOverlay(id);
      return;
    }
    case 'switch_page': {
      const id = typeof params.page_id === 'string' ? params.page_id : null;
      if (id) ctx.switchPage(id);
      return;
    }
    case 'navigate': {
      // Tier A: abre URL em new tab (default) ou current. Sandboxed
      // pra evitar tabnabbing: noopener + noreferrer.
      if (typeof window === 'undefined') return;
      const url = typeof params.url === 'string' ? params.url : null;
      if (!url) return;
      const target = params.target === '_self' ? '_self' : '_blank';
      window.open(url, target, 'noopener,noreferrer');
      return;
    }
    case 'if': {
      // Sprint B4: branch condicional. Avalia `expression` com bindings
      // resolvidos como namespace; dispatcha `then` ou `else` (arrays de
      // sub-events `{ action, params }`).
      const expression =
        typeof params.expression === 'string' ? params.expression : '';
      const thenBranch = Array.isArray(params.then) ? params.then : [];
      const elseBranch = Array.isArray(params.else) ? params.else : [];
      // Coleta bindings via ctx.getBinding (sem acesso direto a state pra evitar
      // stale closures durante chain).
      const ns: Record<string, unknown> = {};
      // O parser usa nomes livres — não temos lista de external_ids aqui.
      // Estratégia: avaliar lazily via Proxy é overkill. Em vez disso,
      // testParser usa lookups dinâmicos via ctx.getBinding.
      const branches = evalConditionViaCtx(expression, ctx) ? thenBranch : elseBranch;
      for (const sub of branches) {
        if (!sub || typeof sub !== 'object') continue;
        const subAction = (sub as { action?: EventAction }).action;
        const subParams = (sub as { params?: Record<string, unknown> }).params ?? {};
        if (subAction) runAction(subAction, subParams, payload, ctx, depth + 1);
      }
      // ns silenciador
      void ns;
      return;
    }
  }
}

function RenderNode({
  node,
  appId,
  variables,
  bindings,
  setBinding,
  dispatchEvent,
}: {
  node: LayoutNode;
  appId: string;
  variables: Record<string, unknown>;
  bindings: Record<string, unknown>;
  setBinding: (externalId: string, value: unknown) => void;
  dispatchEvent: (
    events: WidgetEvent[] | undefined,
    trigger: string,
    payload?: Record<string, unknown>,
    nodeId?: string,
  ) => void;
}) {
  const emit = useCallback(
    (trigger: string, payload?: Record<string, unknown>) =>
      dispatchEvent(node.events, trigger, payload, node.id),
    [dispatchEvent, node.events, node.id],
  );
  // Dispara `on_load` quando o node monta pela primeira vez.
  const hasOnLoad = (node.events ?? []).some((e) => e.trigger === 'on_load');
  const firedOnLoadRef = useRef(false);
  useEffect(() => {
    if (hasOnLoad && !firedOnLoadRef.current) {
      firedOnLoadRef.current = true;
      emit('on_load');
    }
  }, [hasOnLoad, emit]);
  const entry = REGISTRY.get(node.widget.type);
  const style: React.CSSProperties = {};
  if (node.layout?.col_span) style.gridColumn = `span ${node.layout.col_span}`;
  if (node.layout?.row_span) style.gridRow = `span ${node.layout.row_span}`;
  if (node.layout?.min_height) style.minHeight = node.layout.min_height;
  if (!entry) {
    return (
      <div
        data-testid={`workshop-unknown-${node.widget.type}`}
        style={style}
        className="p-3 border border-dashed border-warning bg-warning/5 text-[11px] font-mono text-warning"
      >
        Widget não registrado: <strong>{node.widget.type}</strong>
        <p className="text-[10px] text-muted-on-light mt-1">
          Disponíveis: {getRegisteredWidgetTypes().join(', ') || '(nenhum)'}
        </p>
      </div>
    );
  }
  const Component = entry.Component;
  // Auto-refresh: prioridade override-por-instância (layout.refresh_seconds)
  // → meta.autoRefresh.intervalSeconds → 0 (sem refresh).
  const instanceRefresh = node.layout?.refresh_seconds;
  const metaRefresh = entry.meta.autoRefresh?.intervalSeconds ?? 0;
  const intervalSec =
    typeof instanceRefresh === 'number' ? instanceRefresh : metaRefresh;
  // Wave G.2 (2026-05-23): style_overrides aplicados no wrapper do
  // widget. Tokens semânticos (não cores cruas). Importamos a função de
  // mapeamento `overridesToClassName` localmente — `require` evita
  // cycle no build statment de cima (inspector-styles-tab importa types
  // daqui).
  const propsRecord = (node.widget.props as Record<string, unknown>) ?? {};
  const so = propsRecord.style_overrides as
    | import('./inspector-styles-tab').StyleOverrides
    | undefined;
  // Eslint disable: dynamic require é intencional (single-source mapping).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { overridesToClassName } = require('./inspector-styles-tab') as {
    overridesToClassName: (
      so: import('./inspector-styles-tab').StyleOverrides | undefined,
    ) => string;
  };
  const overrideClasses = overridesToClassName(so);
  return (
    <div
      data-testid={`workshop-widget-${node.id}`}
      data-style-overrides={overrideClasses || undefined}
      style={style}
      className={overrideClasses || undefined}
    >
      <AutoRefreshFrame intervalSeconds={intervalSec}>
        {(key) => (
          <WidgetErrorBoundary
            key={key}
            widgetType={node.widget.type}
            nodeId={node.id}
          >
            <Component
              appId={appId}
              config={propsRecord}
              variables={variables}
              bindings={bindings}
              setBinding={setBinding}
              emit={emit}
            />
          </WidgetErrorBoundary>
        )}
      </AutoRefreshFrame>
    </div>
  );
}

/**
 * Wrapper que força remount do widget filho a cada N segundos via `key`
 * bump. Útil pra widgets com fetch interno (alertas, contagem) sem
 * precisar de polling manual nas implementações.
 *
 * `intervalSeconds <= 0` → renderiza filho 1x sem timer.
 */
function AutoRefreshFrame({
  intervalSeconds,
  children,
}: {
  intervalSeconds: number;
  children: (key: number) => React.ReactNode;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (intervalSeconds <= 0) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [intervalSeconds]);
  return <>{children(tick)}</>;
}

/* -------------------------------------------------------------------------- */
/* OverlayHost (Sprint 2)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Renderiza um overlay (drawer-right, drawer-left, modal) portalado pra
 * body. Backdrop semi-transparente; clique no backdrop OU ESC fecha.
 * Conteúdo é outro layout-tree de widgets, com acesso ao mesmo
 * variables/bindings/dispatchEvent da app pai.
 */
function OverlayHost({
  overlay,
  appId,
  variables,
  bindings,
  setBinding,
  dispatchEvent,
  onClose,
}: {
  overlay: WorkshopOverlay;
  appId: string;
  variables: Record<string, unknown>;
  bindings: Record<string, unknown>;
  setBinding: (external: string, value: unknown) => void;
  dispatchEvent: (
    events: WidgetEvent[] | undefined,
    trigger: string,
    payload?: Record<string, unknown>,
    nodeId?: string,
  ) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  const width = overlay.width ?? 480;
  const isDrawer = overlay.variant !== 'modal';
  const isRight = overlay.variant === 'drawer-right';
  const cols = overlay.layout?.columns ?? 12;

  return createPortal(
    // Wrapper TRANSPARENTE: `surface-light` aqui pintava a viewport inteira de
    // branco opaco e o backdrop translúcido escurecia o branco — não o app
    // (bug reportado pelo operador 2026-06-04). O contexto de texto vai no
    // CONTAINER do drawer/modal, que é quem tem fundo claro.
    <div
      className="fixed inset-0 z-[90]"
      data-testid={`overlay-host-${overlay.id}`}
    >
      {/* Backdrop — escurece o APP atrás (app continua visível, esmaecido) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 ds-overlay"
        data-testid={`overlay-backdrop-${overlay.id}`}
      />
      {/* Container */}
      <div
        role="dialog"
        aria-label={overlay.title ?? overlay.id}
        className={cn(
          'absolute bg-canvas-light text-text-on-light border border-border-light flex flex-col overflow-hidden',
          isDrawer && isRight && 'top-0 bottom-0 right-0 border-l',
          isDrawer && !isRight && 'top-0 bottom-0 left-0 border-r',
          !isDrawer && 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100vh-32px)]',
        )}
        style={{
          width,
          ...(isDrawer ? {} : { maxWidth: `${width}px` }),
        }}
      >
        {/* Header */}
        <header className="h-10 px-3 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1 truncate">
            {overlay.title ?? overlay.id}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar overlay"
            data-testid={`overlay-close-${overlay.id}`}
            className="h-7 w-7 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>
        {/* Body — outra árvore de widgets */}
        <div className="flex-1 overflow-y-auto p-3">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: '0.75rem',
            }}
          >
            {(overlay.layout?.root ?? []).map((node) => (
              <RenderNode
                key={node.id}
                node={node}
                appId={appId}
                variables={variables}
                bindings={bindings}
                setBinding={setBinding}
                dispatchEvent={dispatchEvent}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
