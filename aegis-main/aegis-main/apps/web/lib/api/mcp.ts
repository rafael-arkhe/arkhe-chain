/**
 * Cliente MCP — adapters expostos via `/mcp-adapters/*` no ontology-module.
 *
 * Cada adapter é um wrapper sobre uma fonte externa (Câmara/Senado/IG/
 * Reddit/SearXNG/GDELT/etc). O backend valida permissões e devolve um
 * envelope `{ tool, version, result }` — `result` é payload bruto da
 * fonte, sem normalização.
 */
import { API_BASE, apiFetch } from './client';

/**
 * Descritor de um campo de UI declarado pelo adapter (verificado ao vivo em
 * `/mcp-adapters/list` → tools[].ui_fields). Dirige os componentes novos
 * (multiselect/duration/toggle) por DADO — zero hardcode por fonte.
 * Ex.: maigret_username `sites` = {kind:'multiselect', catalog:'maigret',
 * labelKey:'buscar.maigret.sites'}; `timeout` = {kind:'duration', min:5, max:240,
 * unitKey:'unit.seconds', default:20}; `nsfw` = {kind:'toggle', nsfwGated:true}.
 */
export interface UiFieldSpec {
  kind: 'multiselect' | 'duration' | 'toggle' | 'number' | 'select' | string;
  /** Nome do catálogo de sites (multiselect/select): 'maigret'|'maigret_paises'|'wmn'|'sherlock'. */
  catalog?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Chave i18n da unidade (duration). */
  unitKey?: string;
  /** Valor default sugerido pela fonte. */
  default?: unknown;
  /** Campo só liberado quando o gate NSFW está ativo (FE-B). */
  nsfwGated?: boolean;
  /** Chave i18n de rótulo opcional. */
  labelKey?: string;
  /**
   * ENUM inline da escolha ÚNICA (kind 'select'). O backend deriva de `x-enum`
   * ([{value,label}]) ou do `enum` padrão do JSON Schema (escalares espelhados
   * em {value,label}). Ausente quando o select usa `catalog` dinâmico.
   */
  options?: { value: string; label: string }[];
}

export interface McpAdapter {
  tool: string;
  version: string;
  category?: string;
  description?: string;
  /** Contrato de input derivado do backend (guia de fontes). */
  accepts?: string[];
  refines?: string[];
  required?: string[];
  examples?: Record<string, string>;
  /** Campos de UI por-fonte (sites/timeout/nsfw…), dirigidos por dado. */
  ui_fields?: Record<string, UiFieldSpec>;
}

export interface McpInvokeResponse<T = unknown> {
  tool: string;
  version: string;
  result: T;
}

/**
 * Shape real do `/mcp-adapters/list` (ontology-module):
 *   { adapters: [{module, provider, tier, tools: [{name, version, description}], ...}], count }
 *
 * Cada adapter expõe N tools versionadas — o UI quer cada tool como
 * uma "fonte" individual (tool=name@version). Achamos no return.
 */
interface BackendTool {
  name: string;
  version: string;
  description?: string;
  accepts?: string[];
  refines?: string[];
  required?: string[];
  examples?: Record<string, string>;
  ui_fields?: Record<string, UiFieldSpec>;
}
interface BackendAdapter {
  module?: string;
  provider?: string;
  tier?: string;
  tools?: BackendTool[];
}
interface BackendList {
  adapters?: BackendAdapter[];
  count?: number;
}

