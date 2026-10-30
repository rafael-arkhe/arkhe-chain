/**
 * Workshop v2 contract types — espelhados de aegis/web-app/lib/workshop/types.ts
 * (frozen 2026-05-03). Compartilham os mesmos JSON Schemas em
 * `aegis-python-sdk/aegis/workshop/contracts/`, então qualquer edição
 * precisa ser sincronizada nos 2 apps.
 *
 * Em `security-app` consumimos os mesmos endpoints REST do `ontology-module`
 * (router `/workshop`). A serialização é idêntica.
 */

// -- Variable -------------------------------------------------------------- //
export type VariableType =
  | 'String'
  | 'Numeric'
  | 'Boolean'
  | 'Date'
  | 'ObjectSet'
  | 'ObjectSetFilter'
  | 'Struct'
  // Sprint L7 (2026-05-23): collection types for slate-chart / timeline /
  // geo-map / calendar widgets. Espelhados em aegis.workshop.models.VariableType.
  | 'Series'      // array of { x, y }            chart data
  | 'Events'      // array of { timestamp, ... }  timeline data
  | 'GeoPoints'   // array of { lat, lng, ... }   geo-map data
  | 'Calendar'    // array of { date, value }     calendar heatmap
  // Wave F.2 (2026-05-23): MVP slate-parity types.
  | 'ObjectReference' // ref to single object (entity by id)
  | 'Json';       // free-form JSON payload (handle with care)

export type VariableKind =
  | 'static'
  | 'objectSet'
  | 'objectAggregation'
  | 'function'
  | 'transformation'
  | 'struct';

/**
 * Modo de recompute de uma variable. Alinhado com
 * `aegis.workshop.models.RecomputeMode` no backend.
 *   - `auto`        recomputa sempre que dependências mudam (default)
 *   - `event_only`  só recomputa via evento `refresh_variable` explícito
 *
 * `on_load` foi cogitado em Sprint 1 mas removido em Tier B/closure
 * (2026-05-20): backend nunca aceitou, e `auto` já cobre o caso "computa
 * no mount" via `useEvaluatedApp` mount effect.
 */
export type RecomputeMode = 'auto' | 'event_only';

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface StaticSpec {
  value?: unknown;
}

export interface ObjectSetSpec {
  object_type: string;
  filter?: FilterPredicate | null;
  order_by?: OrderBy[];
  limit?: number;
}

export interface ObjectAggregationSpec {
  object_set: string;
  aggregation: {
    op: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct_count';
    field?: string | null;
  };
}

export interface FunctionSpec {
  function_id: string;
  args?: Record<string, unknown>;
}

export interface TransformationSpec {
  expression: string;
}

/**
 * Sprint C2 (Parity Audit, 2026-05-21): variable composta.
 * Cada field é tipado e pode receber valor de outra variável (`source`).
 * Nested structs NÃO suportados (paridade Foundry).
 */
export type StructFieldType =
  | 'String'
  | 'Numeric'
  | 'Boolean'
  | 'Date'
  | 'ObjectSet'
  | 'ObjectSetFilter';

export interface StructField {
  name: string;
  type: StructFieldType;
  source?: string | null;
  label?: string | null;
}

export interface StructSpec {
  fields: StructField[];
}

export type VariableSpec =
  | StaticSpec
  | ObjectSetSpec
  | ObjectAggregationSpec
  | FunctionSpec
  | TransformationSpec
  | StructSpec;

/**
 * Como a variable aparece (ou não) na URL. Sprint A2 do Parity Audit:
 *   - `when_used` (default): só vai pra URL quando widget visível usa
 *   - `always`: sempre presente na URL
 *   - `never`: nunca persiste na URL
 */
export type RoutingMode = 'when_used' | 'always' | 'never';

/** State saving config por variável. Sprint A2 do Parity Audit. */
export interface VariableStateSaving {
  enabled: boolean;
}

/** Routing config por variável. Sprint A2 do Parity Audit. */
export interface VariableRouting {
  enabled: boolean;
  /** Default `when_used`. */
  mode?: RoutingMode;
}

/**
 * Module interface — Sprint B1 do Parity Audit (2026-05-21).
 *
 * Declara a variável como entrada/saída do app quando este é embarcado
 * em outro Workshop app via widget `embedded_app`. Parent app mapeia
 * suas próprias vars contra estes external IDs.
 */
