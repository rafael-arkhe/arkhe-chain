/**
 * Clientes tipados, agrupados por router do backend.
 * Cada função usa o path exato montado em ontology-module/app/main.py.
 */
import { apiFetch, apiFetchOrFallback, ApiError, API_BASE } from './client';
import {
  mapBackendAlert,
  type BackendAlert,
  type AlertTrailEvent,
} from './alerts-map';
import type { FilterPredicate } from '@/lib/workshop/types';
import type {
  AlertFeed,
  AlertGeofence,
  AlertItem,
  AlertWatch,
  Briefing,
  COV,
  DataSource,
  Dossier,
  Entity,
  EntityLink,
  IamAuditEvent,
  IamPermission,
  IamRole,
  IamUser,
  MeHome,
  GraphOverview,
  NavTree,
  OntologyEdge,
  OntologyGraph,
  OntologyNode,
  CamaraCorrelationGraph,
} from './types';

// Wave D.2 (2026-05-23): re-export tipos do iam usados pelo composer
// (carbon-composer importa diretamente de '@/lib/api').
export type {
  IamAuditEvent,
  IamPermission,
  IamRole,
  IamUser,
  OntologyNode,
};

// ── Ontology (graph atual: nodes/edges) ─────────────────────────────
export interface OntologyNodeType {
  name: string;
  label: string;
  count: number;
}

/**
 * Resposta do endpoint dedicado `/ontology/node-types/{name}/histogram/{field}`.
 * Backend agrega no servidor (não scaneia client-side). `bins.length === bins`
 * solicitado quando há ≥ 1 valor numérico; quando `total === 0` o array é
 * vazio (UI mostra estado "sem dados numéricos").
 */
export interface OntologyHistogram {
  field: string;
  node_type: string;
  bins: { min: number; max: number; count: number }[];
  min: number;
  max: number;
  total: number;
}

/**
 * Contrato TIPADO de um Object Type (Onda 4 — fundação do OSDK).
 * Resposta de `GET /ontology/object-types/{kind}`: o schema que um SDK gerado
 * exporia, unificando as 3 camadas — properties tipadas + link types navegáveis
 * com cardinalidade + action types ligadas/tipadas a este tipo. É o contrato que
 * o catálogo de tipos projeta e que o Workshop binda em design-time.
 */
export interface ObjectTypeProperty {
  key: string;
  type: string;
  label: string;
  is_title: boolean;
}
export interface ObjectTypeLink {
  relation: string;
  target_kind: string;
  target_label: string;
  cardinality: string;
  direction: 'outgoing' | 'incoming';
}
export interface ObjectTypeActionParam {
  key: string;
  type: string;
  title: string;
}
export interface ObjectTypeAction {
  name: string;
  rule: string;
  parameters: ObjectTypeActionParam[];
}
export interface ObjectTypeSchema {
  kind: string;
  display_name: string;
  title_property: string;
  count: number;
  properties: ObjectTypeProperty[];
  links: ObjectTypeLink[];
  actions: ObjectTypeAction[];
}

/** Onda 11 — histórico temporal de um objeto (snapshot por versão). */
export interface NodeVersion {
  version: number;
  content_hash: string;
  lineage_event_id: string | null;
  markings: string[];
  author: string | null;
  created_at: string | null;
}
/** Onda 10 — um hop do caminho de search-around. */
export interface SearchAroundHop {
  relation: string;
  direction: 'outgoing' | 'incoming';
  target_kind?: string;
}
/** Onda 10 — um objeto do set relacionado retornado pelo search-around. */
export interface SearchAroundRow {
  id: string;
  name: string | null;
  node_type: string;
  properties: Record<string, unknown>;
  markings: string[];
}
/** Onda 10 — resultado do search-around. */
export interface SearchAroundResult {
  seed_count: number;
  result: SearchAroundRow[];
  hops_executed: number;
  truncated: boolean;
}

/** Onda 11 — estado reconstruído de um objeto numa versão/instante (as-of). */
export interface NodeAsOf {
  node_id: string;
  name: string | null;
  node_type: string | null;
  properties: Record<string, unknown>;
  schema_definition: Record<string, unknown>;
  canonical: string | null;
  markings: string[];
  version: number;
  content_hash: string;
  captured_at: string | null;
}

// Onda 16 — Ontology Manager write contracts.
export interface ObjectTypePropertyInput {
  key: string;
  type: string;
  label?: string;
  is_title?: boolean;
  fields?: ObjectTypePropertyInput[];
  items?: ObjectTypePropertyInput;
}
export interface ObjectTypeWriteBody {
  kind: string;
  display_name?: string;
  title_property: string;
  properties: ObjectTypePropertyInput[];
  enforce?: 'lenient' | 'strict';
  markings?: string[];
}
export interface ObjectTypeWriteOut {
  id: string;
  kind: string;
  display_name: string;
  title_property: string;
  properties: ObjectTypePropertyInput[];
  enforce: string;
  signed_hash: string;
  version: number;
}
export interface LinkTypeWriteBody {
  source_kind: string;
  target_kind: string;
  relation: string;
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_many';
}

/** CodeFunctions (GAP 1, Onda 1.B) — executa código sandboxed. A coluna
 *  function-backed do Workshop invoca UMA vez com todas as linhas
 *  ({inputs:{rows:[...]}}); a Function imprime {results:{<rowId>:valor}}. */
export type FunctionInvokeResult = { ok: boolean; output: unknown; exit_code?: number; session_id?: string; error?: string | null };
/**
 * Contrato de UMA Code Function (GET /platform/v26/functions/{slug}).
 * F1 (IDE contextual): o backend agora devolve `source` (corpo salvo do
 * transformer) — a Sandbox IDE carrega esse código ao abrir do nó de
 * Processamento, em vez de começar no DEFAULT_CODE.
 */
export interface FunctionOut {
  slug: string;
  display_name: string;
  language: string;
  version: number;
  source?: string | null;
  signature?: Record<string, unknown> | null;
  strict_signature?: boolean;
  allow_network?: boolean;
}
/**
 * F3 — resultado por objeto de um preview em LOTE
 * (POST /platform/v26/functions/{slug}/preview-batch). Espelha fielmente o
 * fluxo de invocação: cada item carrega input_keys, a saída, o esquema de saída
 * inferido, o exit_code, a duração e ok/erro.
 */
export interface PreviewBatchItem {
  input_keys: string[];
  output: unknown;
  output_schema: Record<string, string>;
  exit_code: number | null;
  duration_ms: number | null;
  ok: boolean;
  error: string | null;
}
/**
 * F3/F4 — agregados + contrato de saída de um preview em lote. `output_schema`
 * é a união dos tipos inferidos; `output_violations` lista divergências vs o
 * `declared_output` (não bloqueia, exceto quando `strict_output` é true).
 */
export interface PreviewBatchResult {
  per_object: PreviewBatchItem[];
  rows_in: number;
  rows_out: number;
  total_ms: number;
  avg_ms: number;
  output_schema: Record<string, string>;
  declared_output: unknown | null;
  output_violations: string[];
  strict_output: boolean;
}
/**
 * F6 — uma asserção por campo de um teste governado. `op` cobre comparação
 * (eq/ne/gt/gte/lt/lte), checagem de tipo (`type`), substring (`contains`) e
 * presença do campo (`exists`). `value` é livre (depende do `op`); para
 * `op=type`, `value` é um dos tipos canônicos (string/number/.../null).
 */
export interface FunctionTestAssertion {
  field: string;
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'type' | 'contains' | 'exists';
  value: unknown;
}
/**
 * F5 — um TESTE governado de uma Code Function
 * (GET/POST /platform/v26/functions/{slug}/tests). O operador salva a amostra
 * real (inputs) como caso reproduzível, com `expected_contains` (substrings que
 * a saída deve conter) e/ou `assertions` por campo. `last_status`/`last_output`
 * refletem a última execução do teste na IDE.
 */
export interface TestOut {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
  expected_contains: string[];
  assertions: FunctionTestAssertion[];
  last_status: 'pass' | 'fail' | 'never_run' | null;
  last_output: string | null;
}
/**
 * F6 — uma entrada do histórico de execuções de testes
 * (GET /platform/v26/functions/{slug}/test-runs). `verdict` é o resultado, com
 * o ator e o timestamp da execução. Mais recente primeiro.
 */
export interface TestRun {
  verdict: string;
  test_name: string;
  test_id: string;
  actor: string;
  at: string;
}
/** Status do avaliador de geocercas do Atlas (G10). */
export interface AtlasEvaluatorStatus {
  active: boolean;
  last_tick_at: string | null;
  last_tick_duration_ms: number | null;
  geofences_evaluated: number;
  objects_scanned: number;
  scan_capped: boolean;
  alerts_emitted: number;
}

// 🔴 `Camara.correlation` saiu com o widget que a usava (29/09/2026): o
// grafo de correlação de câmara deixou de ter quem o pedisse, e um cliente de
// API sem chamador é a mesma coisa que um caminho sem destino — a tripping
// que regressa na primeira vez que alguém mexer.
//
// 🔴 A CORRELAÇÃO QUE FICOU é outra: a de `/buscar` e da ficha, com as
// permissoes `correlation.run` / `correlation.save`, vive em
// `lib/api/correlation` e não tem nada a ver com o grafo de câmara. Remove-se
// uma e conserva-se a outra — e a confusão entre as duas é a razão de o
// comentário estar aqui.

export const Atlas = {
  evaluation: {
    // GET status (perm atlas.evaluation.read) — indicador do motor de cercas.
    status: () => apiFetch<AtlasEvaluatorStatus>('/atlas/evaluation/status'),
    // POST run-once (perm atlas.evaluation.manage) — escopado ao tenant do
    // operador no backend; re-avalia as cercas AGORA.
    runOnce: () =>
      apiFetch<AtlasEvaluatorStatus>('/atlas/evaluation/run-once', { method: 'POST' }),
  },
};

export const Functions = {
  // published_version: null = rascunho (nunca publicado). O3c — o nó de código
  // só oferece rascunhos a quem tem perm de AUTORIA (function.write/invoke).
  list: () => apiFetch<Array<{ slug: string; display_name: string; language: string; version: number; published_version: number | null }>>('/platform/v26/functions'),
  get: (slug: string) => apiFetch<FunctionOut>(`/platform/v26/functions/${encodeURIComponent(slug)}`),
  // F6 — persiste o transformer escrito na IDE como Code Function (POST = create;
  // re-criar por slug preserva o contrato). Sem isto o "Salvar" da IDE não gravava.
  create: (body: { slug: string; display_name: string; source: string; language?: string; description?: string }) =>
    apiFetch<FunctionOut>('/platform/v26/functions', {
      method: 'POST',
      body: JSON.stringify({ language: 'python', ...body }),
    }),
  invoke: (slug: string, inputs: Record<string, unknown>) =>
    apiFetch<FunctionInvokeResult>(`/platform/v26/functions/${encodeURIComponent(slug)}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    }),
  // F3 — preview FIEL em lote: roda a Function salva sobre N entradas e devolve
  // saída por objeto + agregados (rows_in/out, tempo) + contrato de saída.
  previewBatch: (slug: string, body: { inputs_list: Record<string, unknown>[]; draft?: boolean }) =>
    apiFetch<PreviewBatchResult>(`/platform/v26/functions/${encodeURIComponent(slug)}/preview-batch`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // F5 — testes governados de uma Function: lista, cria (a partir da amostra),
  // roda um por id, roda todos com resumo, e histórico de execuções.
  tests: (slug: string) =>
    apiFetch<TestOut[]>(`/platform/v26/functions/${encodeURIComponent(slug)}/tests`),
  createTest: (slug: string, body: { name: string; inputs: Record<string, unknown>; expected_contains?: string[]; assertions?: FunctionTestAssertion[] }) =>
    apiFetch<TestOut>(`/platform/v26/functions/${encodeURIComponent(slug)}/tests`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  runTest: (slug: string, testId: string) =>
    apiFetch<TestOut>(`/platform/v26/functions/${encodeURIComponent(slug)}/tests/${encodeURIComponent(testId)}/run`, {
      method: 'POST',
    }),
  runAllTests: (slug: string) =>
    apiFetch<{ total: number; passed: number; failed: number; results: { name: string; status: string }[] }>(
      `/platform/v26/functions/${encodeURIComponent(slug)}/test`,
      { method: 'POST' },
    ),
  testRuns: (slug: string, limit = 50) =>
    apiFetch<TestRun[]>(`/platform/v26/functions/${encodeURIComponent(slug)}/test-runs?limit=${limit}`),
};

// ── IDE (P5 portado pro security-app) — sandbox + codegen, reusa o backend ──
export interface SandboxExecuteResult {
  session_id: string;
  status: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number | null;
  code_hash: string;
}

export interface InstalledPackage {
  id: string;
  package_name: string;
  package_version?: string | null;
  installed_by?: string | null;
  installed_at: string;
}
export const Sandbox = {
  execute: (data: { code: string; language?: string; allow_network?: boolean; timeout_seconds?: number; input_data?: string }) =>
    apiFetch<SandboxExecuteResult>('/sandbox/execute', { method: 'POST', body: JSON.stringify(data) }),
  install: (packageName: string) =>
    apiFetch<{ status: string; package_name: string; stdout: string; stderr: string }>('/sandbox/install', {
      method: 'POST', body: JSON.stringify({ package_name: packageName }),
    }),
  // Pacotes pip JÁ registrados no tenant — reinstalados no container efêmero
  // quando a execução roda com a Rede ligada.
  listPackages: () =>
    apiFetch<InstalledPackage[]>('/sandbox/packages'),
  // Terminal interativo (mesmo backend): ticket curto por HTTP → WS ?ticket=.
  terminalTicket: () => apiFetch<{ ticket: string }>('/sandbox/terminal-ticket'),
  // Débito 4 — o WS NÃO pode passar pelo catch-all /api (strippa o upgrade do WS):
  // vai DIRETO ao ontology. Usa NEXT_PUBLIC_ONTOLOGY_WS_URL se setado, senão deriva
  // de NEXT_PUBLIC_ONTOLOGY_API_URL (http→ws). Sem nenhum, o terminal fica
  // indisponível (console-only) — `terminalAvailable()` controla a UI; nada quebra.
  _terminalWsBase: () => {
    const explicit = (process.env.NEXT_PUBLIC_ONTOLOGY_WS_URL || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const api = (process.env.NEXT_PUBLIC_ONTOLOGY_API_URL || '').trim();
    return api ? api.replace(/^http/, 'ws').replace(/\/$/, '') : '';
  },
  terminalAvailable: () => !!Sandbox._terminalWsBase(),
  terminalWsUrl: (ticket?: string) => {
    const wsBase = Sandbox._terminalWsBase();
    if (!wsBase) return '';
    const base = `${wsBase}/sandbox/terminal`;
    return ticket ? `${base}?ticket=${encodeURIComponent(ticket)}` : base;
  },
};

export interface CodegenResult {
  code: string;
  kind: string;
  entrypoint: string;
  inference_log_id: string;
  model_default: { model: string; provider: string; source: string; jurisdictions: string[]; country: string | null };
  loadcheck: { ran: boolean; ok?: boolean; reason?: string };
}
export const Codegen = {
  // P4 — gera código baseado no AEGIS SDK (validado por AST + carga no sandbox).
  generate: (data: { objective: string; kind?: 'transform' | 'script'; context?: string }) =>
    apiFetch<CodegenResult>('/codegen/generate', { method: 'POST', body: JSON.stringify(data) }),
  // P5b #3 — símbolos do SDK p/ autocomplete SDK-aware no Monaco.
  sdkSymbols: () => apiFetch<{ symbols: { label: string; detail: string; insertText: string }[] }>('/codegen/sdk-symbols'),
};

export const Ontology = {
  /** E4 (V1 visão§) — materialização em LOTE de instâncias canônicas do mesmo
   *  kind (perm ontology.objects.bulk_write). Tudo-ou-nada. */
  bulkCreate: (kind: string, items: Record<string, unknown>[], markings?: string[]) =>
    apiFetch<{ created: number; object_ids: string[]; kind: string }>('/ontology/nodes/bulk', {
      method: 'POST',
      body: JSON.stringify({ kind, items, ...(markings?.length ? { markings } : {}) }),
    }),
  /** Cria uma ARESTA (relação real) entre dois nós da ontologia. Usado pelo writeback
   *  quando um campo LOOKUP (ref_node_type + relation_type) é preenchido → a entidade
   *  fica RELACIONADA no grafo, não um id solto numa property. */
  createEdge: (body: { source_node_id: string; target_node_id: string; relation_type: string; metadata?: Record<string, unknown> }) =>
    apiFetch<{ id: string; source_node_id: string; target_node_id: string; relation_type: string }>(
      '/ontology/edges',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  /** V2 visão§ — edita uma instância canônica (PUT; `properties` substitui o
   *  dict inteiro e roda coerção de contrato, incl. geopoint). Perm
   *  ontology.objects.write; lineage automático. */
  updateNode: (id: string, patch: { properties?: Record<string, unknown>; name?: string; markings?: string[] }) =>
    apiFetch<OntologyNode>(`/ontology/nodes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  /** V2 visão§ — remove uma instância canônica (DELETE governado + lineage). */
  deleteNode: (id: string) =>
    apiFetch<{ status: string }>(`/ontology/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** F1 remoção — bulk-delete de instâncias (multi-seleção OU por node_type).
   *  dry_run=true (default) → PREVIEW: {matched, edges_affected, sample}. Sem
   *  mutar. dry_run=false exige confirm=true (+ opcional expected_count que tem
   *  que bater). Perm ontology.objects.bulk_delete. Auditado em ontology.bulk.delete. */
  bulkDeleteNodes: (body: {
    node_ids?: string[];
    node_type?: string;
    dry_run?: boolean;
    confirm?: boolean;
    expected_count?: number;
  }) =>
    apiFetch<{
      dry_run: boolean;
      matched?: number;
      edges_affected?: number;
      sample?: { id: string; name: string; node_type: string }[];
      deleted?: number;
      edges_deleted?: number;
    }>('/ontology/nodes/bulk-delete', { method: 'POST', body: JSON.stringify(body) }),
  listNodes: (params?: { node_type?: string; q?: string; limit?: number; offset?: number }) => {
    const qs = params
      ? new URLSearchParams(
          Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
            if (v !== undefined && v !== null && v !== '') acc[k] = String(v);
            return acc;
          }, {}),
        ).toString()
      : '';
    return apiFetch<OntologyNode[]>('/ontology/nodes' + (qs ? `?${qs}` : ''));
  },
  getNode: (id: string) => apiFetch<OntologyNode>(`/ontology/nodes/${id}`),
  // Onda 25 — query TSDB-grade sobre a propriedade timeseries [{t,v}] de uma
  // instância: janela temporal + downsample (sem storage novo).
  queryTimeseries: (
    nodeId: string,
    property: string,
    body: { from_time?: string; to_time?: string; max_points?: number } = {},
  ) =>
    apiFetch<{ node_id: string; property_name: string; storage?: string; total_points_in_range: number; returned_points: number; downsampled: boolean; points: { t: string | number; v: number }[] }>(
      `/ontology/nodes/${encodeURIComponent(nodeId)}/properties/${encodeURIComponent(property)}/timeseries-query`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  // GAP 6 — append de pontos no storage temporal dedicado (row-per-point, escala).
  appendTimeseries: (nodeId: string, property: string, points: { t: string | number; v: number }[]) =>
    apiFetch<{ node_id: string; property_name: string; appended: number }>(
      `/ontology/nodes/${encodeURIComponent(nodeId)}/properties/${encodeURIComponent(property)}/timeseries/append`,
      { method: 'POST', body: JSON.stringify({ points }) },
    ),
  createNode: (body: Partial<OntologyNode>) =>
    apiFetch<OntologyNode>('/ontology/nodes', { method: 'POST', body: JSON.stringify(body) }),
  listEdges: () => apiFetch<OntologyEdge[]>('/ontology/edges'),
  graph: (limit?: number, nodeType?: string) => {
    const qs = new URLSearchParams();
    if (limit != null) qs.set('limit', String(limit));
    if (nodeType) qs.set('node_type', nodeType);
    const s = qs.toString();
    return apiFetch<OntologyGraph>(`/ontology/graph${s ? `?${s}` : ''}`);
  },
  /** Vizinhança BFS de um nó canônico (OntologyNode) — /rede unify modo root. */
  neighbors: (nodeId: string, depth = 2) =>
    apiFetch<OntologyGraph>(
      `/platform/v23/links/${encodeURIComponent(nodeId)}/neighbors?depth=${depth}`,
    ),
  /** Visão em cluster (agregada) — escala a milhões. /rede modo global default. */
  graphOverview: (by = 'node_type') =>
    apiFetch<GraphOverview>(`/ontology/graph/overview?by=${encodeURIComponent(by)}`),
  /** Lista tipos de objeto distintos da ontologia (com contagem). Usado pelo
   * Variables Panel pra popular o dropdown de "Tipo de objeto". */
  listNodeTypes: () => apiFetch<OntologyNodeType[]>('/ontology/node-types'),
  /**
   * Contrato tipado de um Object Type (Onda 4 — OSDK). Retorna properties
   * tipadas + link types navegáveis + action types ligadas a este tipo. O
   * catálogo de tipos usa pra projetar o contrato completo da classe.
   */
  objectTypeSchema: (kind: string) =>
    apiFetch<ObjectTypeSchema>(`/ontology/object-types/${encodeURIComponent(kind)}`),
  /** Onda 6 — OSDK: contrato completo (todos os Object Types declarados). */
  osdkManifest: () => apiFetch<ObjectTypeSchema[]>('/ontology/osdk/manifest'),
  /** Onda 6 — OSDK codegen: gera o SDK tipado do schema. {lang, filename, source}. */
  osdkGenerate: (lang = 'python') =>
    apiFetch<{ lang: string; filename: string; source: string }>(
      `/ontology/osdk/generate?lang=${encodeURIComponent(lang)}`,
    ),
  /* Onda 16 — Ontology Manager: CRUD governado de Object Type / Link Type.
   * O type-def deixa de nascer só via AIP/seed; o operador desenha à mão. */
  createObjectType: (body: ObjectTypeWriteBody) =>
    apiFetch<ObjectTypeWriteOut>('/ontology/object-types', { method: 'POST', body: JSON.stringify(body) }),
  updateObjectType: (kind: string, body: ObjectTypeWriteBody) =>
    apiFetch<ObjectTypeWriteOut>(`/ontology/object-types/${encodeURIComponent(kind)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  deleteObjectType: (kind: string) =>
    apiFetch<{ kind: string; deleted: boolean }>(`/ontology/object-types/${encodeURIComponent(kind)}`, { method: 'DELETE' }),
  declareLinkType: (body: LinkTypeWriteBody) =>
    apiFetch<{ edge_id: string }>('/ontology/link-types', { method: 'POST', body: JSON.stringify(body) }),
  deleteLinkType: (edgeId: string) =>
    apiFetch<{ deleted: boolean }>(`/ontology/link-types/${encodeURIComponent(edgeId)}`, { method: 'DELETE' }),
  /** Onda 11 — histórico temporal: lista as versões (snapshots) de um objeto. */
  nodeHistory: (id: string) =>
    apiFetch<NodeVersion[]>(`/ontology/nodes/${encodeURIComponent(id)}/history`),
  /** Onda 11 — as-of: reconstrói o estado do objeto numa versão/instante (do
   * snapshot, nunca do nó vivo; governança histórica). */
  nodeAsOf: (id: string, asOf: string) =>
    apiFetch<NodeAsOf>(
      `/ontology/nodes/${encodeURIComponent(id)}/history?as_of=${encodeURIComponent(asOf)}`,
    ),
  /** Onda 10 — search-around: a partir de um object set semente (tipo), segue um
   * caminho de relations (multi-hop) e devolve o object set relacionado. */
  searchAround: (objectType: string, path: SearchAroundHop[]) =>
    apiFetch<SearchAroundResult>('/workshop/object-set/search-around', {
      method: 'POST',
      body: JSON.stringify({ seed: { object_type: objectType }, path }),
    }),
  /** Onda 14 — agregação on-the-fly sobre um Object Set: count/sum/avg/min/max/
   * cardinality + group_by. Devolve escalar OU buckets [{key,<op>,count}]. Motor
   * de leitura do Quiver (análise sem código). */
  aggregateObjectSet: (
    objectType: string,
    aggregation: { op: string; field?: string; group_by?: string[] },
    filter?: FilterPredicate | null,
  ) =>
    apiFetch<{ result: number | Array<Record<string, unknown>> }>('/workshop/object-set/aggregate', {
      method: 'POST',
      body: JSON.stringify({
        object_set: { object_type: objectType, ...(filter ? { filter } : {}) },
        aggregation,
      }),
    }),
  /**
   * Histograma server-side de um campo numérico em um node_type. Usado
   * pelo `FilterHistogram` do Variables Panel — substitui o scan client
   * via `listNodes`. Backend já aplica filter por marking + agrega em
   * `bins` bins de largura uniforme.
   */
  getNodeTypeHistogram: (nodeType: string, field: string, bins = 12) =>
    apiFetch<OntologyHistogram>(
      `/ontology/node-types/${encodeURIComponent(nodeType)}/histogram/${encodeURIComponent(field)}?bins=${bins}`,
    ),
};

// ── Entities (objects da busca/ficha) ───────────────────────────────
/**
 * Backend (ontology-module) tem schema:
 *   { id, kind, canonical, display, properties, confidence, markings, ... }
 *
 * Frontend Entity type espera:
 *   { id, name, entity_type, classification, properties, version, ... }
 *
 * Esse adapter mantém compatibilidade com payload do CCTV/legacy E do
 * router /entities atual. Não há "raw kind" vs "raw entity_type" — só
 * uma view normalizada do frontend.
 */
type RawEntity = Partial<Entity> & {
  kind?: string;
  display?: string;
  canonical?: string;
  markings?: string[];
  confidence?: number;
};

function normalizeEntity(raw: RawEntity): Entity {
  const markings = Array.isArray(raw.markings) ? raw.markings : [];
  // marking "OPERACIONAL" → classification "restrito" (já vem em
  // português no fallback). Mapeamento espelha o do backend.
  const _MARK_TO_CLASS: Record<string, string> = {
    OFICIAL: 'publico',
    OPERACIONAL: 'restrito',
    GABINETE_INTERNO: 'confidencial',
    CHEFE_GABINETE: 'sigiloso',
  };
  const inferredClass =
    markings.map((m) => _MARK_TO_CLASS[m]).find(Boolean) ?? 'restrito';
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? raw.display ?? raw.canonical ?? ''),
    entity_type: String(raw.entity_type ?? raw.kind ?? ''),
    properties: (raw.properties ?? {}) as Record<string, unknown>,
    classification:
      (raw.classification as Entity['classification']) ??
      (inferredClass as Entity['classification']),
    signed_hash: raw.signed_hash ?? null,
    version: typeof raw.version === 'number' ? raw.version : 1,
    created_by: raw.created_by ?? '',
    created_at: raw.created_at ?? '',
    updated_at: raw.updated_at ?? null,
  } as Entity;
}

export interface IdentidadePossivel {
  tipo: string;
  identificador: string;
  url?: string;
  confianca: number;
  nivel: string;
  sinais: string[];
  fontes: string[];
  fontes_total?: number;
  status: 'possible' | 'confirmed' | 'rejected';
}

/** Veredito do LLM-juiz (Fase 4) — arbitragem explicável SÓ rebaixa; é SINAL (não confirma). */
export interface IdentidadeVeredito {
  arbitrado: boolean;
  motivo?: string; // quando arbitrado=false (sem grounding / IA indisponível / descartado)
  e_a_pessoa?: boolean;
  confianca?: number;
  confianca_anterior?: number;
  nivel?: string;
  trecho_citado?: string;
  justificativa?: string;
  nota?: string;
}

export const Entities = {
  list: async (params?: Record<string, string>): Promise<Entity[]> => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const raw = await apiFetch<RawEntity[]>(`/entities${qs}`);
    return raw.map(normalizeEntity);
  },
  /**
   * Total (tenant) de entidades que casam com kind/q — alimenta o "N de M" e o
   * "Carregar mais" do /explorador. Limite SUPERIOR pré-ABAC (a máscara/RowPolicy
   * pode reduzir o que cada operador vê). `GET /entities/count`.
   */
  count: async (params?: Record<string, string>): Promise<number> => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await apiFetch<{ total: number }>(`/entities/count${qs}`);
    return typeof res?.total === 'number' ? res.total : 0;
  },
  /**
   * Tenta /entities/{id} primeiro (router antigo, IAM-gated).
   * Se der 401/404, tenta /api/v1/cctv/entities/{id} (router CCTV, público)
   * que retorna entidades criadas pelo cctv-worker (LPR/face/object/stream).
   */
  get: async (id: string): Promise<Entity> => {
    try {
      const raw = await apiFetch<RawEntity>(`/entities/${id}`);
      return normalizeEntity(raw);
    } catch {
      const raw = await apiFetch<RawEntity>(`/api/v1/cctv/entities/${id}`);
      return normalizeEntity(raw);
    }
  },
  graph: (id: string, opts?: { hops?: number; max_nodes?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.hops != null) qs.set('hops', String(opts.hops));
    if (opts?.max_nodes != null) qs.set('max_nodes', String(opts.max_nodes));
    const s = qs.toString();
    return apiFetch<OntologyGraph>(
      `/entities/${id}/graph${s ? '?' + s : ''}`,
    );
  },
  /** Grafo global da tenant — todas entities + links, sem root/BFS. */
  globalGraph: (max_nodes = 500) =>
    apiFetch<OntologyGraph>(`/entities/global/graph?max_nodes=${max_nodes}`),
  links: (id: string) => apiFetch<EntityLink[]>(`/entities/${id}/links`),
  evidence: (id: string) => apiFetch<unknown[]>(`/entities/${id}/evidence`),
  /**
   * Coleta posts/fotos das redes sociais correlacionadas à entidade (gesto da
   * aba Mídia da ficha). O backend faz fan-out às fontes (TikTok/Instagram/
   * gram/X), grava cada retorno como Evidence (source_tool tiktok_user_videos/
   * instaloader_profile/agent_x_search/gram_profile) e devolve um resumo HONESTO:
   * quantas redes coletaram, quantos itens no total e o que foi bloqueado (com
   * o motivo legível por rede). `purpose` = finalidade LGPD (gravada na auditoria).
   */
  collectMedia: (id: string, purpose: string) =>
    apiFetch<{ coletadas: number; itens: number; falhas: { rede: string; motivo: string }[] }>(
      `/entities/${id}/collect-media`,
      { method: 'POST', body: JSON.stringify({ purpose }) },
    ),
  /** Coleta de mídia ASSÍNCRONA com PROGRESSO POR REDE ao vivo (operador nunca no
   *  escuro). Espelha dossierViaTask: cria um OperatorTask (origin media_collect),
   *  abre EventSource p/ os steps de cada rede em tempo real e governa a conclusão
   *  por poll de /operator/tasks/{id}. Resolve com result_data {coletadas,itens,
   *  falhas:[{rede,motivo}]} quando done; rejeita se failed/cancelled. `purpose` =
   *  finalidade LGPD (gravada na auditoria). Mantém collectMedia (síncrono). */
  collectMediaViaTask: async (
    entityId: string,
    purpose: string,
    opts?: {
      pollMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      // Progresso VIVO: chamado a cada rede que conclui (provenance.steps), via SSE.
      onProgress?: (steps: { label: string; detail?: string }[]) => void;
    },
  ): Promise<{ coletadas: number; itens: number; falhas: { rede: string; motivo: string }[] }> => {
    const task = await apiFetch<{ id: string }>('/operator/tasks', {
      method: 'POST',
      body: JSON.stringify({
        origin: 'media_collect',
        priority: 'high',
        title: `Coleta de mídia: ${entityId.slice(0, 80)}`,
        prompt_text: JSON.stringify({ entity_id: entityId, purpose }),
      }),
    });
    const pollMs = opts?.pollMs ?? 2500;
    const timeoutMs = opts?.timeoutMs ?? 8 * 60 * 1000;
    const started = Date.now();
    // SSE p/ steps em TEMPO REAL (cada rede do fan-out). Best-effort/aditivo: o poll
    // abaixo governa a conclusão; sem EventSource, o poll também surfaça os steps.
    let es: EventSource | null = null;
    if (opts?.onProgress && typeof EventSource !== 'undefined') {
      try {
        es = new EventSource(`${API_BASE}/operator/tasks/stream`, { withCredentials: true });
        es.addEventListener('task.changed', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data) as {
              id: string;
              provenance?: { steps?: { label: string; detail?: string }[] };
            };
            if (d.id === task.id) opts.onProgress?.(d.provenance?.steps ?? []);
          } catch {
            /* evento malformado — ignora; o poll cobre */
          }
        });
      } catch {
        es = null;
      }
    }
    try {
      for (;;) {
        if (opts?.signal?.aborted) throw new Error('cancelado');
        await new Promise((r) => setTimeout(r, pollMs));
        const t = await apiFetch<{
          status: string;
          result_data: { coletadas: number; itens: number; falhas: { rede: string; motivo: string }[] };
          error_message: string | null;
          provenance?: { steps?: { label: string; detail?: string }[] };
        }>(`/operator/tasks/${encodeURIComponent(task.id)}`);
        if (opts?.onProgress) opts.onProgress(t.provenance?.steps ?? []);
        if (t.status === 'done') {
          return t.result_data || { coletadas: 0, itens: 0, falhas: [] };
        }
        if (t.status === 'failed' || t.status === 'cancelled') {
          throw new Error(t.error_message || 'falha ao coletar a mídia');
        }
        if (Date.now() - started > timeoutMs) {
          throw new Error('tempo esgotado ao coletar a mídia');
        }
      }
    } finally {
      es?.close();
    }
  },
  // Pivô nome→identidade: lista possíveis (sinal real) + confirmar→aprofundar.
  identidades: (id: string) =>
    apiFetch<{ ok: boolean; identidades: IdentidadePossivel[]; fonte?: string }>(
      `/entities/${id}/identidades`,
    ),
  confirmarIdentidade: (
    id: string,
    body: { tipo: string; identificador: string; url?: string; confianca?: number },
  ) =>
    apiFetch<{ ok: boolean; target_id?: string; aprofundado?: number }>(
      `/entities/${id}/identidades/confirmar`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  descartarIdentidade: (id: string, body: { tipo: string; identificador: string }) =>
    apiFetch<{ ok: boolean }>(`/entities/${id}/identidades/descartar`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // LLM-juiz sob gesto: arbitra um candidato (grounding + só rebaixa). É sinal, não confirma.
  julgarIdentidade: (id: string, body: { tipo: string; identificador: string }) =>
    apiFetch<IdentidadeVeredito>(`/entities/${id}/identidades/julgar`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Preview EXATO das fontes que o "Montar dossiê" vai cruzar p/ um tipo de entidade
   *  (espelha entity_fanout._plan_calls, sem rodar nada). Pré-voo do botão. */
  dossierPlan: (body: { kind: string; value?: string; properties?: Record<string, string> }) =>
    apiFetch<{ kind: string; sources: { tool: string; label: string }[]; count: number }>(
      '/entities/dossier-plan',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  /** Montar dossiê ASSÍNCRONO: cria um OperatorTask (origin entity_dossier) e aguarda por
   *  poll — o fan-out longo roda no worker, não prende a conexão. Devolve o result_data
   *  do dossiê (entity_id/sources_failed/...). */
  dossierViaTask: async (
    params: {
      kind: string;
      value: string;
      purpose: string;
      case_id?: string;
      properties?: Record<string, string>;
    },
    opts?: {
      pollMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      // Progresso VIVO: chamado a cada fonte que conclui (provenance.steps), via SSE.
      onProgress?: (steps: { label: string; detail?: string }[]) => void;
    },
  ): Promise<{ entity_id?: string; sources_failed?: unknown[] } & Record<string, unknown>> => {
    const task = await apiFetch<{ id: string }>('/operator/tasks', {
      method: 'POST',
      body: JSON.stringify({
        origin: 'entity_dossier',
        priority: 'high',
        title: `Dossiê: ${params.value.slice(0, 80)}`,
        prompt_text: JSON.stringify(params),
      }),
    });
    const pollMs = opts?.pollMs ?? 2500;
    const timeoutMs = opts?.timeoutMs ?? 8 * 60 * 1000;
    const started = Date.now();
    // SSE p/ steps em TEMPO REAL (cada fonte do fan-out). Best-effort/aditivo: o poll
    // abaixo governa a conclusão; sem EventSource, o poll também surfaça os steps.
    let es: EventSource | null = null;
    if (opts?.onProgress && typeof EventSource !== 'undefined') {
      try {
        es = new EventSource(`${API_BASE}/operator/tasks/stream`, { withCredentials: true });
        es.addEventListener('task.changed', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data) as {
              id: string;
              provenance?: { steps?: { label: string; detail?: string }[] };
            };
            if (d.id === task.id) opts.onProgress?.(d.provenance?.steps ?? []);
          } catch {
            /* evento malformado — ignora; o poll cobre */
          }
        });
      } catch {
        es = null;
      }
    }
    try {
      for (;;) {
        if (opts?.signal?.aborted) throw new Error('cancelado');
        await new Promise((r) => setTimeout(r, pollMs));
        const t = await apiFetch<{
          status: string;
          result_data: { entity_id?: string; sources_failed?: unknown[] } & Record<string, unknown>;
          error_message: string | null;
          provenance?: { steps?: { label: string; detail?: string }[] };
        }>(`/operator/tasks/${encodeURIComponent(task.id)}`);
        if (opts?.onProgress) opts.onProgress(t.provenance?.steps ?? []);
        if (t.status === 'done') return t.result_data || {};
        if (t.status === 'failed' || t.status === 'cancelled') {
          throw new Error(t.error_message || 'falha ao montar o dossiê');
        }
        if (Date.now() - started > timeoutMs) {
          throw new Error('tempo esgotado ao montar o dossiê');
        }
      }
    } finally {
      es?.close();
    }
  },
};