export const Mcp = {
  /**
   * Lista flat de tools (não adapters). Cada item:
   *   { tool: "camara_deputados@v1", version, description, category: provider }
   *
   * Compatível com formatos antigos (array direto de `{tool, version}`)
   * pra não quebrar se o backend mudar.
   */
  list: async (): Promise<McpAdapter[]> => {
    const r = await apiFetch<BackendList | McpAdapter[]>('/mcp-adapters/list');
    if (Array.isArray(r)) {
      // Backend antigo já entregava plano — aceita direto.
      return r;
    }
    const out: McpAdapter[] = [];
    for (const a of r?.adapters ?? []) {
      for (const t of a.tools ?? []) {
        out.push({
          tool: `${t.name}@${t.version}`,
          version: t.version,
          description: t.description,
          category: a.provider,
          accepts: t.accepts,
          refines: t.refines,
          required: t.required,
          examples: t.examples,
          ui_fields: t.ui_fields,
        });
      }
    }
    return out;
  },
  invoke: <T = unknown>(tool: string, params: Record<string, unknown>) =>
    apiFetch<McpInvokeResponse<T>>(
      `/mcp-adapters/${encodeURIComponent(tool)}/invoke`,
      { method: 'POST', body: JSON.stringify({ params }) },
    ),

  /**
   * Catálogo de sites/categorias de uma fonte (p/ o multiselect de fontes).
   *   GET /api/search/fanout/sites?catalog=<NOME>[&include_nsfw=true]
   *   200 { categories:[{key,label}], sites:[{id,label,category,nsfw}], total }
   * NOME = ui_fields[propKey].catalog. SEMPRE 200 (catálogo best-effort).
   */
  sitesCatalog: (catalog: string, includeNsfw?: boolean) => {
    const qs = new URLSearchParams({ catalog });
    if (includeNsfw) qs.set('include_nsfw', 'true');
    return apiFetch<FanoutSitesCatalog>(`/search/fanout/sites?${qs.toString()}`);
  },

  /**
   * FASE 2 do fan-out ESCALÁVEL (2026-06-26) — URL do stream SSE que roda TODAS
   * as fontes CONCORRENTES no servidor e transmite cada `result` conforme conclui.
   *
   * Substitui a fila SERIAL do cliente (1 fonte por vez somava ~2-3min): aqui o
   * backend dispara todas em paralelo e o front é consumidor fino. Monta:
   *   /api/search/fanout/stream?q=&tools=&f_<k>=&p_<tool>__<prop>=&http_concurrency=&sandbox_concurrency=&timeout_per_tool=
   *
   * `tools` = CSV dos nomes de tool (`camara_deputados@v1,...`). `fields` =
   * `advanced.fields` da Busca avançada. Cada par é serializado por NAMESPACE:
   *  - chave COM `__` (`<toolBase>__<propKey>`, ex.: `maigret_username__sites`) é
   *    PARÂMETRO POR-FONTE → vira `p_<key>=<v>` (o backend faz `rsplit('__',1)`).
   *  - chave SEM `__` (`doc`/`username`/`uf`…) é roteamento por accept → `f_<key>=<v>`.
   * O `value` já vem CANÔNICO (CSV pronto p/ arrays; toggle '1'/''). TUDO passa por
   * `encodeURIComponent`. Concorrência real: `http_concurrency`/`sandbox_concurrency`
   * (o antigo `concurrency=32` era param MORTO — o backend nunca o lia). NÃO passa
   * pelo `apiFetch` (JSON-only); o consumidor abre um EventSource same-origin nessa
   * URL — `/api` injeta o Bearer do cookie.
   */
  fanoutStreamUrl: (q: string, tools: string[], fields: Record<string, string>): string => {
    const parts: string[] = [
      `q=${encodeURIComponent(q)}`,
      `tools=${encodeURIComponent(tools.join(','))}`,
    ];
    for (const [k, v] of Object.entries(fields)) {
      // toggle desligado vem '' — mas '1' deve passar; trim só apara espaço.
      const val = (v ?? '').trim();
      if (!val) continue;
      // Namespaced por-fonte (contém '__') → p_; senão roteamento por accept → f_.
      const prefix = k.includes('__') ? 'p_' : 'f_';
      parts.push(`${prefix}${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
    }
    parts.push('http_concurrency=64', 'sandbox_concurrency=4', 'timeout_per_tool=90');
    return `${API_BASE}/search/fanout/stream?${parts.join('&')}`;
  },

  /** Mapa de saúde dos conectores (smoke-test ao vivo de cada um — lento). */
  health: () => apiFetch<ConnectorHealth>('/mcp-adapters/health'),
  /** Último mapa de saúde PERSISTIDO (rápido — abre já mostrando o estado). */
  healthLatest: () => apiFetch<ConnectorHealth>('/mcp-adapters/health/latest'),
};

/** Resposta do catálogo de sites de fan-out (GET /search/fanout/sites). */
export interface FanoutSitesCatalog {
  categories: { key: string; label: string }[];
  sites: { id: string; label: string; category?: string; nsfw?: boolean }[];
  total?: number;
}

export type ConnectorStatus = 'ok' | 'ok_vazio' | 'down' | 'timeout' | 'ausente';
export interface ConnectorHealthItem {
  tool: string;
  provider?: string;
  status: ConnectorStatus;
  item_count?: number | null;
  ms?: number;
  erro?: string;
  nota?: string;
}
export interface ConnectorHealth {
  total_testado: number;
  resumo: Record<string, number>;
  conectores: ConnectorHealthItem[];
  /** ISO da última verificação persistida (só no /health/latest). */
  checked_at?: string | null;
}
