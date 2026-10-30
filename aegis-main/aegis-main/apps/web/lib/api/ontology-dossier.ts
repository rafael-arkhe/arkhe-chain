/**
 * Cliente do dossiê MULTIDOMÍNIO (ontology-module
 * app/routers/ontology_dossier.py, montado em /ontology).
 *
 * Generaliza o dossiê — hoje OSINT-BR travado nos 7 kinds PII — para QUALQUER
 * OntologyNode canônico (carro, país, empresa, organização, evento, operação…),
 * SEM quebrar o dossiê de pessoa nem o fan-out OSINT-BR existentes. A derivação
 * de fontes é por CAMPO/FORMA das properties, NUNCA por node_type/keyword/
 * vertical (régua "mineração herdaria?"). É OPORTUNISTA: um objeto sem
 * identificador pessoal (um 'carro' só com placa) NÃO dispara fan-out vazio —
 * volta só o grafo 1-hop da ontologia + as seções estruturadas.
 *
 * Dois modos, ambos ASSÍNCRONOS (criam um OperatorTask; o trabalho longo roda no
 * worker, observável por SSE, sem prender a conexão):
 *   - startGeneric    → dossiê de UM objeto (origin generic_dossier).
 *   - startComposite  → dossiê de um CONJUNTO/operação/evento: roster +
 *                       sub-dossiês por membro + correlação entre membros + cena
 *                       + linha do tempo (origin composite_dossier).
 *   - get             → poll {status, progress_steps, result?}.
 *   - runToCompletion → conveniência (start + poll + SSE de steps).
 *
 * Perm: correlation.run (mesma capability do motor de correlação — compilar
 * dossiê é da mesma família "investigar/correlacionar").
 */
import { apiFetch, API_BASE } from './client';

/** Passo de progresso vivo (uma fonte/membro por passo), surfaçado pelo poll/SSE. */
export interface DossierStep {
  label: string;
  detail?: string;
}

/** Documento do dossiê genérico (result_data quando status === 'done'). */
export interface GenericDossierResult {
  node: Record<string, unknown>;
  identificadores: { kind: string; value: string; via?: string }[];
  sub_dossiers: Record<string, unknown>[];
  graph: {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
  };
  sections: Record<string, unknown>;
  pii_touched: boolean;
  sources_used: string[];
  sources_failed: unknown[];
}

/** Documento do dossiê composto (conjunto/operação/evento). */
export interface CompositeDossierResult {
  anchor: { node_id: string; node_type: string; name: string } | null;
  roster: Record<string, unknown>[];
  roster_count: number;
  members: Record<string, unknown>[];
  correlation: { seeds: { kind: string; value: string }[]; nodes: unknown[]; edges: unknown[]; stats: Record<string, unknown> } | null;
  scene: Record<string, unknown>[];
  timeline: Record<string, unknown>[];
  pii_touched: boolean;
}

export interface DossierStatus<R = Record<string, unknown>> {
  task_id: string;
  origin: string; // generic_dossier | composite_dossier
  status: string; // pending | running | done | failed | cancelled
  progress_steps: DossierStep[];
  result?: R | null;
  error_message?: string | null;
}

export interface CompositeBody {
  anchor_node_id?: string;
  node_ids?: string[];
  purpose?: string;
  correlate?: boolean;
  scene?: boolean;
  max_depth?: number;
  budget_nodes?: number;
}

interface RunOpts {
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (steps: DossierStep[]) => void;
}

/** Poll + SSE até concluir — espelha Correlation.runChainToCompletion. */
async function _runToCompletion<R>(taskId: string, opts?: RunOpts): Promise<DossierStatus<R>> {
  const pollMs = opts?.pollMs ?? 2500;
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();
  // SSE p/ steps em TEMPO REAL (uma fonte/membro por passo). Best-effort/aditivo:
  // o poll abaixo governa a conclusão; sem EventSource o poll também surfaça os steps.
  let es: EventSource | null = null;
  if (opts?.onProgress && typeof EventSource !== 'undefined') {
    try {
      es = new EventSource(`${API_BASE}/operator/tasks/stream`, { withCredentials: true });
      es.addEventListener('task.changed', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data) as { id: string; provenance?: { steps?: DossierStep[] } };
          if (d.id === taskId) opts.onProgress?.(d.provenance?.steps ?? []);
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
      const st = await OntologyDossier.get<R>(taskId);
      if (opts?.onProgress) opts.onProgress(st.progress_steps ?? []);
      if (st.status === 'done') return st;
      if (st.status === 'failed' || st.status === 'cancelled') {
        throw new Error(st.error_message || 'falha ao montar o dossiê');
      }
      if (Date.now() - started > timeoutMs) throw new Error('tempo esgotado ao montar o dossiê');
    }
  } finally {
    es?.close();
  }
}

export const OntologyDossier = {
  /**
   * POST /ontology/nodes/{node_id}/dossier — enfileira o dossiê de UM objeto
   * canônico (origin generic_dossier). ``purpose`` = finalidade LGPD (obrigatória
   * só se o objeto tiver identificador pessoal). Devolve {task_id}.
   */
  startGeneric: (nodeId: string, body?: { purpose?: string }) =>
    apiFetch<{ task_id: string }>(`/ontology/nodes/${encodeURIComponent(nodeId)}/dossier`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  /**
   * POST /ontology/dossier/composite — enfileira o dossiê de um conjunto/
   * operação/evento (origin composite_dossier). Aceita anchor_node_id (membros =
   * vizinhos 1-hop) OU node_ids[] (conjunto ad-hoc). Devolve {task_id}.
   */
  startComposite: (body: CompositeBody) =>
    apiFetch<{ task_id: string }>('/ontology/dossier/composite', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** GET /ontology/dossier/{task_id} — poll {status, progress_steps, result?}. */
  get: <R = Record<string, unknown>>(taskId: string) =>
    apiFetch<DossierStatus<R>>(`/ontology/dossier/${encodeURIComponent(taskId)}`),

  /** Conveniência: monta o dossiê genérico ATÉ CONCLUIR (start + poll + SSE). */
  runGenericToCompletion: async (
    nodeId: string,
    body?: { purpose?: string },
    opts?: RunOpts,
  ): Promise<DossierStatus<GenericDossierResult>> => {
    const { task_id } = await OntologyDossier.startGeneric(nodeId, body);
    return _runToCompletion<GenericDossierResult>(task_id, opts);
  },

  /** Conveniência: monta o dossiê composto ATÉ CONCLUIR (start + poll + SSE). */
  runCompositeToCompletion: async (
    body: CompositeBody,
    opts?: RunOpts,
  ): Promise<DossierStatus<CompositeDossierResult>> => {
    const { task_id } = await OntologyDossier.startComposite(body);
    return _runToCompletion<CompositeDossierResult>(task_id, opts);
  },
};