// ── Data sources ────────────────────────────────────────────────────
export const Sources = {
  list: () => apiFetch<DataSource[]>('/sources/'),
  get: (id: string) => apiFetch<DataSource>(`/sources/${id}`),
  test: (id: string) => apiFetch<{ ok: boolean; latency_ms: number }>(`/sources/${id}/test`, { method: 'POST' }),
  connectors: () => apiFetch<{ id: string; label: string }[]>('/sources/connectors/available'),
};

// ── Ingestão governada (core-loop) — DataSource → DataAsset (hash) →
//    LineageEvent. Usada pelo "Conectar dados" dos nós de Coleta (#1). ─────
export const Ingest = {
  event: (body: {
    source_name: string;
    source_type: string;
    payload: Record<string, unknown>;
    extra_markings?: string[];
  }) =>
    apiFetch<{ asset_id: string; transform: Record<string, unknown> | null }>(
      '/ingest/event',
      { method: 'POST', body: JSON.stringify(body) },
    ),
};

// ── Alerts (caixa unificada — store na ontologia) ───────────────────
// O wire shape é o Alert canônico (BackendAlert); a UI consome AlertItem
// via mapBackendAlert (lib/api/alerts-map.ts).
const mapAlerts = (rows: BackendAlert[]): AlertItem[] => rows.map(mapBackendAlert);

// Re-export do tipo da trilha de auditoria (BACKLOG #6a) — consumidores
// importam de `@/lib/api`.
export type { AlertTrailEvent } from './alerts-map';

/**
 * BACKLOG #6a ELO 2 — saída de `GET /alerts/metrics`. `mttr_ack_seconds` é
 * `null` quando não há amostra na janela; `window` ecoa o intervalo aplicado.
 */
export interface AlertMetrics {
  window: { since: string; until: string };
  pending_count: number;
  acknowledged_count: number;
  escalated_count: number;
  resolved_in_window: number;
  mttr_ack_seconds: number | null;
}

export const Alerts = {
  feeds: {
    list: () => apiFetch<AlertFeed[]>('/alerts/feeds'),
    // Salvar busca / criar alerta de busca = um SearchFeed (POST /alerts/feeds).
    // cadence_seconds>0 → monitorado (alerta quando houver novos matches).
    create: (body: { name: string; filters: Record<string, unknown>; cadence_seconds?: number }) =>
      apiFetch<AlertFeed>('/alerts/feeds', { method: 'POST', body: JSON.stringify(body) }),
    // Gestão da busca monitorada: renomear, mudar cadência, pausar/retomar (active).
    update: (id: string, changes: { name?: string; cadence_seconds?: number; active?: boolean }) =>
      apiFetch<AlertFeed>(`/alerts/feeds/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
    delete: (id: string) =>
      apiFetch<void>(`/alerts/feeds/${id}`, { method: 'DELETE' }),
    alerts: () =>
      apiFetch<BackendAlert[]>('/alerts/feeds/alerts').then(mapAlerts),
    ack: (id: string) =>
      apiFetch<void>(`/alerts/feeds/${id}/acknowledge`, { method: 'POST' }),
  },
  watches: {
    list: () => apiFetch<AlertWatch[]>('/alerts/watches'),
    alerts: () =>
      apiFetch<BackendAlert[]>('/alerts/watches/alerts').then(mapAlerts),
    ack: (id: string) =>
      apiFetch<void>(`/alerts/watches/${id}/acknowledge`, { method: 'POST' }),
  },
  geofences: {
    list: () => apiFetch<AlertGeofence[]>('/alerts/geofences'),
    create: (body: Partial<AlertGeofence> & { baseline_silent?: boolean }) =>
      apiFetch<AlertGeofence>('/alerts/geofences', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    // PATCH parcial (perm alerts.geofences.manage) — renomear/severidade/
    // ativar OU redesenhar (shape+coordinates); só os campos enviados mudam.
    update: (id: string, changes: Partial<Omit<AlertGeofence, 'id'>>) =>
      apiFetch<AlertGeofence>(`/alerts/geofences/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      }),
    // DELETE /alerts/geofences/{id} (perm alerts.geofences.manage) —
    // remoção pela UI do /geo (confirmModal, nunca diálogo nativo).
    remove: (id: string) =>
      apiFetch<void>(`/alerts/geofences/${id}`, { method: 'DELETE' }),
    alerts: () =>
      apiFetch<BackendAlert[]>('/alerts/geofences/alerts').then(mapAlerts),
    ack: (id: string) =>
      apiFetch<void>(`/alerts/geofences/${id}/acknowledge`, { method: 'POST' }),
  },
  shares: {
    alerts: () =>
      apiFetch<BackendAlert[]>('/alerts/shares').then(mapAlerts),
    ack: (id: string) =>
      apiFetch<void>(`/alerts/shares/${id}/ack`, { method: 'POST' }),
  },
  /**
   * Inbox unificado (2026-06-12) — caixa única cross-família servida pelo
   * store na ontologia (perm `alerts.read`). Alimenta o widget `alert_list`
   * da página /alertas parametrizável e o badge REAL da sidenav.
   * Devolve o wire shape cru (BackendAlert) — o widget renderiza severidade/
   * status direto; quem precisar de AlertItem usa mapBackendAlert.
   */
  inbox: {
    list: (opts?: {
      kinds?: string[];
      severities?: string[];
      status?: string;
      limit?: number;
      offset?: number;
    }) => {
      const qs = new URLSearchParams();
      if (opts?.kinds?.length) qs.set('kinds', opts.kinds.join(','));
      if (opts?.severities?.length) qs.set('severities', opts.severities.join(','));
      if (opts?.status) qs.set('status', opts.status);
      if (opts?.limit != null) qs.set('limit', String(opts.limit));
      if (opts?.offset != null) qs.set('offset', String(opts.offset));
      const q = qs.toString();
      return apiFetch<BackendAlert[]>(`/alerts/inbox${q ? `?${q}` : ''}`);
    },
    countPending: () =>
      apiFetch<{ count: number }>('/alerts/count_pending'),
    ack: (id: string) =>
      apiFetch<BackendAlert>(`/alerts/${encodeURIComponent(id)}/acknowledge`, {
        method: 'POST',
      }),
    /**
     * BACKLOG #6a ELO 2 — trilha de auditoria de UM alerta (gestos `alert.*`
     * em ordem cronológica). Mesma cerca de visibilidade do ack (perm da
     * família + ABAC por-marcação). Alimenta o drawer de Auditoria do widget
     * `alert_list`.
     */
    trail: (id: string) =>
      apiFetch<AlertTrailEvent[]>(`/alerts/${encodeURIComponent(id)}/trail`),
    /**
     * BACKLOG #6a ELO 2 — métricas de gestão numa chamada (contagens por
     * status + nº escalados + MTTR na janela). Os metric_card do seed usam as
     * variables (count barato); este endpoint é a visão autoritativa/janela
     * pra relatórios. `since`/`until` opcionais (default: últimos 7 dias).
     */
    metrics: (opts?: { since?: string; until?: string }) => {
      const qs = new URLSearchParams();
      if (opts?.since) qs.set('since', opts.since);
      if (opts?.until) qs.set('until', opts.until);
      const q = qs.toString();
      return apiFetch<AlertMetrics>(`/alerts/metrics${q ? `?${q}` : ''}`);
    },
  },
};

// ── Alert routes (config de roteamento — /painel-de-controle/alertas) ──
// AlertRoute = nó da ontologia (node_type='AlertRoute'); canais vêm do
// registry de messaging + config do tenant. Perms: alerts.routes.view/manage.
export interface AlertRouteMatch {
  kinds: string[];
  min_severity: string;
}
export interface AlertRoute {
  id: string;
  name: string;
  match: AlertRouteMatch;
  channel: string;
  channel_config_ref: string | null;
  silence_until: string | null;
  escalation: Record<string, unknown> | null;
  active: boolean;
}
export interface AlertChannel {
  channel: string;
  configured: boolean;
  requires_config: boolean;
  config_refs: string[];
}

/** O que a tela ENVIA ao configurar um canal. Campos livres porque o
 *  vocabulário é do canal, não do core. */
export interface AlertChannelConfigIn {
  channel?: string;
  url?: string;
  to?: string;
  token?: string;
  username?: string;
  allowlist?: string[];
  timeout?: number;
}

/** O que a tela RECEBE de volta: a config com o segredo mascarado. */
export interface AlertChannelConfig {
  ref: string;
  channel: string;
  config: Record<string, unknown>;
}

export const AlertRoutes = {
  list: () => apiFetch<AlertRoute[]>('/alerts/routes'),
  create: (body: {
    name: string;
    match: AlertRouteMatch;
    channel: string;
    channel_config_ref?: string | null;
    active?: boolean;
  }) =>
    apiFetch<AlertRoute>('/alerts/routes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, changes: Partial<Omit<AlertRoute, 'id' | 'silence_until'>>) =>
    apiFetch<AlertRoute>(`/alerts/routes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/alerts/routes/${id}`, { method: 'DELETE' }),
  /** minutes > 0 silencia; 0 limpa — gesto auditado em lineage. */
  silence: (id: string, minutes: number) =>
    apiFetch<AlertRoute>(`/alerts/routes/${id}/silence`, {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    }),
  channels: () => apiFetch<AlertChannel[]>('/alerts/channels'),
  /**
   * Aponta um canal de entrega (URL do webhook do Discord, destino padrão…).
   * Existe para que isso seja BOTÃO: antes, apontar o alerta para o Discord da
   * equipe exigia editar o JSONB do tenant no banco — gesto de shell para
   * tarefa de operação. Auditado como `alert_channel.configured`; a resposta
   * traz a credencial MASCARADA (a tela não é lugar de onde se copia segredo).
   */
  putChannel: (ref: string, config: AlertChannelConfigIn) =>
    apiFetch<AlertChannelConfig>(`/alerts/channels/${encodeURIComponent(ref)}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  removeChannel: (ref: string) =>
    apiFetch<void>(`/alerts/channels/${encodeURIComponent(ref)}`, { method: 'DELETE' }),
  kinds: () =>
    apiFetch<{ kinds: string[] }>('/alerts/routes/kinds').then((r) => r.kinds),
};

// ── Workshop (dossiers · briefings · COVs/ficha) ────────────────────
export const Workshop = {
  dossiers: {
    list: () => apiFetch<Dossier[]>('/workshop/dossiers'),
    get: (id: string) => apiFetch<Dossier>(`/workshop/dossiers/${id}`),
    create: (body: Partial<Dossier>) =>
      apiFetch<Dossier>('/workshop/dossiers', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Dossier>) =>
      apiFetch<Dossier>(`/workshop/dossiers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  briefings: {
    broadcast: (id: string) =>
      apiFetch<void>(`/workshop/briefings/${id}/broadcast`, { method: 'POST' }),
  },
  covs: {
    list: (entityType?: string) => {
      const qs = entityType ? `?entity_type=${entityType}` : '';
      return apiFetch<COV[]>(`/workshop/covs${qs}`);
    },
    get: (id: string) => apiFetch<COV>(`/workshop/covs/${id}`),
    setTeamDefault: (id: string) =>
      apiFetch<void>(`/workshop/covs/${id}/set-team-default`, { method: 'POST' }),
  },
};

// ── IAM (users · roles · permissions · audit · nav) ─────────────────
export const Iam = {
  users: {
    list: () => apiFetch<IamUser[]>('/iam/users'),
    get: (id: string) => apiFetch<IamUser>(`/iam/users/${id}`),
  },
  roles: {
    list: () => apiFetch<IamRole[]>('/iam/roles'),
  },
  permissions: {
    list: () => apiFetch<IamPermission[]>('/iam/permissions'),
  },
  audit: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch<IamAuditEvent[]>(`/iam/audit${qs}`);
    },
  },
  nav: {
    tree: () => apiFetch<NavTree>('/iam/nav'),
  },
};

// ── Me / Home dashboard ─────────────────────────────────────────────
export interface MySignature {
  has_signature: boolean;
  object_key: string | null;
}
export const Me = {
  home: () => apiFetch<MeHome>('/me/home'),
  /** #3 — assinatura reutilizável do operador (cofre por usuário). */
  signature: () => apiFetch<MySignature>('/me/signature'),
  /** Cadastra/rotaciona a assinatura (data URL de imagem — upload ou desenho). */
  setSignature: (dataUrl: string) =>
    apiFetch<MySignature>('/me/signature', { method: 'PUT', body: JSON.stringify({ data_url: dataUrl }) }),
  removeSignature: () => apiFetch<MySignature>('/me/signature', { method: 'DELETE' }),
  /** Caminho de serve da imagem da própria assinatura (gateado ao dono). */
  signatureImageUrl: () => `/api/me/signature/image`,
};

// ── Auth ────────────────────────────────────────────────────────────
// Login/refresh/logout sao ROTAS Next.js dedicadas (em app/api/auth/*).
// Elas escrevem cookies httpOnly e o browser nunca ve o token em JS.
// `whoami` passa pelo proxy genérico → backend /whoami.
export type LoginResponse = {
  // O body NAO traz tokens — token vai pros cookies httpOnly. So flags.
  must_change_password?: boolean;
  token_type?: string;
  expires_in?: number;
};

export const Auth = {
  login: (body: { username: string; password: string; totp_code?: string }) =>
    apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  whoami: () => apiFetch<{ username: string; perms: string[]; roles: string[] }>('/whoami'),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
};

// ── Painel de Controle (Sprint H1+, 2026-05-22) ────────────────────
export interface CPApproval {
  id: string;
  requester_id: string;
  resource_kind: string;
  resource_id: string | null;
  title: string;
  action: string;
  status: 'open' | 'in_progress' | 'approved' | 'rejected' | 'closed';
  submitted_at: string;
  decided_at: string | null;
  decided_by_id: string | null;
  rationale: string | null;
}

export interface CPCommunication {
  category: string;
  emails: string[];
  updated_at: string;
}

export interface CPFavorite {
  setting_key: string;
  starred_at: string;
}

export interface CPHomeCard {
  icon: string;
  title: string;
  description: string;
  href: string;
  perm_key?: string | null;
}

export interface CPHomeSection {
  title: string;
  cards: CPHomeCard[];
}

export interface CPHome {
  enrollment: { id: string; name: string; host?: string };
  organizations: { id: string; name: string }[];
  starred_settings: string[];
  sections: CPHomeSection[];
}

export interface CPActivityPoint {
  date: string;
  application_key: string;
  group_key: string;
  unique_users: number;
  view_count: number;
  modify_count: number;
}

export interface CPActivity {
  tab: 'platform' | 'resource';
  aggregate: 'app' | 'group' | 'resource';
  interaction: 'view' | 'modify';
  group_by: 'day' | 'week' | 'month' | 'year';
  series: CPActivityPoint[];
  applications: string[];
  range_from: string;
  range_to: string;
}

export const ControlPanel = {
  home: () => apiFetch<CPHome>('/control-panel/home'),
  approvals: {
    list: (params?: { status?: string; bucket?: 'all' | 'review' | 'mine' }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.bucket) qs.set('bucket', params.bucket);
      const s = qs.toString();
      return apiFetch<CPApproval[]>(`/control-panel/approvals${s ? '?' + s : ''}`);
    },
    create: (body: { resource_kind: string; resource_id?: string; title: string; action: string }) =>
      apiFetch<CPApproval>('/control-panel/approvals', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    approve: (id: string, rationale?: string) =>
      apiFetch<CPApproval>(`/control-panel/approvals/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ rationale }),
      }),
    reject: (id: string, rationale?: string) =>
      apiFetch<CPApproval>(`/control-panel/approvals/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rationale }),
      }),
    close: (id: string, rationale?: string) =>
      apiFetch<CPApproval>(`/control-panel/approvals/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ rationale }),
      }),
  },
  communications: {
    list: () => apiFetch<CPCommunication[]>('/control-panel/communications'),
    update: (category: string, emails: string[]) =>
      apiFetch<CPCommunication>('/control-panel/communications', {
        method: 'PUT',
        body: JSON.stringify({ category, emails }),
      }),
  },
  favorites: {
    list: () => apiFetch<CPFavorite[]>('/control-panel/favorites'),
    star: (key: string) =>
      apiFetch<CPFavorite>(`/control-panel/favorites/${encodeURIComponent(key)}`, { method: 'PUT' }),
    unstar: (key: string) =>
      apiFetch<void>(`/control-panel/favorites/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  },
  activity: (params?: {
    tab?: 'platform' | 'resource';
    aggregate?: 'app' | 'group' | 'resource';
    interaction?: 'view' | 'modify';
    group_by?: 'day' | 'week' | 'month' | 'year';
    from?: string;
    to?: string;
    application?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) qs.set(k, String(v));
      }
    }
    const s = qs.toString();
    return apiFetch<CPActivity>(`/control-panel/activity${s ? '?' + s : ''}`);
  },
};

// ─── Foundry-A taxonomy base (Sprint Foundry-A, 2026-05-22) ────────────────
// UI surfaces these as Organização / Espaço / Operação via useT().

export interface Organization {
  id: string;
  slug: string;
  display_name: string;
  features: string[];
  active: boolean;
  created_at: string;
}

export interface SpaceOrganization {
  id: string;
  tenant_id: string;
  added_at: string;
}

export interface Space {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  organizations: SpaceOrganization[];
}

