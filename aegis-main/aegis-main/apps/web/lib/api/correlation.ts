/**
 * Cliente do motor de correlação em CADEIA (ontology-module
 * app/routers/correlation.py, montado em /correlation).
 *
 * O motor (run_chain / quick_links) faz um BFS de fronteira a partir de um
 * SELETOR ({kind, value} — CPF/CNPJ/@handle/email/...): roda as fontes certas
 * para o tipo, EXTRAI novos seletores do retorno (por FORMATO, nunca por
 * keyword — multidomínio), liga nó+aresta com evidência e repete até um guarda
 * de profundidade/orçamento parar. O ``kind`` é inferido pelo formato quando
 * ausente (mesmo classificador do /buscar).
 *
 * Dois modos:
 *   - quickLinks   → SÍNCRONO, 1-hop barato ("o que liga a isto agora?").
 *   - startChain   → ASSÍNCRONO: cria um OperatorTask (origin correlation_run);
 *                    o BFS multi-hop roda no worker (observável por SSE), não
 *                    prende a conexão. getChain faz o poll (status/steps/grafo).
 *   - saveChain    → OPT-IN: materializa o grafo da corrida na ontologia
 *                    canônica (OntologyNode/Edge), idempotente. A corrida
 *                    sozinha NUNCA escreve a ontologia (não poluir).
 *
 * Perms:
 *   - correlation.run   — quickLinks + startChain + getChain
 *   - correlation.save  — saveChain (materializar)
 */
import { API_BASE } from './client';
import { aegis } from './sdk';

/** Nó do grafo de correlação (contrato espelhado de run_chain). */
export interface CorrelationNode {
  id: string;
  kind: string;
  value: string;
  display: string;
  canonical: string;
  confidence: number;
  depth: number;
  properties?: Record<string, unknown>;
}

/** Aresta tipada do grafo (relação + score + evidência). */
export interface CorrelationEdge {
  src: string;
  dst: string;
  rel: string;
  /**
   * Score final. Quando há provedor de embedding configurado, é a FUSÃO
   * 0.5*corroboração + 0.3*semântico + 0.2*sinal-de-grafo (ver `components`);
   * sem provedor, é o score de corroboração do BFS (degradação graciosa).
   */
  score: number;
  evidence?: Record<string, unknown>;
  /**
   * Explicabilidade do score (P3.4): como ele foi fundido. Vazio quando nenhum
   * provedor de embedding rodou.
   */
  components?: {
    corroboracao?: number;
    semantic?: number;
    graph?: number;
  };
  /**
   * `true` numa aresta `rel='similar_to'`: correlação NÃO-ÓBVIA sugerida por
   * embedding (provável-mesma-entidade). É SÓ sugestão — preview-only, nunca
   * materializada por saveChain. `score` = cosseno do par.
   */
  suggested?: boolean;
}

export interface CorrelationGraph {
  nodes: CorrelationNode[];
  edges: CorrelationEdge[];
  stats: Record<string, unknown>;
}

/** Passo de progresso vivo do BFS (um por hop), surfaçado pelo poll/SSE. */
export interface CorrelationStep {
  label: string;
  detail?: string;
}

export interface CorrelationChainStatus {
  task_id: string;
  status: string; // pending | running | done | failed | cancelled
  progress_steps: CorrelationStep[];
  graph?: CorrelationGraph | null;
  error_message?: string | null;
}