export interface VariableModuleInterface {
  enabled: boolean;
  /** Nome humano que parent app vê ao mapear. */
  display_name?: string;
  /** Descrição curta — aparece como hint no mapping UI do parent. */
  description?: string;
  /**
   * Quando a var é kind=objectSet, restringe ao tipo declarado (ex.: `parlamentar`).
   * Parent só pode mapear vars compatíveis.
   */
  object_type?: string;
  /** Aplicável quando kind=objectSet: aceita qualquer N ou só 1 objeto. */
  object_set_size?: 'any_size' | 'single_object';
}

export interface WorkshopVariable {
  id: string;
  external_id: string;
  label?: string | null;
  description?: string | null;
  type: VariableType;
  kind: VariableKind;
  recompute_mode: RecomputeMode;
  default?: unknown;
  spec?: VariableSpec;
  inputs?: string[];
  permissions?: { read?: string[] };
  markings?: string[];
  /** Sprint A2: settings cross-cutting (Foundry Variable Editor "Settings" tab). */
  routing?: VariableRouting;
  state_saving?: VariableStateSaving;
  /** Sprint B1: interface módulo (embed mapping). */
  module_interface?: VariableModuleInterface;
}

// -- FilterPredicate AST --------------------------------------------------- //
export type LeafOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'between'
  | 'contains'
  | 'prefix'
  | 'geo_within'
  | 'geo_intersects'
  | 'has_marking'
  | 'lacks_marking';

export type LogicalOp = 'and' | 'or' | 'not';

export type FilterPredicate =
  | { op: 'and'; operands: FilterPredicate[] }
  | { op: 'or'; operands: FilterPredicate[] }
  | { op: 'not'; operand: FilterPredicate }
  | LeafPredicate;

export interface LeafPredicate {
  op: LeafOp;
  field: string;
  value?: unknown;
}

// -- ActionType ------------------------------------------------------------ //
export interface ActionParam {
  name: string;
  label?: string | null;
  type: 'String' | 'Numeric' | 'Boolean' | 'Date' | 'ObjectRef' | 'ObjectSet';
  required: boolean;
  default?: unknown;
  description?: string | null;
}

export interface ActionType {
  id: string;
  label: string;
  description?: string | null;
  params: ActionParam[];
  permissions: string[];
  execution?: { kind: 'service' | 'function'; target: string };
  audit?: { lineage_event?: boolean; inference_log?: boolean };
}

// -- Runtime payloads ------------------------------------------------------ //
export interface ResolvedVariable {
  value: unknown;
  markings: string[];
}

export type ResolvedVariableMap = Record<string, ResolvedVariable>;

export interface ObjectSetRow {
  id: string;
  name: string;
  node_type: string;
  properties: Record<string, unknown>;
  markings: string[];
}

// -- Layout / App --------------------------------------------------------- //
export interface WidgetConfig {
  /** Id do widget no catalog (ex.: "object_table_v2", "kpi_card"). */
  type: string;
  /** Configuração opaca lida pelo componente do widget. */
  props?: Record<string, unknown>;
  /** Binding map: { var_external_id: source_widget_id } */
  bindings?: Record<string, string>;
}

// -- Events system v1 (Sprint 2) ------------------------------------------ //
/**
 * Triggers que widgets podem emitir via `WidgetRenderProps.emit`:
 *   - `click`           — botão clicado, item selecionado
 *   - `select_change`   — linha de tabela / item de lista escolhido
 *   - `value_change`    — input/select/dropdown mudou de valor
 *   - `on_load`         — widget montou pela primeira vez
 *   - `action.execute.success|pending|error` — ciclo de vida de uma Ação
 *     disparada por um widget de ação (object_action_button). Permite reagir
 *     ao resultado da Ação (ex.: refresh_all no sucesso, open_overlay no erro).
 */
export type EventTrigger =
  | 'click'
  | 'select_change'
  | 'value_change'
  | 'on_load'
  // Ciclo de vida de Ação (object_action_button)
  | 'action.execute.success'
  | 'action.execute.pending'
  | 'action.execute.error'
  // Ciclo de vida de Formulário (form_builder)
  | 'form.submit.success'
  | 'form.submit.error'
  | 'form.submit.denied'
  // Ciclo de vida de Consulta (query_result)
  | 'query.success'
  | 'query.error'
  // Busca / filtro (search_input, exploration_filter_pills)
  | 'search.changed'
  | 'painel.filter.changed';

