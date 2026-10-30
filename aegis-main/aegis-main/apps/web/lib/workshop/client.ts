/**
 * Workshop client — chama os mesmos endpoints REST `/workshop/*` do
 * ontology-module que o web-app usa. Backend é fonte da verdade.
 *
 * IMPORTANTE: o backend usa snake_case do banco — `slug`, `display_name`,
 * `variables: dict`. O client (Workshop v2) usa `external_id`, `display`,
 * `variables: WorkshopVariable[]`. Toda chamada faz mapping bidirecional
 * para não vazar essa divergência pro resto do app.
 */

import { apiFetch } from '@/lib/api/client';
import type {
  WorkshopApp,
  WorkshopVariable,
  EvaluatePayload,
  EvaluateResponse,
  QueryObjectSetPayload,
  QueryObjectSetResponse,
  InvokeActionPayload,
} from './types';

// ── Backend wire format ──────────────────────────────────────────────
export type WorkshopSurface =
  | 'standalone'
  | 'entity_ficha'
  | 'search_result'
  // P5 Onda 3 — briefing operacional autorado (resolvido por /briefings).
  | 'briefing';

interface BackendApp {
  id: string;
  tenant_id: string;
  project_id: string | null;
  slug: string;
  display_name: string;
  description: string | null;
  layout: Record<string, unknown>;
  variables: Record<string, unknown>;
  markings: string[];
  active: boolean;
  schema_version: number;
  parent_version_id?: string | null;
  template_id?: string | null;
  source_diagram_id?: string | null;
  surface?: WorkshopSurface;
  target_kind?: string | null;
  target_source?: string | null;
  // Fase C — colunas dedicadas no backend
  overlays?: unknown[] | null;
  pages?: unknown[] | null;
  // Tier A — header customizado
  header_config?: Record<string, unknown> | null;
  // Sprint B2 — variable-backed active page
  active_page_variable?: string | null;
  // Sprint PE4 (2026-05-20) — opt-out de telemetria por painel
  metrics_enabled?: boolean | null;
  // Sprint F2 (2026-05-21) — catálogo de cores salvas
  used_colors?: unknown[] | null;
  // PF3 (2026-05-20) — terminologia customizável pra estados salvos
  state_saving_config?: {
    display_name?: string | null;
    display_name_plural?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string | null;
  // F1 remoção — quando != null, o app está na Lixeira (soft-deleted)
  deleted_at?: string | null;
}

interface BackendAppCreate {
  slug: string;
  display_name: string;
  description?: string | null;
  project_id?: string | null;
  layout?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  markings?: string[];
  schema_version?: number;
  surface?: WorkshopSurface;
  target_kind?: string | null;
  target_source?: string | null;
  overlays?: unknown[] | null;
  pages?: unknown[] | null;
  header_config?: Record<string, unknown> | null;
  active_page_variable?: string | null;
  metrics_enabled?: boolean | null;
  used_colors?: unknown[] | null;
  state_saving_config?: {
    display_name?: string | null;
    display_name_plural?: string | null;
  } | null;
}

interface BackendAppUpdate {
  display_name?: string;
  description?: string | null;
  layout?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  markings?: string[];
  active?: boolean;
  surface?: WorkshopSurface;
  target_kind?: string | null;
  target_source?: string | null;
  overlays?: unknown[] | null;
  pages?: unknown[] | null;
  header_config?: Record<string, unknown> | null;
  active_page_variable?: string | null;
  metrics_enabled?: boolean | null;
  used_colors?: unknown[] | null;
  state_saving_config?: {
    display_name?: string | null;
    display_name_plural?: string | null;
  } | null;
}

// ── Conversões ──────────────────────────────────────────────────────
// Backend canon (ontology-module/_parse_variables) é `{variables: [array]}`.
// Mantemos um wrapper p/ não passar lista nua e p/ preservar shape se outras
// chaves futuras forem adicionadas ao bloco (ex.: dependency_graph, version).
function variablesArrayToDict(arr: WorkshopVariable[]): Record<string, unknown> {
  return { variables: arr };
}

function variablesDictToArray(
  d: Record<string, unknown> | null | undefined,
): WorkshopVariable[] {
  if (!d || typeof d !== 'object') return [];
  // Shape v2 canônica: {variables: [array]}.
  const list = (d as { variables?: unknown }).variables;
  if (Array.isArray(list)) {
    return list
      .map((v) => {
        if (!v || typeof v !== 'object') return null;
        const obj = v as Partial<WorkshopVariable>;
        return {
          id: obj.id ?? obj.external_id ?? '',
          external_id: obj.external_id ?? obj.id ?? '',
          type: obj.type ?? 'String',
          kind: obj.kind ?? 'static',
          recompute_mode: obj.recompute_mode ?? 'auto',
          ...obj,
        } as WorkshopVariable;
      })
      .filter((v): v is WorkshopVariable => v !== null && !!v.external_id);
  }
  // Backward-compat: dict legado `{ext_id: var}` (apps salvos antes do fix).
  return Object.entries(d)
    .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
    .map(([k, v]) => {
      const obj = v as Partial<WorkshopVariable>;
      return {
        id: obj.id ?? k,
        external_id: obj.external_id ?? k,
        type: obj.type ?? 'String',
        kind: obj.kind ?? 'static',
        recompute_mode: obj.recompute_mode ?? 'auto',
        ...obj,
      } as WorkshopVariable;
    });
}

function backendToClient(b: BackendApp): WorkshopApp {
  // Fase C: overlays/pages agora vivem em colunas dedicadas, lidas
  // direto de `b.overlays` e `b.pages`. Mantém compat retroativa
  // limpando `_*` que possam existir em layouts pré-migration 0024.
  // Sempre materializa `root: []` e `columns: 12` para que o editor/renderer
  // não quebrem em apps salvos sem layout (ex.: criados só com variables).
  const rawLayout = (b.layout as Record<string, unknown> | null) ?? {};
  const layoutClean: Record<string, unknown> = { ...rawLayout };
  delete layoutClean._overlays;
  delete layoutClean._pages;
  delete layoutClean._draft_layout;
  delete layoutClean._draft_pages;
  if (!Array.isArray(layoutClean.root)) layoutClean.root = [];
  if (typeof layoutClean.columns !== 'number') layoutClean.columns = 12;
  const overlays = Array.isArray(b.overlays)
    ? (b.overlays as WorkshopApp['overlays'])
    : undefined;
  const pages = Array.isArray(b.pages)
    ? (b.pages as WorkshopApp['pages'])
    : undefined;

  return {
    id: b.id,
    external_id: b.slug,
    display: b.display_name,
    description: b.description,
    schema_version: 2,
    variables: variablesDictToArray(b.variables),
    layout: (layoutClean as unknown as WorkshopApp['layout']) ?? { root: [] },
    markings: b.markings ?? [],
    project_id: b.project_id,
    tenant_id: b.tenant_id,
    surface: b.surface ?? 'standalone',
    target_kind: b.target_kind ?? null,
    target_source: b.target_source ?? null,
    source_diagram_id: b.source_diagram_id ?? null,
    overlays,
    pages,
    header_config: (b.header_config ?? undefined) as WorkshopApp['header_config'],
    active_page_variable: b.active_page_variable ?? undefined,
    // Sprint PE4: default true quando backend não envia (apps pré-migração).
    metrics_enabled: b.metrics_enabled == null ? true : b.metrics_enabled,
    // Sprint F2: catálogo de cores. Mantém shape do backend; filtra entries
    // malformados pra não quebrar a UI.
    used_colors: Array.isArray(b.used_colors)
      ? (b.used_colors
          .filter(
            (e): e is { id?: unknown; name?: unknown; hex?: unknown; dark_hex?: unknown } =>
              !!e && typeof e === 'object',
          )
          .map((e) => ({
            id: typeof e.id === 'string' ? e.id : `c_${Math.random().toString(36).slice(2, 9)}`,
            name: typeof e.name === 'string' ? e.name : '',
            hex: typeof e.hex === 'string' ? e.hex : '',
            dark_hex: typeof e.dark_hex === 'string' ? e.dark_hex : undefined,
          }))
          .filter((e) => /^#[0-9a-fA-F]{6}$/.test(e.hex)) as WorkshopApp['used_colors'])
      : undefined,
    state_saving_config: b.state_saving_config
      ? {
          display_name: b.state_saving_config.display_name ?? undefined,
          display_name_plural: b.state_saving_config.display_name_plural ?? undefined,
        }
      : undefined,
    created_at: b.created_at,
    updated_at: b.updated_at ?? undefined,
    deleted_at: b.deleted_at ?? undefined,
  };
}

function clientToBackendCreate(
  app: Partial<WorkshopApp> & Pick<WorkshopApp, 'display'>,
): BackendAppCreate {
  return {
    slug: app.external_id || app.id || `app-${Date.now()}`,
    display_name: app.display,
    description: app.description ?? null,
    project_id: app.project_id ?? null,
    layout: (app.layout as unknown as Record<string, unknown>) ?? { root: [] },
    variables: variablesArrayToDict(app.variables ?? []),
    markings: app.markings ?? [],
    schema_version: app.schema_version ?? 2,
    surface: app.surface ?? 'standalone',
    target_kind: app.target_kind ?? null,
    target_source: app.target_source ?? null,
    // Fase C — campos dedicados
    overlays: app.overlays ?? null,
    pages: app.pages ?? null,
    // Tier A — header customizado
    header_config: (app.header_config as Record<string, unknown> | undefined) ?? null,
    // Sprint B2
    active_page_variable: app.active_page_variable ?? null,
    // Sprint PE4 — opt-in telemetria (default true)
    metrics_enabled: app.metrics_enabled ?? true,
    // Sprint F2 — catálogo de cores (opt-in, null quando vazio)
    used_colors: app.used_colors && app.used_colors.length > 0 ? app.used_colors : null,
    // PF3 — terminologia state saving (null = backend usa default)
    state_saving_config: serializeStateSavingConfig(app.state_saving_config),
  };
}

/**
 * Serializa `state_saving_config` removendo strings vazias/branco. Quando
 * ambos campos resultam vazios, retorna `null` — backend cai no default
 * "Estado salvo / Estados salvos".
 */
function serializeStateSavingConfig(
  cfg: WorkshopApp['state_saving_config'] | undefined,
): BackendAppCreate['state_saving_config'] {
  if (!cfg) return null;
  const dn = (cfg.display_name ?? '').trim();
  const dnp = (cfg.display_name_plural ?? '').trim();
  if (!dn && !dnp) return null;
  return {
    display_name: dn || null,
    display_name_plural: dnp || null,
  };
}

function clientToBackendUpdate(app: Partial<WorkshopApp>): BackendAppUpdate {
  const out: BackendAppUpdate = {};
  if (app.display !== undefined) out.display_name = app.display;
  if (app.description !== undefined) out.description = app.description;
  if (app.layout !== undefined)
    out.layout = app.layout as unknown as Record<string, unknown>;
  if (app.overlays !== undefined) out.overlays = app.overlays ?? null;
  if (app.pages !== undefined) out.pages = app.pages ?? null;
  if (app.header_config !== undefined)
    out.header_config = (app.header_config as Record<string, unknown> | null) ?? null;
  if (app.active_page_variable !== undefined)
    out.active_page_variable = app.active_page_variable ?? null;
  if (app.metrics_enabled !== undefined)
    out.metrics_enabled = app.metrics_enabled;
  if (app.used_colors !== undefined)
    out.used_colors = app.used_colors && app.used_colors.length > 0 ? app.used_colors : null;
  if (app.state_saving_config !== undefined)
    out.state_saving_config = serializeStateSavingConfig(app.state_saving_config);
  if (app.variables !== undefined)
    out.variables = variablesArrayToDict(app.variables);
  if (app.markings !== undefined) out.markings = app.markings;
  if (app.surface !== undefined) out.surface = app.surface;
  if (app.target_kind !== undefined) out.target_kind = app.target_kind;
  if (app.target_source !== undefined) out.target_source = app.target_source;
  return out;
}

// ── Endpoints ────────────────────────────────────────────────────────
export const Workshop = {
  /** Lista apps que o caller pode ler (filtradas por tenant + markings). */
  list: async (): Promise<WorkshopApp[]> => {
    const rows = await apiFetch<BackendApp[]>('/workshop/apps');
    return rows.map(backendToClient);
  },

  /** Lista a Lixeira: apps soft-deletados (deleted_at != null), recentes
   *  primeiro. Restauráveis via restore(); excluíveis de vez via delete(id,
   *  {purge:true}) (perm workshop.apps.purge). */
  listTrashed: async (): Promise<WorkshopApp[]> => {
    const rows = await apiFetch<BackendApp[]>('/workshop/apps?trashed=true');
    return rows.map(backendToClient);
  },

  /** Carrega 1 app por id (uuid) ou slug. */
  get: async (idOrSlug: string): Promise<WorkshopApp> => {
    const row = await apiFetch<BackendApp>(
      `/workshop/apps/${encodeURIComponent(idOrSlug)}`,
    );
    return backendToClient(row);
  },

  /** Resolve o app workshop que substitui o default da tenant pro par
   *  (surface, target_kind | target_source). Retorna null se não existe
   *  — chamadores caem no fallback (seed em código / DetalheObjeto). */
  bySurface: async (params: {
    surface: WorkshopSurface;
    target_kind?: string;
    target_source?: string;
  }): Promise<WorkshopApp | null> => {
    const qs = new URLSearchParams();
    qs.set('surface', params.surface);
    if (params.target_kind) qs.set('target_kind', params.target_kind);
    if (params.target_source) qs.set('target_source', params.target_source);
    const row = await apiFetch<BackendApp | null>(
      `/workshop/apps/by-surface?${qs.toString()}`,
    );
    return row ? backendToClient(row) : null;
  },

  /** Cria nova app (precisa de workshop.apps.write). */
  create: async (
    body: Partial<WorkshopApp> & Pick<WorkshopApp, 'display'>,
  ): Promise<WorkshopApp> => {
    const row = await apiFetch<BackendApp>('/workshop/apps', {
      method: 'POST',
      body: JSON.stringify(clientToBackendCreate(body)),
    });
    return backendToClient(row);
  },

  /** Salva alterações de layout/variables/etc. */
  update: async (id: string, body: Partial<WorkshopApp>): Promise<WorkshopApp> => {
    const row = await apiFetch<BackendApp>(
      `/workshop/apps/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(clientToBackendUpdate(body)),
      },
    );
    return backendToClient(row);
  },

  /** Excluir app. Default = soft-delete (vai pra Lixeira, restaurável). Com
   *  `purge:true` = hard delete irreversível (perm workshop.apps.purge). Com
   *  `teardownBuild:true` = remove a CONSTRUÇÃO inteira que o AIP materializou
   *  (ontologia/ações/agentes/fluxos/funções/Sala) + o app — inverso do
   *  materialize, governado por `solution.materialize.delete`. */
  delete: (id: string, opts?: { purge?: boolean; teardownBuild?: boolean }) => {
    const q = opts?.teardownBuild ? '?teardown_build=true' : opts?.purge ? '?purge=true' : '';
    return apiFetch<{ status: string; removed?: Record<string, number> }>(
      `/workshop/apps/${encodeURIComponent(id)}${q}`,
      { method: 'DELETE' },
    );
  },

  /** Pré-visualização do teardown — o que será removido se o operador escolher
   *  'remover também a construção'. Não apaga nada. */
  teardownPlan: (id: string) =>
    apiFetch<{
      available: boolean;
      blueprint_id: string | null;
      counts: Record<string, number>;
      ontology_types: string[];
    }>(`/workshop/apps/${encodeURIComponent(id)}/teardown-plan`),

  /** Restaura um app da Lixeira (limpa deleted_at). */
  restore: async (id: string): Promise<WorkshopApp> => {
    const row = await apiFetch<BackendApp>(
      `/workshop/apps/${encodeURIComponent(id)}/restore`,
      { method: 'POST' },
    );
    return backendToClient(row);
  },

  /** Resolve todas as variáveis da app aplicando overrides (URL query). */
  evaluate: (id: string, body: EvaluatePayload = {}) =>
    apiFetch<EvaluateResponse>(`/workshop/apps/${encodeURIComponent(id)}/evaluate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Executa a query de um ObjectSet variable (paginado). */
  queryObjectSet: (id: string, body: QueryObjectSetPayload) =>
    apiFetch<QueryObjectSetResponse>(
      `/workshop/apps/${encodeURIComponent(id)}/object-sets/query`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /** Valores DISTINTOS de um campo (popula opções de filtro discreto ao vivo). */
  distinctObjectSet: (
    id: string,
    body: { variable?: string; object_type?: string; field: string; limit?: number },
  ) =>
    apiFetch<{ values: string[]; truncated: boolean }>(
      `/workshop/apps/${encodeURIComponent(id)}/object-sets/distinct`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /** Invoca um ActionType (botões/forms da app). */
  invokeAction: (appId: string, actionId: string, body: InvokeActionPayload) =>
    apiFetch<{ result: unknown }>(
      `/workshop/apps/${encodeURIComponent(appId)}/actions/${encodeURIComponent(actionId)}/invoke`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /** E5 (V1 visão) — sobe um data URL governado (MinIO + lineage) e devolve a
   *  URL presignada (TTL 5 min). Evidência do fluxo de contagem por imagem. */
  upload: (appId: string, body: { data_url: string; original_filename?: string; max_bytes?: number }) =>
    apiFetch<{ id: string; url: string; object_key: string; content_type: string; size: number }>(
      `/workshop/apps/${encodeURIComponent(appId)}/uploads`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // -- Per-user states (Fase A do refactor) --------------------------- //
  /** Lista views salvas do usuário corrente pra um app. */
  listUserStates: (appId: string) =>
    apiFetch<BackendUserState[]>(
      `/workshop/apps/${encodeURIComponent(appId)}/states`,
    ),

  /** Upsert por nome — sobrescreve se já existir. */
  upsertUserState: (appId: string, body: { name: string; bindings: Record<string, unknown> }) =>
    apiFetch<BackendUserState>(
      `/workshop/apps/${encodeURIComponent(appId)}/states`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),

  removeUserState: (appId: string, stateId: string) =>
    apiFetch<void>(
      `/workshop/apps/${encodeURIComponent(appId)}/states/${encodeURIComponent(stateId)}`,
      { method: 'DELETE' },
    ),

  // -- Versions (Fase A do refactor) ---------------------------------- //
  /** Cria snapshot da app corrente. Dedup por content-hash. `semver_tag`
   *  identifica releases públicos; vazio = rascunho. */
  createVersion: (
    appId: string,
    body: { semver_tag?: string; commit_message?: string } = {},
  ) =>
    apiFetch<BackendAppVersion>(
      `/workshop/apps/${encodeURIComponent(appId)}/versions`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listVersions: (appId: string) =>
    apiFetch<BackendAppVersion[]>(
      `/workshop/apps/${encodeURIComponent(appId)}/versions`,
    ),

  /** Restaura app pra um snapshot anterior. Cria auto-snapshot do estado
   *  atual antes de restaurar (revert é reversível). */
  revertVersion: (appId: string, versionId: string) =>
    apiFetch<BackendApp>(
      `/workshop/apps/${encodeURIComponent(appId)}/revert/${encodeURIComponent(versionId)}`,
      { method: 'POST' },
    ),

  // -- Variable usage (P5 Parity Audit) ------------------------------ //
  /**
   * Resolve onde uma variable é consumida no app: widgets (via props ou
   * binding), eventos (via event_params), além de flags cross-cutting
   * (module_interface, routing, state_saving, active_page_variable e
   * lista de overlays que usam essa var como `open_variable`).
   *
   * Usado pela sidebar "USADO EM" do Variable Editor.
   */
  getVariableUsage: (appId: string, externalId: string) =>
    apiFetch<VariableUsage>(
      `/workshop/apps/${encodeURIComponent(appId)}/variables/${encodeURIComponent(externalId)}/usage`,
    ),

  // -- Usage telemetry (Sprint E1/E2 do Parity Audit) ----------------- //
  /**
   * Ingest fire-and-forget de um evento de uso. Telemetria NUNCA pode
   * quebrar UX — qualquer erro é engolido silenciosamente. Retorna
   * `void` mesmo em falha pra que o caller não precise try/catch.
   *
   * Caller é responsável por filtrar IDs locais (`seed.*`, `local.app.*`)
   * antes de chamar — backend rejeita esses IDs com 404/400.
   */
  logUsageEvent: (
    appId: string,
    body: {
      event_type: 'page_view' | 'overlay_view' | 'action_submit' | string;
      action_id?: string | null;
      page_id?: string | null;
      tab_id?: string | null;
      overlay_id?: string | null;
    },
  ): void => {
    // Fire-and-forget: nunca await; nunca propaga erro pro caller.
    try {
      void apiFetch<void>(
        `/workshop/apps/${encodeURIComponent(appId)}/usage-events`,
        { method: 'POST', body: JSON.stringify(body) },
      ).catch(() => {
        /* silenciado: telemetria não quebra UX */
      });
    } catch {
      /* silenciado */
    }
  },

  /** Agrega métricas pro app no período pedido. */
  getMetrics: (appId: string, period: '7d' | '30d' | '90d' = '7d') =>
    apiFetch<WorkshopMetrics>(
      `/workshop/apps/${encodeURIComponent(appId)}/metrics?period=${encodeURIComponent(period)}`,
    ),

  // -- Comments (Fase B do refactor) ---------------------------------- //
  listComments: (appId: string, scope: string) =>
    apiFetch<BackendComment[]>(
      `/workshop/apps/${encodeURIComponent(appId)}/comments?scope=${encodeURIComponent(scope)}`,
    ),

  createComment: (
    appId: string,
    body: { scope_key: string; content: string },
  ) =>
    apiFetch<BackendComment>(
      `/workshop/apps/${encodeURIComponent(appId)}/comments`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  removeComment: (appId: string, commentId: string) =>
    apiFetch<void>(
      `/workshop/apps/${encodeURIComponent(appId)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' },
    ),
};

/**
 * Heurística pra decidir se `appId` é UUID real do backend (vs `seed.*`,
 * `local.app.*`, `editor`, `palette-preview`). Telemetria/metrics só
 * fazem sentido pra IDs persistidos no servidor.
 */
export function isPersistedAppId(appId: string | null | undefined): boolean {
  if (!appId) return false;
  if (appId === 'editor' || appId === 'palette-preview') return false;
  if (appId.startsWith('seed.')) return false;
  if (appId.startsWith('local.app.')) return false;
  // Onda I.1: Páginas embrulham o config como WorkshopApp virtual com id
  // sintético `page::<slug>` — não existe como app no backend, então nunca
  // tem telemetria/metrics (evita 500 em /workshop/apps/page%3A%3A.../usage-events).
  if (appId.startsWith('page::')) return false;
  return true;
}

/**
 * Sprint E2 — saída agregada do `GET /workshop/apps/{id}/metrics`.
 * `delta_pct` é null quando o período anterior tem 0 eventos (divisão
 * por zero — UI mostra "—" nesse caso).
 *
 * Sprint PE1 (2026-05-20) acrescenta `timeseries[]` (contagem por hora,
 * dia ou semana) e `timeseries_bucket` indicando granularidade. PF2
 * (2026-05-20) introduz bucket `hour` pra 7d — quando `bucket === 'hour'`,
 * `timeseries[].date` é ISO completo (`2026-05-21T01:00:00+00:00`); pra
 * `day`/`week`, ainda é `YYYY-MM-DD`. Quando o backend antigo não envia
 * estes campos, o frontend renderiza sem o mini-chart.
 */
export interface WorkshopMetrics {
  period_days: number;
  total_events: number;
  total_previous: number;
  delta_pct: number | null;
  by_event_type: Record<string, number>;
  by_action: { label: string; count: number }[];
  by_page: { label: string; count: number }[];
  by_overlay: { label: string; count: number }[];
  /** Sprint PE1: série temporal (`date` ISO; `count` por bucket). */
  timeseries?: { date: string; count: number }[];
  /** Sprint PE1/PF2: granularidade — `hour` pra 7d, `day` pra 30d, `week` pra 90d. */
  timeseries_bucket?: 'hour' | 'day' | 'week';
}

// -- Tipos auxiliares dos endpoints (espelham VersionOut + StateOut) --- //
/** P5 Parity Audit (2026-05-21): retorno do endpoint variable usage. */
export interface VariableUsage {
  external_id: string;
  widgets: { node_id: string; widget_type: string; via: 'props' | 'binding' }[];
  events: { node_id: string; widget_type: string; via: 'event_params' }[];
  is_module_interface: boolean;
  is_routing: boolean;
  is_state_saving: boolean;
  is_active_page_variable: boolean;
  /** External ids dos overlays que usam essa var como `open_variable`. */
  is_active_open_variable_of: string[];
}

export interface BackendUserState {
  id: string;
  name: string;
  bindings: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

export interface BackendAppVersion {
  id: string;
  app_id: string;
  content_hash: string;
  semver_tag: string | null;
  commit_message: string;
  schema_version: number;
  created_at: string;
  created_by: string | null;
}

export interface BackendComment {
  id: string;
  scope_key: string;
  author_id: string | null;
  author_display: string | null;
  content: string;
  created_at: string;
  updated_at: string | null;
}
