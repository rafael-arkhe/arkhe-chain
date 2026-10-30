/**
 * F8.5 — clipboard do canvas (copiar/colar nós, paridade n8n "paste importa JSON").
 *
 * Formato ÚNICO do clipboard: payload JSON com os nós selecionados + as arestas
 * INTERNAS à seleção (mesmo shape do graph canônico do board). O parse é
 * tolerante: aceita o payload novo, o formato legado de nó único ({op, config})
 * e um graph completo ({nodes, edges}) — o que torna o colar compatível com o
 * export JSON do board (F8.7). Puro → testável.
 */
import type { PipelineBoardGraph, PipelineBoardNode, PipelineBoardEdge } from '@/lib/api';

export const PIPELINE_CLIPBOARD_KIND = 'aegis-pipeline-nodes';

/** Offset do colar (mesma convenção do duplicateNode: +36/+36). */
export const PASTE_OFFSET = 36;

export interface ClipboardNodes {
  nodes: PipelineBoardNode[];
  edges: PipelineBoardEdge[];
}

/** Prefixo canônico do id por op — fonte ÚNICA (antes havia 3 cópias com
 * divergência: ontology_output caía em 'tf' numa delas). */
export function nodePrefix(op: string): string {
  return op === 'output' || op === 'ontology_output' ? 'out'
    : op === 'source' ? 'src'
    : op === 'trigger' ? 'trg'
    : op === 'note' ? 'note'
    : op === 'if' ? 'if'
    : op === 'switch' ? 'sw'
    : op === 'merge' ? 'mg'
    : op === 'wait' ? 'wt'
    : op === 'stop_error' ? 'st'
    : op === 'compare' ? 'cmp'
    // A4 onda 4 — cluster AIP (prefixos distintos p/ root e sub-nodes).
    : op === 'aip_agent' ? 'aip'
    : op === 'aip_model' ? 'aipm'
    : op === 'aip_tools' ? 'aipt'
    : op === 'aip_memory' ? 'aipmem'
    : op === 'aip_vector' ? 'aipvec'
    : 'tf';
}

/** UID curto p/ ids de nó (sem Date.now p/ determinismo de render React). */
export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Serializa a SELEÇÃO (nós + arestas internas) p/ texto de clipboard. */
export function serializeNodesToClipboard(graph: PipelineBoardGraph, ids: string[]): string {
  const want = new Set(ids);
  const nodes = (graph.nodes || []).filter((n) => want.has(n.id));
  const present = new Set(nodes.map((n) => n.id));
  const edges = (graph.edges || []).filter((e) => present.has(e.from) && present.has(e.to));
  return JSON.stringify({ kind: PIPELINE_CLIPBOARD_KIND, version: 1, nodes, edges }, null, 2);
}

function normalizeNode(raw: unknown): PipelineBoardNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const op = typeof r.op === 'string' ? r.op : '';
  if (!op) return null;
  const node: PipelineBoardNode = {
    id: typeof r.id === 'string' ? r.id : '',
    op,
    config: r.config && typeof r.config === 'object' && !Array.isArray(r.config)
      ? (r.config as Record<string, unknown>)
      : {},
  };
  const pos = r.position as { x?: unknown; y?: unknown } | undefined;
  if (pos && typeof pos === 'object' && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))) {
    node.position = { x: Number(pos.x), y: Number(pos.y) };
  }
  return node;
}

/**
 * Parse tolerante do texto do clipboard → {nodes, edges} ou null quando o texto
 * não é um payload de nós reconhecível (nunca lança).
 */
export function parseClipboardText(text: string): ClipboardNodes | null {
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  // Payload novo OU graph completo (export F8.7): {nodes:[...], edges?:[...]}
  if (Array.isArray(o.nodes)) {
    const nodes = (o.nodes as unknown[]).map(normalizeNode).filter((n): n is PipelineBoardNode => !!n);
    if (!nodes.length) return null;
    const present = new Set(nodes.map((n) => n.id));
    const edges = (Array.isArray(o.edges) ? (o.edges as unknown[]) : [])
      .map((e) => {
        const r = e as Record<string, unknown> | null;
        if (!r || typeof r.from !== 'string' || typeof r.to !== 'string') return null;
        // A4/A5 — preserva a porta de saída (if/switch/error); ausente = 'main'.
        const edge: PipelineBoardEdge = { from: r.from, to: r.to };
        if (typeof r.port === 'string' && r.port) edge.port = r.port;
        return edge;
      })
      .filter((e): e is PipelineBoardEdge => !!e && present.has(e.from) && present.has(e.to));
    return { nodes, edges };
  }
  // Formato legado do copyNode antigo: nó único {op, config}
  const single = normalizeNode(o);
  return single ? { nodes: [single], edges: [] } : null;
}

/**
 * Materializa um payload colado dentro de um graph existente: ids NOVOS (nunca
 * colidem com os existentes), arestas remapeadas, config deep-clonado e
 * position deslocada (+36/+36) quando presente. `uid` é injetável p/ teste.
 */
export function materializePaste(
  payload: ClipboardNodes,
  existingIds: Set<string>,
  makeId: (prefix: string) => string = uid,
): ClipboardNodes {
  const used = new Set(existingIds);
  const idMap = new Map<string, string>();
  const nodes = payload.nodes.map((n) => {
    let next = makeId(nodePrefix(n.op));
    while (used.has(next)) next = makeId(nodePrefix(n.op));
    used.add(next);
    if (n.id) idMap.set(n.id, next);
    const out: PipelineBoardNode = {
      id: next,
      op: n.op,
      config: JSON.parse(JSON.stringify(n.config ?? {})),
    };
    if (n.position) out.position = { x: n.position.x + PASTE_OFFSET, y: n.position.y + PASTE_OFFSET };
    return out;
  });
  const edges = payload.edges
    .map((e) => {
      const from = idMap.get(e.from);
      const to = idMap.get(e.to);
      if (!from || !to) return null;
      // A4/A5 — a porta da aresta viaja junto (colar um if religado preserva true/false).
      return e.port ? { from, to, port: e.port } : { from, to };
    })
    .filter((e): e is PipelineBoardEdge => !!e);
  return { nodes, edges };
}