/**
 * Actions que podem ser disparadas por um evento:
 *   - `set_variable`     — escreve em `bindings[params.target]`
 *   - `refresh_variable` — força recompute da variable `params.target`
 *   - `refresh_all`      — força recompute de TODAS as variables do módulo (Tier A)
 *   - `copy_variable`    — copia `bindings[params.source]` pra `bindings[params.target]` (Tier A)
 *   - `switch_page`      — muda page ativa pra `params.page_id` (Sprint 3)
 *   - `open_overlay`     — abre overlay `params.overlay_id`
 *   - `close_overlay`    — fecha overlay `params.overlay_id`
 *   - `navigate`         — abre URL `params.url` (Tier A); `params.target = '_blank' | '_self'`
 */
export type EventAction =
  | 'set_variable'
  | 'refresh_variable'
  | 'refresh_all'
  | 'copy_variable'
  | 'switch_page'
  | 'open_overlay'
  | 'close_overlay'
  | 'navigate'
  /** Sprint B4 (Parity Audit): branch condicional. params:
   *  { expression: string, then: WidgetEvent['action'/]'params'][], else: ... }
   *  Avalia `expression` via safe-eval com bindings como namespace; se
   *  truthy roda `then`, senão `else`. */
  | 'if';

/**
 * Evento declarativo num node. Quando o widget emite um `trigger`, o
 * renderer executa o `action` com os `params`. Eventos rodam em ordem
 * (foreach do array) — sem await entre eles, similar ao Foundry: o
 * próximo evento vê o estado da action anterior sem esperar
 * recomputes downstream completarem.
 *
 * `params` é livre por design (cada action consome o que precisa). Convenções:
 *   - set_variable: `{ target: string, value?: unknown, from?: string }`
 *     (`from` lê do `payload` que o widget passou em `emit`).
 *   - refresh_variable: `{ target: string }`
 *   - switch_page: `{ page_id: string }`
 *   - open_overlay / close_overlay: `{ overlay_id: string }`
 */
export interface WidgetEvent {
  trigger: EventTrigger;
  action: EventAction;
  params?: Record<string, unknown>;
}

// -- Overlay primitive (Sprint 2) ----------------------------------------- //
/**
 * Overlay = camada flutuante (drawer ou modal) com seu próprio layout
 * de widgets. Renderiza por cima da página quando aberto via evento
 * `open_overlay`. Backdrop click ou ESC dismiss.
 */
export type OverlayVariant = 'drawer-right' | 'drawer-left' | 'modal';

export interface WorkshopOverlay {
  /** Id estável; usado em `open_overlay.params.overlay_id`. */
  id: string;
  /** Título opcional no header do overlay. */
  title?: string;
  /** drawer-right (default), drawer-left ou modal centralizado. */
  variant: OverlayVariant;
  /** Largura em px (drawers) ou max-width (modal). Default 480. */
  width?: number;
  /** Layout interno do overlay — outra árvore de widgets. */
  layout: WorkshopAppLayout;
  /**
   * Sprint B3 do Parity Audit (2026-05-21): variable-backed overlay.
   * `external_id` de uma boolean variable: true → overlay aberto;
   * false → fechado. Mudança nos dois sentidos sincroniza.
   */
  open_variable?: string;
  /**
   * Inverte a semântica: variável true → fechado. Útil quando operador
   * declara variável `hidden` semanticamente.
   */
  open_variable_invert?: boolean;
}

export interface LayoutNode {
  id: string;
  widget: WidgetConfig;
  /** Filhos (pra widgets compostos: Tabs, Grid). */
  children?: LayoutNode[];
  /** Eventos declarados no node — Sprint 2 do parity roadmap. */
  events?: WidgetEvent[];
  /** Grid placement (col/row span) + min-height opcional. */
  layout?: {
    col_start?: number;
    col_span?: number;
    row_start?: number;
    row_span?: number;
    /** CSS min-height (ex: "460px"). Útil pra widgets sem altura
     *  intrínseca (MiniMap, CamerasPrioritarias). */
    min_height?: string;
    /**
     * Aba em que o widget aparece na view final. Usado pela
     * `/ficha/{id}` pra agrupar widgets em tabs. Ignorado no canvas do
     * editor (operador vê todos os blocos soltos pra edição
     * granular). Strings livres — convenção pra ficha: "identidade",
     * "historico", "atividade". Qualquer string nova cria uma aba.
     * Vazio/ausente cai em "Outros".
     */
    tab?: string;
    /**
     * Slot na view final. Permite mover widgets entre regiões do
     * layout (header / sidebar esquerda / sidebar direita / canvas
     * central). Default: `'canvas'`.
     *
     * No editor do Workshop, blocos aparecem todos soltos no canvas
     * pra edição. Na view final, o shell posiciona cada um conforme
     * o slot.
     */
    slot?: 'top' | 'left' | 'right' | 'canvas' | string;
    /**
     * Override por instância do auto-refresh declarado no `WidgetMeta`.
     * Adicionado em Sprint 1. `null` ou `0` = sem refresh. Quando ausente,
     * usa o valor default do meta.
     */
    refresh_seconds?: number | null;
  };
}