export const Correlation = {
  /**
   * POST /correlation/quick-links — pivô 1-hop SÍNCRONO. ``kind`` opcional
   * (inferido pelo formato quando ausente). Devolve {graph}. Roda fontes ao
   * vivo; espelha a camada de trabalho (Entity/EntityLink), NÃO a ontologia
   * canônica (isso é saveChain). Perm correlation.run.
   */
  quickLinks: (body: { value: string; kind?: string }) =>
    aegis.correlation.quickLinks<{ graph: CorrelationGraph }>(body.value, body.kind),

  /**
   * POST /correlation/chain — enfileira a corrida multi-hop ASSÍNCRONA (cria um
   * OperatorTask origin correlation_run). Devolve {task_id}; acompanhe com
   * getChain. max_depth ≤ 4, budget_nodes ≤ 200. Perm correlation.run.
   *
   * `deep_osint_depth` (P3.4, default 0): hops mais profundos que isto pulam as
   * fontes OSINT de sandbox (lentas) e mantêm só as HTTP rápidas — assim a
   * expansão em cadeia não trava em sandbox nos nós derivados (a semente, no
   * depth 0, ainda faz OSINT profundo).
   */
  startChain: (body: {
    value: string;
    kind?: string;
    max_depth?: number;
    budget_nodes?: number;
    deep_osint_depth?: number;
  }) => {
    const { value, ...opts } = body;
    return aegis.correlation.startChain<{ task_id: string }>(value, opts);
  },

  /**
   * GET /correlation/chain/{task_id} — poll da corrida: {status,
   * progress_steps, graph?}. O grafo aparece quando status === 'done'.
   * Perm correlation.run.
   */
  getChain: (taskId: string) =>
    aegis.correlation.getChain<CorrelationChainStatus>(encodeURIComponent(taskId)),

  /**
   * POST /correlation/chain/{task_id}/save — materializa o grafo (ou o subset
   * ``node_ids``) na ontologia canônica. OPT-IN, idempotente. Devolve
   * {created_nodes, created_edges}. Perm correlation.save.
   */
  saveChain: (taskId: string, body?: { node_ids?: string[] }) =>
    aegis.correlation.saveChain<{ created_nodes: number; created_edges: number }>(
      encodeURIComponent(taskId),
      body?.node_ids,
    ),

  /**
   * Conveniência: roda a corrida multi-hop ATÉ CONCLUIR (startChain + poll +
   * SSE de steps), espelhando ``Entities.dossierViaTask``. Resolve com a
   * CorrelationChainStatus final (status done -> graph preenchido); rejeita se
   * failed/cancelled/timeout. ADD-alongside — os 4 métodos atômicos seguem
   * disponíveis para fluxos que controlam o poll na própria UI.
   */
  runChainToCompletion: async (
    body: {
      value: string;
      kind?: string;
      max_depth?: number;
      budget_nodes?: number;
      deep_osint_depth?: number;
    },
    opts?: {
      pollMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      onProgress?: (steps: CorrelationStep[]) => void;
    },
  ): Promise<CorrelationChainStatus> => {
    const { task_id } = await Correlation.startChain(body);
    const pollMs = opts?.pollMs ?? 2500;
    const timeoutMs = opts?.timeoutMs ?? 8 * 60 * 1000;
    const started = Date.now();
    // SSE p/ steps em TEMPO REAL (um por hop). Best-effort/aditivo: o poll
    // abaixo governa a conclusão; sem EventSource, o poll surfaça os steps.
    let es: EventSource | null = null;
    if (opts?.onProgress && typeof EventSource !== 'undefined') {
      try {
        es = new EventSource(`${API_BASE}/operator/tasks/stream`, {
          withCredentials: true,
        });
        es.addEventListener('task.changed', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data) as {
              id: string;
              provenance?: { steps?: CorrelationStep[] };
            };
            if (d.id === task_id) opts.onProgress?.(d.provenance?.steps ?? []);
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
        const st = await Correlation.getChain(task_id);
        if (opts?.onProgress) opts.onProgress(st.progress_steps ?? []);
        if (st.status === 'done') return st;
        if (st.status === 'failed' || st.status === 'cancelled') {
          throw new Error(st.error_message || 'falha na correlação em cadeia');
        }
        if (Date.now() - started > timeoutMs) {
          throw new Error('tempo esgotado na correlação em cadeia');
        }
      }
    } finally {
      es?.close();
    }
  },
};
