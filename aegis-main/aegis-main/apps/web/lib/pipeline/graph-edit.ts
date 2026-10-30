/**
 * F8.5 — edições PURAS de graph usadas pelo canvas (rename inline F2 e
 * remoção multi-seleção). O canvas é controlado: aplica e emite via
 * onGraphChange; o provider marca dirty + snapshot de undo. Puro → testável.
 */
import type { PipelineBoardGraph } from '@/lib/api';

/**
 * Aplica o rótulo do operador em config.label do nó. Rótulo vazio REMOVE a
 * chave (o card volta ao rótulo default por kind). Retorna null quando o nó
 * não existe (caller não emite — evita PUT de graph idêntico).
 */
export function applyNodeLabel(graph: PipelineBoardGraph, id: string, label: string): PipelineBoardGraph | null {
  const node = (graph.nodes || []).find((n) => n.id === id);
  if (!node) return null;
  const trimmed = label.trim();
  const cfg = { ...((node.config ?? {}) as Record<string, unknown>) };
  if ((cfg.label ?? '') === trimmed || (!trimmed && cfg.label == null)) return null; // sem mudança
  if (trimmed) cfg.label = trimmed;
  else delete cfg.label;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, config: cfg } : n)),
  };
}

/** Remove um CONJUNTO de nós + todas as arestas incidentes (delete multi-seleção). */
export function removeNodesFromGraph(graph: PipelineBoardGraph, ids: Set<string>): PipelineBoardGraph {
  return {
    nodes: (graph.nodes || []).filter((n) => !ids.has(n.id)),
    edges: (graph.edges || []).filter((e) => !ids.has(e.from) && !ids.has(e.to)),
  };
}