export interface WorkshopAppLayout {
  /** Número de colunas do grid raiz. */
  columns?: number;
  root: LayoutNode[];
}

/** Tier A do parity roadmap (2026-05-20). */
export interface WorkshopHeaderConfig {
  /** Nome de ícone lucide-react. Default: nenhum ícone. */
  icon?: string;
  /** Preset (`primary` | `success` | `warning` | `danger` | `info`) OU hex. */
  color?: string;
  /** Altura em pixels. Default 40. */
  height?: number;
}

/**
 * Página de um app multi-page — Sprint 3 do parity roadmap.
 *
 * Apps modernos têm `pages: WorkshopPage[]` em vez do `layout` flat.
 * O header persistente mostra abas com `label` + `icon` opcional.
 * Active page é mantida via binding `__active_page__` (escrito por
 * `switch_page` action).
 *
 * Apps antigos com só `layout` continuam funcionando — o renderer trata
 * como single-page com id `__main__`.
 */
export interface WorkshopPage {
  /** Id estável; usado em `switch_page.params.page_id`. */
  id: string;
  /** Label visível na aba. */
  label: string;
  /** Nome de ícone lucide opcional. */
  icon?: string;
  /**
   * URL slug opcional usado quando o app tem roteamento por URL ligado.
   * Default = `id`. Sprint A4 do Parity Audit (2026-05-20).
   * Ex.: page com id `p1` pode ter slug `/dashboard` aparecendo na URL.
   */
  url_slug?: string;
  /**
   * Se true, esta é a página default ao abrir o painel.
   * Único `is_default: true` por painel — UI deve enforce singleton.
   * Sprint A4 do Parity Audit.
   */
  is_default?: boolean;
  /** Layout da página. */
  layout: WorkshopAppLayout;
}

export type WorkshopSurface =
  | 'standalone'
  | 'entity_ficha'
  | 'search_result'
  // P5 Onda 3 — app autorado como briefing operacional, resolvido por
  // /briefings via by-surface (sem target_kind/target_source).
  | 'briefing';

/**
 * Sprint F2 (Parity Audit, 2026-05-21): entry do catálogo de cores
 * salvas pelo operador (campo `used_colors` no WorkshopApp). O renderer
 * NÃO consome esse catálogo — é apenas referência pro operador copiar
 * o hex e colar onde quiser (props de widget, marcadores, chips).
 */
export interface UsedColorEntry {
  /** Identificador estável (gerado no client) — usado pra remover/editar. */
  id: string;
  /** Nome amigável definido pelo operador (ex.: "Vermelho alerta"). */
  name: string;
  /** Cor em hex `#rrggbb`. Validada antes de salvar. */
  hex: string;
  /** Variante opcional pro dark mode. */
  dark_hex?: string;
}

