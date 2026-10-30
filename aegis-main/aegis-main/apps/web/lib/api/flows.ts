/**
 * Cliente Flows — consome `/campaign/flows` do ontology-module.
 *
 * O backend foi mantido sob namespace `campaign.*` porque é o mesmo
 * código que serve o politicians-app. A tenant de security ganhou
 * cross-grant em `campaign.flows.*` pra reusar as rotas sem duplicar
 * engine. UI usa labels neutros ("Fluxos") — só o wire é compartilhado.
 */

import { apiFetch } from './client';

export type FlowStatus = 'draft' | 'active' | 'archived';
export type FlowRunStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface FlowNode {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
}

export interface FlowEdge {
  from_node: string;
  to_node: string;
  branch?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowTrigger {
  type: 'manual' | 'cron' | 'webhook' | string;
  config?: Record<string, unknown>;
}

export interface FlowVariableSpec {
  type: 'string' | 'number' | 'boolean' | 'json' | string;
  value?: unknown;
  description?: string;
}

export interface FlowOut {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: FlowStatus;
  graph: FlowGraph;
  trigger?: FlowTrigger;
  variables?: Record<string, FlowVariableSpec>;
  is_template?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FlowRunOut {
  id: string;
  flow_id: string;
  status: FlowRunStatus;
  trigger_kind?: string;
  started_at?: string;
  finished_at?: string;
  node_results?: Record<string, unknown>;
  error_message?: string | null;
}

export interface FlowCreateBody {
  slug: string;
  name: string;
  description?: string;
  graph?: FlowGraph;
  trigger?: FlowTrigger;
  variables?: Record<string, FlowVariableSpec>;
}

export interface FlowPatchBody {
  name?: string;
  description?: string;
  graph?: FlowGraph;
  trigger?: FlowTrigger;
  variables?: Record<string, FlowVariableSpec>;
}

const BASE = '/campaign/flows';

export const Flows = {
  list: (status?: FlowStatus) =>
    apiFetch<FlowOut[]>(`${BASE}${status ? `?status=${status}` : ''}`),
  get: (id: string) => apiFetch<FlowOut>(`${BASE}/${encodeURIComponent(id)}`),
  create: (body: FlowCreateBody) =>
    apiFetch<FlowOut>(BASE, { method: 'POST', body: JSON.stringify(body) }),
  patch: (id: string, body: FlowPatchBody) =>
    apiFetch<FlowOut>(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  activate: (id: string) =>
    apiFetch<FlowOut>(`${BASE}/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
    }),
  archive: (id: string) =>
    apiFetch<FlowOut>(`${BASE}/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    }),
  run: (id: string, payload?: Record<string, unknown>) =>
    apiFetch<FlowRunOut>(`${BASE}/${encodeURIComponent(id)}/run`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  runs: (id: string, limit = 50) =>
    apiFetch<FlowRunOut[]>(
      `${BASE}/${encodeURIComponent(id)}/runs?limit=${limit}`,
    ),
  runDetail: (id: string, runId: string) =>
    apiFetch<FlowRunOut>(
      `${BASE}/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`,
    ),
};
