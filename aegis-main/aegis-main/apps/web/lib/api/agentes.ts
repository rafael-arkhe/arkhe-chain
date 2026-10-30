/**
 * Cliente Agentes — consome `/campaign/agents` do ontology-module.
 * Mesma estratégia do `flows.ts`: backend único + perms cruzadas.
 */
import { apiFetch } from './client';

export type AgentStatus = 'idle' | 'running' | 'failed' | 'archived' | string;
export type AgentKind = 'worker' | 'aip' | string;
export type CronPreset =
  | 'off'
  | 'every_15m'
  | 'every_hour'
  | 'every_6h'
  | 'daily_6am_brt'
  | 'daily_6pm_brt'
  | 'weekly_monday_6am_brt';

export interface AgentOut {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  kind: AgentKind;
  status: AgentStatus;
  config: Record<string, unknown>;
  cron?: CronPreset;
  last_run_at?: string | null;
  last_run_status?: AgentStatus | null;
  next_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AgentRunOut {
  id: string;
  agent_id: string;
  status: AgentStatus;
  queued_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  output_summary?: string | null;
  error_trace?: string | null;
  lineage_event_id?: string | null;
}

export type AgentTemplateParam = {
  /** Chave do parâmetro — bate com `TemplateParamOut.key` no backend.
   *  É esta chave que vira a propriedade do objeto `params` no install. */
  key: string;
  label: string;
  type: string;
  help?: string;
  default?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[];
};

export interface AgentTemplateOut {
  slug: string;
  title: string;
  description?: string;
  kind: AgentKind;
  icon?: string;
  params: AgentTemplateParam[];
  prereqs?: {
    ok: boolean;
    message?: string;
    fix_label?: string;
    fix_url?: string;
    /** Compat: algumas versões enviam `label`; mantido opcional. */
    label?: string;
  }[];
  can_install: boolean;
  already_installed?: boolean;
  /** IDs dos agentes já instalados que casam com este template — usado
   *  pelo card do catálogo para remover sem ir ao kanban. */
  installed_agent_ids?: string[];
}

/** Resposta do install — bate com `InstallOut` no backend. */
export interface InstallResult {
  agent_id: string;
  agent_slug: string;
  display_name: string;
  status: string;
}

const BASE = '/campaign/agents';

export const Agentes = {
  list: () => apiFetch<AgentOut[]>(BASE),
  runs: (agentId: string, limit = 50) =>
    apiFetch<AgentRunOut[]>(
      `${BASE}/${encodeURIComponent(agentId)}/runs?limit=${limit}`,
    ),
  manualRun: (agentId: string, note?: string) =>
    apiFetch<AgentRunOut>(`${BASE}/${encodeURIComponent(agentId)}/run`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),
  setCron: (agentId: string, preset: CronPreset, note?: string) =>
    apiFetch<AgentOut>(`${BASE}/${encodeURIComponent(agentId)}/cron`, {
      method: 'POST',
      body: JSON.stringify({ preset, note }),
    }),
  patchConfig: (agentId: string, patch: Record<string, unknown>) =>
    apiFetch<AgentOut>(`${BASE}/${encodeURIComponent(agentId)}/config`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  catalog: () => apiFetch<AgentTemplateOut[]>(`${BASE}/catalog`),
  install: (templateSlug: string, params: Record<string, string | number>) =>
    apiFetch<InstallResult>(`${BASE}/catalog/install`, {
      method: 'POST',
      // Contrato backend (`InstallIn`): `template_slug` + `params` (objeto
      // chaveado pelo `key` de cada TemplateParam). NÃO usar `template`.
      body: JSON.stringify({ template_slug: templateSlug, params }),
    }),
  /** Desinstala (remove) um agente do tenant. Backend responde 204; o
   *  cascade de FK apaga bindings/runs/cursors. Auditado via LineageEvent. */
  uninstall: (agentId: string) =>
    apiFetch<void>(`${BASE}/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    }),
};