export interface WorkshopApp {
  id: string;
  external_id?: string | null;
  display: string;
  description?: string | null;
  schema_version: 2;
  variables: WorkshopVariable[];
  layout: WorkshopAppLayout;
  actions?: ActionType[];
  markings?: string[];
  project_id?: string | null;
  tenant_id?: string | null;
  /** Surface de interação — controla onde o app substitui o default. */
  surface?: WorkshopSurface;
  /** Quando surface='entity_ficha', kind da entity (pessoa/parlamentar/empresa/...). */
  target_kind?: string | null;
  /** Quando surface='search_result', key da source MCP (camara_deputados@v1, ...). */
  target_source?: string | null;
  /** Auto-refresh: intervalo (s) p/ re-avaliar o app (KPIs "ao vivo" sem F5).
   *  0/ausente = uma vez no mount (comportamento default). */
  refresh_seconds?: number | null;
  /** Modo-edição do AIP (F1) — diagrama de origem; habilita "Editar no AIP". */
  source_diagram_id?: string | null;
  /** Overlays do app — Sprint 2 do parity roadmap. */
  overlays?: WorkshopOverlay[];
  /**
   * Páginas do app — Sprint 3 do parity roadmap.
   * Quando presente, sobrescreve `layout` (apps multi-page). Quando
   * ausente, `layout` é renderizado como single-page implícita.
   */
  pages?: WorkshopPage[];
  /**
   * Tier A do parity roadmap (2026-05-20): header polish.
   * Customização do PageShell quando o app é exibido em /workshop/view/{id}.
   */
  header_config?: WorkshopHeaderConfig;
  /**
   * Sprint B2 do Parity Audit (2026-05-21): variable-backed active page.
   *
   * `external_id` de uma string variable cujo valor identifica a page ativa.
   * Mudanças bidirecionais: switch_page atualiza a variável; mudança externa
   * da variável (URL routing, set_variable, etc) troca a página.
   *
   * Valor da variável deve casar com `page.id` OU `page.url_slug` (ambos
   * são tentados em ordem).
   */
  active_page_variable?: string;
  /**
   * Sprint PE4 (2026-05-20): opt-in/out de telemetria por painel.
   *
   * Quando `false`, o WorkshopV2Renderer e widgets param de chamar
   * `Workshop.logUsageEvent` — eventos novos não são gravados. Aggregação
   * existente continua disponível (apenas pausa coleta).
   *
   * Default: `true` (opt-out). Backend default 2026-05-20.
   */
  metrics_enabled?: boolean;
  /**
   * PF3 (2026-05-20): terminologia customizável pra "estados salvos" (views)
   * deste painel. Operador pode trocar "Estado salvo / Estados salvos" por
   * algo do domínio: "Pré-candidato / Pré-candidatos", "Investigação /
   * Investigações", etc. Defaults aplicados no consumer (UserViewsToolbar).
   */
  state_saving_config?: {
    display_name?: string;
    display_name_plural?: string;
  };
  /**
   * Sprint F2 (Parity Audit, 2026-05-21): paleta de cores salvas.
   *
   * Catálogo de cores nomeadas que o operador salvou nesse painel para
   * reuso em props de widgets (background, chip, marcador). UI lista
   * cores salvas + cores em uso ainda não catalogadas (scan dos
   * widgets via regex `/#[0-9a-fA-F]{6}/`). O renderer NÃO consome
   * este catálogo — é apenas referência pro operador copiar/colar.
   */
  used_colors?: UsedColorEntry[];
  /**
   * Refactor Fase A (2026-05-20): `draft_layout`/`draft_pages` agora
   * vivem APENAS no state do editor (não persistido como coluna do
   * app). Snapshots persistem via `WorkshopAppVersion`:
   *   - "Salvar rascunho" → POST /apps/{id}/versions sem semver_tag
   *   - "Publicar"         → POST /apps/{id}/versions com semver_tag +
   *                          PUT /apps/{id} atualizando o layout publicado
   *
   * Os 2 fields abaixo permanecem no tipo SÓ pra retrocompat de apps
   * que tinham `_draft_layout` em layout JSON (lidos pelo unpacker mas
   * nunca mais persistidos). Em alguns ciclos serão removidos.
   */
  draft_layout?: WorkshopAppLayout;
  draft_pages?: WorkshopPage[];
  created_at?: string;
  updated_at?: string;
  /** F1 remoção — quando != null, o app está na Lixeira (soft-deleted). */
  deleted_at?: string;
}

// -- Evaluate / Action --------------------------------------------------- //
export interface EvaluatePayload {
  /** Overrides de variáveis (URL query `?var.x=...` mapeia aqui). */
  overrides?: Record<string, unknown>;
}

export interface EvaluateResponse {
  variables: ResolvedVariableMap;
}

export interface QueryObjectSetPayload {
  variable: string;
  /** Overrides aplicados antes de avaliar a variável. */
  overrides?: Record<string, unknown>;
  /** Substitui o limit do spec se fornecido. */
  limit?: number;
  offset?: number;
}

export interface QueryObjectSetResponse {
  rows: ObjectSetRow[];
  total: number;
}

export interface InvokeActionPayload {
  params: Record<string, unknown>;
}