export interface OrganizationGuest {
  id: string;
  tenant_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export const Organizations = {
  list: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const s = qs.toString();
    return apiFetch<Organization[]>(`/organizations${s ? '?' + s : ''}`);
  },
  get: (id: string) => apiFetch<Organization>(`/organizations/${id}`),
  create: (body: { slug: string; display_name: string; features?: string[] }) =>
    apiFetch<Organization>('/organizations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: { display_name?: string; active?: boolean }) =>
    apiFetch<Organization>(`/organizations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  guests: {
    list: (organizationId: string, include_revoked = false) => {
      const qs = include_revoked ? '?include_revoked=true' : '';
      return apiFetch<OrganizationGuest[]>(`/organizations/${organizationId}/guests${qs}`);
    },
    invite: (organizationId: string, body: { user_id: string; expires_at?: string }) =>
      apiFetch<OrganizationGuest>(`/organizations/${organizationId}/guests`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    revoke: (organizationId: string, userId: string) =>
      apiFetch<void>(`/organizations/${organizationId}/guests/${userId}`, {
        method: 'DELETE',
      }),
  },
};

export const Spaces = {
  list: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const s = qs.toString();
    return apiFetch<Space[]>(`/spaces${s ? '?' + s : ''}`);
  },
  get: (id: string) => apiFetch<Space>(`/spaces/${id}`),
  create: (body: { slug: string; display_name: string; description?: string }) =>
    apiFetch<Space>('/spaces', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (
    id: string,
    body: { display_name?: string; description?: string; active?: boolean },
  ) =>
    apiFetch<Space>(`/spaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  addOrganization: (id: string, tenant_id: string) =>
    apiFetch<Space>(`/spaces/${id}/organizations`, {
      method: 'POST',
      body: JSON.stringify({ tenant_id }),
    }),
  removeOrganization: (id: string, tenant_id: string) =>
    apiFetch<void>(`/spaces/${id}/organizations/${tenant_id}`, {
      method: 'DELETE',
    }),
  softDelete: (id: string) =>
    apiFetch<void>(`/spaces/${id}`, { method: 'DELETE' }),
};

// ─── Foundry-C Markings (Sprint Foundry-C, 2026-05-22) ─────────────────────

export interface MarkingCategory {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  mode: 'conjunctive' | 'disjunctive';
  created_at: string;
}

export interface Marking {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  category_id: string | null;
  active: boolean;
  created_at: string;
}

export interface MarkingEligibility {
  id: string;
  marking_id: string;
  // Onda L.6/R.1: a marking is granted to a user OR a group (exactly one).
  user_id: string | null;
  group_id: string | null;
  can_apply: boolean;
  granted_at: string;
}

export interface ResourceMarking {
  id: string;
  marking_id: string;
  marking_slug: string;
  marking_display_name: string;
  resource_kind: string;
  resource_id: string;
  applied_at: string;
}

export const Markings = {
  list: (params?: { limit?: number; offset?: number; category_id?: string; include_archived?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.category_id) qs.set('category_id', params.category_id);
    if (params?.include_archived) qs.set('include_archived', 'true');
    const s = qs.toString();
    return apiFetch<Marking[]>(`/markings${s ? '?' + s : ''}`);
  },
  get: (id: string) => apiFetch<Marking>(`/markings/${id}`),
  create: (body: { slug: string; display_name: string; description?: string; category_id?: string }) =>
    apiFetch<Marking>('/markings', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Pick<Marking, 'display_name' | 'description' | 'category_id' | 'active'>>) =>
    apiFetch<Marking>(`/markings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  usage: (id: string) =>
    apiFetch<{ marking_id: string; applied_count: number }>(`/markings/${id}/usage`),
  archive: (id: string) =>
    apiFetch<Marking>(`/markings/${id}/archive`, { method: 'POST' }),
  unarchive: (id: string) =>
    apiFetch<Marking>(`/markings/${id}/unarchive`, { method: 'POST' }),
  delete: (id: string) =>
    apiFetch<void>(`/markings/${id}`, { method: 'DELETE' }),
  categories: {
    list: () => apiFetch<MarkingCategory[]>('/markings/categories'),
    create: (body: { slug: string; display_name: string; description?: string; mode?: 'conjunctive' | 'disjunctive' }) =>
      apiFetch<MarkingCategory>('/markings/categories', { method: 'POST', body: JSON.stringify(body) }),
  },
  eligibility: {
    list: (markingId: string) =>
      apiFetch<MarkingEligibility[]>(`/markings/${markingId}/eligibility`),
    // Onda R.1: grant to a user OR a group (exactly one of user_id/group_id).
    grant: (
      markingId: string,
      body: { user_id?: string; group_id?: string; can_apply?: boolean },
    ) =>
      apiFetch<MarkingEligibility>(`/markings/${markingId}/eligibility`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    revoke: (markingId: string, userId: string) =>
      apiFetch<void>(`/markings/${markingId}/eligibility/${userId}`, { method: 'DELETE' }),
    revokeGroup: (markingId: string, groupId: string) =>
      apiFetch<void>(`/markings/${markingId}/eligibility/group/${groupId}`, {
        method: 'DELETE',
      }),
  },
};

export const ResourceMarkings = {
  list: (resourceKind: string, resourceId: string) =>
    apiFetch<ResourceMarking[]>(`/resources/${resourceKind}/${resourceId}/markings`),
  apply: (resourceKind: string, resourceId: string, markingId: string) =>
    apiFetch<ResourceMarking>(`/resources/${resourceKind}/${resourceId}/markings`, {
      method: 'POST',
      body: JSON.stringify({ marking_id: markingId }),
    }),
  remove: (resourceKind: string, resourceId: string, markingId: string) =>
    apiFetch<void>(`/resources/${resourceKind}/${resourceId}/markings/${markingId}`, {
      method: 'DELETE',
    }),
};

// ─── Foundry-G Workspaces / Salas (Sprint Foundry-G, 2026-05-22) ───────────

export interface Workspace {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  project_id: string | null;
  config: Record<string, unknown>;
  active: boolean;
  created_at: string;
  signed_hash: string | null;
  version: number;
}

export interface WorkspaceVersion {
  id: string;
  workspace_id: string;
  version_number: number;
  config_snapshot: Record<string, unknown>;
  signed_hash: string | null;
  published_at: string;
  published_by: string | null;
  message: string | null;
}

export const Workspaces = {
  list: (params?: { limit?: number; offset?: number; include_inactive?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.include_inactive) qs.set('include_inactive', 'true');
    const s = qs.toString();
    return apiFetch<Workspace[]>(`/workspaces${s ? '?' + s : ''}`);
  },
  get: (id: string) => apiFetch<Workspace>(`/workspaces/${id}`),
  getBySlug: (slug: string) =>
    apiFetch<Workspace>(`/workspaces/by-slug/${encodeURIComponent(slug)}`),
  create: (body: {
    slug: string;
    display_name: string;
    description?: string;
    project_id?: string;
    config?: Record<string, unknown>;
  }) => apiFetch<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  publish: (id: string, body: { config: Record<string, unknown>; message?: string }) =>
    apiFetch<Workspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  /**
   * Sprint L16 — POST /workspaces/{id}/config-yaml.
   * Persiste o Layout da Sala (Carbon schema) validado. Grava em
   * `config.carbon` preservando outras chaves do config; emite
   * LineageEvent `workspace.config_yaml.update` + publish normal.
   */
  publishCarbon: (
    id: string,
    body: { config: Record<string, unknown>; message?: string },
  ) =>
    apiFetch<Workspace>(`/workspaces/${id}/config-yaml`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/workspaces/${id}`, { method: 'DELETE' }),
  versions: {
    list: (id: string) =>
      apiFetch<WorkspaceVersion[]>(`/workspaces/${id}/versions`),
    get: (id: string, version: number) =>
      apiFetch<WorkspaceVersion>(`/workspaces/${id}/versions/${version}`),
    republish: (id: string, version: number, body?: { message?: string }) =>
      apiFetch<Workspace>(`/workspaces/${id}/versions/${version}/republish`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
  },
};

// ─── Sprint L16 — Carbon validator (Layout da Sala) ─────────────────────────

export interface CarbonValidateOut {
  ok: boolean;
  errors: { loc: string[]; msg: string; type: string }[];
  preview: {
    name: string;
    description: string | null;
    n_discoverable_modules: number;
    n_sections: number;
    sections: { title: string; displayAs: string; n_items: number }[];
    columns_total: number;
  } | null;
}

export interface CarbonTemplate {
  slug: string;
  display_name: string;
  description: string;
  config: Record<string, unknown>;
}

export interface CarbonApplyTemplateOut {
  ok: boolean;
  workspace_id: string;
  template_slug: string;
  config: Record<string, unknown>;
  // Wave G.1 — preenchido quando auto_publish=true.
  published_version?: number | null;
}

export const Carbon = {
  validate: (config: Record<string, unknown>) =>
    apiFetch<CarbonValidateOut>('/platform/v23/carbon/validate', {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),
  // Wave F.1 — full R2 schema endpoints.
  importYaml: (yaml_text: string) =>
    apiFetch<CarbonValidateOut>('/platform/v23/carbon/import-yaml', {
      method: 'POST',
      body: JSON.stringify({ yaml_text }),
    }),
  templates: () =>
    apiFetch<CarbonTemplate[]>('/platform/v23/carbon/templates'),
  // Wave G.1 — opts.auto_publish faz o backend chamar publish_workspace
  // imediatamente após o apply (bump version + LineageEvent).
  applyTemplate: (
    templateSlug: string,
    workspaceId: string,
    opts?: { message?: string; auto_publish?: boolean },
  ) =>
    apiFetch<CarbonApplyTemplateOut>(
      `/platform/v23/carbon/templates/${templateSlug}/apply/${workspaceId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: opts?.message ?? null,
          auto_publish: opts?.auto_publish ?? false,
        }),
      },
    ),
};

// ─── Wave D.2 — Marketplace produtos (já existia router; client agora) ─────

export interface MarketplaceProduct {
  id: string;
  slug: string;
  display_name: string;
  category: string | null;
  description: string | null;
  version: string;
  manifest: Record<string, unknown>;
  published: boolean;
  markings: string[];
  created_at: string | null;
}

export interface MarketplaceInstall {
  id: string;
  product_id: string;
  installed_version: string;
  status: string;
  notes: string | null;
  installed_at: string | null;
}

export const Marketplace = {
  list: (publishedOnly = false) => {
    const qs = publishedOnly ? '?published_only=true' : '';
    return apiFetch<MarketplaceProduct[]>(`/platform/v23/marketplace/products${qs}`);
  },
  install: (productId: string, notes?: string) =>
    apiFetch<MarketplaceInstall>(
      `/platform/v23/marketplace/products/${productId}/install`,
      { method: 'POST', body: JSON.stringify({ notes: notes ?? null }) },
    ),
  installs: () => apiFetch<MarketplaceInstall[]>('/platform/v23/marketplace/installs'),

  // Wave H.4.C (2026-05-23) — Loja Foundry-style endpoints.
  storefront: (opts?: {
    category?: string;
    sort?: 'popular' | 'recent' | 'top_rated';
    search?: string;
    tags?: string[];
  }) => {
    const q = new URLSearchParams();
    if (opts?.category) q.set('category', opts.category);
    if (opts?.sort) q.set('sort', opts.sort);
    if (opts?.search) q.set('search', opts.search);
    if (opts?.tags && opts.tags.length > 0) q.set('tags', opts.tags.join(','));
    const qs = q.toString();
    return apiFetch<MarketplaceProductRich[]>(
      `/platform/v23/marketplace${qs ? `?${qs}` : ''}`,
    );
  },
  details: (productId: string) =>
    apiFetch<MarketplaceProductDetail>(
      `/platform/v23/marketplace/${productId}/details`,
    ),
  installed: () =>
    apiFetch<MarketplaceInstall[]>('/platform/v23/marketplace/installed'),
  installWizard: (
    productId: string,
    body: {
      confirm_text: string;
      config?: Record<string, unknown>;
      notes?: string | null;
    },
  ) =>
    apiFetch<MarketplaceInstall>(
      `/platform/v23/marketplace/${productId}/install`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  uninstall: (installId: string) =>
    apiFetch<MarketplaceInstall>(
      `/platform/v23/marketplace/installs/${installId}/uninstall`,
      { method: 'POST' },
    ),
  seed: () =>
    apiFetch<MarketplaceProductRich[]>('/platform/v23/marketplace/seed', {
      method: 'POST',
    }),
  // Onda I.3 (2026-05-23) — contexto ontológico/datasource/módulos.
  ontologyImpact: (productId: string) =>
    apiFetch<MarketplaceOntologyImpact>(
      `/platform/v23/marketplace/${productId}/ontology-impact`,
    ),
  installPrecheck: (productId: string) =>
    apiFetch<MarketplaceInstallPreCheck>(
      `/platform/v23/marketplace/${productId}/install-precheck`,
    ),
  // Onda L.2 (2026-05-23) — histórico de versões publicadas (read-only),
  // ordenado desc pelo backend. Fecha a lacuna do detail pane que listava
  // só a versão corrente.
  versions: (productId: string) =>
    apiFetch<MarketplaceVersion[]>(
      `/platform/v23/marketplace/${productId}/versions`,
    ),
};

// Wave H.4.C — Loja types (extends MarketplaceProduct com metadata rica).
export interface MarketplaceProductRich extends MarketplaceProduct {
  thumbnail_url: string | null;
  author: string | null;
  tags: string[];
  rating: number;
  downloads_count: number;
  // Onda I.3 (2026-05-23) — contexto ontológico/datasource/módulos.
  usa_ontologia_tipos: MarketplaceOntologyType[];
  usa_datasources: MarketplaceDatasource[];
  requer_projeto: boolean;
  requer_espaco: boolean;
  modulos_dependentes: MarketplaceModuleDep[];
  interacao_descricao: string | null;
  outputs: MarketplaceOutput[];
  correlacao_widgets: string[];
  recursos_externos: MarketplaceExternalResource[];
}

export interface MarketplaceProductDetail extends MarketplaceProductRich {
  screenshots: string[];
  permissions_required: string[];
  // Onda I.3 — grafo computado: nodes/edges de modulos + recursos externos.
  dependency_graph: MarketplaceDependencyGraph;
}

// Onda I.3 — tipagens dos campos ricos do contexto.

export interface MarketplaceOntologyType {
  node_type: string;
  quantidade_aprox: number;
  descricao_uso: string;
}

export interface MarketplaceDatasource {
  nome: string;
  tipo: string; // postgres | minio | qdrant | redis | external_api | ...
  obrigatorio: boolean;
  observacoes: string;
}

export interface MarketplaceModuleDep {
  modulo: string;
  status: 'requerido' | 'opcional';
  motivo: string;
}

export interface MarketplaceOutput {
  tipo: string; // dashboard | alert | relatorio | ...
  descricao: string;
}

export interface MarketplaceExternalResource {
  tipo: string; // llm | sandbox | api
  nome: string;
  custo_aprox: string;
}

export interface MarketplaceDependencyGraph {
  nodes: Array<{
    id: string;
    kind: string; // product | modulo | recurso_externo
    label: string;
    status?: string;
    motivo?: string | null;
    custo_aprox?: string | null;
  }>;
  edges: Array<{ from: string; to: string; kind: string }>;
}

export interface MarketplaceOntologyImpact {
  novos_tipos: MarketplaceOntologyType[];
  tipos_reutilizados: MarketplaceOntologyType[];
  total_objetos_aprox: number;
  resumo: string;
}

export interface MarketplaceInstallGap {
  tipo: string; // modulo | projeto | espaco
  nome: string;
  status: string; // requerido | opcional
  motivo: string | null;
}

export interface MarketplaceInstallPreCheck {
  ok: boolean;
  gaps: MarketplaceInstallGap[];
}

// Onda L.2 (2026-05-23) — uma entrada do histórico de versões do produto.
export interface MarketplaceVersion {
  version: string;
  data: string | null;
  notas: string | null;
  autor: string | null;
  atual: boolean;
}

// ─── Wave D.2 — Styles configurator (Configurador de estilos) ───────────────

export interface StylesOut {
  tokens: Record<string, string>;
}

/**
 * M2 (2026-05-24) — marca PÚBLICA da tela /login. Só campos seguros.
 *
 * `login_use_default=true` ⇒ os campos refletem a marca AEGIS neutra (o
 * tenant optou por ocultar a própria marca no login).
 */
export interface PublicBrandOut {
  login_use_default: boolean;
  logo_url: string;
  slogan: string;
  primary_color: string;
  login_background: string | null;
  login_message: string | null;
  pwa_name: string;
  // Onda M3 (2026-05-24) — nome da empresa/unidade, exposto pré-login pra
  // montar o título da aba do navegador ({company_name} · {slogan}).
  company_name: string | null;
  // Ícone da aba do navegador (BrandOut.favicon_url), exposto pré-login
  // pra generateMetadata() poder aplicar o favicon do tenant. Opcional —
  // fixtures/mocks anteriores a esta onda não incluem o campo.
  favicon_url?: string | null;
}

export const Styles = {
  get: () => apiFetch<StylesOut>('/platform/v23/styles'),
  /**
   * M2 — marca pública pré-login. NÃO passa pelo proxy auth-gated
   * `/api/[...path]` (que exige cookie); usa a rota pública dedicada
   * `/api/styles/brand/public`. Sem credentials — anônimo por design.
   */
  getPublicBrand: async (): Promise<PublicBrandOut> => {
    const res = await fetch('/api/styles/brand/public', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`getPublicBrand ${res.status}`);
    }
    return (await res.json()) as PublicBrandOut;
  },
  update: (tokens: Record<string, string>, message?: string) =>
    apiFetch<StylesOut>('/platform/v23/styles', {
      method: 'PUT',
      body: JSON.stringify({ tokens, message: message ?? null }),
    }),
  // Wave G.3 — Layouts default template.
  getLayouts: () =>
    apiFetch<LayoutsOut>('/platform/v23/styles/layouts'),
  updateLayouts: (default_template: LayoutSlug, message?: string) =>
    apiFetch<LayoutsOut>('/platform/v23/styles/layouts', {
      method: 'PUT',
      body: JSON.stringify({ default_template, message: message ?? null }),
    }),
  // Wave G.3 — Global stylesheet.
  getGlobalStylesheet: () =>
    apiFetch<GlobalStylesheetOut>('/platform/v23/styles/global-stylesheet'),
  updateGlobalStylesheet: (
    css: string,
    enabled: boolean,
    message?: string,
  ) =>
    apiFetch<GlobalStylesheetOut>('/platform/v23/styles/global-stylesheet', {
      method: 'PUT',
      body: JSON.stringify({ css, enabled, message: message ?? null }),
    }),
  // Wave H.4.C (2026-05-23) — Marca.
  getBrand: () => apiFetch<BrandOut>('/platform/v23/styles/brand'),
  updateBrand: (body: BrandUpdate) =>
    apiFetch<BrandOut>('/platform/v23/styles/brand', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  // Wave H.4.C — Cores por região.
  getRegionColors: () =>
    apiFetch<RegionColorsOut>('/platform/v23/styles/region-colors'),
  updateRegionColors: (body: RegionColorsUpdate) =>
    apiFetch<RegionColorsOut>('/platform/v23/styles/region-colors', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  // Onda I.2 (Feedback #7) — defaults canônicos da marca.
  getBrandDefaults: () =>
    apiFetch<BrandDefaultsOut>('/platform/v23/styles/brand/defaults'),
  // Onda I.2 (Feedback #6) — presets de paleta por região.
  getRegionColorPresets: () =>
    apiFetch<RegionColorPresetsOut>('/platform/v23/styles/region-colors/presets'),
  // Wave H.4.C — Upload logo (multipart; passa pelo /api proxy).
  uploadLogo: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const url = `/api/platform/v23/styles/upload/logo`;
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`uploadLogo ${res.status}: ${text.slice(0, 500)}`);
    }
    return (await res.json()) as LogoUploadOut;
  },
};

// Wave H.4.C — Marca + Cores por região types.
export interface BrandOut {
  // Onda M3 (2026-05-24) — nome operacional da empresa/unidade (ex.: "Safe
  // Core"). Distinto de pwa_name (nome do app instalável). Alimenta o título
  // da aba do navegador.
  company_name: string | null;
  logo_url: string | null;
  // Onda brand2 (2026-07-09) — logo para superfícies ESCURAS (cabeçalho +
  // sidenav operacional). `logo_url` é a primária (superfície clara). Ver
  // BrandOut no backend styles.py pro racional (dois assets > invert toggle).
  logo_dark_url: string | null;
  slogan: string | null;
  primary_color: string | null;
  favicon_url: string | null;
  pwa_name: string | null;
  pwa_short_name: string | null;
}

export interface BrandUpdate {
  company_name?: string | null;
  logo_url?: string | null;
  logo_dark_url?: string | null;
  slogan?: string | null;
  primary_color?: string | null;
  favicon_url?: string | null;
  pwa_name?: string | null;
  pwa_short_name?: string | null;
  message?: string;
}

export interface RegionColorsOut {
  banner: Record<string, string>;
  sidenav: Record<string, string>;
  navbar: Record<string, string>;
  footer: Record<string, string>;
  comunicados: Record<string, string>;
  backdrop: Record<string, string>;
}

export type RegionColorsUpdate = Partial<RegionColorsOut> & { message?: string };

// Onda I.2 (2026-05-23) — Defaults canônicos da Marca + presets por região.

export interface BrandDefaultsOut {
  company_name_default: string;
  logo_default_url: string;
  logo_dark_default_url: string;
  slogan_default: string;
  primary_color_default: string;
  favicon_default: string;
  pwa_name: string;
  pwa_short_name: string;
}

export interface RegionColorPresetOut {
  key: string;
  label: string;
  description: string;
  colors: RegionColorsOut;
}

export interface RegionColorPresetsOut {
  presets: RegionColorPresetOut[];
}

export interface LogoUploadOut {
  storage_ref: string;
  url: string;
  filename: string;
  content_type: string;
  bytes: number;
  sha256: string;
}

// Wave G.3 — Layouts + Global Stylesheet (Configurador de estilos).
export type LayoutSlug =
  | 'sidebar-canvas-inspector'
  | 'single-pane'
  | 'two-col'
  | 'three-col'
  | 'tabbed';

export interface LayoutTemplate {
  slug: LayoutSlug;
  label: string;
  description: string;
}

export interface LayoutsOut {
  default_template: LayoutSlug | null;
  available: LayoutTemplate[];
}

export interface GlobalStylesheetOut {
  css: string;
  enabled: boolean;
  updated_at: string | null;
}

// ─── Wave E.1 — App Shell configurator (Layout do App) ──────────────────────

export interface AppShellHomepageItem {
  kind?: string;
  ref?: string | null;
  label: string;
  icon?: string | null;
}

export interface AppShellHomepageSection {
  title: string;
  displayAs?: 'grid' | 'list' | 'tiles';
  items: AppShellHomepageItem[];
}

export interface AppShellNavbarItem {
  label: string;
  href: string;
  icon?: string | null;
  position?: 'left' | 'right';
}

/**
 * Onda M1.a (#4) — config do campo de busca do cabeçalho. Define o SHAPE
 * consumido pelo header (a renderização efetiva fica a cargo do agente de
 * render):
 *   - placeholder: texto-guia do input de busca global.
 *   - compact: quando true, o header pode colapsar a busca em um ícone que
 *     expande ao foco (telas estreitas / barra densa).
 */
export interface AppShellNavbarSearchConfig {
  placeholder: string;
  compact: boolean;
}

export interface AppShellSidenavItem {
  label: string;
  href: string;
  icon?: string | null;
  perm_key?: string | null;
}

export interface AppShellSidenavSection {
  title: string;
  items: AppShellSidenavItem[];
}

export interface AppShellFooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface AppShellFooterColumn {
  title: string;
  links: AppShellFooterLink[];
}

// Wave F.1 — R2 extras/marketplace.md
// Onda I.5 (2026-05-23) — apps_menu refina a aba "Loja de apps" do
// composer do shell. Cada item instalado pode aparecer no menu Apps do
// header, no sidenav global ou ser ocultado.
export type AppShellAppMenuPosition = 'menu' | 'sidenav' | 'hidden';

export interface AppShellAppMenuItem {
  product_id: string;
  position: AppShellAppMenuPosition;
  order: number;
}

export interface AppShellAppsMenuConfig {
  /** Mostrar o menu Apps no header (botão drop-down). */
  enabled: boolean;
  items: AppShellAppMenuItem[];
}

export interface AppShellMarketplaceConfig {
  enabled_app_slugs: string[];
  /** Onda I.5 — refinamento da aba Loja de apps. */
  apps_menu?: AppShellAppsMenuConfig;
}

// Wave F.1 — R2 permissions/landing-page.md
export interface AppShellLandingPageOverride {
  group_id: string;
  url: string;
}

// Wave F.1 — R2 permissions/{default-workspace,landing-page}.md
export interface AppShellPermissionsDefaults {
  default_workspace_id: string | null;
  landing_page_overrides: AppShellLandingPageOverride[];
}

// ── Wave H.4.Y — Extended sections ───────────────────────────────────────

export type AppShellBannerPosition = 'top' | 'bottom';

/**
 * Onda K.4 (Feedback #3) — slots de contexto dinâmico do banner.
 * Cada flag decide se o slot aparece na barra de contexto viva.
 */
export interface AppShellBannerContextSlots {
  organization: boolean;
  space: boolean;
  project: boolean;
  classification: boolean;
}

/**
 * Onda M1.a (#11) — política de truncamento dos slots do banner.
 * Define o SHAPE consumido pelo classification-banner (a renderização
 * efetiva fica a cargo do agente de render). Defaults seguros mantêm
 * o banner em uma linha mesmo com contexto longo:
 *   - enabled: liga/desliga o truncamento por slot.
 *   - max_chars_per_slot: corte máximo por slot (org/espaço/operação/texto).
 *   - responsive: encolhe o limite em telas estreitas quando true.
 */
export interface AppShellBannerTruncateConfig {
  enabled: boolean;
  max_chars_per_slot: number;
  responsive: boolean;
}

export interface AppShellBannerConfig {
  visible: boolean;
  // Onda K.4 (Feedback #3) — legacy; consolidado em `custom_text`. A UI
  // não edita mais este campo (eram duplicados). Mantido só p/ leitura.
  subtitle?: string | null;
  // Wave H.4.Y
  enabled: boolean;
  classification_default?: string | null;
  custom_text?: string | null;
  bg?: string | null;
  text?: string | null;
  position: AppShellBannerPosition;
  show_clock: boolean;
  show_timezone: boolean;
  dismissible: boolean;
  // Onda K.4 (Feedback #3) — contexto dinâmico (org/espaço/operação) +
  // botão "Trocar" (reusa o Context Switcher existente).
  context_slots?: AppShellBannerContextSlots;
  show_context_switcher?: boolean;
  // Onda M1.a (#11) — política de truncamento dos slots (shape para o
  // classification-banner consumir; render é de outro agente).
  truncate?: AppShellBannerTruncateConfig;
}

export type AppShellFooterItemType = 'system' | 'custom';
export type AppShellFooterItemPosition = 'left' | 'center' | 'right';

export interface AppShellFooterStatusItem {
  key: string;
  label: string;
  icon?: string | null;
  type: AppShellFooterItemType;
  value?: string | null;
  href?: string | null;
  position: AppShellFooterItemPosition;
}

export interface AppShellFooterConfig {
  visible: boolean;
  columns: AppShellFooterColumn[];
  status_bar_items: AppShellFooterStatusItem[];
  copyright_text?: string | null;
  version_visible: boolean;
}

export type AppShellUserMenuItemKind = 'link' | 'divider' | 'logout';

export interface AppShellUserMenuItem {
  key: string;
  label: string;
  icon?: string | null;
  href?: string | null;
  kind: AppShellUserMenuItemKind;
  visible: boolean;
}

export interface AppShellUserMenuConfig {
  items: AppShellUserMenuItem[];
}

export interface AppShellSidenavGroupItem {
  key: string;
  label: string;
  icon?: string | null;
  href: string;
  perm_required?: string | null;
  badge?: string | null;
}

export interface AppShellSidenavGroup {
  key: string;
  label: string;
  collapsed_by_default: boolean;
  items: AppShellSidenavGroupItem[];
}

export interface AppShellSidenavConfig {
  style?: 'default' | 'compact' | 'expanded';
  sections: AppShellSidenavSection[];
  // Wave H.4.Y
  groups: AppShellSidenavGroup[];
  width_px: number;
  dense: boolean;
  footer_link?: string | null;
}

export interface AppShellHomepageConfig {
  logo?: string | null;
  hero_text?: string | null;
  sections: AppShellHomepageSection[];
  // Onda J.1 — slug da Página (Registro de Páginas) usada como inicial.
  // null = Home padrão (seed). Resolve em `/` via WorkshopV2Renderer.
  // (O editor de "blocos rápidos" de 4 tipos foi removido nesta onda;
  // a Página inicial é editada no editor de Páginas / Workshop.)
  page_id?: string | null;
}

export interface AppShellConfig {
  homepage: AppShellHomepageConfig;
  navbar: {
    logo?: string | null;
    items: AppShellNavbarItem[];
    // Onda M1.a (#4) — config do campo de busca do header (shape para o
    // header consumir; render é de outro agente).
    search?: AppShellNavbarSearchConfig;
  };
  sidenav: AppShellSidenavConfig;
  footer: AppShellFooterConfig;
  banner: AppShellBannerConfig;
  context_switcher: {
    visible: boolean;
    default_scope?: 'org' | 'tenant' | 'personal';
    show_promoted_workspaces: boolean;
  };
  theme: 'light' | 'dark';
  // Wave F.1 — R2 extensions
  marketplace?: AppShellMarketplaceConfig;
  permissions?: AppShellPermissionsDefaults;
  // Wave H.4.Y
  user_menu: AppShellUserMenuConfig;
  // M2 (2026-05-24) — personalização da tela /login.
  login?: AppShellLoginConfig;
}

/**
 * M2 (2026-05-24) — bloco de personalização da tela /login.
 *
 * `use_default_aegis=true` ⇒ /login mostra a marca AEGIS neutra. `false` ⇒
 * aplica o logo/slogan/cor/fundo/mensagem do tenant. Persistido no
 * app_shell config (me/tenant scoped) e lido pelo endpoint público
 * `GET /platform/v23/styles/brand/public` pré-login.
 */
export interface AppShellLoginConfig {
  use_default_aegis: boolean;
  logo_url?: string | null;
  slogan?: string | null;
  background?: string | null;
  primary_color?: string | null;
  message?: string | null;
}

export interface AppShellEnvelope {
  config: AppShellConfig;
  source: 'user' | 'tenant' | 'default';
}

export const AppShell = {
  getMe: () => apiFetch<AppShellEnvelope>('/platform/v23/app-shell/me'),
  putMe: (config: AppShellConfig) =>
    apiFetch<AppShellEnvelope>('/platform/v23/app-shell/me', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getTenant: () => apiFetch<AppShellEnvelope>('/platform/v23/app-shell/tenant'),
  putTenant: (config: AppShellConfig) =>
    apiFetch<AppShellEnvelope>('/platform/v23/app-shell/tenant', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  // Onda K.4 (Feedback #2) — "Restaurar padrão". section='all' apaga o
  // override do escopo; section específica reseta só aquela seção.
  reset: (opts?: {
    scope?: 'me' | 'tenant';
    section?: 'banner' | 'footer' | 'user_menu' | 'sidenav' | 'homepage' | 'all';
  }) =>
    apiFetch<AppShellEnvelope>('/platform/v23/app-shell/reset', {
      method: 'POST',
      body: JSON.stringify({
        scope: opts?.scope ?? 'me',
        section: opts?.section ?? 'all',
      }),
    }),
  // Wave H.4.Y — per-section endpoints
  banner: {
    get: () => apiFetch<AppShellBannerConfig>('/platform/v23/app-shell/banner'),
    put: (cfg: AppShellBannerConfig) =>
      apiFetch<AppShellBannerConfig>('/platform/v23/app-shell/banner', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
  },
  footer: {
    get: () => apiFetch<AppShellFooterConfig>('/platform/v23/app-shell/footer'),
    put: (cfg: AppShellFooterConfig) =>
      apiFetch<AppShellFooterConfig>('/platform/v23/app-shell/footer', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
  },
  userMenu: {
    get: () => apiFetch<AppShellUserMenuConfig>('/platform/v23/app-shell/user-menu'),
    put: (cfg: AppShellUserMenuConfig) =>
      apiFetch<AppShellUserMenuConfig>('/platform/v23/app-shell/user-menu', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
  },
  sidenav: {
    get: () => apiFetch<AppShellSidenavConfig>('/platform/v23/app-shell/sidenav'),
    put: (cfg: AppShellSidenavConfig) =>
      apiFetch<AppShellSidenavConfig>('/platform/v23/app-shell/sidenav', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
  },
  homepage: {
    get: () => apiFetch<AppShellHomepageConfig>('/platform/v23/app-shell/homepage'),
    put: (cfg: AppShellHomepageConfig) =>
      apiFetch<AppShellHomepageConfig>('/platform/v23/app-shell/homepage', {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
  },
};

// ─── Wave H.4.B — Comunicados (banners globais agendados) ──────────────────

export type ComunicadoKind = 'info' | 'warning' | 'danger' | 'success';

export interface ComunicadoOut {
  id: string;
  tenant_id: string;
  kind: ComunicadoKind;
  title: string;
  body: string;
  icon: string | null;
  closable: boolean;
  duration_s: number;
  audience_roles: string[] | null;
  audience_iam_perms: string[] | null;
  audience_groups: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days_of_week: number[] | null;
  cta_label: string | null;
  cta_href: string | null;
  created_at: string;
  created_by_user_id: string | null;
  deleted_at?: string | null;
}

export interface ComunicadoCreate {
  kind: ComunicadoKind;
  title: string;
  body?: string;
  icon?: string | null;
  closable?: boolean;
  duration_s?: number;
  audience_roles?: string[] | null;
  audience_iam_perms?: string[] | null;
  audience_groups?: string[] | null;
  schedule_start?: string | null;
  schedule_end?: string | null;
  schedule_days_of_week?: number[] | null;
  cta_label?: string | null;
  cta_href?: string | null;
}

export const Comunicados = {
  list: (params?: {
    kind?: ComunicadoKind;
    status_temporal?: 'active' | 'future' | 'past' | 'all';
    include_deleted?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.status_temporal) qs.set('status_temporal', params.status_temporal);
    if (params?.include_deleted) qs.set('include_deleted', 'true');
    const s = qs.toString();
    return apiFetch<ComunicadoOut[]>(
      `/platform/v23/comunicados${s ? '?' + s : ''}`,
    );
  },
  active: () =>
    apiFetch<ComunicadoOut[]>('/platform/v23/comunicados/active'),
  // Wave L.8 — push (quase) real-time via SSE. EventSource não passa pelo
  // apiFetch (que é JSON-only); o consumidor abre o EventSource direto nessa
  // URL absoluta de proxy (`/api` injeta o Bearer do cookie httpOnly).
  streamUrl: `${API_BASE}/platform/v23/comunicados/stream`,
  create: (body: ComunicadoCreate) =>
    apiFetch<ComunicadoOut>('/platform/v23/comunicados', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patch: (id: string, body: Partial<ComunicadoCreate>) =>
    apiFetch<ComunicadoOut>(`/platform/v23/comunicados/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/platform/v23/comunicados/${id}`, { method: 'DELETE' }),
  dismissMe: (id: string) =>
    apiFetch<void>(`/platform/v23/comunicados/${id}/dismiss/me`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

// ─── Onda L.6 — IAM Groups (Foundry Groups parity) ──────────────────────────

export interface Group {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  member_count: number;
  created_at: string;
  created_by: string | null;
}

export interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  added_at: string;
}

// W6 — "Grupo concede acesso": papéis (RBAC) concedidos a um grupo. Cada
// membro herda o fecho de permissões do papel. role_ids vêm do catálogo
// (dropdown) — nunca slug/ID digitado.
export interface GroupRoleRef {
  role_id: string;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  priority: number;
}

export const Groups = {
  list: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const s = qs.toString();
    return apiFetch<Group[]>(`/iam/groups${s ? '?' + s : ''}`);
  },
  get: (id: string) => apiFetch<Group>(`/iam/groups/${id}`),
  create: (body: { name: string; description?: string }) =>
    apiFetch<Group>('/iam/groups', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; description?: string }) =>
    apiFetch<Group>(`/iam/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/iam/groups/${id}`, { method: 'DELETE' }),
  members: {
    list: (groupId: string) =>
      apiFetch<GroupMember[]>(`/iam/groups/${groupId}/members`),
    add: (groupId: string, userId: string) =>
      apiFetch<GroupMember>(`/iam/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    remove: (groupId: string, userId: string) =>
      apiFetch<void>(`/iam/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
      }),
  },
  forUser: (userId: string) =>
    apiFetch<Group[]>(`/iam/users/${userId}/groups`),
  // W6 — papéis concedidos ao grupo (Grupo concede acesso). `replace` exige
  // iam.roles.write no backend (autoridade de atribuição de papel).
  roles: {
    list: (groupId: string) =>
      apiFetch<GroupRoleRef[]>(`/iam/groups/${groupId}/roles`),
    replace: (groupId: string, roleIds: string[]) =>
      apiFetch<GroupRoleRef[]>(`/iam/groups/${groupId}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ role_ids: roleIds }),
      }),
  },
};

// ─── Sprint L17 — Links recursive (BFS no servidor) ─────────────────────────

export interface LinksTraversedNode {
  id: string;
  name: string;
  node_type: string;
  depth: number;
}

export interface LinksTraversedEdge {
  source_id: string;
  target_id: string;
  relation_type: string;
  depth: number;
}

export interface LinksTraversalOut {
  root_id: string;
  direction: 'upstream' | 'downstream' | 'neighbors';
  max_depth: number;
  truncated: boolean;
  nodes: LinksTraversedNode[];
  edges: LinksTraversedEdge[];
}

export interface LinksResolveOut {
  prefixed_id: string;
  kind: 'asset' | 'action' | 'node' | 'unknown';
  raw_id: string;
  ontology_node_id: string | null;
  reason: string | null;
}

export const Links = {
  resolve: (prefixed_id: string) =>
    apiFetch<LinksResolveOut>('/platform/v23/links/_resolve', {
      method: 'POST',
      body: JSON.stringify({ prefixed_id }),
    }),
  upstream: (
    nodeId: string,
    params?: { max_depth?: number; max_nodes?: number; relation_type?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.max_depth) qs.set('max_depth', String(params.max_depth));
    if (params?.max_nodes) qs.set('max_nodes', String(params.max_nodes));
    if (params?.relation_type) qs.set('relation_type', params.relation_type);
    const s = qs.toString();
    return apiFetch<LinksTraversalOut>(
      `/platform/v23/links/${encodeURIComponent(nodeId)}/upstream${s ? '?' + s : ''}`,
    );
  },
  downstream: (
    nodeId: string,
    params?: { max_depth?: number; max_nodes?: number; relation_type?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.max_depth) qs.set('max_depth', String(params.max_depth));
    if (params?.max_nodes) qs.set('max_nodes', String(params.max_nodes));
    if (params?.relation_type) qs.set('relation_type', params.relation_type);
    const s = qs.toString();
    return apiFetch<LinksTraversalOut>(
      `/platform/v23/links/${encodeURIComponent(nodeId)}/downstream${s ? '?' + s : ''}`,
    );
  },
  neighbors: (
    nodeId: string,
    params?: { max_depth?: number; max_nodes?: number; relation_type?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.max_depth) qs.set('max_depth', String(params.max_depth));
    if (params?.max_nodes) qs.set('max_nodes', String(params.max_nodes));
    if (params?.relation_type) qs.set('relation_type', params.relation_type);
    const s = qs.toString();
    return apiFetch<LinksTraversalOut>(
      `/platform/v23/links/${encodeURIComponent(nodeId)}/neighbors${s ? '?' + s : ''}`,
    );
  },
};

// ─── Foundry-F Property Markings (Sprint Foundry-F, 2026-05-22) ────────────

export interface PropertyMarkingItem {
  marking_id: string;
  marking_slug: string;
  marking_display_name: string;
  applied_at: string;
}

// ─── Foundry-H Tours / WorkspaceUpdate (Sprint Foundry-H, 2026-05-22) ──────

export interface WorkspaceUpdatePage {
  id: string;
  workspace_update_id: string;
  ordering: number;
  title: string;
  description: string | null;
  media_url: string | null;
  documentation_url: string | null;
  /** Wave H.1 (2026-05-23) — CSS selector pra spotlight. */
  target_selector?: string | null;
}

export interface WorkspaceUpdate {
  id: string;
  workspace_id: string;
  title: string;
  summary: string | null;
  ordering: number;
  status: 'active' | 'archived';
  created_at: string;
  archived_at: string | null;
  pages: WorkspaceUpdatePage[];
  /** Wave H.1 (2026-05-23) — filtros de público (role/group). */
  audience?: TourAudience | null;
  /** Wave H.1 — gatilho (datas + páginas alvo). */
  trigger?: TourTrigger | null;
}

export interface TourAudience {
  roles?: string[];
  groups?: string[];
}

export interface TourTrigger {
  /** ISO-8601 (inclusive) — null = sem data de início. */
  start_at?: string | null;
  /** ISO-8601 (exclusive) — null = sem data de término. */
  end_at?: string | null;
  /** Pathnames onde o tour deve aparecer (prefix match). Vazio = todas. */
  target_pages?: string[];
}

export interface TourPageInput {
  title: string;
  description?: string;
  media_url?: string;
  documentation_url?: string;
  /** Wave H.1 — selector CSS opcional pra highlight (driver.js-style). */
  target_selector?: string;
  ordering?: number;
}

export interface TourViewCount {
  viewed: number;
  total_eligible: number;
}

export interface TourEligibleUser {
  id: string;
  username: string;
  display_name: string | null;
  viewed: boolean;
  viewed_at: string | null;
}

// ─── Foundry-I Workspace navigation policy (Sprint Foundry-I, 2026-05-22) ───

export interface WorkspaceNavigationPolicy {
  workspace_id: string;
  navigate_out_allowed: boolean;
  allowed_applications: string[];
  version: number;
}

export interface KnownApplication {
  /** Identificador estável da aplicação (= slug da Página registrada). */
  slug: string;
  /** Rótulo exibido no seletor + barra de contexto. */
  label: string;
  /** Rota base servida pela aplicação (ex: `/buscar`, `/mapa`). */
  route: string;
}

/**
 * Onda L.4 — fallback estático.
 *
 * Mantido para boot offline / testes; a fonte canônica é
 * {@link deriveKnownApplications} sobre {@link Pages.list}. O viewer e o
 * dialog de Navegação consomem a lista derivada das rotas reais; este
 * array só entra em cena quando a derivação falha.
 *
 * NÃO é mais a fonte única (Memory: feedback_no_manual_technical_input —
 * apps via seletor de itens conhecidos, derivados das rotas reais).
 */
export const KNOWN_APPLICATIONS: KnownApplication[] = [
  { slug: 'inicio', label: 'Início', route: '/' },
  { slug: 'buscar', label: 'Buscar', route: '/buscar' },
  { slug: 'mapa', label: 'Mapa', route: '/mapa' },
  { slug: 'cameras', label: 'Câmeras', route: '/cameras' },
  { slug: 'analise', label: 'Análise', route: '/analise' },
  { slug: 'explorador', label: 'Explorador', route: '/explorador' },
  { slug: 'rede', label: 'Rede', route: '/rede' },
  { slug: 'conteudo', label: 'Conteúdo', route: '/conteudo' },
  { slug: 'alertas', label: 'Alertas', route: '/alertas' },
  { slug: 'relatorios', label: 'Relatórios', route: '/relatorios' },
  { slug: 'briefings', label: 'Briefings', route: '/briefings' },
  { slug: 'documentacao', label: 'Documentação', route: '/docs' },
  { slug: 'workshop', label: 'Workshop', route: '/workshop' },
];

/**
 * Onda L.4 — deriva as aplicações conhecidas das Páginas registradas
 * (rotas reais da app), não de uma const estática. Alimenta tanto o
 * seletor de whitelist (editor da Sala) quanto a barra de contexto e o
 * interceptor de navegação (viewer).
 *
 * Exclui a própria rota dinâmica da Sala (`/sala/[slug]`) — uma Sala não
 * é uma "aplicação permitida" navegável a partir de outra Sala via esta
 * policy; Salas em destaque têm o seu próprio menu.
 *
 * Em caso de falha (offline/perm), cai no fallback estático.
 */
export async function deriveKnownApplications(): Promise<KnownApplication[]> {
  try {
    const pages = await Pages.list();
    const apps = pages
      .filter((p) => !p.route.includes('[') && p.slug !== 'sala')
      .map((p) => ({ slug: p.slug, label: p.title, route: p.route }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    return apps.length > 0 ? apps : KNOWN_APPLICATIONS;
  } catch {
    return KNOWN_APPLICATIONS;
  }
}

/**
 * Onda L.4 — resolve a rota/href de um destino de navegação para o slug
 * da aplicação conhecida. Casa por prefixo de rota (mais longo primeiro)
 * para que `/painel-de-controle/salas` resolva para a app `painel` se
 * existir. Retorna `null` quando o destino não corresponde a nenhuma app
 * conhecida (tratado como navegação externa/fora do catálogo).
 *
 * Pura — sem DOM. Aceita tanto path interno (`/mapa`) quanto URL absoluta.
 */
export function resolveApplicationForHref(
  href: string,
  knownApps: KnownApplication[],
): KnownApplication | null {
  if (!href) return null;
  let path = href;
  // URL absoluta → extrai o pathname; host externo é tratado como sem-match.
  if (/^https?:\/\//i.test(href)) {
    try {
      const u = new URL(href);
      if (
        typeof window !== 'undefined' &&
        u.origin !== window.location.origin
      ) {
        return null; // host externo: não é app conhecida
      }
      path = u.pathname;
    } catch {
      return null;
    }
  }
  // Ignora âncoras, mailto, tel, etc.
  if (!path.startsWith('/')) return null;
  // Normaliza trailing slash (exceto raiz).
  const norm = path.length > 1 ? path.replace(/\/+$/, '') : path;
  // Casa pela rota mais longa primeiro; raiz (`/`) só casa exata.
  const byLongest = [...knownApps].sort(
    (a, b) => b.route.length - a.route.length,
  );
  for (const app of byLongest) {
    const r = app.route;
    if (r === '/') {
      if (norm === '/') return app;
      continue;
    }
    if (norm === r || norm.startsWith(r + '/')) return app;
  }
  return null;
}

export type NavigationDecision = 'allow' | 'new_tab' | 'block';

/**
 * Onda L.4 — decisão pura de enforcement de navegação para um destino,
 * dado a policy da Sala e o catálogo de apps conhecidas.
 *
 * Regras (espelham restrict-navigation.md + o texto do dialog):
 *  - Destino que resolve para uma app PERMITIDA → `allow` (navegação
 *    interna à Sala permanece ativa).
 *  - Whitelist ativa (não-vazia) + destino que resolve para app
 *    CONHECIDA mas FORA da whitelist → `block` (é navegação interna
 *    restrita; bloquear in-place com aviso).
 *  - Destino FORA do catálogo (link externo / rota desconhecida):
 *      · `navigate_out_allowed=true`  → `allow`
 *      · `navigate_out_allowed=false` → `new_tab` (abre em nova aba para
 *        preservar a sessão da Sala — comportamento documentado).
 */
export function decideNavigation(
  href: string,
  policy: { navigate_out_allowed: boolean; allowed_applications: string[] },
  knownApps: KnownApplication[],
): NavigationDecision {
  const app = resolveApplicationForHref(href, knownApps);
  const allowlist = policy.allowed_applications ?? [];
  const whitelistActive = allowlist.length > 0;

  if (app) {
    // Destino é uma aplicação conhecida (navegação interna).
    if (!whitelistActive) return 'allow';
    return allowlist.includes(app.slug) ? 'allow' : 'block';
  }

  // Destino fora do catálogo conhecido → navegação externa.
  if (policy.navigate_out_allowed) return 'allow';
  return 'new_tab';
}

// ─── Foundry-J Sala em destaque / Promotion (Sprint Foundry-J, 2026-05-22) ───

export interface WorkspacePromotion {
  id: string;
  workspace_id: string;
  organization_id: string;
  ordering: number;
  promoted_at: string;
  promoted_by: string | null;
}

export interface PromotedWorkspace {
  workspace_id: string;
  workspace_slug: string;
  workspace_display_name: string;
  workspace_version: number;
  ordering: number;
  promoted_at: string;
}

export const WorkspacePromotions = {
  list: (workspaceId: string) =>
    apiFetch<WorkspacePromotion[]>(`/workspaces/${workspaceId}/promotions`),
  promote: (
    workspaceId: string,
    body: { organization_id: string; ordering?: number },
  ) =>
    apiFetch<WorkspacePromotion>(`/workspaces/${workspaceId}/promotions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  unpromote: (workspaceId: string, organizationId: string) =>
    apiFetch<void>(`/workspaces/${workspaceId}/promotions/${organizationId}`, {
      method: 'DELETE',
    }),
  listForOrganization: (organizationId: string) =>
    apiFetch<PromotedWorkspace[]>(
      `/organizations/${organizationId}/promoted-workspaces`,
    ),
};

// ─── Foundry-K Modo Apresentação / Kiosk (Sprint Foundry-K, 2026-05-22) ────

export interface KioskConfig {
  workspace_id: string;
  hide_chrome: boolean;
  allow_exit: boolean;
  auto_fullscreen: boolean;
  /** Wave H.1 (2026-05-23) — permite drilldown/filtros read-only durante apresentação. */
  allow_read_interaction: boolean;
  /** Wave H.1 — auto-rotate seções a cada slide_interval_seconds. */
  slide_loop: boolean;
  /** Wave H.1 — segundos entre auto-advances (mín 5, máx 600). */
  slide_interval_seconds: number;
  version: number;
  active_sessions_count: number;
}

export interface KioskSession {
  id: string;
  workspace_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  client_info: Record<string, unknown>;
  /** Wave H.1 — snapshot da config no momento do start (histórico legível). */
  config_snapshot?: Record<string, unknown> | null;
  /** Wave H.1 — derivado server-side. */
  duration_seconds?: number | null;
}

export const WorkspaceKiosk = {
  get: (workspaceId: string) =>
    apiFetch<KioskConfig>(`/workspaces/${workspaceId}/kiosk`),
  set: (
    workspaceId: string,
    body: {
      hide_chrome: boolean;
      allow_exit: boolean;
      auto_fullscreen: boolean;
      allow_read_interaction?: boolean;
      slide_loop?: boolean;
      slide_interval_seconds?: number;
      message?: string;
    },
  ) =>
    apiFetch<KioskConfig>(`/workspaces/${workspaceId}/kiosk`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  startSession: (
    workspaceId: string,
    body?: { client_info?: Record<string, unknown> },
  ) =>
    apiFetch<KioskSession>(`/workspaces/${workspaceId}/kiosk/sessions`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  listSessions: (
    workspaceId: string,
    opts?: { active_only?: boolean; limit?: number; offset?: number },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.active_only) qs.set('active_only', 'true');
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.offset) qs.set('offset', String(opts.offset));
    const s = qs.toString();
    return apiFetch<KioskSession[]>(
      `/workspaces/${workspaceId}/kiosk/sessions${s ? '?' + s : ''}`,
    );
  },
  endSession: (workspaceId: string, sessionId: string) =>
    apiFetch<KioskSession>(
      `/workspaces/${workspaceId}/kiosk/sessions/${sessionId}/end`,
      { method: 'POST' },
    ),
  /** Wave H.1 (2026-05-23) — encerra todas as sessões ativas da Sala. */
  endAllSessions: (workspaceId: string, body?: { reason?: string }) =>
    apiFetch<{ ended: number }>(
      `/workspaces/${workspaceId}/kiosk/sessions/end_all`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
    ),
};

export const WorkspaceNavigation = {
  get: (workspaceId: string) =>
    apiFetch<WorkspaceNavigationPolicy>(`/workspaces/${workspaceId}/navigation`),
  set: (
    workspaceId: string,
    body: {
      navigate_out_allowed: boolean;
      allowed_applications: string[];
      message?: string;
    },
  ) =>
    apiFetch<WorkspaceNavigationPolicy>(`/workspaces/${workspaceId}/navigation`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

export const WorkspaceUpdates = {
  list: (workspaceId: string, opts?: { include_archived?: boolean }) => {
    const qs = opts?.include_archived ? '?include_archived=true' : '';
    return apiFetch<WorkspaceUpdate[]>(`/workspaces/${workspaceId}/updates${qs}`);
  },
  listUnseen: (workspaceId: string) =>
    apiFetch<WorkspaceUpdate[]>(`/workspaces/${workspaceId}/updates/unseen`),
  get: (workspaceId: string, updateId: string) =>
    apiFetch<WorkspaceUpdate>(`/workspaces/${workspaceId}/updates/${updateId}`),
  create: (
    workspaceId: string,
    body: {
      title: string;
      summary?: string;
      pages: TourPageInput[];
      audience?: TourAudience;
      trigger?: TourTrigger;
    },
  ) =>
    apiFetch<WorkspaceUpdate>(`/workspaces/${workspaceId}/updates`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patch: (
    workspaceId: string,
    updateId: string,
    body: {
      title?: string;
      summary?: string;
      pages?: TourPageInput[];
      audience?: TourAudience;
      trigger?: TourTrigger;
    },
  ) =>
    apiFetch<WorkspaceUpdate>(`/workspaces/${workspaceId}/updates/${updateId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  archive: (workspaceId: string, updateId: string) =>
    apiFetch<WorkspaceUpdate>(`/workspaces/${workspaceId}/updates/${updateId}/archive`, {
      method: 'POST',
    }),
  delete: (workspaceId: string, updateId: string) =>
    apiFetch<void>(`/workspaces/${workspaceId}/updates/${updateId}`, {
      method: 'DELETE',
    }),
  markSeen: (workspaceId: string, updateId: string, body?: { dismissed?: boolean }) =>
    apiFetch<void>(`/workspaces/${workspaceId}/updates/${updateId}/seen`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  /** Wave H.1 (2026-05-23) — quantos operadores já viram este Tour. */
  viewCount: (workspaceId: string, updateId: string) =>
    apiFetch<TourViewCount>(
      `/workspaces/${workspaceId}/updates/${updateId}/view-count`,
    ),
  /** Wave H.1 — lista usuários elegíveis (audience) + flag viewed. */
  eligibleUsers: (workspaceId: string, updateId: string) =>
    apiFetch<TourEligibleUser[]>(
      `/workspaces/${workspaceId}/updates/${updateId}/eligible-users`,
    ),
};

// ─── UX-1.3 · Ontology node search (Sprint UX-1.3, 2026-05-22) ─────────────

export interface OntologyNodeSearchItem {
  id: string;
  name: string;
  node_type: string;
  description: string | null;
  property_keys: string[];
}

export const OntologyNodes = {
  search: (params?: { q?: string; node_type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.node_type) qs.set('node_type', params.node_type);
    if (params?.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    return apiFetch<OntologyNodeSearchItem[]>(
      `/ontology/node-search${s ? '?' + s : ''}`,
    );
  },
  properties: (nodeId: string) =>
    apiFetch<string[]>(`/ontology/nodes/${nodeId}/properties`),
};

export interface BulkMarkingResult {
  applied: number;
  skipped: number;
  failed: { node_id: string; reason: string }[];
}

export interface MarkingCoverageRow {
  node_type: string;
  total_nodes: number;
  marked_nodes: number;
  coverage_pct: number;
}

export interface MarkingCoverageOut {
  marking_id: string;
  marking_slug: string;
  rows: MarkingCoverageRow[];
  total_nodes: number;
  total_marked: number;
}

export const PropertyMarkings = {
  /** Map of {property_key: PropertyMarkingItem[]} for a whole node. */
  listForNode: (nodeId: string) =>
    apiFetch<Record<string, PropertyMarkingItem[]>>(
      `/ontology/nodes/${nodeId}/property-markings`,
    ),
  listOne: (nodeId: string, propertyKey: string) =>
    apiFetch<PropertyMarkingItem[]>(
      `/ontology/nodes/${nodeId}/properties/${encodeURIComponent(propertyKey)}/markings`,
    ),
  apply: (nodeId: string, propertyKey: string, markingId: string) =>
    apiFetch<PropertyMarkingItem>(
      `/ontology/nodes/${nodeId}/properties/${encodeURIComponent(propertyKey)}/markings`,
      { method: 'POST', body: JSON.stringify({ marking_id: markingId }) },
    ),
  remove: (nodeId: string, propertyKey: string, markingId: string) =>
    apiFetch<void>(
      `/ontology/nodes/${nodeId}/properties/${encodeURIComponent(propertyKey)}/markings/${markingId}`,
      { method: 'DELETE' },
    ),
  // ─── Wave H.2 — workspace endpoints (2026-05-23) ────────────────────────
  bulkApply: (body: {
    node_ids: string[];
    marking_id: string;
    property_key?: string | null;
  }) =>
    apiFetch<BulkMarkingResult>('/ontology/property-markings/bulk-apply', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  bulkRemove: (body: {
    node_ids: string[];
    marking_id: string;
    property_key?: string | null;
  }) =>
    apiFetch<BulkMarkingResult>('/ontology/property-markings/bulk-remove', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  coverage: (markingId: string) =>
    apiFetch<MarkingCoverageOut>(
      `/ontology/property-markings/coverage?marking_id=${encodeURIComponent(markingId)}`,
    ),
  exportCsvUrl: (params?: { node_type?: string; marking_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.node_type) qs.set('node_type', params.node_type);
    if (params?.marking_id) qs.set('marking_id', params.marking_id);
    const s = qs.toString();
    return `/api/ontology/property-markings/export.csv${s ? '?' + s : ''}`;
  },
};

// ─── Foundry-E Project Constraints (Sprint Foundry-E, 2026-05-22) ──────────

export interface ProjectListItem {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface ProjectConstraintData {
  project_id: string;
  mode: 'none' | 'allowed' | 'prohibited';
  markings: string[];
  classification_ceiling: 'publico' | 'restrito' | 'confidencial' | 'sigiloso' | null;
  updated_at: string;
}

export interface ConstraintViolation {
  resource_kind: string;
  resource_id: string;
  marking_id: string;
  marking_slug: string;
  marking_display_name: string;
  violation: 'not_allowed' | 'prohibited';
}

export interface RevalidateReport {
  project_id: string;
  mode: 'none' | 'allowed' | 'prohibited';
  total_checked: number;
  violation_count: number;
  violations: ConstraintViolation[];
}

export const Projects = {
  list: (params?: { include_inactive?: boolean }) => {
    const qs = params?.include_inactive ? '?include_inactive=true' : '';
    return apiFetch<ProjectListItem[]>(`/projects${qs}`);
  },
  create: (body: {
    slug: string;
    display_name: string;
    description?: string;
    space_id?: string | null;
  }) => apiFetch<ProjectListItem>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  update: (
    projectId: string,
    body: { display_name?: string; description?: string | null; active?: boolean },
  ) =>
    apiFetch<ProjectListItem>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  softDelete: (projectId: string) =>
    apiFetch<void>(`/projects/${projectId}`, { method: 'DELETE' }),
  workspaces: (projectId: string, opts?: { include_inactive?: boolean }) => {
    const qs = opts?.include_inactive ? '?include_inactive=true' : '';
    return apiFetch<
      { id: string; slug: string; display_name: string; description: string | null; version: number; active: boolean; created_at: string }[]
    >(`/projects/${projectId}/workspaces${qs}`);
  },
  constraints: {
    get: (projectId: string) =>
      apiFetch<ProjectConstraintData>(`/projects/${projectId}/constraints`),
    put: (
      projectId: string,
      body: {
        mode: 'none' | 'allowed' | 'prohibited';
        markings: string[];
        classification_ceiling: 'publico' | 'restrito' | 'confidencial' | 'sigiloso' | null;
      },
    ) =>
      apiFetch<ProjectConstraintData>(`/projects/${projectId}/constraints`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    clear: (projectId: string) =>
      apiFetch<void>(`/projects/${projectId}/constraints`, { method: 'DELETE' }),
    revalidate: (projectId: string) =>
      apiFetch<RevalidateReport>(`/projects/${projectId}/constraints/revalidate`, {
        method: 'POST',
      }),
  },
};

// ─── UX-2.11 · Lineage Events (Sprint UX-2.11, 2026-05-22) ─────────────────

export interface LineageEvent {
  id: string;
  event_type: string;
  actor: string | null;
  status: string;
  metadata_: Record<string, unknown>;
  timestamp: string;
  tenant_id: string | null;
}

export const Lineage = {
  listEvents: (
    params?: {
      limit?: number;
      offset?: number;
      event_type?: string;
      status?: string;
    },
    /** AbortSignal — encadeia o cancelamento ao trocar de filtro/aba. */
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.event_type) qs.set('event_type', params.event_type);
    if (params?.status) qs.set('status', params.status);
    const s = qs.toString();
    return apiFetch<LineageEvent[]>(`/lineage/events${s ? '?' + s : ''}`, {
      signal,
    });
  },
  getEvent: (id: string) => apiFetch<LineageEvent>(`/lineage/events/${id}`),
  /** Onda 5/11 — assets (datasets) p/ o trace coluna-a-coluna. schema_snapshot.columns
   * lista as colunas dos derivados. */
  assets: (assetType?: string) =>
    apiFetch<DataAssetLite[]>(
      `/lineage/assets${assetType ? `?asset_type=${encodeURIComponent(assetType)}` : ''}`,
    ),
  /** Onda 11 — lineage coluna-a-coluna: traça (asset, coluna) até a origem. */
  columnTrace: (assetId: string, column: string, depth = 10) =>
    apiFetch<ColumnTrace>(
      `/lineage/assets/${encodeURIComponent(assetId)}/columns/${encodeURIComponent(column)}/trace?depth=${depth}`,
    ),
};

/** Asset (dataset) enxuto p/ os pickers do trace coluna-a-coluna. */
export interface DataAssetLite {
  id: string;
  name: string;
  asset_type: string;
  version: number;
  schema_snapshot: { columns?: string[] } | null;
}
/** Onda 11 — nó da cadeia de lineage coluna-a-coluna (recursivo). */
export interface ColumnTrace {
  asset_id: string;
  asset_name: string;
  column: string;
  produced_by_pipeline: string | null;
  upstream: ColumnTrace[];
  source: boolean;
}

// ── Workshop Scenarios (what-if por app — Onda 10) ──────────────────────────
// Cenário = conjunto de deltas (ações) sobre um app; o commit APLICA de verdade
// (dispatcha os handlers da Onda 9) e devolve deltas_applied/deltas_failed.
export interface WorkshopScenario {
  id: string;
  app_id: string;
  name: string;
  description: string;
  status: string;
  delta_count: number;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
}
export interface WorkshopScenarioDelta {
  id: string;
  scenario_id: string;
  action_id: string;
  params: Record<string, unknown>;
  target_node_id: string | null;
  status: string;
  applied_at: string | null;
  created_at: string;
}
export interface WorkshopScenarioCommit {
  scenario_id: string;
  status: string;
  deltas_applied: number;
  deltas_failed: number;
}
const _scBase = (appId: string) =>
  `/workshop/apps/${encodeURIComponent(appId)}/scenarios`;
export const WorkshopScenarios = {
  list: (appId: string) => apiFetch<WorkshopScenario[]>(_scBase(appId)),
  create: (appId: string, name: string) =>
    apiFetch<WorkshopScenario>(_scBase(appId), { method: 'POST', body: JSON.stringify({ name }) }),
  deltas: (appId: string, scenarioId: string) =>
    apiFetch<WorkshopScenarioDelta[]>(`${_scBase(appId)}/${encodeURIComponent(scenarioId)}/deltas`),
  applyAction: (appId: string, scenarioId: string, actionId: string, params: Record<string, unknown> = {}) =>
    apiFetch<WorkshopScenarioDelta>(`${_scBase(appId)}/${encodeURIComponent(scenarioId)}/deltas`, {
      method: 'POST', body: JSON.stringify({ action_id: actionId, params }),
    }),
  commit: (appId: string, scenarioId: string) =>
    apiFetch<WorkshopScenarioCommit>(`${_scBase(appId)}/${encodeURIComponent(scenarioId)}/commit`, { method: 'POST' }),
  discard: (appId: string, scenarioId: string) =>
    apiFetch<void>(`${_scBase(appId)}/${encodeURIComponent(scenarioId)}/discard`, { method: 'POST' }),
};

// ─── Sprint L2 · Action Types ──────────────────────────────────────────────

export interface ActionTypeOut {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  code_ref: string;
  requires_markings: string[];
  requires_clearances: string[];
  timeout_seconds: number;
  auto_approvable: boolean;
  validations: Record<string, unknown>[];
  version: number;
  created_at: string | null;
}

export interface ActionExecutionOut {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'POLICY_DENIED' | 'PENDING' | 'RUNNING' | 'ABORTED';
  initiated_by: string;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  lineage_event_id: string | null;
}

export interface ActionExecuteResult {
  execution_id: string | null;
  status: 'SUCCESS' | 'FAILED' | 'POLICY_DENIED' | 'PENDING_APPROVAL';
  output: Record<string, unknown>;
  duration_ms: number | null;
  lineage_event_id: string | null;
  approval_id?: string | null;
}

// Sprint L8 — Solution Designer blueprint.
export interface ProposedProperty {
  key: string;
  type: string;
  label: string;
  rationale: string;
}
export interface ProposedOntologyType {
  kind: string;
  rationale: string;
  properties: ProposedProperty[];
  // Nome humano do TIPO (pt-BR; backend popula via _humanize_kind) — nunca o
  // kind cru como rótulo único na UI. title_property = qual property rotula a instância.
  display_name?: string;
  title_property?: string;
}
export interface ProposedLink {
  source_kind: string;
  target_kind: string;
  relation: string;
  rationale?: string;
}
export interface ProposedLogicFunction {
  slug: string;
  display_name: string;
  description: string;
  prompt: string;
  inputs: string[];
}
export interface ProposedActionType {
  name: string;
  description: string;
  code_ref: string;
  auto_approvable: boolean;
  rationale: string;
  // Onda 4.1 — torna a Action proposta executável (round-trip p/ o materialize).
  input_schema?: Record<string, unknown>;
  validations?: Record<string, unknown>[];
}
export interface ProposedWidget {
  type: string;
  config: Record<string, unknown>;
  rationale: string;
}
// Sprint L17 (2026-05-24) — full-stack proposals: a real Operação (Project),
// Agentes (Agent) e Fluxos (AgentFlow) materializados pelo "Salvar e Construir".
export interface ProposedProject {
  slug: string;
  display_name: string;
  description?: string;
  domain?: string;
  rationale?: string;
}
export interface ProposedAgent {
  slug: string;
  display_name: string;
  kind?: string; // "worker" | "aip"
  description?: string;
  skill_key?: string;
  // #2 — skill REAL casada pelo Arquiteto (builtin ou openclaw curado).
  skill_label?: string;
  skill_platforms?: string[];
  // true = roda hoje (registrada); false = openclaw curada → requer ativação.
  skill_ready?: boolean;
  phase?: string;
  rationale?: string;
}
export interface ProposedFlow {
  slug: string;
  name: string;
  description?: string;
  phase?: string;
  trigger?: Record<string, unknown>;
  graph?: Record<string, unknown>;
  rationale?: string;
}
// Sprint L18 (2026-05-24) — Workshop App + Páginas materializados como
// entidades reais (não só widgets dentro da Sala). Ambos carregam os widgets
// do painel (``workspace_layout``) como fonte.
export interface ProposedApp {
  slug: string;
  title: string;
  description?: string;
  rationale?: string;
  widgets?: ProposedWidget[];
}
export interface ProposedPage {
  slug: string;
  title: string;
  rationale?: string;
  widgets?: ProposedWidget[];
}
// Sprint L20 — Espaço (fronteira de implantação real: site/cliente/teatro)
// proposto pela IA; o operador confirma, escolhe um existente ou renomeia.
export interface ProposedSpace {
  slug: string;
  display_name: string;
  description?: string;
  rationale?: string;
}
export interface SolutionBlueprint {
  id: string;
  problem: string;
  domain: string;
  summary: string;
  backend: string; // "llm" | "heuristic" | "heuristic-fallback"
  ontology_types: ProposedOntologyType[];
  // Sprint L19 — link types (relações) entre object types.
  proposed_links?: ProposedLink[];
  logic_functions: ProposedLogicFunction[];
  action_types: ProposedActionType[];
  workspace_layout: ProposedWidget[];
  // Sprint L20 — Espaço (fronteira de implantação) proposto pela IA.
  proposed_space?: ProposedSpace | null;
  // Sprint L17 — full-stack proposals. Defaults vazios em blueprints antigos.
  proposed_project?: ProposedProject | null;
  proposed_agents?: ProposedAgent[];
  proposed_flows?: ProposedFlow[];
  // Sprint L18 — Workshop App + Páginas. Defaults vazios → blueprints antigos
  // continuam válidos.
  proposed_app?: ProposedApp | null;
  proposed_pages?: ProposedPage[];
  created_at: string;
  created_by: string;
}

export interface SolutionMaterializeAccept {
  ontology_types: string[]; // kinds aceitos
  logic_functions: string[]; // slugs aceitos
  action_types: string[]; // nomes aceitos
  workspace_layout: boolean;
  // Sprint L16 (2026-05-23): Operação destino opcional para o Workspace
  // materializado. null/undefined = tenant-wide.
  project_id?: string | null;
  // Sprint L17 (2026-05-24): aceitar a Operação (booleano — no máx. uma por
  // blueprint) + Agentes/Fluxos (accept-by-slug).
  project?: boolean;
  agents?: string[];
  flows?: string[];
  // Sprint L18 (2026-05-24): aceitar o Workshop App (booleano) + as Páginas
  // (accept-by-slug).
  app?: boolean;
  pages?: string[];
  // Sprint L19 — link types aceitos (accept-by-key "source|relation|target").
  links?: string[];
  // Sprint L20 — Espaço destino + publicar/disponibilizar.
  space_mode?: 'current' | 'existing' | 'new' | 'none';
  space_id?: string | null;
  space_name?: string | null;
  publish_and_surface?: boolean;
}

export interface SolutionMaterializeCount {
  ontology_types: number;
  links?: number;
  logic_functions: number;
  action_types: number;
  workspaces: number;
  spaces?: number;
  // Sprint L17 (2026-05-24): full-stack entities.
  projects: number;
  agents: number;
  flows: number;
  // Sprint L18 (2026-05-24): Workshop App + Páginas + total de widgets.
  apps: number;
  pages: number;
  widgets: number;
  // P2 (2026-06-05): fontes vinculadas que materializaram (conector amarrado +
  // ingestão enfileirada; fonte/dataset com proveniência).
  sources?: number;
}

export interface SolutionMaterializeFailure {
  kind: string;
  name: string;
  reason: string;
}

export interface SolutionSourceResult {
  label: string;
  kind: string;
  target_node_type: string;
  action: string; // scheduled | bound | typed-ingest:N | registered
}

// T2 — aviso NÃO-fatal da materialização (ex.: parâmetro de skill fora do
// min/max declarado → ajustado/descartado). O recurso foi criado; o aviso
// conta honestamente o que mudou em relação ao que foi pedido.
export interface SolutionMaterializeWarning {
  kind: string; // agent | ...
  name: string; // slug/nome do recurso ajustado
  message: string;
}

export interface SolutionMaterializeResult {
  materialized: SolutionMaterializeCount;
  failures: SolutionMaterializeFailure[];
  lineage_event_ids: string[];
  blueprint_hash: string;
  // B (#1) — por fonte: a rota Fonte→Tipo + o status da construção.
  source_results?: SolutionSourceResult[];
  // T2 — campo aditivo/opcional: consumidores antigos seguem funcionando.
  warnings?: SolutionMaterializeWarning[];
}

// ─── M4 #9 — Desenho da Operação (Solution Diagram canvas) ──────────────
export interface SolutionWizard {
  end_product?: string;
  requirements?: string;
  source_data?: string;
  build_preference?: string;
  domain?: string;
}

export interface SolutionNode {
  id: string;
  kind: string; // 'concept' | 'worker' | 'dataset' | 'ontology_type' | ...
  phase: string; // 'coleta' | 'processamento' | 'ontologia' | 'aplicacao'
  title: string;
  description?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
}

export interface SolutionEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface SolutionGraph {
  nodes: SolutionNode[];
  edges: SolutionEdge[];
  wizard?: SolutionWizard & Record<string, unknown>;
}

export interface SolutionDiagram extends SolutionGraph {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  project_id?: string | null;
  version?: number;
  signed_hash?: string;
  backend?: string;
  domain?: string;
  // Sprint L17 (2026-05-24) — the blueprint that produced the graph. Surfaced
  // by /design-graph and round-tripped via wizard["_blueprint"]; the "Salvar e
  // Construir" flow reads it to materialize the real stack.
  blueprint?: SolutionBlueprint | null;
}

// Sprint L20 (2026-05-25) — incremental merge ("[Mesclar]") report: what the
// merge ADDED to the current plan (counts) + whether the proposal carried a
// different Espaço (the boundary is kept; this only flags it).
export interface SolutionMergeReport {
  added: {
    ontology_types?: number;
    links?: number;
    logic_functions?: number;
    action_types?: number;
    widgets?: number;
    agents?: number;
    flows?: number;
    pages?: number;
  };
  space_changed: boolean;
}

export interface SolutionMergeResult extends SolutionDiagram {
  merge_report: SolutionMergeReport;
}

export interface SolutionPattern {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  vertical?: string;
  nodes: SolutionNode[];
  edges: SolutionEdge[];
}

export interface SolutionImplementationPlan {
  id: string;
  title: string;
  summary: string;
  nodes: Array<{ kind: string; title: string; config?: Record<string, unknown> }>;
}

export interface SolutionDataModel {
  object_types: Array<{
    kind: string;
    properties: Array<{ key: string; type: string; label: string }>;
    rationale?: string;
  }>;
  link_types: Array<{ from: string; to: string; label: string }>;
}

export interface SolutionWalkthrough {
  workspace_id: string;
  update_id: string;
  pages: Array<{ ordering: number; title: string; description: string }>;
}

// Plano A (2026-06-02) — refactor the EXISTING structure (edit, not only
// create). The diff classifies each change additive vs destructive; the chat
// renders it as an interactive artifact and re-applies with allow_destructive
// once the operator confirms the destructive parts.
export interface RefactorPropertyChange {
  key: string;
  from_type: string;
  to_type: string;
}
export interface RefactorTypeDiff {
  kind: string;
  added_properties: ProposedProperty[];
  removed_properties: string[];
  changed_properties: RefactorPropertyChange[];
  relabeled_properties: string[];
}
export interface RefactorBlueprintDiff {
  added_types: ProposedOntologyType[];
  removed_types: string[];
  updated_types: RefactorTypeDiff[];
  added_links: ProposedLink[];
  removed_links: string[];
  added_actions: ProposedActionType[];
  removed_actions: string[];
}
export interface RefactorCount {
  added_types: number;
  updated_types: number;
  removed_types: number;
  added_links: number;
  removed_links: number;
  added_actions: number;
  removed_actions: number;
}
// Plano B (2026-06-02) — scope the design to a slice ("desenhe só isto").
// 'full' decomposes the whole problem; 'module'/'page' with a focus narrows it.
export interface SolutionScope {
  kind: 'full' | 'module' | 'page';
  focus: string;
}

export interface RefactorResult {
  diff: RefactorBlueprintDiff;
  is_destructive: boolean;
  is_empty: boolean;
  applied: RefactorCount;
  gated: boolean;
  failures: { kind: string; name: string; reason: string }[];
  lineage_event_ids: string[];
  blueprint_hash: string;
}

export const Solutions = {
  design: (problem: string, domain?: string) =>
    apiFetch<SolutionBlueprint>('/platform/v23/solutions/design', {
      method: 'POST',
      body: JSON.stringify({ problem, domain }),
    }),
  materialize: (
    blueprint: SolutionBlueprint,
    accept: SolutionMaterializeAccept,
    // Modo-edição (F1): diagrama de origem — gravado no app (source_diagram_id) p/ reabrir no AIP.
    diagramId?: string,
    // Modo-edição (F3): app-alvo — quando presente, ATUALIZA o mesmo app (não cria novo).
    appId?: string,
    // P2 (2026-06-05): fontes vinculadas nos nós de Coleta — o backend as
    // CONSOME (conector → amarra + enfileira ingestão; fonte/dataset → lineage).
    // B (#1): cada vínculo carrega a ROTA — target_node_type (Tipo de objeto
    // de saída) + id_field/name_field (mapa). Vazio = só proveniência.
    linkedSources?: {
      kind: string;
      id: string;
      label: string;
      target_node_type?: string;
      id_field?: string;
      name_field?: string;
    }[],
    // Parâmetros da skill por nó de Coleta (mapeados por skill_key) — a hashtag,
    // a auth, etc. que o operador preencheu no nó → viram a config do binding.
    agentParams?: Record<string, Record<string, unknown>>,
    // INFERÊNCIA (nó de Processamento): modelo + prompt → config do agente aip;
    // transformer_function (Code Function) → config do agente; variables declaradas
    // (shape Variable, objectSet liga à ontologia) → painel de variáveis do app.
    inference?: {
      model?: string;
      system_prompt?: string;
      transformer_function?: string;
      variables?: Record<string, unknown>[];
    },
  ) =>
    apiFetch<SolutionMaterializeResult>('/platform/v23/solutions/materialize', {
      method: 'POST',
      body: JSON.stringify({
        blueprint,
        accept,
        diagram_id: diagramId,
        app_id: appId,
        ...(linkedSources && linkedSources.length ? { linked_sources: linkedSources } : {}),
        ...(agentParams && Object.keys(agentParams).length ? { agent_params: agentParams } : {}),
        ...(inference && (inference.model || inference.system_prompt) ? { inference } : {}),
      }),
    }),
  // Plano A — refactor the EXISTING structure. preview is read-only (the diff
  // the chat renders as an artifact); apply gates destructive changes behind
  // allowDestructive (operator confirmation). Requires solution.refactor.
  refactorPreview: (blueprint: SolutionBlueprint) =>
    apiFetch<RefactorResult>('/platform/v23/solutions/refactor/preview', {
      method: 'POST',
      body: JSON.stringify({ blueprint }),
    }),
  refactorApply: (blueprint: SolutionBlueprint, allowDestructive = false) =>
    apiFetch<RefactorResult>('/platform/v23/solutions/refactor/apply', {
      method: 'POST',
      body: JSON.stringify({ blueprint, allow_destructive: allowDestructive }),
    }),
  // #6 — amostra ad-hoc de uma skill de Coleta ("rodar o nó" estilo N8N): roda
  // a skill de verdade com limite pequeno, em modo amostra (não persiste), e
  // devolve os registros REAIS. Background + poll (skill real leva ~30s-2min).
  skillSample: (skill_key: string, params: Record<string, unknown>, project_id?: string) =>
    apiFetch<{ sample_id: string; status: string }>('/platform/v23/solutions/skill-sample', {
      method: 'POST',
      body: JSON.stringify({ skill_key, params, project_id }),
    }),
  skillSampleStatus: (sampleId: string) =>
    apiFetch<{
      sample_id: string;
      status: 'running' | 'done' | 'error' | 'unsupported';
      output?: { records?: Record<string, unknown>[]; users?: number; node_type?: string };
      error?: string;
    }>(`/platform/v23/solutions/skill-sample/${sampleId}`),
  /** #5 dry-run — roda a inferência/transformador PROPOSTO sobre 1 linha de amostra → output REAL. */
  nodeDryRun: (body: {
    model?: string; prompt_template?: string; transformer_function?: string;
    sample_row: Record<string, unknown>;
  }) =>
    apiFetch<{
      inference?: { ok: boolean; output?: string; rendered_prompt?: string; model?: string; error?: string };
      transformer?: { ok: boolean; output?: unknown; error?: string };
      note?: string;
    }>('/platform/v23/solutions/node-dry-run', { method: 'POST', body: JSON.stringify(body) }),
  // M4 #9 — diagram canvas (AIP Architect). Caminho SÍNCRONO (mantido p/
  // back-compat / uso direto); a UI usa designGraphViaTask para não prender a
  // conexão durante a orquestração longa.
  designGraph: (problem: string, wizard: SolutionWizard, scope?: SolutionScope) =>
    apiFetch<SolutionDiagram>('/platform/v23/solutions/design-graph', {
      method: 'POST',
      body: JSON.stringify({ problem, wizard, scope }),
    }),
  // Latência: a orquestração multi-agente do AIP Arquiteto é trabalho LONGO
  // (~minutos). Em vez de uma única requisição bloqueante (que estoura timeouts
  // de proxy/gateway), submetemos um OperatorTask (origin='solution_design') que
  // roda no worker — observável — e fazemos poll até concluir. O ``result_data``
  // do task é exatamente o payload do DiagramOut (nodes/edges/wizard/blueprint).
  designGraphViaTask: async (
    problem: string,
    wizard: SolutionWizard,
    opts?: {
      pollMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      scope?: SolutionScope;
      // P2 — proposta ENXUTA por padrão (lean, 1 chamada, segundos). 'full' = "Aprofundar":
      // largura multi-agente sob demanda. Omitido → backend assume 'lean'.
      depth?: 'lean' | 'full';
      // P3 — progresso vivo: chamado a cada poll com os passos da orquestração
      // (provenance.steps), p/ o chat renderizar a timeline no lugar do spinner mudo.
      onProgress?: (steps: { label: string; detail?: string }[]) => void;
    },
  ): Promise<SolutionDiagram> => {
    // ``prompt_text`` is a serialized DesignBody (the worker model_validates it),
    // so threading ``scope``/``depth`` here narrows/widens the design with no backend change.
    const task = await apiFetch<{ id: string }>('/operator/tasks', {
      method: 'POST',
      body: JSON.stringify({
        origin: 'solution_design',
        priority: 'high',
        title: `AIP Arquiteto: ${problem.slice(0, 80)}`,
        prompt_text: JSON.stringify({ problem, wizard, scope: opts?.scope, depth: opts?.depth }),
      }),
    });
    const pollMs = opts?.pollMs ?? 2500;
    const timeoutMs = opts?.timeoutMs ?? 8 * 60 * 1000;
    const started = Date.now();
    // P3+ — SSE para steps em TEMPO REAL (vs poll de 2.5s): EventSource same-origin no
    // proxy /api (injeta o Bearer do cookie). Best-effort/ADITIVO: o poll abaixo continua
    // governando a conclusão; se o EventSource não existir/falhar, o poll cobre os steps.
    let es: EventSource | null = null;
    if (opts?.onProgress && typeof EventSource !== 'undefined') {
      try {
        es = new EventSource(`${API_BASE}/operator/tasks/stream`, { withCredentials: true });
        es.addEventListener('task.changed', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data) as {
              id: string;
              provenance?: { steps?: { label: string; detail?: string }[] };
            };
            if (d.id === task.id) opts.onProgress?.(d.provenance?.steps ?? []);
          } catch {
            /* evento malformado — ignora; o poll cobre */
          }
        });
      } catch {
        es = null; // sem SSE → poll-only
      }
    }
    try {
      for (;;) {
        if (opts?.signal?.aborted) throw new Error('cancelado');
        await new Promise((r) => setTimeout(r, pollMs));
        const t = await apiFetch<{
          status: string;
          result_data: SolutionDiagram;
          error_message: string | null;
          provenance?: { steps?: { label: string; detail?: string }[] };
        }>(`/operator/tasks/${encodeURIComponent(task.id)}`);
        // surfaça os passos acumulados (rede do SSE; a timeline preenche enquanto roda).
        if (opts?.onProgress) opts.onProgress(t.provenance?.steps ?? []);
        if (t.status === 'done') return t.result_data;
        if (t.status === 'failed' || t.status === 'cancelled') {
          throw new Error(t.error_message || 'falha ao desenhar a operação');
        }
        if (Date.now() - started > timeoutMs) {
          throw new Error('tempo esgotado ao desenhar a operação');
        }
      }
    } finally {
      es?.close();
    }
  },
  // Sprint L20 — incremental merge: union an incoming proposal's blueprint INTO
  // the plan on the canvas (dedupe by natural key, in-place reconcile keeping
  // positions + manual nodes). Returns the merged diagram + a report of what
  // was added. Requires solution.diagram.write.
  mergeGraph: (
    currentGraph: SolutionGraph,
    baseBlueprint: SolutionBlueprint,
    incomingBlueprint: SolutionBlueprint,
  ) =>
    apiFetch<SolutionMergeResult>('/platform/v23/solutions/merge-graph', {
      method: 'POST',
      body: JSON.stringify({
        current_graph: currentGraph,
        base_blueprint: baseBlueprint,
        incoming_blueprint: incomingBlueprint,
      }),
    }),
  listPatterns: () =>
    apiFetch<SolutionPattern[]>('/platform/v23/solutions/patterns'),
  listDiagrams: () =>
    apiFetch<SolutionDiagram[]>('/platform/v23/solutions/diagrams'),
  getDiagram: (id: string) =>
    apiFetch<SolutionDiagram>(`/platform/v23/solutions/diagrams/${id}`),
  createDiagram: (body: {
    slug: string;
    title: string;
    description?: string;
    project_id?: string | null;
    nodes: SolutionNode[];
    edges: SolutionEdge[];
    wizard?: SolutionWizard & Record<string, unknown>;
  }) =>
    apiFetch<SolutionDiagram>('/platform/v23/solutions/diagrams', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  saveDiagram: (
    id: string,
    body: {
      nodes: SolutionNode[];
      edges: SolutionEdge[];
      wizard?: Record<string, unknown>;
      message?: string;
    },
  ) =>
    apiFetch<SolutionDiagram>(`/platform/v23/solutions/diagrams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  implementations: (
    graph: SolutionGraph,
    nodeId: string,
    problem: string,
    wizard: SolutionWizard,
  ) =>
    apiFetch<SolutionImplementationPlan[]>(
      '/platform/v23/solutions/implementations',
      {
        method: 'POST',
        body: JSON.stringify({ graph, node_id: nodeId, problem, wizard }),
      },
    ),
  expandNode: (
    graph: SolutionGraph,
    nodeId: string,
    planId: string,
    wizard: SolutionWizard,
  ) =>
    apiFetch<SolutionGraph>('/platform/v23/solutions/expand-node', {
      method: 'POST',
      body: JSON.stringify({ graph, node_id: nodeId, plan_id: planId, wizard }),
    }),
  ontologyModel: (prompt: string) =>
    apiFetch<SolutionDataModel>('/platform/v23/solutions/ontology-model', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  fromLineage: () =>
    apiFetch<SolutionGraph>('/platform/v23/solutions/from-lineage', {
      method: 'POST',
      body: JSON.stringify({ events: [] }),
    }),
  buildWalkthrough: (id: string) =>
    apiFetch<SolutionWalkthrough>(
      `/platform/v23/solutions/diagrams/${id}/walkthrough`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
};

// Sprint L9 — Workflow Lineage grafo vivo.
/** Contexto Organization de um nó — Operação (Project) + Espaço (Space). */
export interface LineageNodeOrg {
  space_id?: string | null;
  space_label?: string | null;
  project_id?: string | null;
  project_label?: string | null;
}
export interface LineageGraphNode {
  id: string;
  kind: string;
  label: string;
  markings: string[];
  extra: Record<string, unknown>;
  /** M5-polish — agrupamento por Operação/Espaço (eixo Organization). */
  org?: LineageNodeOrg;
}
export interface LineageGraphEdge {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  event_id: string | null;
  actor: string | null;
  created_at: string | null;
}
export interface LineageGraphOut {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  total_nodes: number;
  total_edges: number;
  truncated: boolean;
}

export const LineageGraph = {
  get: (
    params?: {
      marking?: string;
      since?: string;
      kind?: string;
      limit_events?: number;
      /** O3b — foca o grafo na sub-DAG de proveniência deste asset. */
      asset_id?: string;
    },
    /** AbortSignal — encadeia o cancelamento ao trocar de filtro (fix refresh). */
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams();
    if (params?.marking) qs.set('marking', params.marking);
    if (params?.since) qs.set('since', params.since);
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.limit_events) qs.set('limit_events', String(params.limit_events));
    if (params?.asset_id) qs.set('asset_id', params.asset_id);
    const s = qs.toString();
    return apiFetch<LineageGraphOut>(
      `/platform/v23/lineage-graph${s ? '?' + s : ''}`,
      { signal },
    );
  },
};

// Sprint L6 — Plan/Act mode (dry-run preview).
export interface ActionPlanStep {
  action_id: string;
  action_name: string;
  will_execute: boolean;
  will_request_approval: boolean;
  deny_reason: string | null;
  requires_markings: string[];
  auto_approvable: boolean;
  input: Record<string, unknown>;
}

export interface ActionPlanResult {
  steps: ActionPlanStep[];
  total: number;
  will_execute: number;
  will_request_approval: number;
  will_deny: number;
}

export const ActionTypes = {
  list: () => apiFetch<ActionTypeOut[]>('/platform/v23/action-types'),
  get: (id: string) =>
    apiFetch<ActionTypeOut>(`/platform/v23/action-types/${id}`),
  create: (body: {
    name: string;
    description?: string;
    code_ref: string;
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    requires_markings?: string[];
    requires_clearances?: string[];
    timeout_seconds?: number;
    auto_approvable?: boolean;
    validations?: Record<string, unknown>[];
  }) =>
    apiFetch<ActionTypeOut>('/platform/v23/action-types', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (
    id: string,
    body: Partial<{
      description: string;
      code_ref: string;
      input_schema: Record<string, unknown>;
      output_schema: Record<string, unknown>;
      requires_markings: string[];
      requires_clearances: string[];
      timeout_seconds: number;
      auto_approvable: boolean;
      validations: Record<string, unknown>[];
    }>,
  ) =>
    apiFetch<ActionTypeOut>(`/platform/v23/action-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    apiFetch<{ status: string }>(`/platform/v23/action-types/${id}`, {
      method: 'DELETE',
    }),
  execute: (id: string, input: Record<string, unknown>, note?: string) =>
    apiFetch<ActionExecuteResult>(`/platform/v23/action-types/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input, note }),
    }),
  // Sprint L5 — approver finaliza CPApproval pendente e executa.
  approveAndExecute: (
    actionId: string,
    approvalId: string,
    rationale?: string,
  ) =>
    apiFetch<ActionExecuteResult>(
      `/platform/v23/action-types/${actionId}/approve/${approvalId}`,
      {
        method: 'POST',
        body: JSON.stringify({ rationale }),
      },
    ),
  // Sprint L6 — Plan/Act mode (dry-run).
  plan: (steps: { action_id: string; input?: Record<string, unknown> }[]) =>
    apiFetch<ActionPlanResult>('/platform/v23/action-types/plan', {
      method: 'POST',
      body: JSON.stringify({ steps }),
    }),
  executions: (id: string) =>
    apiFetch<ActionExecutionOut[]>(
      `/platform/v23/action-types/${id}/executions`,
    ),
  // ─── Wave H.2 — Form-schema + validate-input (2026-05-23) ───────────────
  formSchema: (id: string) =>
    apiFetch<ActionFormSchemaOut>(
      `/platform/v23/action-types/${id}/form-schema`,
    ),
  validateInput: (id: string, input: Record<string, unknown>) =>
    apiFetch<ActionValidateOut>(
      `/platform/v23/action-types/${id}/validate-input`,
      { method: 'POST', body: JSON.stringify({ input }) },
    ),
  // ─── Onda 1 — external dispatch target allowlist (SSRF boundary) ─────────
  getTargets: () =>
    apiFetch<ActionTargetsOut>('/platform/v23/action-types/config/targets'),
  putTargets: (targets: string[]) =>
    apiFetch<ActionTargetsOut>('/platform/v23/action-types/config/targets', {
      method: 'PUT',
      body: JSON.stringify({ targets }),
    }),
};

export interface ActionTargetsOut {
  targets: string[];
}

// ─── Onda 2 — Acessos públicos (guest tokens p/ morador/visitante) ─────────
export interface GuestTokenOut {
  id: string;
  label: string;
  subject: string;
  allowed_action_ids: string[];
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  min_interval_seconds: number;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string | null;
}
export interface GuestTokenIssued extends GuestTokenOut {
  token: string; // plaintext — shown exactly once
}
export const GuestTokens = {
  list: () => apiFetch<GuestTokenOut[]>('/platform/v23/guest-tokens'),
  issue: (body: {
    label?: string;
    subject?: string;
    allowed_action_ids: string[];
    ttl_hours?: number;
    max_uses?: number | null;
    min_interval_seconds?: number;
  }) =>
    apiFetch<GuestTokenIssued>('/platform/v23/guest-tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revoke: (id: string) =>
    apiFetch<GuestTokenOut>(`/platform/v23/guest-tokens/${id}/revoke`, {
      method: 'POST',
    }),
};

// M4.2 — Conectores: agentes genéricos (Agent + SkillBinding connector.http) sobre
// o backend de governança. Registrar = criar agente + bindar a skill connector.http.
// ── Pipelines (camada de dados — Onda 5) ────────────────────────────
// Espelha platform_v22/pipelines.py. O build é governado-tipado: materializa
// dataset derivado + mapeia linhas em instâncias do Object Type declarado em
// spec.output, com histórico de runs.
export interface Pipeline {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  spec: Record<string, unknown>;
  column_provenance: Record<string, unknown>;
  autosave: boolean;
  last_build_status: string | null;
  last_build_error: string | null;
  last_build_at: string | null;
  created_at: string;
}
export interface PipelineRun {
  id: string;
  pipeline_id?: string | null;
  board_id?: string | null;
  status: string;
  rows_in: number | null;
  rows_out: number | null;
  output_asset_id: string | null;
  source_asset_id: string | null;
  target_node_type: string | null;
  instances_upserted: number | null;
  classification_level: string | null;
  duration_ms: number | null;
  error: string | null;
  trigger_source: string | null;
  created_at: string;
  step_history?: PipelineRunStep[];
}
export interface PipelineRunStep {
  seq?: number | null;
  node_id?: string | null;
  op?: string | null;
  status?: string | null;
  rows_in?: number | null;
  rows_out?: number | null;
  duration_ms?: number | null;
  message?: string | null;
}
export interface PipelineCreateBody {
  slug: string;
  display_name: string;
  description?: string;
  spec?: Record<string, unknown>;
}
const _PV22 = '/platform/v22';
export const Pipelines = {
  list: () => apiFetch<Pipeline[]>(`${_PV22}/pipelines`),
  create: (b: PipelineCreateBody) =>
    apiFetch<Pipeline>(`${_PV22}/pipelines`, {
      method: 'POST',
      body: JSON.stringify({ ...b, spec: b.spec ?? {} }),
    }),
  build: (id: string) =>
    apiFetch<Pipeline>(`${_PV22}/pipelines/${id}/build`, { method: 'POST' }),
  runs: (id: string, limit = 50) =>
    apiFetch<PipelineRun[]>(`${_PV22}/pipelines/${id}/runs?limit=${limit}`),
};

// ── Pipeline Builder (DAG visual — Onda 15) ─────────────────────────
// Espelha platform_v23/pipeline.py. O board é um grafo {nodes,edges}; o run
// traduz grafo→spec e EXECUTA na MESMA engine governada da Onda 5 (materializa
// instância tipada + floor + lineage). Nó op='source'|'<transform>'|'output'.
export interface PipelineBoardNode {
  id: string;
  op: string; // source | select | filter | derive | rename | agg | output | ontology_output
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
}
export interface PipelineBoardEdge {
  from: string;
  to: string;
  /** A4/A5 (DAG não-linear) — porta de SAÍDA do nó de origem. Ausente = 'main'.
   * Obrigatória ao sair de if ('true'|'false') / switch (nome da regra|'default');
   * 'error' quando settings.on_error='error_output'. Espelha o backend v23. */
  port?: string;
}
export interface PipelineBoardGraph {
  nodes: PipelineBoardNode[];
  edges: PipelineBoardEdge[];
}
export interface PipelineBoard {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  graph: PipelineBoardGraph;
  markings: string[];
  tags: string[];
  active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  schedule_preset: string | null;
  project_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  // F9b — Publish/Versioning. is_published sempre presente; published_version_number
  // e is_dirty só vêm preenchidos no GET de 1 board (list = defaults).
  is_published?: boolean;
  published_version_number?: number | null;
  is_dirty?: boolean;
}
export interface PipelineBoardVersion {
  id: string;
  version_number: number;
  label: string | null;
  notes: string | null;
  published_by: string | null;
  created_at: string | null;
  is_published: boolean;
}
export interface BoardRunResult {
  board_id: string;
  run_id: string | null;
  status: string;
  error?: string | null;
  rows_in?: number | null;
  rows_out?: number | null;
  source_asset_id?: string | null;
  output_asset_id?: string | null;
  target_node_type?: string | null;
  instances_upserted?: number | null;
  duration_ms?: number | null;
  // A10 — amostra do OUTPUT do nó-alvo (run de nó individual): o NDV atualiza o
  // OUTPUT com a saída REAL do run, não só as contagens. schema {coluna: tipo}.
  sample_rows?: Record<string, unknown>[];
  schema?: Record<string, string>;
  // OP3 — TEST-RUN: sem efeito de produção; amostras POR NÓ + histórico de passos
  // p/ pintar o canvas e abrir o NDV com o dado que fluiu em cada nó.
  test_mode?: boolean;
  node_samples?: Record<string, Record<string, unknown>[]>;
  step_history?: Array<{ node_id?: string | null; op?: string | null; status?: string | null; rows_in?: number | null; rows_out?: number | null; duration_ms?: number | null; message?: string | null }>;
}
const _PV23 = '/platform/v23';
export const PipelineBuilder = {
  list: () => apiFetch<PipelineBoard[]>(`${_PV23}/pipeline`),
  get: (id: string) => apiFetch<PipelineBoard>(`${_PV23}/pipeline/${id}`),
  create: (b: { slug: string; display_name: string; description?: string; graph?: PipelineBoardGraph; project_id?: string }) =>
    apiFetch<PipelineBoard>(`${_PV23}/pipeline`, {
      method: 'POST',
      body: JSON.stringify({ ...b, graph: b.graph ?? { nodes: [], edges: [] } }),
    }),
  // A1 — project_id: '' desvincula da Operação; valor vincula (gate de membership no backend).
  update: (id: string, b: Partial<{ display_name: string; description: string; graph: PipelineBoardGraph; active: boolean; schedule_preset: string; tags: string[]; markings: string[]; project_id: string }>) =>
    apiFetch<PipelineBoard>(`${_PV23}/pipeline/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  remove: (id: string) => apiFetch<{ status: string }>(`${_PV23}/pipeline/${id}`, { method: 'DELETE' }),
  run: (id: string, opts?: { incremental?: boolean; branch?: string; stop_at_node?: string; test_mode?: boolean }) =>
    apiFetch<BoardRunResult>(`${_PV23}/pipeline/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ incremental: opts?.incremental ?? false, branch: opts?.branch || 'main', stop_at_node: opts?.stop_at_node, ...(opts?.test_mode ? { test_mode: true } : {}) }),
    }),
  runs: (id: string, limit = 50) =>
    apiFetch<PipelineRun[]>(`${_PV23}/pipeline/${id}/runs?limit=${limit}`),
  runDetail: (id: string, runId: string) =>
    apiFetch<PipelineRun>(`${_PV23}/pipeline/${id}/runs/${encodeURIComponent(runId)}`),
  // F9a — Repetir (retry) uma execução FALHA: re-roda o board com o grafo atual
  // (paridade n8n 'retry with current workflow'). Cria um NOVO run; preserva o
  // original. Backend rejeita run não-FAILED (409). Devolve `retried_from`.
  retry: (id: string, runId: string) =>
    apiFetch<BoardRunResult & { retried_from?: string }>(
      `${_PV23}/pipeline/${id}/runs/${encodeURIComponent(runId)}/retry`,
      { method: 'POST' },
    ),
  // F9b — Publish/Versioning. publish snapshota o rascunho e ativa o gate (os
  // gatilhos/agendamentos passam a rodar o snapshot); unpublish limpa o ponteiro.
  publish: (id: string, body?: { label?: string; notes?: string }) =>
    apiFetch<PipelineBoard>(`${_PV23}/pipeline/${id}/publish`, {
      method: 'POST', body: JSON.stringify(body ?? {}),
    }),
  unpublish: (id: string) =>
    apiFetch<PipelineBoard>(`${_PV23}/pipeline/${id}/unpublish`, { method: 'POST' }),
  versions: (id: string) =>
    apiFetch<PipelineBoardVersion[]>(`${_PV23}/pipeline/${id}/versions`),
  restoreVersion: (id: string, versionId: string) =>
    apiFetch<PipelineBoard>(
      `${_PV23}/pipeline/${id}/versions/${encodeURIComponent(versionId)}/restore`,
      { method: 'POST' },
    ),
  // Fase 2 (overhaul DAG n8n) — URL do SSE de progresso por nó. EventSource não
  // passa pelo apiFetch (JSON-only); o consumidor abre direto nesta URL de proxy
  // (`/api` injeta o Bearer do cookie httpOnly). Hello → node×N → done.
  runStreamUrl: (id: string, opts?: { incremental?: boolean; branch?: string; stop_at_node?: string; test_mode?: boolean }) => {
    const qs = new URLSearchParams({
      incremental: String(opts?.incremental ?? false),
      branch: opts?.branch || 'main',
      ...(opts?.stop_at_node ? { stop_at_node: opts.stop_at_node } : {}),
      // OP3 SSE live — Testar AO VIVO (esterilidade no backend)
      ...(opts?.test_mode ? { test_mode: 'true' } : {}),
    });
    return `${API_BASE}${_PV23}/pipeline/${id}/run/stream?${qs.toString()}`;
  },
  // Fase 4 — webhook triggers (CRUD)
  createTrigger: (slug: string, boardId: string) =>
    apiFetch<{ id: string; slug: string; secret: string; board_id: string }>(`${_PV23}/pipeline/triggers`, {
      method: 'POST',
      body: JSON.stringify({ slug, board_id: boardId }),
    }),
  listTriggers: () =>
    apiFetch<Array<{ id: string; slug: string; board_id: string; active: boolean }>>(`${_PV23}/pipeline/triggers`),
  deleteTrigger: (id: string) =>
    apiFetch<void>(`${_PV23}/pipeline/triggers/${id}`, { method: 'DELETE' }),
  // P6b — preview do OUTPUT dos transforms sobre uma amostra, sem materializar.
  transformPreview: (sample_rows: Record<string, unknown>[], steps: Record<string, unknown>[]) =>
    apiFetch<TransformPreviewResult>(`${_PV23}/pipeline/transform/preview`, {
      method: 'POST',
      body: JSON.stringify({ sample_rows, steps }),
    }),
  // P6 — valida a topologia do board (ordem topológica) antes de Executar.
  dryRun: (id: string) =>
    apiFetch<PipelineDryRunResult>(`${_PV23}/pipeline/${id}/dry-run`, { method: 'POST' }),
};

export interface TransformPreviewResult {
  schema: Record<string, string> | Record<string, unknown>;
  row_count: number;
  sample_rows: Record<string, unknown>[];
  skipped_ops: string[];
}

export interface PipelineDryRunResult {
  pipeline_id: string;
  topological_order: string[];
  node_count: number;
  status: string;
}

// ── Datasets / branching (Rev 6/7) — versionamento de datasets ─────
// Branches + transações (SNAPSHOT/APPEND/UPDATE/DELETE) + merge fast-forward e
// 3-way com resolução de conflito. Espelha ontology-module/app/routers/datasets.py.
export interface DatasetBranchOut {
  id: string;
  dataset_name: string;
  name: string;
  parent_branch_id: string | null;
  branch_point_asset_id: string | null;
  head_asset_id: string | null;
  head_version: number | null;
  active: boolean;
  description: string | null;
  created_at: string;
}
export interface DatasetListItem {
  name: string;
  asset_count: number;
  head_version: number | null;
  head_asset_id: string | null;
  branches: DatasetBranchOut[];
  // Governança por dataset (Onda 2 follow-on b) — chips do Acervo.
  classification_level: string | null;
  file_classification: string | null;
  marking_count: number;
}
export interface DatasetTransactionOut {
  id: string;
  branch_id: string;
  kind: string; // SNAPSHOT | APPEND | UPDATE | DELETE
  status: string; // OPEN | COMMITTED | ABORTED
  parent_asset_id: string | null;
  resulting_asset_id: string | null;
  input_payload: Record<string, unknown>;
  actor: string | null;
  error: string | null;
  started_at: string;
  finalized_at: string | null;
}
export interface DatasetMergeConflict {
  path: string;
  base: unknown;
  source: { op: string; value?: unknown; from?: unknown; to?: unknown };
  target: { op: string; value?: unknown; from?: unknown; to?: unknown };
}
export interface DatasetClassification {
  data_classification: string | null;
  file_classification: string | null;
}
// Marcação need-to-know aplicada a um dataset (eixo de elegibilidade — gateia
// /sample via user_can_access_resource; espelha DatasetMarkingOut do backend).
export interface DatasetMarking {
  id: string;
  marking_id: string;
  marking_slug: string;
  marking_display_name: string;
  applied_at: string;
}
export type DatasetMergeResult =
  | { status: 'conflict'; conflicts: DatasetMergeConflict[]; base_asset_id: string; source_head_id: string; target_head_id: string }
  | { status: 'merged' | 'no-op' | 'fast-forward'; target_head?: string; merge_base_asset_id?: string; resolved?: string[] };

const _dsName = (n: string) => encodeURIComponent(n);

// F7.2 — cross-links do organismo /dados ("quem usa este dado").
export interface DatasetUsageBoardRef {
  id: string;
  slug: string;
  display_name: string;
  tags: string[];
  node_id: string;
  last_run_status: string | null;
}
export interface DatasetUsage {
  dataset: string;
  produced_by:
    | { kind: 'board'; id: string; slug: string; display_name: string; tags: string[] }
    | { kind: 'connector'; agent_id: string; agent_slug: string; skill_key: string }
    | null;
  used_by_boards: DatasetUsageBoardRef[];
  searchable_in: { collection: string; status: string } | null;
}
export const Datasets = {
  list: () => apiFetch<DatasetListItem[]>('/datasets'),
  get: (name: string) =>
    apiFetch<{ name: string; head: { id: string; version: number; signed_hash: string; markings: string[]; payload_keys: string[] }; branches: DatasetBranchOut[] }>(
      `/datasets/${_dsName(name)}`,
    ),
  // Primeiras N linhas do head (governado) — alimenta o preview de transform.
  sample: (name: string, limit = 20) =>
    apiFetch<{ name: string; rows: Record<string, unknown>[]; row_count: number }>(
      `/datasets/${_dsName(name)}/sample?limit=${limit}`,
    ),
  listBranches: (name: string) => apiFetch<DatasetBranchOut[]>(`/datasets/${_dsName(name)}/branches`),
  createBranch: (name: string, body: { name: string; from_branch?: string; from_asset_id?: string; description?: string; project_id?: string }) =>
    apiFetch<DatasetBranchOut>(`/datasets/${_dsName(name)}/branches`, { method: 'POST', body: JSON.stringify(body) }),
  deactivateBranch: (name: string, branch: string) =>
    apiFetch<{ status: string; id: string }>(`/datasets/${_dsName(name)}/branches/${_dsName(branch)}`, { method: 'DELETE' }),
  listTransactions: (name: string, branch?: string) =>
    apiFetch<DatasetTransactionOut[]>(`/datasets/${_dsName(name)}/transactions${branch ? `?branch=${_dsName(branch)}` : ''}`),
  beginTransaction: (name: string, kind: string, branch = 'main') =>
    apiFetch<DatasetTransactionOut>(`/datasets/${_dsName(name)}/transactions`, { method: 'POST', body: JSON.stringify({ kind, branch }) }),
  commitTransaction: (name: string, txId: string, input_payload: Record<string, unknown>) =>
    apiFetch<DatasetTransactionOut>(`/datasets/${_dsName(name)}/transactions/${_dsName(txId)}/commit`, { method: 'POST', body: JSON.stringify({ input_payload }) }),
  abortTransaction: (name: string, txId: string, reason?: string) =>
    apiFetch<DatasetTransactionOut>(`/datasets/${_dsName(name)}/transactions/${_dsName(txId)}/abort`, { method: 'POST', body: JSON.stringify({ reason }) }),
  mergeFastForward: (name: string, source: string, into: string) =>
    apiFetch<{ status: string; target_head?: string }>(`/datasets/${_dsName(name)}/branches/${_dsName(source)}/merge`, { method: 'POST', body: JSON.stringify({ into }) }),
  // F7.2 — "Used in N" (padrão Foundry): produtor/consumidores/pesquisabilidade.
  usage: (name: string) =>
    apiFetch<DatasetUsage>(`/datasets/${_dsName(name)}/usage`),
  // Classificação (CBAC/LAI) do head do dataset — ativa as perms da Fase D.
  getClassification: (name: string) =>
    apiFetch<DatasetClassification>(`/datasets/${_dsName(name)}/classification`),
  setClassification: (name: string, body: { data_classification?: string | null; file_classification?: string | null }) =>
    apiFetch<DatasetClassification>(`/datasets/${_dsName(name)}/classification`, { method: 'PATCH', body: JSON.stringify(body) }),
  // merge3 devolve 409 com o corpo de conflito; capturamos e normalizamos p/ a UI
  // tratar { status:'conflict', conflicts } como retorno (não exceção).
  mergeThreeWay: async (name: string, source: string, into: string, resolutions: Record<string, string> = {}): Promise<DatasetMergeResult> => {
    try {
      return await apiFetch<DatasetMergeResult>(`/datasets/${_dsName(name)}/branches/${_dsName(source)}/merge3`, {
        method: 'POST', body: JSON.stringify({ into, resolutions }),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          const parsed = JSON.parse(e.message) as { detail?: DatasetMergeResult } | DatasetMergeResult;
          return ('detail' in parsed && parsed.detail ? parsed.detail : parsed) as DatasetMergeResult;
        } catch { throw e; }
      }
      throw e;
    }
  },
  // Marcações need-to-know do head do dataset (eixo de elegibilidade). Wrappers
  // por NOME sobre /resources/data_asset/{id} — resolvem o head tenant-scoped.
  listMarkings: (name: string) =>
    apiFetch<DatasetMarking[]>(`/datasets/${_dsName(name)}/markings`),
  applyMarking: (name: string, markingId: string) =>
    apiFetch<DatasetMarking>(`/datasets/${_dsName(name)}/markings`, {
      method: 'POST', body: JSON.stringify({ marking_id: markingId }),
    }),
  // Remoção é SENSÍVEL (baixa o floor) → exige a perm markings.expand_access.
  removeMarking: (name: string, markingId: string) =>
    apiFetch<void>(`/datasets/${_dsName(name)}/markings/${_dsName(markingId)}`, { method: 'DELETE' }),
  // Onda 4b — tornar o dataset PESQUISÁVEL (embed bge-m3 → índice vetorial Qdrant).
  // POST dispara o job assíncrono (202; guardrail de custo no backend ABORTA antes se
  // passar do teto / sem preço) e devolve o run; acompanhe via getEmbedStatus
  // (null = nunca embeddado). Exige a perm data.datasets.embed.
  embedDataset: (name: string) =>
    apiFetch<DatasetEmbedRun>(`/datasets/${_dsName(name)}/embed`, { method: 'POST' }),
  getEmbedStatus: (name: string) =>
    apiFetch<DatasetEmbedRun | null>(`/datasets/${_dsName(name)}/embed-status`),
};

// Onda 4b — estado do job "tornar pesquisável" (espelha EmbedRunOut do backend).
export interface DatasetEmbedRun {
  id: string;
  dataset_name: string;
  collection: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  rows: number;
  est_cost_brl?: number | null;
  error?: string | null;
  requested_by?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

// ── Media Sets — coleções de arquivos não-estruturados ─────────────
// Espelha ontology-module/app/routers/platform_v23/media.py.
export interface MediaSetItem {
  id: string;
  media_set_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  uri: string | null;
  /** Pasta canônica dentro do conjunto ('/'=raiz) — aba Arquivos = Drive. */
  folder_path: string;
  meta: Record<string, unknown>;
  created_at: string | null;
}
export interface MediaSetOut {
  id: string;
  slug: string;
  display_name: string;
  media_type: string; // image | video | audio | document | mixed
  bucket: string | null;
  item_count: number;
  total_bytes: number;
  markings: string[];
  /** Pastas DECLARADAS do conjunto (existem mesmo vazias). */
  folders: string[];
  project_id: string | null;
  created_at: string | null;
}
/** Hit da busca tenant-wide (barra de busca do Drive) — item + conjunto. */
export interface MediaSearchHit extends MediaSetItem {
  set_slug: string;
  set_name: string;
}
/** Board do DAG que USA um arquivo (frente 4 — espelho de used_by_boards). */
export interface MediaUsageBoard {
  id: string;
  slug: string;
  display_name: string;
  last_run_status: string | null;
  roles: string[]; // 'reads' (extract_file) | 'writes' (convert_file/proveniência)
}
export const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'mixed'] as const;
export const MediaSets = {
  list: () => apiFetch<MediaSetOut[]>(`${_PV23}/media/sets`),
  create: (body: { slug: string; display_name: string; media_type: string; bucket?: string; markings?: string[]; project_id?: string }) =>
    apiFetch<MediaSetOut>(`${_PV23}/media/sets`, { method: 'POST', body: JSON.stringify({ markings: [], ...body }) }),
  remove: (id: string) => apiFetch<{ status: string }>(`${_PV23}/media/sets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listItems: (id: string) => apiFetch<MediaSetItem[]>(`${_PV23}/media/sets/${encodeURIComponent(id)}/items`),
  addItem: (id: string, body: { filename: string; content_type?: string; size_bytes?: number; uri?: string; meta?: Record<string, unknown> }) =>
    apiFetch<MediaSetItem>(`${_PV23}/media/sets/${encodeURIComponent(id)}/items`, { method: 'POST', body: JSON.stringify(body) }),
  // Aba Arquivos — upload de CONTEUDO de verdade (o addItem so grava metadados;
  // era o bug 'nao consigo visualizar/baixar'). Multipart direto (sem o
  // Content-Type json do apiFetch — o browser poe o boundary sozinho).
  uploadItem: async (id: string, file: File, opts?: { folder?: string }): Promise<MediaSetItem> => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    // Drive: o upload cai NA pasta atual da UI.
    if (opts?.folder && opts.folder !== '/') fd.append('folder', opts.folder);
    const res = await fetch(`${API_BASE}${_PV23}/media/sets/${encodeURIComponent(id)}/items/upload`, {
      method: 'POST', credentials: 'include', cache: 'no-store', body: fd,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
    return res.json();
  },
  /** URL de conteudo servida pelo backend (preview inline / download) — o
   *  browser NUNCA ve a uri interna s3:// do storage. */
  contentUrl: (itemId: string, opts?: { download?: boolean }) =>
    `${API_BASE}${_PV23}/media/items/${encodeURIComponent(itemId)}/content${opts?.download ? '?download=1' : ''}`,
  // ── Aba Arquivos = Google Drive (frente 2) ─────────────────────────
  /** Renomeia o conjunto (display_name; slug imutável). */
  update: (id: string, body: { display_name?: string }) =>
    apiFetch<MediaSetOut>(`${_PV23}/media/sets/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  /** Declara uma pasta (pais automáticos; idempotente). */
  createFolder: (id: string, path: string) =>
    apiFetch<MediaSetOut>(`${_PV23}/media/sets/${encodeURIComponent(id)}/folders`, {
      method: 'POST', body: JSON.stringify({ path }),
    }),
  /** Renomeia/move uma pasta — cascateia subpastas + itens. */
  renameFolder: (id: string, path: string, newPath: string) =>
    apiFetch<MediaSetOut>(`${_PV23}/media/sets/${encodeURIComponent(id)}/folders`, {
      method: 'PATCH', body: JSON.stringify({ path, new_path: newPath }),
    }),
  /** Exclui a pasta e TODO o conteúdo (como no Drive). */
  removeFolder: (id: string, path: string) =>
    apiFetch<{ status: string; removed_items: number }>(
      `${_PV23}/media/sets/${encodeURIComponent(id)}/folders?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
    ),
  /** Renomeia / move de pasta / move de conjunto. */
  updateItem: (itemId: string, body: { filename?: string; folder_path?: string; media_set_id?: string }) =>
    apiFetch<MediaSetItem>(`${_PV23}/media/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  /** Exclui um item (contadores ajustados; bytes best-effort). */
  removeItem: (itemId: string) =>
    apiFetch<{ status: string }>(`${_PV23}/media/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  /** Busca tenant-wide por nome de arquivo (conjuntos visíveis). */
  search: (q: string) =>
    apiFetch<MediaSearchHit[]>(`${_PV23}/media/search?q=${encodeURIComponent(q)}`),
  /** Frente 4 — QUAIS boards do DAG usam este arquivo (reads/writes). */
  itemUsage: (itemId: string) =>
    apiFetch<MediaUsageBoard[]>(`${_PV23}/media/items/${encodeURIComponent(itemId)}/usage`),
};

// ── Notepad / Relatórios — documentos markdown governados ───────────
// Espelha ontology-module/app/routers/platform_v23/notepad.py (NotepadDoc).
/** Seção de um Document (T3): narrative|object_set|aggregation|markdown. */
export interface NotepadSection {
  id?: string;
  heading?: string;
  kind?: 'narrative' | 'object_set' | 'aggregation' | 'markdown' | string;
  body?: string;
  prompt?: string;
  binding?: Record<string, unknown> | null;
  data_summary?: string;
  context?: Array<Record<string, unknown>>;
  generated?: { body?: string; citations?: string[]; inference_log_id?: string | null };
  [k: string]: unknown;
}
export interface NotepadDoc {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  /** T3 — seções ordenadas que materializam ontologia + AIP. */
  sections: NotepadSection[];
  markings: string[];
  /** Nível CBAC fechado (LAI): publico|restrito|confidencial|sigiloso ou null.
   *  CONJUNTIVO com `markings` (dois eixos de controle de acesso). */
  classification_level: string | null;
  version: number;
  pinned: boolean;
  /** T3 — assinatura (selar). signed_hash invalida em qualquer edição. */
  signed: boolean;
  signed_hash: string | null;
  signed_at: string | null;
  signed_by: string | null;
  project_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}
/** Descritor devolvido ao embutir um nó da ontologia num relatório (P5 Onda 4). */
export interface NotepadEmbed {
  node_id: string;
  node_type: string;
  name: string;
  widget: string;
  markings: string[];
  lineage_event_id: string;
}
export interface NotepadTransmit {
  token: string;
  link: string;
  expires_at: string;
}
export const Notepad = {
  list: () => apiFetch<NotepadDoc[]>(`${_PV23}/notepad`),
  get: (id: string) => apiFetch<NotepadDoc>(`${_PV23}/notepad/${encodeURIComponent(id)}`),
  create: (body: { slug: string; title: string; body_md?: string; sections?: NotepadSection[]; markings?: string[]; classification_level?: string | null; pinned?: boolean; project_id?: string }) =>
    apiFetch<NotepadDoc>(`${_PV23}/notepad`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; body_md?: string; sections?: NotepadSection[]; markings?: string[]; classification_level?: string | null; pinned?: boolean }) =>
    apiFetch<NotepadDoc>(`${_PV23}/notepad/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<{ status: string }>(`${_PV23}/notepad/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Compila o relatório a partir de um nó: registra o embed + LineageEvent. */
  embed: (id: string, body: { node_id: string; widget: string }) =>
    apiFetch<NotepadEmbed>(`${_PV23}/notepad/${encodeURIComponent(id)}/embed`, { method: 'POST', body: JSON.stringify(body) }),
  /** T3 — gera as seções narrativas via AIP (auditado). */
  generate: (id: string, body: { sections?: NotepadSection[]; context_items?: Array<Record<string, unknown>>; provider?: string; model?: string | null; only_section_ids?: string[] } = {}) =>
    apiFetch<NotepadDoc>(`${_PV23}/notepad/${encodeURIComponent(id)}/generate`, { method: 'POST', body: JSON.stringify(body) }),
  /** T3 — sela o documento (signed_hash). Perm security.relatorios.close. */
  sign: (id: string) =>
    apiFetch<NotepadDoc>(`${_PV23}/notepad/${encodeURIComponent(id)}/sign`, { method: 'POST', body: JSON.stringify({ confirm: true }) }),
  /** T3-B — Transmitir: gera link público read-only /m/{token} escopado ao doc. */
  transmit: (id: string, body: { ttl_hours?: number; link_base?: string; label?: string } = {}) =>
    apiFetch<NotepadTransmit>(`${_PV23}/notepad/${encodeURIComponent(id)}/transmit`, { method: 'POST', body: JSON.stringify(body) }),
  /** T3-E2 — resolve um object-set (tipo + filtro) p/ uma seção de widget, governado (_query_object_set). */
  queryObjectSet: (
    id: string,
    spec: {
      object_type: string;
      filter?: Record<string, unknown> | null;
      order_by?: { field: string; direction: string }[];
      limit?: number;
    },
  ) =>
    apiFetch<{
      rows: Array<{ id: string; name: string; node_type: string; properties: Record<string, unknown>; markings: string[] }>;
      total_after_filter: number;
    }>(`${_PV23}/notepad/${encodeURIComponent(id)}/object-sets/query`, {
      method: 'POST',
      body: JSON.stringify(spec),
    }),
  /** T3-G2 — upload de arquivo escopado ao doc (→ MinIO). Devolve object_key ESTÁVEL. */
  upload: (id: string, body: { data_url: string; original_filename?: string; max_bytes?: number }) =>
    apiFetch<{ object_key: string; content_type: string; bytes: number }>(
      `${_PV23}/notepad/${encodeURIComponent(id)}/uploads`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  /** Caminho ESTÁVEL de serve da mídia (proxy → backend stream gateado; sem expiração). */
  mediaUrl: (id: string, objectKey: string) =>
    `/api${_PV23}/notepad/${encodeURIComponent(id)}/media?key=${encodeURIComponent(objectKey)}`,
  /** URL do PDF com fuso+locale do operador (datas no fuso/idioma certo, não UTC cru). */
  pdfUrl: (id: string, opts?: { tz?: string; locale?: string }) => {
    const p = new URLSearchParams();
    if (opts?.tz) p.set('tz', opts.tz);
    if (opts?.locale) p.set('locale', opts.locale);
    const q = p.toString();
    return `/api${_PV23}/notepad/${encodeURIComponent(id)}/pdf${q ? `?${q}` : ''}`;
  },
};

// ── Time Series — charts salvos de contagem por bucket temporal ─────
// Bucketiza nós de um node_type por created_at (day/hour), ABAC-filtrado.
// Espelha ontology-module/app/routers/platform_v23/timeseries.py.
export interface TimeSeriesChart {
  id: string;
  slug: string;
  display_name: string;
  node_type: string;
  config: Record<string, unknown>;
  markings: string[];
  created_at: string | null;
}
export interface TimeSeriesRender {
  chart_id: string;
  node_type: string;
  bucket: string;
  total_visible: number;
  series: { bucket: string; count: number }[];
}
export const TimeSeries = {
  list: () => apiFetch<TimeSeriesChart[]>(`${_PV23}/timeseries`),
  create: (body: { slug: string; display_name: string; node_type: string; config?: Record<string, unknown>; markings?: string[] }) =>
    apiFetch<TimeSeriesChart>(`${_PV23}/timeseries`, { method: 'POST', body: JSON.stringify({ config: {}, markings: [], ...body }) }),
  remove: (id: string) => apiFetch<{ status: string }>(`${_PV23}/timeseries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  render: (id: string) => apiFetch<TimeSeriesRender>(`${_PV23}/timeseries/${encodeURIComponent(id)}/render`, { method: 'POST', body: JSON.stringify({}) }),
};

// ── Quiver (análise interativa — free-form analysis do Foundry) ─────
// Notebook = Object Set + cards de análise (métrica/group-by/texto) que rodam ao
// vivo no motor de agregação da Onda 14. Espelha platform_v24/quiver.py.
export interface QuiverCell {
  id: string;
  kind: 'source' | 'metric' | 'group' | 'chart' | 'text';
  object_type?: string;
  op?: string;
  field?: string;
  group_by?: string[];
  text?: string;
  title?: string;
  // Onda 18 (Contour) — filtro do Object Set fonte (predicado AND/OR), na source cell.
  filter?: FilterPredicate | null;
  // Onda 19 — card de gráfico: distribuição (group-by) renderizada como
  // barras/linha/pizza em vez de tabela.
  chart_type?: 'bar' | 'line' | 'pie';
}
export interface QuiverNotebook {
  id: string;
  slug: string;
  display_name: string;
  cells: QuiverCell[];
  created_at: string | null;
  updated_at: string | null;
}
const _PV24 = '/platform/v24';
export const Quiver = {
  list: () => apiFetch<QuiverNotebook[]>(`${_PV24}/quiver/notebooks`),
  get: (id: string) => apiFetch<QuiverNotebook>(`${_PV24}/quiver/notebooks/${id}`),
  create: (b: { slug: string; display_name: string; cells?: QuiverCell[] }) =>
    apiFetch<QuiverNotebook>(`${_PV24}/quiver/notebooks`, {
      method: 'POST', body: JSON.stringify({ ...b, cells: b.cells ?? [] }),
    }),
  update: (id: string, b: { display_name?: string; cells?: QuiverCell[] }) =>
    apiFetch<QuiverNotebook>(`${_PV24}/quiver/notebooks/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  remove: (id: string) => apiFetch<{ deleted: boolean }>(`${_PV24}/quiver/notebooks/${id}`, { method: 'DELETE' }),
};

export interface ConnectorAgent {
  id: string;
  slug: string;
  display_name: string;
  kind: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  // WP-E/WP-F — aditivos do backend: skills bindadas (decide a skill de
  // test/run e o filtro connector.*) + preset de agendamento.
  skill_keys?: string[];
  schedule?: string | null;
}
export interface ConnectorRun {
  id: string;
  agent_id: string;
  agent_slug?: string | null;
  skill_key: string;
  status: string;
  trigger: string;
  queued_at: string;
  started_at?: string | null;
  finished_at: string | null;
  duration_ms?: number | null;
  output_summary: Record<string, unknown>;
  error_message: string | null;
  attempt_number?: number;
}
export interface ConnectorBinding {
  skill_key: string;
  config: Record<string, unknown>;
  active: boolean;
}
export interface ConnectorRegisterBody {
  slug: string;
  display_name: string;
  base_url: string;
  path?: string;
  // WP-F — método/query/body/markings agora viajam até o binding (antes o
  // painel só mandava o básico e a paginação era hardcoded {mode:'none'}).
  method?: string;
  query?: Record<string, string>;
  request_body?: Record<string, unknown>;
  markings?: string[];
  node_type: string;
  id_field: string;
  name_field?: string;
  records_path?: string;
  auth?: Record<string, unknown>;
  pagination?: Record<string, unknown>;
  cron_preset?: string | null;
  // P6a — serializer da Sincronização: como parsear a resposta da Fonte.
  serializer?: { format: string; options?: Record<string, unknown> };
}

// P6a — preview da Sincronização (serializer + schema inferido).
export interface SyncSchemaField {
  key: string;
  type: 'text' | 'number' | 'date' | 'boolean';
}
export interface SyncPreviewResult {
  format: string;
  schema: SyncSchemaField[];
  row_count: number;
  sample_rows: Record<string, unknown>[];
  fetched_from: string | null;
}

const CONNECTOR_SKILL = 'connector.http';

// F7.2b — cross-link conector → datasets que ele materializou.
export interface ConnectorDatasetRef {
  dataset: string;
  rows: number;
  last_at: string | null;
  pulls: number;
}
// Estação WhatsApp — estado do pareamento por QR de uma skill com capability
// 'pairing'. qr_data_url é um data:image/png;base64 pronto p/ <img src>.
export interface PairingInfo {
  state: 'connected' | 'awaiting_scan' | 'disconnected' | 'error';
  qr_data_url: string | null;
  code: string | null;
  expires_at: string | null;
  detail: string;
  // Aditivo (estação de pool): QUAL número está pareando — skills de
  // instância única nunca preenchem.
  pairing_number?: string | null;
}
export const Connectors = {
  list: () => apiFetch<ConnectorAgent[]>('/governance/agents'),
  bindings: (agentId: string) =>
    apiFetch<ConnectorBinding[]>(`/governance/agents/${agentId}/skills`),
  async register(b: ConnectorRegisterBody): Promise<ConnectorAgent> {
    const agent = await apiFetch<ConnectorAgent>('/governance/agents', {
      method: 'POST',
      body: JSON.stringify({
        slug: b.slug,
        display_name: b.display_name,
        kind: 'worker',
        description: 'Conector HTTP',
        config: b.cron_preset ? { cron_preset: b.cron_preset } : {},
      }),
    });
    await apiFetch(`/governance/agents/${agent.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({
        skill_key: CONNECTOR_SKILL,
        active: true,
        config: {
          base_url: b.base_url,
          path: b.path || '',
          method: b.method || 'GET',
          node_type: b.node_type,
          id_field: b.id_field,
          name_field: b.name_field || '',
          records_path: b.records_path || '',
          query: b.query || {},
          request_body: b.request_body || {},
          auth: b.auth || { mode: 'none' },
          pagination: b.pagination || { mode: 'none' },
          serializer: b.serializer || { format: 'json' },
          // markings ausente → o skill aplica o default dele (["OFICIAL"])
          ...(b.markings && b.markings.length ? { markings: b.markings } : {}),
        },
      }),
    });
    return agent;
  },
  // Sprint 1 — registro CATALOG-DRIVEN: qualquer skill de conector do catálogo
  // (connector.* / camera.detect_tick / …) vira conector pelo MESMO trilho
  // governado (Agent kind=worker + SkillBinding com a config do param_schema).
  // ADD ao lado de register (connector.http permanece idêntico).
  async registerSkill(b: {
    slug: string;
    display_name: string;
    skill_key: string;
    config: Record<string, unknown>;
    cron_preset?: string | null;
    description?: string;
  }): Promise<ConnectorAgent> {
    const agent = await apiFetch<ConnectorAgent>('/governance/agents', {
      method: 'POST',
      body: JSON.stringify({
        slug: b.slug,
        display_name: b.display_name,
        kind: 'worker',
        description: b.description || '',
        config: b.cron_preset ? { cron_preset: b.cron_preset } : {},
      }),
    });
    await apiFetch(`/governance/agents/${agent.id}/skills`, {
      method: 'POST',
      body: JSON.stringify({
        skill_key: b.skill_key,
        active: true,
        config: b.config,
      }),
    });
    return agent;
  },
  // WP-F — Ativar/Pausar do painel: PATCH governado do agente (status é o que o
  // tick_connectors seleciona; 'inactive' pausa o agendamento).
  update: (agentId: string, b: { status?: string; display_name?: string; config?: Record<string, unknown> }) =>
    apiFetch<ConnectorAgent>(`/governance/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(b),
    }),
  // WP-F — histórico de execuções de um conector (mais recente primeiro).
  runs: (agentId: string, limit = 20) =>
    apiFetch<ConnectorRun[]>(
      `/governance/agents/runs?agent_id=${encodeURIComponent(agentId)}&limit=${limit}`,
    ),
  retryRun: (runId: string) =>
    apiFetch<ConnectorRun>(`/governance/agents/runs/${runId}/retry`, { method: 'POST' }),
  // P6a — preview da Sincronização: desserializa uma amostra (colada OU buscada
  // da fonte pública) e mostra o schema inferido ANTES de salvar o conector.
  syncPreview: (body: {
    format: string;
    options?: Record<string, unknown>;
    sample?: string;
    source_url?: string;
    method?: string;
    headers?: Record<string, string>;
    request_body?: string;
  }) =>
    apiFetch<SyncPreviewResult>('/platform/v23/pipeline/sync/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // WP-F — a skill vem do binding REAL do agente (skill_keys da lista); o
  // default connector.http é só back-compat de chamadas antigas.
  test: (agentId: string, skillKey: string = CONNECTOR_SKILL) =>
    apiFetch<{ ok: boolean; message: string }>(
      `/governance/agents/${agentId}/skills/${skillKey}/test`,
      { method: 'POST' },
    ),
  // Estação WhatsApp — pareamento por QR. `pairingStart` inicia/renova (POST;
  // {refresh:true} força um novo código); `pairingPoll` é leitura pura (GET)
  // pra acompanhar o estado enquanto o QR está na tela. Espelha
  // /governance/agents/{id}/skills/{skill}/pairing. `target` (aditivo) dirige
  // o gesto a uma sub-unidade — a estação de pool pareia POR NÚMERO.
  pairingStart: (
    agentId: string, skillKey: string,
    opts: { refresh?: boolean; target?: string } = {},
  ) =>
    apiFetch<PairingInfo>(
      `/governance/agents/${agentId}/skills/${skillKey}/pairing`
      + (opts.target ? `?target=${encodeURIComponent(opts.target)}` : ''),
      { method: 'POST', body: JSON.stringify({ refresh: opts.refresh }) },
    ),
  pairingPoll: (agentId: string, skillKey: string, opts: { target?: string } = {}) =>
    apiFetch<PairingInfo>(
      `/governance/agents/${agentId}/skills/${skillKey}/pairing`
      + (opts.target ? `?target=${encodeURIComponent(opts.target)}` : ''),
    ),
  // Inventário do conector (capability genérica `inventory`): cadastrar,
  // corrigir e remover uma sub-unidade — os N números de uma estação de pool.
  // Existe para que isso seja BOTÃO: antes, mexer no inventário exigia editar
  // variável de ambiente e re-deployar. A LEITURA não passa por aqui (a lista
  // já chega pelo snapshot em /edge/nodes → nodes[].pool).
  inventoryApply: (
    agentId: string, skillKey: string,
    op: 'add' | 'update' | 'remove' | 'retry', item: Record<string, unknown>,
  ) =>
    apiFetch<InventoryResult>(
      `/governance/agents/${agentId}/skills/${skillKey}/inventory`,
      { method: 'POST', body: JSON.stringify({ op, item }) },
    ),
  run: (agentId: string, skillKey: string = CONNECTOR_SKILL) =>
    apiFetch<ConnectorRun>(`/governance/agents/${agentId}/run`, {
      method: 'POST',
      body: JSON.stringify({ skill_key: skillKey }),
    }),
  // Fase 3b — "Testar chamada" de um conector JÁ CONFIGURADO (auth+paginação):
  // roda connector.http em modo AMOSTRA (1 página, sem persistir) COM o segredo do
  // Vault, devolve o response REAL → schema (mesmo shape do syncPreview). O segredo
  // nunca volta. Diferente de `test` (só conectividade) e `run` (ingere/persiste).
  sample: (agentId: string, skillKey: string = CONNECTOR_SKILL) =>
    apiFetch<SyncPreviewResult & { truncated?: boolean; pages?: number }>(
      `/governance/agents/${agentId}/skills/${skillKey}/sample`,
      { method: 'POST' },
    ),
  // F7.2b — datasets GERADOS por este conector (agrega connector.materialize).
  datasets: (agentId: string) =>
    apiFetch<ConnectorDatasetRef[]>(`/governance/agents/${agentId}/datasets`),
  // Fase 3b — "Gerar dataset": puxão REAL capado (auth+paginação) → projeta os
  // campos selecionados (keep-only-set) → SNAPSHOT versionado/governado.
  materialize: (
    agentId: string,
    body: { dataset: string; fields?: string[]; max_pages?: number; branch?: string },
    skillKey: string = CONNECTOR_SKILL,
  ) =>
    apiFetch<{ dataset: string; rows: number; pages: number; truncated: boolean }>(
      `/governance/agents/${agentId}/skills/${skillKey}/materialize`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  // Fase 3b — URL do proxy SSE p/ "Gerar dataset" com PROGRESSO POR PÁGINA
  // (EventSource não passa pelo apiFetch). hello → page×N → done. Fallback = materialize.
  materializeStreamUrl: (
    agentId: string,
    skillKey: string,
    body: { dataset: string; fields?: string[]; max_pages?: number; branch?: string },
  ) => {
    const qs = new URLSearchParams({
      dataset: body.dataset,
      fields: (body.fields ?? []).join(','),
      max_pages: String(body.max_pages ?? 10),
      branch: body.branch ?? 'main',
    });
    return `${API_BASE}/governance/agents/${encodeURIComponent(agentId)}/skills/${skillKey}/materialize/stream?${qs.toString()}`;
  },
  schedulerTick: () =>
    apiFetch<{ checked: number; enqueued: number; agents: string[] }>(
      '/governance/agents/scheduler/tick',
      { method: 'POST' },
    ),
};

// Fase 3b — Vault (segredos cifrados). O VALOR nunca volta em list/get; o ref é
// `namespace/slug`. Usado pelo picker de segredo do conector (substitui o input
// técnico de texto livre): listar p/ escolher + cadastrar inline.
export interface VaultSecret {
  id: string;
  namespace: string;
  slug: string;
  display_name: string;
  description: string;
  scope_skill_key: string | null;
  scope_agent_id: string | null;
  kind: string; // "text" | "file"
  last_used_at: string | null;
}
export const Vault = {
  // GET /governance/vault — exige iam.governance; filtra por namespace. Nunca vaza valor.
  listSecrets: (namespace?: string) =>
    apiFetch<VaultSecret[]>(
      `/governance/vault${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`,
    ),
  // POST /governance/vault/skill-secret — create/rotate idempotente. connectors.manage
  // grava refs de conector declaradas; iam.governance grava qualquer ref.
  upsertSkillSecret: (body: {
    namespace: string;
    slug: string;
    display_name: string;
    value: string;
    description?: string;
    scope_skill_key?: string;
  }) =>
    apiFetch<VaultSecret>('/governance/vault/skill-secret', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // ref canônico de um segredo p/ o secret_ref do conector.
  ref: (s: { namespace: string; slug: string }) => `${s.namespace}/${s.slug}`,
};

// Tarefa B (2026-06-11) — AEGIS Edge: equipamentos instalados no local que
// conectam câmeras da rede interna à plataforma. Superfície de OPERADOR
// (perm connectors.manage no servidor): listar, parear (código single-use
// de TTL curto) e revogar. Espelha app/routers/edge.py do ontology-module.
// Onda 4 (débito 3c) — resumo de saúde por edge, derivado pelo backend do
// que o heartbeat já grava no espelho (sem migration). Edge mudo = nulos.
export interface EdgeDiagnosticsSummary {
  selftest_ok: boolean | null; // autoteste do modelo no boot (null = sem dado)
  selftest_persons: number | null; // pessoas detectadas na imagem embutida
  last_error: string | null; // já truncado ≤160 pelo backend
  loop_restarts_total: number; // reinícios do watchdog (self-healing)
  uptime_seconds: number | null;
}
// Estação de POOL — um número do inventário publicado pelo tick da skill no
// espelho do Dispositivo (GET /edge/nodes → nodes[].pool). O estado é o
// vocabulário do pool (paired | awaiting_scan | temp_banned | needs_relink |
// dead | quarantined); a UI só traduz os conhecidos, nunca o valor cru.
// Automação de religação do número (o celular é um edge). Presente SÓ quando
// há aparelho declarado para aquele número — ausência = número no gesto
// manual, e a linha não muda de aparência.
export interface EdgePoolAutomation {
  // 'idle' | 'pending' | 'attempting' | 'confirming' | 'needs_human'
  state?: string;
  attempts?: number;
  max_attempts?: number;
  last_error?: string; // já truncado ≤160 pelo backend
  last_attempt_at?: string; // ISO-8601
  last_success_at?: string; // ISO-8601
  device?: {
    serial?: string;
    battery?: number; // 0 = não informada
    screen_on?: boolean;
    wa_foreground?: boolean;
    at?: string; // ISO-8601 da última telemetria
  };
}
export interface EdgePoolNumber {
  id: string;
  msisdn?: string;
  role?: string; // 'titular' | 'vazao'
  owner?: string;
  state?: string;
  sendable?: boolean;
  needs_gesture?: boolean;
  banned_until?: string | null; // ISO-8601
  sent?: number;
  automation?: EdgePoolAutomation | null;
  // QUEM realmente pareou, quando o gateway informa. Ausente = não sei — o que
  // é diferente de "confere".
  connected_msisdn?: string;
  // Aparelho Android que religa este número (serial do adb). Declarado pelo
  // operador NA LINHA — vazio = número sem automação, gesto humano como hoje.
  device_serial?: string;
  // true = o chip pareado contradiz o cadastrado. Derivado no backend: a regra
  // de "que número é este de verdade" é do inventário, não da tela.
  msisdn_mismatch?: boolean;
}
// Resultado de um gesto de inventário (capability `inventory`). `detail` traz
// a frase do driver ("já existe número com este identificador") — é o
// diagnóstico do operador, e engoli-la deixaria a tela dizendo só "falhou".
export interface InventoryResult {
  ok: boolean;
  detail: string;
  item?: Record<string, unknown> | null;
}
// Aparelho que um runner enxerga no adb AGORA. `state` vem cru do adb
// ('device' pronto, 'unauthorized' falta autorizar, 'offline') — é ele que
// permite a tela dizer o que fazer em vez de só omitir o aparelho.
export interface EdgePoolSeenDevice {
  serial: string;
  state?: string;
  model?: string;
  runner?: string;
  at?: string;
}
export interface EdgePoolSummary {
  station?: string | null;
  // lista para o operador ESCOLHER o aparelho, em vez de digitar o serial
  devices_seen?: EdgePoolSeenDevice[];
  state?: string | null;
  health?: {
    total?: number; sendable?: number; standby?: number;
    needs_gesture?: number; temp_banned?: number; connected?: boolean;
  };
  numbers?: EdgePoolNumber[];
}
// Bancada de Aparelhos (kind='android_bench'): os celulares que os runners
// enxergam. O celular é um edge físico, então a bancada é Dispositivo — e cada
// aparelho é sub-unidade DESCOBERTA (entra e sai), como os números são
// sub-unidades da estação.
export interface EdgeBenchDevice {
  serial: string;
  state?: string;   // 'device' = pronto; 'unauthorized' | 'offline' | ...
  model?: string;
  runner?: string;
  at?: string;
  // número que este aparelho religa (vem do inventário) — ausente = aparelho
  // visível mas não atribuído a nenhum número.
  atende?: string;
  // Declarado pelo OPERADOR no painel (vs. só descoberto pelo adb). Aparelho
  // declarado e ainda ausente do adb aparece com `adoption` explicando por quê —
  // é o caso em que o operador precisa agir.
  declared?: boolean;
  // Endereço de conexão do adb ("ip:porta"). A linha é chaveada pelo IP (a
  // porta muda a cada reinício do aparelho), mas o VÍNCULO com o número usa o
  // endereço completo — é ele que a estação manda ao runner.
  addr?: string;
  adoption?: string;  // 'queued' | 'pairing' | 'ready' | 'failed'
  detail?: string;    // motivo da falha, vindo da estação
  // A senha da tela EXISTE (nunca qual): o retrato não carrega segredo.
  has_pin?: boolean;
  // Aplicativo de mensageria DESTE aparelho (pacote) e os que o runner enxerga
  // instalados. Existe porque adivinhar erra: um celular com WhatsApp e
  // WhatsApp Business abriria o errado e cairia na tela de registro.
  app?: string;
  apps?: string[];
  // Energia: fora do carregador o Android entra em sono profundo, desliga o
  // Wi-Fi e derruba o adb. Ausente = a telemetria ainda não sabe (diferente de
  // "está fora da tomada", que é um aviso de verdade).
  charging?: boolean;
}
export interface EdgeBenchSummary {
  devices?: EdgeBenchDevice[];
  total?: number;
  ready?: number;   // em estado 'device'
  armed?: number;   // declarados em algum número
}
export interface EdgeNodeRow {
  edge_id: string;
  name: string; // pode ser ''
  // Aditivo (Estação WhatsApp): tipo do dispositivo — 'camera_gateway' |
  // 'whatsapp_station' | 'whatsapp_pool' | 'autosync_bridge'. Ausente =
  // legado (tratar como camera_gateway).
  kind?: string;
  // status EFETIVO derivado na leitura pelo backend (staleness): 'online' só
  // com heartbeat < 3× heartbeat_seconds; senão 'offline'; 'paired' = credencial
  // emitida e ainda sem contato; 'revoked' prevalece.
  status: 'online' | 'offline' | 'paired' | 'revoked' | string;
  version: string; // reportada pelo edge; pode ser ''
  last_seen_at: string | null; // ISO-8601 com tz
  update_available: boolean;
  cameras_ok: number | null;
  // opcional só por tolerância a cache/payload legado — o backend sempre manda
  diagnostics_summary?: EdgeDiagnosticsSummary | null;
  // Dispositivo que pareia por conector (estação de mensageria, ponte
  // AutoSync): o par agente+skill que o diálogo de pareamento usa, mais o
  // `slug` do conector — a chave que a ação governada de configuração
  // (aegis.connector.configure) recebe em {connector}. null (ou ausente) =
  // gateway de câmeras, que pareia pelo código global do Edge.
  // `capabilities` são as DECLARADAS pela skill ('pairing', 'inventory', …) —
  // a UI gateia cada gesto por elas, nunca por skill_key chumbada.
  pairing?: {
    agent_id: string; slug: string; skill_key: string;
    capabilities?: string[];
  } | null;
  // Estação de POOL: snapshot dos N números (espelho properties.pool). null/
  // ausente = dispositivo sem pool — a UI rende a lista pela PRESENÇA do
  // dado, nunca por tipo/vertical.
  pool?: EdgePoolSummary | null;
  // Bancada de aparelhos Android — null nos outros Dispositivos. A UI rende
  // pela PRESENÇA do dado, nunca pelo kind.
  bench?: EdgeBenchSummary | null;
}
export interface EdgeNodesResult {
  expected_version: string; // '' = sem release esperada
  nodes: EdgeNodeRow[]; // created_at asc; revogados aparecem
}
export interface EdgePairingCode {
  code: string;
  expires_at: string;
  label: string;
}
// Onda 4 — câmeras DESCOBERTAS na LAN pelo aparelho (WS-Discovery ONVIF +
// porta RTSP), quando o conector camera.stream liga o parâmetro 'discovery'.
// Consumo: listar achados e pré-preencher o cadastro de câmera com
// url=suggested_url e nome sugerido 'Câmera <ip>'.
export interface EdgeDiscoveredCamera {
  ip: string;
  port: number;
  source: 'onvif' | 'rtsp-port';
  suggested_url: string;
  last_seen: string | null; // ISO-8601
}
export interface EdgeDiscoveredGroup {
  edge_id: string;
  edge_name: string; // pode ser ''
  cameras: EdgeDiscoveredCamera[]; // last_seen desc; vazio = sem achado
}
export const Edge = {
  nodes: () => apiFetch<EdgeNodesResult>('/api/v1/edge/nodes'),
  // Só edges NÃO-revogados entram; mesma perm de operador (connectors.manage).
  discovered: () => apiFetch<EdgeDiscoveredGroup[]>('/api/v1/edge/discovered'),
  // O código em claro aparece SÓ nesta resposta (hash at rest no backend).
  // `grants` concede GESTOS ao Dispositivo que resgatar este codigo (ex.:
  // ['retry'] para o app de mesa poder religar um numero). Vazio = so le
  // saude, que e' o default de proposito: privilegio minimo.
  createPairingCode: (
    b: { label?: string; ttl_seconds?: number; grants?: string[] } = {},
  ) =>
    apiFetch<EdgePairingCode>('/api/v1/edge/pairing-codes', {
      method: 'POST',
      body: JSON.stringify(b),
    }),
  // Efeito imediato: o edge perde o acesso (config/frames/heartbeat → 401).
  revoke: (edgeId: string) =>
    apiFetch<{ edge_id: string; status: string; revoked: boolean }>(
      `/api/v1/edge/${edgeId}/revoke`,
      { method: 'POST' },
    ),
};

// DLQ operável (2026-06-12) — pipeline de detecções na central de conectores.
// Espelho de /api/v1/events/pipeline (router events_pipeline.py): estado do
// barramento (backlog + fila-morta) e o ciclo da DLQ (listar / reprocessar /
// descartar). Perms: events.pipeline.view (GET) / events.pipeline.manage (POST).
export interface PipelineConsumerGroup {
  name: string;
  consumers: number;
  pending: number;
}
export interface PipelineStatus {
  bus_kind: string; // memory | redis | redpanda
  topic: string;
  group: string;
  pending: number; // backlog do grupo consumidor (entregues sem ACK)
  dlq_count: number;
  // melhor-esforço: lista por grupo no perfil redis; null onde o substrato
  // não expõe barato (a UI mostra a ausência, nunca um zero inventado)
  consumers: PipelineConsumerGroup[] | null;
}
export interface PipelineDlqItem {
  id: string;
  key: string; // chave de partição (tenant:fonte) — a ORIGEM da mensagem
  reason: string; // ex.: 'max_deliveries=5'
  orig_id: string | null;
  ts: string | null; // ISO-8601 — quando caiu na fila-morta
  payload: {
    event_id: string | null;
    kind: string | null;
    source_id: string | null;
    preview: string; // JSON truncado (≤240) — o envelope completo fica na DLQ
  };
}
export interface PipelineDlqResult {
  topic: string;
  count: number;
  items: PipelineDlqItem[]; // mais novas primeiro
}
// Seleção EXPLÍCITA (regra anti-acidente do backend): ids não-vazios OU
// all=true — nunca os dois, nunca implícito (400 caso contrário).
export interface PipelineDlqSelection {
  ids?: string[];
  all?: boolean;
}
export const EventsPipeline = {
  status: () => apiFetch<PipelineStatus>('/api/v1/events/pipeline/status'),
  dlq: (limit = 50) =>
    apiFetch<PipelineDlqResult>(`/api/v1/events/pipeline/dlq?limit=${limit}`),
  // Republica na fila principal (envelope intacto; idempotência por event_id
  // absorve duplicata) e remove da fila-morta. Auditado em lineage.
  retry: (sel: PipelineDlqSelection) =>
    apiFetch<{ topic: string; retried: number; ids: string[] }>(
      '/api/v1/events/pipeline/dlq/retry',
      { method: 'POST', body: JSON.stringify(sel) },
    ),
  // Descarta sem republicar (gesto destrutivo). Auditado em lineage.
  purge: (sel: PipelineDlqSelection) =>
    apiFetch<{ topic: string; purged: number; ids: string[] }>(
      '/api/v1/events/pipeline/dlq/purge',
      { method: 'POST', body: JSON.stringify(sel) },
    ),
};

// #2 — ativação de skills openclaw curadas (descobríveis → registradas no worker).
// Reusa o endpoint real de governança (install no gateway + refresh do registry).

// Um parâmetro declarado de uma fonte (skill/conector). Dirige o form genérico do
// nó de Coleta — multidomínio: os campos vêm do schema, nunca hardcoded.
export interface SkillParam {
  key: string;
  label: string;
  param_type: string; // string | number | boolean | enum | secret | ...
  required: boolean;
  default?: unknown;
  description?: string;
  enum_values?: string[];
  secret_scope?: string | null;
  placeholder?: string;
  /**
   * Task 1 — Dynamic dropdown source. When set, the field renders a
   * lazy-loaded dropdown instead of a free-text input:
   *   'object_types' → Ontology.listNodeTypes()
   *   'properties'   → Ontology.objectTypeSchema(dependsOnValue).properties
   *   'sources'      → Sources.list()
   *   'datasets'     → Datasets.list()
   *   'markings'     → Markings.list()
   *   'projects'     → Projects.list()
   *   'cameras'      → Cctv.streams.list() (Tarefa B — valor = id do stream)
   *   'detector_classes' → Cctv.detector.classes() (Tarefa A — classes
   *                        válidas do detector ativo; com multi=true → CHIPS)
   */
  dynamic_source?: 'object_types' | 'properties' | 'sources' | 'datasets' | 'markings' | 'projects' | 'cameras' | 'detector_classes' | 'media_sets';
  /**
   * Key of another param that provides context for this dynamic dropdown.
   * Used by 'properties' source: the chosen object type comes from the
   * param named by this field.
   */
  dynamic_depends_on?: string;
  /**
   * Tarefa A — multi-seleção sobre a fonte dinâmica: a UI renderiza CHIPS
   * (busca + adicionar/remover) em vez de dropdown single. O VALOR submetido
   * segue o contrato do param (ex.: CSV canônico p/ param_type='string').
   */
  multi?: boolean;
  /**
   * Tarefa C — limites ESTRUTURADOS p/ params numéricos (int/float), vindos
   * do param_schema do backend (SkillParamRow). O form aplica min/max no
   * input e valida client-side; o clamp server-side permanece como defesa.
   */
  min?: number | null;
  max?: number | null;
}
export interface SkillCatalogRow {
  skill_key: string;
  label: string;
  description: string;
  category: string;
  source: string; // native | clawhub
  platforms: string[];
  requires_secrets: string[];
  param_schema: SkillParam[];
  // Aditivo — capacidades declaradas da skill (ex.: ['pairing'] para estações
  // que pareiam por QR). Ausente/vazio = sem capacidades extras.
  capabilities?: string[];
}
export const Skills = {
  // Catálogo de fontes (native registrado + clawhub curado) com o param_schema
  // declarado de cada uma — a fonte da verdade do form do nó de Coleta.
  catalog: (source?: 'native' | 'clawhub') =>
    apiFetch<SkillCatalogRow[]>(
      '/governance/agents/skills' + (source ? `?source=${source}` : ''),
    ),
  // Aceita o skill_key canônico (openclaw:<slug>) OU o slug puro; envia o slug.
  installOpenclaw: (skillKeyOrSlug: string) =>
    apiFetch<{ installed: boolean; discovered: string[] }>(
      '/governance/agents/skills/openclaw/install',
      {
        method: 'POST',
        body: JSON.stringify({
          slug: skillKeyOrSlug.replace(/^openclaw:/, ''),
        }),
      },
    ),
};

// ─────────────────────────────────────────────────────────────────────────────
// V1 visão→georref→mapa — Provedores de Computação (BYOM multi-provider).
// Espelha o router /compute do ontology-module: a credencial entra no create/
// update e NUNCA volta (Vault); jurisdição/certificações são exibidas honestas.
// ─────────────────────────────────────────────────────────────────────────────
export interface ComputeProviderRow {
  id: string;
  slug: string;
  display_name: string;
  vendor: string;
  provider_kind: 'edge' | 'cloud_inference' | 'cloud_gpu';
  base_url: string | null;
  country: string | null;
  jurisdictions: string[];
  capabilities: string[];
  cert_metadata: Record<string, string | boolean>;
  pricing_hint: string | null;
  enabled: boolean;
  has_credential: boolean;
  validation_status: string | null;
  created_at: string;
}

export interface ComputeVendorPreset {
  vendor: string;
  label: string;
  provider_kind: string;
  country: string | null;
  jurisdictions: string[];
  capabilities: string[];
  cert_metadata: Record<string, string | boolean>;
  pricing_hint: string | null;
  requires_api_key: boolean;
  requires_base_url: boolean;
  notes: string;
}

export interface ComputeProviderCreate {
  display_name: string;
  vendor: string;
  api_key?: string;
  base_url?: string;
  country?: string;
  jurisdictions?: string[];
  capabilities?: string[];
  enabled?: boolean;
}

export interface VisionDetection {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  confidence?: number;
  label?: string;
  geopoint?: { lat: number; lng: number };
  // S2 — segmentação: polígono normalizado 0-1 e geoshape georreferenciado.
  polygon?: number[][];
  geoshape?: { type: string; coordinates: number[][][] };
}

export interface VisionCountResult {
  count: number;
  detections: VisionDetection[];
  provider: string;
  vendor: string;
  provider_kind: string;
  capability?: string;
  output_as?: string;
  jurisdictions: string[];
}

// S1/S4 — recomendação de modelo por capacidade estrutural (vocabulário × saída
// × intenção de hospedagem). O AIP propõe; o operador escolhe.
export interface VisionModelCandidate {
  key: string;
  label: string;
  vocabulary: string;
  output: string;
  hostings: string[];
  provider_hint: string;
  route: string;
  jurisdictions: string[];
  capability: string;
  cost_hint: string;
  coldstart_hint: string;
  notes?: string;
}
export interface SelectModelResult {
  classification: { vocabulary: string; output: string; reason: string };
  intention: string | null;
  jurisdiction: string | null;
  recommended: VisionModelCandidate | null;
  candidates: VisionModelCandidate[];
  tradeoffs: string[];
}

export const Compute = {
  catalog: () =>
    apiFetch<{ vendors: ComputeVendorPreset[]; capabilities: string[] }>(
      '/compute/providers/catalog',
    ),
  list: () => apiFetch<ComputeProviderRow[]>('/compute/providers'),
  create: (body: ComputeProviderCreate) =>
    apiFetch<ComputeProviderRow>('/compute/providers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<ComputeProviderCreate>) =>
    apiFetch<ComputeProviderRow>(`/compute/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/compute/providers/${id}`, { method: 'DELETE' }),
  test: (id: string) =>
    apiFetch<{ ok: boolean; message: string }>(`/compute/providers/${id}/test`, {
      method: 'POST',
    }),
  visionCount: (body: {
    image_url: string;
    instruction: string;
    provider?: string;
    jurisdiction?: string;
    capability?: 'detect' | 'segment';
    output_as?: 'geoshape' | 'point';
    geo_bounds?: { nw: { lat: number; lng: number }; se: { lat: number; lng: number } };
  }) =>
    apiFetch<VisionCountResult>('/compute/vision/count', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Onda 2.1 — visão ASSÍNCRONA: a UI nunca toma timeout no cold-start do GPU.
  // submete → recebe job_id na hora → POLLA o status mostrando "GPU inicializando".
  visionJobSubmit: (body: { image_url: string; instruction?: string; provider?: string }) =>
    apiFetch<{ provider_id: string; provider: string; endpoint_id: string; job_id: string; status: string }>(
      '/compute/vision/jobs', { method: 'POST', body: JSON.stringify(body) }),
  visionJobStatus: (providerId: string, endpointId: string, jobId: string) =>
    apiFetch<{
      status: string; delay_ms?: number; execution_ms?: number; error?: string;
      count?: number;
      detections?: { x_min: number; y_min: number; x_max: number; y_max: number; confidence?: number; label?: string }[];
    }>(`/compute/vision/jobs/${providerId}/${endpointId}/${jobId}`),
  // toggle "manter aquecida" (workers_min 1/0) — elimina cold-start, gera custo.
  visionWarm: (warm: boolean, provider?: string) =>
    apiFetch<{ endpoint_id: string; warm: boolean; workers_min: number }>(
      '/compute/vision/warm', { method: 'POST', body: JSON.stringify({ warm, ...(provider ? { provider } : {}) }) }),
  // S1/S4 — o AIP recomenda o modelo por intenção (não por provider).
  selectModel: (objective: string, intention?: string, jurisdiction?: string) =>
    apiFetch<SelectModelResult>('/compute/vision/select-model', {
      method: 'POST',
      body: JSON.stringify({
        objective,
        ...(intention ? { intention } : {}),
        ...(jurisdiction ? { jurisdiction } : {}),
      }),
    }),

  // V3 — pista programável (read + ações de operador). O AIP cria/publica via
  // chat; aqui o operador VÊ e opera o que existe (deploy de release, limpar).
  listReleases: () =>
    apiFetch<{ releases: ComputeRelease[] }>('/compute/releases'),
  listEndpoints: (providerId: string) =>
    apiFetch<{ endpoints: ComputeEndpoint[] }>(`/compute/providers/${providerId}/endpoints`),
  endpointHealth: (providerId: string, endpointId: string) =>
    apiFetch<{ health: { workers?: Record<string, number>; jobs?: Record<string, number> } }>(
      `/compute/providers/${providerId}/endpoints/${endpointId}/health`),
  deleteEndpoint: (providerId: string, endpointId: string) =>
    apiFetch<{ deleted: boolean }>(
      `/compute/providers/${providerId}/endpoints/${endpointId}`, { method: 'DELETE' }),
  promoteRelease: (name: string, version: number, minEvalScore = 0.8) =>
    apiFetch<{ release: ComputeRelease }>('/compute/releases/promote', {
      method: 'POST',
      body: JSON.stringify({ name, version, min_eval_score: minEvalScore }),
    }),
  deployRelease: (providerId: string, name: string, channel: string, extra: Record<string, unknown> = {}) =>
    apiFetch<{ release: ComputeRelease; endpoint: ComputeEndpoint }>(
      `/compute/providers/${providerId}/releases/deploy`, {
        method: 'POST',
        body: JSON.stringify({ name, channel, ...extra }),
      }),
  listPods: (providerId: string) =>
    apiFetch<{ pods: Array<Record<string, unknown>> }>(`/compute/providers/${providerId}/pods`),
};

export interface ComputeRelease {
  id: string;
  name: string;
  version: number;
  image: string;
  channel: 'staging' | 'production';
  eval_score: number | null;
  endpoint_id: string | null;
  provider_slug: string | null;
  created_at: string | null;
  promoted_at: string | null;
}

export interface ComputeEndpoint {
  id: string;
  name?: string;
  [k: string]: unknown;
}

/** Wave H.2 — Enriched JSON Schema field for the dynamic form. */
export interface ActionFormField {
  key: string;
  type:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'enum'
    | 'array'
    | 'date'
    | 'object_ref';
  title: string;
  description: string | null;
  required: boolean;
  enum: unknown[] | null;
  default: unknown | null;
  minimum: number | null;
  maximum: number | null;
  min_length: number | null;
  max_length: number | null;
  pattern: string | null;
  items_type: string | null;
  ref_node_type: string | null;
  placeholder: string | null;
  format: string | null;
}

export interface ActionFormSchemaOut {
  action_id: string;
  action_name: string;
  fields: ActionFormField[];
}

export interface ActionValidationError {
  key: string;
  message: string;
}

export interface ActionValidateOut {
  valid: boolean;
  errors: ActionValidationError[];
}

// ─── Forms — Onda K.2 (2026-05-23) ────────────────────────────────────────
// Form Widget rico do editor de Páginas/Workshop. O submit respeita a
// política de visibilidade (public/requires_auth/requires_perm), reavalia
// condicional + validação server-side e grava via ActionType OU criando um
// nó na ontologia. LineageEvent `form.submit` é emitido pelo backend.

/** Regra condicional nível Salesforce: `quando X op Y → effect este campo`. */
export interface FormConditionalRule {
  when_field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'contains'
    | 'is_empty'
    | 'is_not_empty'
    | 'in';
  value?: unknown;
  effect: 'show' | 'hide' | 'require';
}

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'date'
  | 'datetime'
  | 'time'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox_group'
  | 'lookup'
  | 'file'
  | 'hidden'
  | 'section'
  | 'computed';

/** Definição de UM campo do form (espelha FieldSpec do backend). */
export interface FormFieldSpec {
  key: string;
  label?: string;
  type: FormFieldType;
  required?: boolean;
  minimum?: number | null;
  maximum?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  pattern?: string | null;
  custom_message?: string | null;
  ref_node_type?: string | null;
  /** Campo de RELAÇÃO: ao preencher (lookup), o writeback cria uma aresta
   *  (source=novo nó, target=valor escolhido) com este relation_type. */
  relation_type?: string | null;
  options?: unknown[];
  rules?: FormConditionalRule[];
  // UI-only (não enviados ao backend de validação): placeholder, default
  // source dinâmico, e fórmula de campo computed.
  placeholder?: string;
  default_source?: string;
  compute_expr?: string;
  // Foundry-grade (2026-06-07): formato/adorno/visibilidade. format = currency|percent|
  // email|url|cpf|cnpj|phone|geopoint|…; prefix/suffix/unit = adornos do input (R$, %,
  // kg); help_text = guia sob o label; visibility = prominent|normal|hidden; identifier =
  // chave humana (monospace/copiável).
  format?: string;
  prefix?: string;
  suffix?: string;
  unit?: string;
  help_text?: string;
  visibility?: 'normal' | 'prominent' | 'hidden';
  identifier?: boolean;
}

export type FormVisibilityPolicy = 'public' | 'requires_auth' | 'requires_perm';

export interface FormSubmitBody {
  form_key: string;
  fields: FormFieldSpec[];
  payload: Record<string, unknown>;
  visibility_policy: FormVisibilityPolicy;
  required_perm?: string | null;
  action_id?: string | null;
  target_node_type?: string | null;
  note?: string | null;
}

export interface FormSubmitOut {
  submission_id: string;
  status: 'submitted' | 'denied' | 'failed';
  result: Record<string, unknown>;
  lineage_event_id: string | null;
  validation_errors: ActionValidationError[];
  deny_reason: string | null;
}

export interface FormSubmissionRow {
  id: string;
  form_key: string;
  visibility_policy: FormVisibilityPolicy;
  required_perm: string | null;
  writeback_kind: 'action' | 'node';
  action_id: string | null;
  target_node_type: string | null;
  status: string;
  submitted_by: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  lineage_event_id: string | null;
  created_at: string | null;
}

export const Forms = {
  submit: (body: FormSubmitBody) =>
    apiFetch<FormSubmitOut>('/platform/v23/forms/submit', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submissions: (params?: { form_key?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.form_key) qs.set('form_key', params.form_key);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const s = qs.toString();
    return apiFetch<FormSubmissionRow[]>(
      `/platform/v23/forms/submissions${s ? '?' + s : ''}`,
    );
  },
};

// ─── Sprint L10 · Pilots (multi-step sequential, human-in-the-loop) ─────────
// Backend POST /platform/v23/pilots/start corre steps em fail-fast; quando
// um step não é auto_approvable, pausa criando CPApproval (Sprint L5).
// GET /{pilot_run_id} agrega via LineageEvent.metadata_.pilot_run_id.

export interface PilotStepIn {
  action_id: string;
  input?: Record<string, unknown>;
  note?: string;
  /**
   * Wave D.1 — DAG mode. Lista de step_indexes (0-based) que devem
   * estar SUCCESS antes desse step rodar. Lista vazia = entra na
   * primeira onda (sem deps).
   */
  depends_on?: number[];
}

export interface PilotStepOut {
  step_index: number;
  action_id: string;
  action_name: string;
  /** SUCCESS | FAILED | POLICY_DENIED | PENDING_APPROVAL | SKIPPED */
  status: string;
  output: Record<string, unknown>;
  execution_id?: string | null;
  lineage_event_id?: string | null;
  duration_ms?: number | null;
  approval_id?: string | null;
  depends_on?: number[];
}

export interface PilotRunOut {
  pilot_run_id: string;
  goal: string;
  /** SUCCESS | FAILED | PAUSED */
  status: 'SUCCESS' | 'FAILED' | 'PAUSED';
  steps: PilotStepOut[];
  started_at: string;
  finished_at?: string | null;
}

/**
 * Wave C.1 — item resumido devolvido por GET /platform/v23/pilots.
 *
 * Não inclui detalhe de steps; UI usa esse shape para listagem do histórico
 * persistido (Sprint L10 antes mantinha só em React state).
 */
export interface PilotListItem {
  pilot_run_id: string;
  goal: string;
  status: 'SUCCESS' | 'FAILED' | 'PAUSED' | 'PENDING' | string;
  started_at: string;
  finished_at?: string | null;
  initiated_by: string;
  n_steps: number;
}

/**
 * Wave D.1 — devolvido por POST /pilots/{id}/resume. Mostra qual step
 * destravou e quais rodaram em sequência após o resume.
 */
export interface PilotResumeOut {
  pilot_run_id: string;
  /** SUCCESS | FAILED | PAUSED */
  status: 'SUCCESS' | 'FAILED' | 'PAUSED' | string;
  resumed_step_index: number;
  steps_executed: number[];
  finished_at?: string | null;
}

/**
 * Wave H.3 — template descritivo devolvido por GET /pilots/templates.
 *
 * UI conversacional usa ``action_code_ref_hint`` p/ casar contra o
 * catálogo de ActionType e pré-popular o plano editável.
 */
export interface PilotTemplateStep {
  title: string;
  note: string;
  action_code_ref_hint?: string | null;
  input_hint: Record<string, unknown>;
}

export interface PilotTemplate {
  id: string;
  label: string;
  description: string;
  goal: string;
  steps: PilotTemplateStep[];
}

export const Pilots = {
  start: (goal: string, steps: PilotStepIn[]) =>
    apiFetch<PilotRunOut>('/platform/v23/pilots/start', {
      method: 'POST',
      body: JSON.stringify({ goal, steps }),
    }),
  /** Wave H.3 — templates hard-coded servidos pelo backend. */
  templates: () =>
    apiFetch<PilotTemplate[]>('/platform/v23/pilots/templates'),
  get: (id: string) =>
    apiFetch<PilotRunOut>(`/platform/v23/pilots/${id}`),
  /**
   * Wave D.1 — retoma um pilot PAUSED após CPApproval aprovado.
   *
   * Backend valida approval.status==approved + 4-eyes (requester !=
   * decided_by_id), executa o step pendente e continua waves
   * restantes do DAG.
   */
  resume: (id: string) =>
    apiFetch<PilotResumeOut>(`/platform/v23/pilots/${id}/resume`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  /**
   * Wave C.1 — lista pilots persistidos do tenant.
   *
   * Ordenado por started_at desc. ``initiated_by=me`` filtra ao usuário
   * corrente. ``status`` filtra por SUCCESS/FAILED/PAUSED/PENDING.
   */
  list: (params?: { initiated_by?: 'me' | string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.initiated_by) qs.set('initiated_by', params.initiated_by);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    return apiFetch<PilotListItem[]>(`/platform/v23/pilots${s ? '?' + s : ''}`);
  },
  /** Atalho: lista do usuário corrente. */
  listMine: (limit = 50) =>
    apiFetch<PilotListItem[]>(
      `/platform/v23/pilots?initiated_by=me&limit=${limit}`,
    ),
};

// ─── Sprint L11 · Autopilot (single-action loop com budget + terminator) ────
// Backend POST /platform/v23/autopilot/run só aceita actions com
// auto_approvable=True; loop bounded por max_steps + max_duration_s, com
// terminator opcional (output_contains | output_eq_path/value).

export interface AutopilotTerminator {
  output_contains?: string | null;
  output_eq_path?: string | null;
  output_eq_value?: unknown;
}

export interface AutopilotStepOut {
  step_index: number;
  status: string;
  output: Record<string, unknown>;
  duration_ms?: number | null;
  lineage_event_id?: string | null;
}

export interface AutopilotRunOut {
  autopilot_run_id: string;
  goal: string;
  action_id: string;
  /** SUCCESS | FAILED | BUDGET_EXHAUSTED | TERMINATED */
  status: string;
  reason: string;
  steps_ran: number;
  elapsed_s: number;
  steps: AutopilotStepOut[];
  started_at: string;
  finished_at: string;
}

/**
 * Wave C.1 — item resumido devolvido por GET /platform/v23/autopilot.
 *
 * Não inclui detalhe dos steps; UI usa para listar runs do tenant após reload.
 */
export interface AutopilotListItem {
  autopilot_run_id: string;
  goal: string;
  action_id: string;
  action_name: string;
  status: string;
  reason: string;
  started_at: string;
  finished_at?: string | null;
  initiated_by: string;
  steps_ran: number;
  elapsed_s: number;
}

export const Autopilot = {
  run: (params: {
    goal: string;
    action_id: string;
    input?: Record<string, unknown>;
    note?: string;
    max_steps?: number;
    max_duration_s?: number;
    terminator?: AutopilotTerminator;
  }) =>
    apiFetch<AutopilotRunOut>('/platform/v23/autopilot/run', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  get: (id: string) =>
    apiFetch<AutopilotRunOut>(`/platform/v23/autopilot/${id}`),
  /**
   * Wave C.1 — lista autopilots persistidos do tenant.
   *
   * Ordenado por started_at desc; aceita filtro ``initiated_by=me`` +
   * ``status`` (SUCCESS/FAILED/BUDGET_EXHAUSTED/TERMINATED/PENDING).
   */
  list: (params?: { initiated_by?: 'me' | string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.initiated_by) qs.set('initiated_by', params.initiated_by);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    return apiFetch<AutopilotListItem[]>(
      `/platform/v23/autopilot${s ? '?' + s : ''}`,
    );
  },
  listMine: (limit = 50) =>
    apiFetch<AutopilotListItem[]>(
      `/platform/v23/autopilot?initiated_by=me&limit=${limit}`,
    ),
};

// ─── Sprint L7 · AIP Logic Functions (invoke) ──────────────────────────────

export interface AipLogicFunctionOut {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  prompt: string;
  signature: Record<string, unknown>;
  version: number;
  created_at: string | null;
}

export interface AipLogicInvokeResult {
  function_id: string;
  output: string;
  version: number;
  few_shot_count: number;
}

export const AipLogic = {
  list: () => apiFetch<AipLogicFunctionOut[]>('/platform/v23/aip-logic'),
  get: (id: string) =>
    apiFetch<AipLogicFunctionOut>(
      `/platform/v23/aip-logic/${encodeURIComponent(id)}`,
    ),
  invoke: (id: string, inputs: Record<string, unknown>) =>
    apiFetch<AipLogicInvokeResult>(
      `/platform/v23/aip-logic/${encodeURIComponent(id)}/invoke`,
      { method: 'POST', body: JSON.stringify({ inputs }) },
    ),
};

// ─── UX-1.1 · Me Context (Sprint UX-1.1, 2026-05-22) ───────────────────────

export interface MeContext {
  organization_id: string;
  organization_name: string;
  space_id: string | null;
  space_name: string | null;
  project_id: string | null;
  project_name: string | null;
}

export interface OrganizationMembership {
  id: string;
  slug: string;
  display_name: string;
  role: 'owner' | 'guest' | 'admin';
  active: boolean;
}

// M3 — vendor dev-mode. A senha é verificada server-side (hmac) e NUNCA
// fica no front além do POST de ativação; o backend devolve só {enabled,until}.
export interface DevModeStatus {
  enabled: boolean;
  until: string | null;
}

export const MeContextApi = {
  get: () => apiFetch<MeContext>('/me/context'),
  set: (body: {
    organization_id?: string | null;
    space_id?: string | null;
    project_id?: string | null;
  }) =>
    apiFetch<MeContext>('/me/context', {
      method: 'PUT',
      body: JSON.stringify({
        organization_id: body.organization_id ?? undefined,
        space_id: body.space_id ?? undefined,
        project_id: body.project_id ?? undefined,
      }),
    }),
  listOrganizations: () =>
    apiFetch<OrganizationMembership[]>('/me/organizations'),
  // Ativa dev-mode (vendor). Requer role vendor + senha correta (server-side).
  enableDevMode: (password: string) =>
    apiFetch<DevModeStatus>('/me/dev-mode', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  // Desativa dev-mode da sessão atual.
  disableDevMode: () =>
    apiFetch<DevModeStatus>('/me/dev-mode', { method: 'DELETE' }),
};

// M3 — domínios licenciados do tenant (vendor-only) + catálogo fechado.
export interface VendorTenantDomains {
  tenant_id: string;
  allowed_domains: string[];
  catalog: string[];
}

export interface DomainOption {
  slug: string;
  label: string;
}

export interface VendorNavOverrides {
  hidden: string[];
}

export const VendorApi = {
  listDomains: () => apiFetch<DomainOption[]>('/domains'),
  getTenantDomains: () => apiFetch<VendorTenantDomains>('/vendor/tenant-domains'),
  setTenantDomains: (allowed_domains: string[]) =>
    apiFetch<VendorTenantDomains>('/vendor/tenant-domains', {
      method: 'PUT',
      body: JSON.stringify({ allowed_domains }),
    }),
  getNavOverrides: () => apiFetch<VendorNavOverrides>('/vendor/nav-overrides'),
  setNavOverrides: (hidden: string[]) =>
    apiFetch<VendorNavOverrides>('/vendor/nav-overrides', {
      method: 'PUT',
      body: JSON.stringify({ hidden }),
    }),
};

// ─── Sprint L12 · Scenarios (what-if patches sobre ontology) ─────────────────

export interface NodePatch {
  node_id: string;
  props?: Record<string, unknown> | null;
  markings?: string[] | null;
  name?: string | null;
}

export interface PropDiff {
  key: string;
  before: unknown;
  after: unknown;
  op: 'add' | 'update' | 'noop';
}

export interface NodeDiff {
  node_id: string;
  found: boolean;
  current_name?: string | null;
  current_kind?: string | null;
  props_diff: PropDiff[];
  markings_before: string[];
  markings_after: string[];
  name_before?: string | null;
  name_after?: string | null;
  deny_reason?: string | null;
}

export interface ScenarioPreview {
  scenario_id: string;
  name: string;
  description: string;
  summary: string;
  diffs: NodeDiff[];
  hash: string;
}

export interface ScenarioMergeOut {
  scenario_id: string;
  name: string;
  merged: number;
  skipped: number;
  events: string[];
}

/**
 * Wave C.1 — item resumido devolvido por GET /platform/v23/scenarios.
 *
 * Cada item representa 1 cenário aplicado (merge) ou em rascunho. UI
 * mostra como bloco "Histórico" na página /painel-de-controle/scenarios.
 */
export interface ScenarioListItem {
  scenario_id: string;
  name: string;
  description: string;
  status: 'draft' | 'merged' | 'discarded' | string;
  merged_count: number;
  skipped_count: number;
  scenario_hash: string;
  created_by: string;
  created_at: string;
  merged_at?: string | null;
}

export const Scenarios = {
  preview: (body: { name: string; description?: string; patches: NodePatch[] }) =>
    apiFetch<ScenarioPreview>('/platform/v23/scenarios/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  merge: (body: { name: string; description?: string; patches: NodePatch[] }) =>
    apiFetch<ScenarioMergeOut>('/platform/v23/scenarios/merge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /**
   * Wave C.1 — lista cenários persistidos do tenant.
   *
   * Ordenado por created_at desc. Filtros: ``initiated_by=me`` +
   * ``status`` (draft/merged/discarded).
   */
  list: (params?: { initiated_by?: 'me' | string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.initiated_by) qs.set('initiated_by', params.initiated_by);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    return apiFetch<ScenarioListItem[]>(
      `/platform/v23/scenarios${s ? '?' + s : ''}`,
    );
  },
  listMine: (limit = 50) =>
    apiFetch<ScenarioListItem[]>(
      `/platform/v23/scenarios?initiated_by=me&limit=${limit}`,
    ),

  // ─── Wave D.1 · Branch isolation (sandbox antes do merge) ─────────────────
  /**
   * Cria uma branch ativa sobre o scenario. Ghost patches são
   * persistidos no row da branch — não tocam OntologyNodes ainda.
   *
   * Quando ``scenarioId === 'draft'``, o backend cria um ScenarioRun
   * novo em status=draft junto com a branch (use-case principal: UI
   * vem direto do /preview sem ter chamado /merge antes).
   *
   * Para aplicar definitivo: ``commitBranch``. Para descartar:
   * ``discardBranch``.
   */
  createBranch: (
    scenarioId: string,
    patches: NodePatch[],
    extra?: { name?: string; description?: string },
  ) =>
    apiFetch<ScenarioBranchOut>(
      `/platform/v23/scenarios/${encodeURIComponent(scenarioId)}/branch`,
      {
        method: 'POST',
        body: JSON.stringify({ patches, ...extra }),
      },
    ),
  /**
   * Devolve uma "view" da ontologia com ghost patches aplicados.
   * Read-only. Cada nó é resolvido contra o OntologyNode atual e
   * o resultado é o estado simulado.
   */
  getBranchOntology: (scenarioId: string, branchId: string) =>
    apiFetch<ScenarioBranchOntologyOut>(
      `/platform/v23/scenarios/${encodeURIComponent(scenarioId)}/branches/${encodeURIComponent(branchId)}/ontology`,
    ),
  /**
   * Commit definitivo: aplica ghost_patches como UPDATE real (cada
   * nó altera version + emite LineageEvent scenario.merge). Marca
   * branch=merged + scenario=merged.
   */
  commitBranch: (scenarioId: string, branchId: string) =>
    apiFetch<ScenarioBranchCommitOut>(
      `/platform/v23/scenarios/${encodeURIComponent(scenarioId)}/branches/${encodeURIComponent(branchId)}/commit`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
  /** Descarta a branch (status=discarded). Não toca em OntologyNodes. */
  discardBranch: (scenarioId: string, branchId: string) =>
    apiFetch<ScenarioBranchDiscardOut>(
      `/platform/v23/scenarios/${encodeURIComponent(scenarioId)}/branches/${encodeURIComponent(branchId)}`,
      { method: 'DELETE' },
    ),
};

/**
 * Wave D.1 — branch ativa sobre um scenario. Operador pode criar,
 * inspecionar a ontologia simulada e então commit ou discard.
 */
export interface ScenarioBranchOut {
  branch_id: string;
  scenario_id: string;
  /** active | merged | discarded */
  status: 'active' | 'merged' | 'discarded' | string;
  ghost_patches: NodePatch[];
  created_at: string;
  merged_at?: string | null;
  discarded_at?: string | null;
  created_by?: string | null;
}

/** Wave D.1 — nó simulado (estado after-patches). */
export interface ScenarioBranchNodeView {
  node_id: string;
  found: boolean;
  name?: string | null;
  node_type?: string | null;
  properties: Record<string, unknown>;
  markings: string[];
  deny_reason?: string | null;
}

/** Wave D.1 — ontologia simulada da branch (read-only). */
export interface ScenarioBranchOntologyOut {
  branch_id: string;
  scenario_id: string;
  status: 'active' | 'merged' | 'discarded' | string;
  nodes: ScenarioBranchNodeView[];
}

/** Wave D.1 — devolvido por POST /commit. */
export interface ScenarioBranchCommitOut {
  branch_id: string;
  scenario_id: string;
  status: 'merged';
  merged: number;
  skipped: number;
  events: string[];
}

/** Wave D.1 — devolvido por DELETE /. */
export interface ScenarioBranchDiscardOut {
  branch_id: string;
  scenario_id: string;
  status: 'discarded';
}

// ─── Sprint L13 · AIPLogicFunctions (no-code logic editor) ────────────────────

export interface AIPLogicFunctionOut {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  prompt: string;
  signature: Record<string, unknown>;
  markings: string[];
  version: number;
  active: boolean;
  project_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const AIPLogicFunctions = {
  list: () =>
    apiFetch<AIPLogicFunctionOut[]>('/platform/v23/aip-logic'),
  get: (id: string) =>
    apiFetch<AIPLogicFunctionOut>(`/platform/v23/aip-logic/${id}`),
  create: (body: {
    slug: string;
    display_name: string;
    description?: string;
    prompt: string;
    signature?: Record<string, unknown>;
  }) =>
    apiFetch<AIPLogicFunctionOut>('/platform/v23/aip-logic', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (
    id: string,
    body: {
      display_name?: string;
      description?: string;
      prompt?: string;
      signature?: Record<string, unknown>;
    },
  ) =>
    apiFetch<AIPLogicFunctionOut>(`/platform/v23/aip-logic/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

// ─── Sprint L14 · Audio transcribe + multipart upload ──────────────────────
// Backend POST /platform/v23/audio/upload aceita multipart (audio/* file),
// retorna `storage_ref` minio:// + URL pré-assinada. POST .../transcribe
// devolve transcript + segments + speakers.

export interface AudioSpeakerHint {
  speaker_id: string;
  person_urn?: string | null;
  label?: string | null;
}

export interface AudioTranscriptSegment {
  speaker_id: string;
  start_s: number;
  end_s: number;
  text: string;
}

export interface AudioTranscribeOut {
  transcription_id: string;
  storage_ref: string;
  language: string;
  transcript: string;
  segments: AudioTranscriptSegment[];
  speakers: AudioSpeakerHint[];
  duration_s: number;
  backend: string;
  lineage_event_id: string;
}

export interface AudioUploadOut {
  storage_ref: string;
  url: string;
  filename: string;
  content_type: string;
  bytes: number;
  sha256: string;
}

// Sprint L14.C — histórico persistido + speaker link + transcript_qa.
export interface AudioTranscriptionListItem {
  transcription_id: string;
  storage_ref: string;
  language: string;
  transcript: string;
  duration_s: number;
  backend: string;
  lineage_event_id: string | null;
  created_by_username: string;
  created_at: string;
  n_segments: number;
  n_speakers: number;
}

export interface AudioSpeakerLink {
  speaker_id: string;
  person_node_id: string | null;
  person_name: string | null;
  label: string | null;
}

export interface AudioTranscriptionDetail {
  transcription_id: string;
  storage_ref: string;
  language: string;
  transcript: string;
  duration_s: number;
  backend: string;
  lineage_event_id: string | null;
  created_by_username: string;
  created_at: string;
  segments: AudioTranscriptSegment[];
  speakers: AudioSpeakerLink[];
}

export interface AudioQACitation {
  speaker_id: string;
  start_s: number;
}

export interface AudioQAOut {
  transcription_id: string;
  question: string;
  answer: string;
  citations: AudioQACitation[];
  function_id: string;
  version: number;
}

export const Audio = {
  upload: async (file: File, label?: string): Promise<AudioUploadOut> => {
    // Multipart precisa de FormData puro — apiFetch espera JSON, então
    // hit direto no /api proxy. Cookies vão via credentials:include.
    const fd = new FormData();
    fd.append('file', file);
    if (label) fd.append('label', label);
    const res = await fetch('/api/platform/v23/audio/upload', {
      method: 'POST',
      body: fd,
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, detail);
    }
    return res.json();
  },
  transcribe: (body: {
    storage_ref: string;
    language?: string;
    speaker_hints?: AudioSpeakerHint[];
    stub_transcript?: string;
  }) =>
    apiFetch<AudioTranscribeOut>('/platform/v23/audio/transcribe', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  signedUrl: (storage_ref: string) =>
    apiFetch<{ url: string; expires_in_s: number }>(
      `/platform/v23/audio/signed-url?storage_ref=${encodeURIComponent(storage_ref)}`,
    ),
  // Sprint L14.C — histórico persistido
  listTranscriptions: (limit = 50) =>
    apiFetch<AudioTranscriptionListItem[]>(
      `/platform/v23/audio/transcriptions?limit=${limit}`,
    ),
  getTranscription: (id: string) =>
    apiFetch<AudioTranscriptionDetail>(
      `/platform/v23/audio/transcriptions/${encodeURIComponent(id)}`,
    ),
  patchSpeaker: (
    transcriptionId: string,
    speakerId: string,
    body: { person_node_id?: string | null; label?: string | null },
  ) =>
    apiFetch<AudioSpeakerLink>(
      `/platform/v23/audio/transcriptions/${encodeURIComponent(transcriptionId)}/speakers/${encodeURIComponent(speakerId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  transcriptQa: (transcription_id: string, question: string) =>
    apiFetch<AudioQAOut>('/platform/v23/audio/transcript-qa', {
      method: 'POST',
      body: JSON.stringify({ transcription_id, question }),
    }),
};

// ─── Wave D.3 · AIP Threads / Models / Memory / RAG ────────────────────────
// Integração com o AIP avançado já existente (web-app + ontology-module).
// Os endpoints todos vivem em ontology-module — ver
// `app/routers/platform_v25/analyst.py` (threads), `byom.py` (catalog),
// `platform_v23/aip_assist.py` (memory) e `platform_v23/aip_rag.py` (RAG).

export interface AipThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  kind: string;
  citations: Record<string, unknown>[];
  // Blocos ricos persistidos (re-hidratação no reload — Sprint 9).
  entity_refs?: Record<string, unknown>[];
  tool_calls?: Record<string, unknown>[];
  tool_results?: Record<string, unknown>[];
  meta?: Record<string, unknown>;
  at: string;
}

export interface AipThread {
  id: string;
  title: string;
  messages: AipThreadMessage[];
  dependency_graph: {
    nodes: { id: string; kind: string; at: string }[];
    edges: { from: string; to: string }[];
  };
  created_at: string;
  updated_at: string | null;
}

export const AIPThreads = {
  list: () => apiFetch<AipThread[]>('/platform/v25/aip/analyst/threads'),
  get: (id: string) =>
    apiFetch<AipThread>(`/platform/v25/aip/analyst/threads/${id}`),
  create: (body: { title?: string }) =>
    apiFetch<AipThread>('/platform/v25/aip/analyst/threads', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  appendMessage: (
    id: string,
    body: {
      role: 'user' | 'assistant' | 'tool';
      content: string;
      kind?: string;
      depends_on?: string[];
      citations?: Record<string, unknown>[];
      entity_refs?: Record<string, unknown>[];
      tool_calls?: Record<string, unknown>[];
      tool_results?: Record<string, unknown>[];
      meta?: Record<string, unknown>;
    },
  ) =>
    apiFetch<AipThread>(`/platform/v25/aip/analyst/threads/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/platform/v25/aip/analyst/threads/${id}`, {
      method: 'DELETE',
    }),
};

export interface ModelPricing {
  /** Preço por 1 milhão de tokens, em BRL, já com markup AEGIS aplicado. */
  input_brl_mtok: number;
  output_brl_mtok: number;
  /** Custo-base OpenRouter por 1M tokens em USD (transparência p/ gestor). */
  input_usd_mtok: number;
  output_usd_mtok: number;
  /** Margem AEGIS aplicada (%). */
  markup_pct: number;
  usd_brl: number;
  fx_source?: string | null;
  fx_as_of?: string | null;
  currency: string;
}

export interface AipCatalogModel {
  id: string;
  label: string;
  provider: string;
  capabilities: string[];
  context_window: number;
  source: 'byom' | 'preset';
  description: string | null;
  /** Nome ORIGINAL do provedor (ex.: "OpenAI: GPT-4o") — usado nos proprietários. */
  display_name?: string | null;
  /** Slug canônico do provedor (fecha o gap catalog-id≠slug). */
  model_slug?: string | null;
  /** Preço por 1M tokens em BRL (markup AEGIS + câmbio). null = sob consulta. */
  pricing?: ModelPricing | null;
}

// P3 (2026-06-05) — modelo DEFAULT por finalidade, com soberania do provider vinculado.
export interface AipModelDefault {
  purpose: string;
  provider: string;
  model: string;
  source: 'tenant' | 'env' | 'hardcoded';
  provider_id: string | null;
  jurisdictions: string[];
  country: string | null;
}

export const AIPModels = {
  /** Unified catalog: BYOM (tenant) + presets (Groq/OpenRouter/OpenClaw). */
  catalog: (provider?: string) => {
    const qs = provider ? `?provider=${encodeURIComponent(provider)}` : '';
    return apiFetch<AipCatalogModel[]>(`/platform/v25/aip/models/catalog${qs}`);
  },
  /** P3 — modelos default resolvidos por finalidade (tenant → env → hardcoded). */
  defaults: () => apiFetch<AipModelDefault[]>('/platform/v25/aip/models/defaults'),
  /** P3 — define o default de `purpose` (codegen); provider_id opcional vincula soberania. */
  setDefault: (body: {
    purpose?: string;
    provider: string;
    model: string;
    provider_id?: string;
  }) =>
    apiFetch<AipModelDefault>('/platform/v25/aip/models/defaults', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  /** BYOM — modelos próprios do tenant (com credencial no Vault). */
  list: () => apiFetch<ByomModel[]>('/platform/v25/aip/models'),
  /** BYOM — registra modelo próprio; `api_key` (write-only) vai cifrado p/ o Vault. */
  register: (body: ByomRegister) =>
    apiFetch<ByomModel>('/platform/v25/aip/models', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** BYOM — remove o modelo próprio (e a credencial no Vault). */
  unregister: (id: string) =>
    apiFetch<{ status: string }>(`/platform/v25/aip/models/${id}`, { method: 'DELETE' }),
};

// ─── W1 — Experiência configurável do AIP Chat ─────────────────────────────
// A "experiência do AIP" (tom default da tenant, overlay de persona, temperatura,
// saudação, sugestões + defaults de ferramentas/capacidades) é AUTORITATIVA no
// SERVIDOR: persiste no `Agent.config` do agente kind='aip' slug 'aip-chat%' e é
// lida por `build_system_prompt` a CADA turno. Por isso NÃO vive em
// `Page.config.params` (como solutions/agents) — tem endpoint dedicado.
//   GET /platform/v25/aip/experience  (perm aip.threads.read)  → config EFETIVA
//   PUT /platform/v25/aip/experience  (perm aip.threads.configure) → merge parcial
// `default_model*` são READ-ONLY (slug resolvido da finalidade "chat"): o FRONT
// mapeia para o CODINOME AIP via lib/aip/modelLabels — NUNCA slug/vendor cru.

/** Preset de TOM (key de persona_presets) p/ o dropdown do editor. */
export interface AipTonePreset {
  key: string;
  label: string;
  description: string;
  domain: string;
}

/** Config EFETIVA da experiência do AIP Chat (ExperienceOut do backend). */
export interface AipExperienceConfig {
  /** Tom default da tenant (key de persona_presets ou "" = padrão da casa). */
  tone_default: string;
  /** Instruções adicionais da organização — COMPLEMENTA a base, nunca substitui. */
  persona_overlay: string;
  /** Temperatura default do turno (0..1; default 0.2). */
  temperature: number;
  /** Saudação inicial do chat (consumida pelo FRONTEND na Landing). */
  greeting: string;
  /** Sugestões de partida (consumidas pelo FRONTEND na Landing). */
  suggestions: string[];
  /** Allow-list default de ferramentas (consumida pelo FRONTEND ao montar a sessão). */
  allowed_tools_default: string[];
  /** Capacidades ligadas por padrão (consumidas pelo FRONTEND ao montar a sessão). */
  capabilities_default: string[];
  /** READ-ONLY: slug do modelo da finalidade "chat" — exibir via aipModelLabel. */
  default_model: string | null;
  default_model_provider: string | null;
  default_model_source: string | null;
  /** Catálogo de tons p/ o dropdown do editor. */
  tone_presets: AipTonePreset[];
  /** Já existe um Agent AIP Chat na tenant? (false = ainda usando defaults). */
  configured: boolean;
}

/** Body do PUT — todos opcionais (merge parcial; ausente = inalterado). */
export interface AipExperiencePut {
  tone_default?: string;
  persona_overlay?: string;
  temperature?: number;
  greeting?: string;
  suggestions?: string[];
  allowed_tools_default?: string[];
  capabilities_default?: string[];
}

/** Spec mínima de uma ferramenta exposta ao agente (multiselect do editor). */
export interface AipToolSpec {
  name: string;
  description: string;
}

export const AipExperience = {
  /** Config EFETIVA (Agent.config se existe, senão defaults). Perm aip.threads.read. */
  get: () => apiFetch<AipExperienceConfig>('/platform/v25/aip/experience'),
  /** Grava a experiência (merge parcial) no Agent.config. Perm aip.threads.configure. */
  save: (cfg: AipExperiencePut) =>
    apiFetch<AipExperienceConfig>('/platform/v25/aip/experience', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  /** Catálogo de ferramentas disponíveis — alimenta o multiselect (sem digitar). */
  toolsAvailable: () =>
    apiFetch<{ count: number; tools: AipToolSpec[] }>('/agent/tools/available'),
};

export interface ByomRegister {
  name: string;
  provider: string;
  endpoint_url?: string;
  api_key?: string;
  context_window?: number;
  capabilities?: string[];
}
export interface ByomModel {
  id: string;
  name: string;
  provider: string;
  endpoint_url: string | null;
  /** Há credencial no Vault — a chave nunca é exposta. */
  has_credential: boolean;
  context_window: number;
  capabilities: string[];
  active: boolean;
  created_at: string;
}

// Débito 1 — orçamento cumulativo de LLM por tenant (uso do período + teto).
export interface LlmBudgetStatus {
  period_start: string;
  tokens_used: number;
  cap: number | null;
  remaining: number | null;
  exceeded: boolean;
}
export interface LlmUsageByModel {
  model: string;
  calls: number;
  tokens_input: number;
  tokens_output: number;
  cost_brl: number;
  has_price: boolean;
}
export interface LlmUsageDetail {
  currency: string;
  month_start: string;
  month_cost_brl: number;
  month_calls: number;
  month_tokens: number;
  avg_cost_per_call_brl: number;
  last_30d_cost_brl: number;
  daily_avg_brl: number;
  projected_month_brl: number;
  by_model: LlmUsageByModel[];
  markup_pct: number;
  usd_brl: number;
  fx_source?: string | null;
}
export const LlmBudget = {
  get: () => apiFetch<LlmBudgetStatus>('/platform/v23/llm-budget'),
  set: (tokensPerMonth: number | null) =>
    apiFetch<LlmBudgetStatus>('/platform/v23/llm-budget', {
      method: 'PUT',
      body: JSON.stringify({ tokens_per_month: tokensPerMonth }),
    }),
  /** Fase 2 — detalhe de uso/custo do mês em R$ + projeção (run-rate 30d). */
  usage: () => apiFetch<LlmUsageDetail>('/platform/v23/llm-budget/usage'),
};

export interface AipMemoryItem {
  id: string;
  scope: string;
  resource_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  markings: string[];
  kind: 'context' | 'memory';
  created_at: string | null;
}

export const AIPMemory = {
  list: (kind: 'context' | 'memory' = 'memory') =>
    apiFetch<AipMemoryItem[]>(
      `/platform/v23/aip-assist?kind=${encodeURIComponent(kind)}`,
    ),
  create: (body: {
    title: string;
    body: string;
    scope?: string;
    pinned?: boolean;
    markings?: string[];
  }) =>
    apiFetch<AipMemoryItem>('/platform/v23/aip-assist', {
      method: 'POST',
      body: JSON.stringify({
        scope: body.scope || 'global',
        title: body.title,
        body: body.body,
        pinned: body.pinned ?? true,
        markings: body.markings ?? [],
        kind: 'memory',
      }),
    }),
  update: (
    id: string,
    body: { title?: string; body?: string; pinned?: boolean },
  ) =>
    apiFetch<AipMemoryItem>(`/platform/v23/aip-assist/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/platform/v23/aip-assist/${id}`, { method: 'DELETE' }),
};

export interface AipRagCollection {
  id: string;
  label: string;
  source: string;
  // Onda 4a — enriquecimento HONESTO: provenance = onde a coleção é consultada
  // ("qdrant" | "social_module", derivado, espelha o caminho do /query); doc_count
  // = contagem REAL de pontos (Qdrant), null = desconhecido (a UI mostra "—",
  // nunca 0 fabricado — coleções sociais não têm contagem barata).
  provenance?: string | null;
  doc_count?: number | null;
  // A11 — SINCRONIA com os workflows do DAG: coleção produzida por um board
  // (board.{slug}.derived) carrega a identidade do FLUXO (nome/tags/id) p/ o painel
  // mostrar "do fluxo X" clicável + facetas por tag. Ausente nas fontes nativas.
  board_id?: string | null;
  board_slug?: string | null;
  board_name?: string | null;
  board_tags?: string[];
}

export interface AipRagMatch {
  id: string;
  score: number;
  text: string;
  collection: string;
  metadata: Record<string, unknown>;
}

export interface AipRagQueryOut {
  query: string;
  matches: AipRagMatch[];
  // 'none' = nenhum backend devolveu dado real (resposta honesta, sem hit fabricado)
  backend: 'qdrant' | 'social_module' | 'none';
  total: number;
}

export const AIPRag = {
  collections: () =>
    apiFetch<AipRagCollection[]>('/platform/v23/aip-rag/collections'),
  query: (body: { query: string; top_k?: number; collections?: string[] }) =>
    apiFetch<AipRagQueryOut>('/platform/v23/aip-rag/query', {
      method: 'POST',
      body: JSON.stringify({
        query: body.query,
        top_k: body.top_k ?? 5,
        collections: body.collections ?? [],
      }),
    }),
};

// ─── Wave D.3 · Docs UI loader ─────────────────────────────────────────────
// Consome `/docs/tree` + `/docs/content` do ontology-module (router
// `app/routers/docs.py`). Reflete os 500+ markdowns do monorepo no UI.

export interface DocsTreeNode {
  name: string;
  type: 'dir' | 'file';
  path?: string;
  byteSize?: number;
  children?: DocsTreeNode[];
}

export interface DocsTreeOut {
  tree: DocsTreeNode[];
  generatedAt: string;
}

export interface DocsContentOut {
  path: string;
  markdown: string;
  byteSize: number;
}

export const Docs = {
  tree: () => apiFetch<DocsTreeOut>('/docs/tree'),
  content: (path: string) =>
    apiFetch<DocsContentOut>(
      `/docs/content?path=${encodeURIComponent(path)}`,
    ),
};

// ─── Wave G.1 — PainelApps (commit, merge, perf-stats) ──────────────────────

export interface PainelAppImportPreview {
  slug: string;
  display_name: string;
  surface: string;
  n_variables: number;
  n_pages: number;
  n_overlays: number;
  n_root_widgets: number;
}

export interface PainelAppImportError {
  loc: string[];
  msg: string;
  type: string;
}

export interface PainelAppImportResult {
  ok: boolean;
  errors: PainelAppImportError[];
  preview: PainelAppImportPreview | null;
  committed: boolean;
  app_id: string | null;
  idempotent: boolean;
}

export interface PainelAppMergeConflict {
  path: string;
  base: unknown;
  source: unknown;
  target: unknown;
}

export interface PainelAppMergeOut {
  ok: boolean;
  source_version: string;
  target_version: string;
  base_version: string | null;
  merged_layout: Record<string, unknown>;
  merged_variables: Record<string, unknown>;
  conflicts: PainelAppMergeConflict[];
  requires_manual: boolean;
}

export interface PainelAppPerfStatsWidget {
  widget_id: string;
  widget_type: string;
  time_in_node_ms: number;
  server_time_ms: number;
  total_load_ms: number;
  samples: number;
}

export interface PainelAppPerfStatsOut {
  app_id: string;
  total_ms: number;
  sample_count: number;
  slowest_3: PainelAppPerfStatsWidget[];
  per_widget: PainelAppPerfStatsWidget[];
}

export const PainelApps = {
  // Wave F.2 + Wave G.1 — commit flag controla preview vs write.
  import: (
    payload: Record<string, unknown>,
    opts?: { commit?: boolean },
  ) =>
    apiFetch<PainelAppImportResult>('/platform/v23/painel-apps/import', {
      method: 'POST',
      body: JSON.stringify({
        json_payload: payload,
        commit: opts?.commit ?? false,
      }),
    }),
  merge: (
    appId: string,
    body: { source_version: string; target_version: string; strategy?: 'ours' | 'theirs' | '3way' },
  ) =>
    apiFetch<PainelAppMergeOut>(
      `/platform/v23/painel-apps/${appId}/merge`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  perfStats: (appId: string) =>
    apiFetch<PainelAppPerfStatsOut>(
      `/platform/v23/painel-apps/${appId}/perf-stats`,
    ),
};

// ─── Wave G.1 — OSDK Actions (stub invoke) ─────────────────────────────────

export interface OsdkInvokeOut {
  ok: boolean;
  action_key: string;
  result: Record<string, unknown>;
  lineage_event_id: string | null;
  dry_run: boolean;
}

export const OsdkActions = {
  invoke: (
    actionKey: string,
    input: Record<string, unknown>,
    opts?: { dry_run?: boolean },
  ) =>
    apiFetch<OsdkInvokeOut>(
      `/platform/v25/aip/osdk/actions/${encodeURIComponent(actionKey)}/invoke`,
      {
        method: 'POST',
        body: JSON.stringify({
          input,
          dry_run: opts?.dry_run ?? false,
        }),
      },
    ),
};

// ─── Wave H.4.A — Editor de Páginas ───────────────────────────────────────

export type PageStatus = 'published' | 'draft' | 'archived';
export type PageScope = 'tenant' | 'operacao' | 'espaco';

export interface PageWorkspaceBindings {
  operacao_id: string | null;
  espaco_id: string | null;
  sala_id: string | null;
}

export interface RegisteredPage {
  slug: string;
  title: string;
  route: string;
  status: PageStatus;
  workspace_bindings: PageWorkspaceBindings;
  marking_requirements: string[];
  iam_perm_required: string | null;
  config: Record<string, unknown>;
  last_edited_by: string | null;
  last_edited_at: string | null;
  created_at: string | null;
}

export interface RegisteredPageConfig {
  slug: string;
  config: Record<string, unknown>;
  last_edited_at: string | null;
}

export interface PageCreateInput {
  slug: string;
  title: string;
  route: string;
  status?: PageStatus;
  workspace_bindings?: Partial<PageWorkspaceBindings>;
  marking_requirements?: string[];
  iam_perm_required?: string | null;
  config?: Record<string, unknown>;
}

export interface PagePatchInput {
  title?: string;
  route?: string;
  status?: PageStatus;
  workspace_bindings?: Partial<PageWorkspaceBindings>;
  marking_requirements?: string[];
  iam_perm_required?: string | null;
  config?: Record<string, unknown>;
}

export interface PagesListFilters {
  status?: PageStatus;
  scope?: PageScope;
  perm?: string;
}

export const Pages = {
  list: (filters?: PagesListFilters) => {
    const qs = new URLSearchParams();
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.scope) qs.set('scope', filters.scope);
    if (filters?.perm) qs.set('perm', filters.perm);
    const q = qs.toString();
    return apiFetch<RegisteredPage[]>(
      `/platform/v23/pages${q ? `?${q}` : ''}`,
    );
  },
  /**
   * Mission #8 — quando ``enforce`` é true o backend aplica o gate de
   * acesso da page (``iam_perm_required`` + ``marking_requirements``) e
   * responde 403 se o operador não satisfaz. Usado pela rota-resolver
   * ``/paginas/[slug]/view``. Tooling (editor/home/app-shell) omite.
   */
  get: (slug: string, opts?: { enforce?: boolean }) =>
    apiFetch<RegisteredPage>(
      `/platform/v23/pages/${encodeURIComponent(slug)}${
        opts?.enforce ? '?enforce=true' : ''
      }`,
    ),
  getConfig: (slug: string) =>
    apiFetch<RegisteredPageConfig>(
      `/platform/v23/pages/${encodeURIComponent(slug)}/config`,
    ),
  create: (body: PageCreateInput) =>
    apiFetch<RegisteredPage>('/platform/v23/pages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (slug: string, body: PagePatchInput) =>
    apiFetch<RegisteredPage>(
      `/platform/v23/pages/${encodeURIComponent(slug)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  delete: (slug: string) =>
    apiFetch<RegisteredPage>(
      `/platform/v23/pages/${encodeURIComponent(slug)}`,
      { method: 'DELETE' },
    ),
  duplicate: (slug: string) =>
    apiFetch<RegisteredPage>(
      `/platform/v23/pages/${encodeURIComponent(slug)}/duplicate`,
      { method: 'POST' },
    ),
  /**
   * Onda I.1 (2026-05-23) — atualiza só o blob de config via endpoint
   * dedicado. Usado pelo Workshop-based editor de Páginas (reuso do
   * WorkshopEditor + Widget Registry).
   *
   * Body: `{ config: PageConfig }` onde `config` aceita os dois modos:
   *   - `{ mode: 'workshop', workshop_layout, variables?, overlays?, surface? }`
   *   - `{ mode: 'legacy', blocks }`
   */
  putConfig: (slug: string, config: Record<string, unknown>) =>
    apiFetch<RegisteredPage>(
      `/platform/v23/pages/${encodeURIComponent(slug)}/config`,
      { method: 'PUT', body: JSON.stringify({ config }) },
    ),
  /**
   * Onda I.1 — marca status=published + emite lineage `pages.publish`.
   * Distinto de `update(slug, {status: 'published'})` apenas no evento
   * de auditoria. Usado pelo botão "Publicar" do editor.
   */
  publish: (slug: string) =>
    apiFetch<RegisteredPage>(
      `/platform/v23/pages/${encodeURIComponent(slug)}/publish`,
      { method: 'POST' },
    ),
};

export { apiFetchOrFallback };
