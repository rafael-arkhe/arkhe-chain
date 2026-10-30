/**
 * F3 — deriva, a partir do blueprint embutido (`wizard._blueprint`), os NÓS de
 * tipo de objeto e as ARESTAS de lineage que faltavam no diagrama do AIP:
 *
 *   • relações  (proposed_links)        → tipo ↔ tipo, rotuladas pela relação
 *   • Coleta → objeto                    → o que a fase de coleta ingere
 *   • objeto → Construção (consumidores) → quem consome cada tipo (widgets/ações)
 *
 * PURA (sem React/reactflow) p/ ser testável isolada. O `SolutionCanvas` mistura
 * a saída daqui com os nós de fase + arestas base já existentes. Multidomínio:
 * tudo vem do contrato do blueprint, nada hardcodado de vertical.
 */

export type BpType = { kind?: string; display_name?: string };
export type BpLink = { source_kind?: string; target_kind?: string; relation?: string };
export type BpAction = { target_kind?: string };
export type BpWidget = {
  type?: string;
  config?: { object_kind?: string; target_kind?: string } & Record<string, unknown>;
};
export type BlueprintForGraph = {
  ontology_types?: BpType[];
  proposed_links?: BpLink[];
  action_types?: BpAction[];
  workspace_layout?: BpWidget[];
  proposed_app?: { widgets?: BpWidget[] } | null;
  proposed_pages?: { widgets?: BpWidget[] }[];
};

export type PhaseNode = {
  id: string;
  kind: string;
  phase: string;
  title?: string;
  config?: Record<string, unknown>;
};

export type ObjectNode = {
  id: string;
  kind: 'ontology_type';
  phase: 'ontologia';
  title: string;
  config: { object_kind: string; items: { label: string; detail?: string }[]; synthetic: true };
  position: { x: number; y: number };
};

export type DerivedEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  /** aresta de relação tipo↔tipo (proposed_link) */
  relation?: boolean;
  /** aresta objeto→Construção (consumo por widget/ação) */
  consumer?: boolean;
};

const OBJ_PREFIX = 'otype:';
export function objectNodeId(kind: string): string {
  return OBJ_PREFIX + kind;
}
export function isObjectNodeId(id: string): boolean {
  return id.startsWith(OBJ_PREFIX);
}

function humanizeRelation(r: string | undefined): string {
  return String(r || '').replace(/_/g, ' ').trim();
}

function allWidgets(bp: BlueprintForGraph): BpWidget[] {
  return [
    ...(bp.workspace_layout || []),
    ...((bp.proposed_app && bp.proposed_app.widgets) || []),
    ...(bp.proposed_pages || []).flatMap((p) => p.widgets || []),
  ];
}

/** Quantos widgets/ações da Construção consomem cada tipo de objeto. */
function consumerCounts(bp: BlueprintForGraph): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (k?: string) => {
    const key = String(k || '').trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  };
  for (const w of allWidgets(bp)) bump(w?.config?.object_kind || w?.config?.target_kind);
  for (const a of bp.action_types || []) bump(a?.target_kind);
  return counts;
}

/** Tipos que a Coleta ingere: dos itens do nó de coleta ("Ingestão · ‹kind›");
 *  fallback = raízes do grafo de relações (source que nunca é target). */
function collectedKinds(bp: BlueprintForGraph, phaseNodes: PhaseNode[], known: Set<string>): Set<string> {
  const collected = new Set<string>();
  const coleta = phaseNodes.find((n) => n.phase === 'coleta');
  const items = Array.isArray(coleta?.config?.items)
    ? (coleta!.config!.items as { label?: string }[])
    : [];
  for (const it of items) {
    const lbl = String(it?.label || '');
    for (const k of known) if (k && lbl.includes(k)) collected.add(k);
  }
  if (collected.size === 0) {
    const links = bp.proposed_links || [];
    if (links.length) {
      const targets = new Set(links.map((l) => String(l.target_kind || '').trim()));
      for (const l of links) {
        const s = String(l.source_kind || '').trim();
        if (s && known.has(s) && !targets.has(s)) collected.add(s);
      }
    }
  }
  return collected;
}

/**
 * Ordena os tipos pela PROFUNDIDADE no grafo de relações (raízes — sem aresta de
 * entrada — primeiro), p/ a banda de objetos ler upstream→downstream igual ao fluxo.
 * Tie-break alfabético. Guard de ciclo. PURA / testável. F7.
 */
export function orderByFlow(kinds: string[], links: BpLink[]): string[] {
  const incoming = new Map<string, string[]>();
  for (const k of kinds) incoming.set(k, []);
  for (const l of links) {
    const s = String(l.source_kind || '').trim();
    const t = String(l.target_kind || '').trim();
    if (incoming.has(t) && incoming.has(s) && s !== t) incoming.get(t)!.push(s);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (k: string): number => {
    if (depth.has(k)) return depth.get(k)!;
    if (visiting.has(k)) return 0; // guard de ciclo
    visiting.add(k);
    const ins = incoming.get(k) || [];
    const v = ins.length ? Math.max(...ins.map(d)) + 1 : 0;
    visiting.delete(k);
    depth.set(k, v);
    return v;
  };
  return [...kinds].sort((a, b) => d(a) - d(b) || a.localeCompare(b));
}

export function deriveBlueprintGraph(
  bp: BlueprintForGraph | undefined | null,
  phaseNodes: PhaseNode[],
): { objectNodes: ObjectNode[]; edges: DerivedEdge[] } {
  const types = (bp?.ontology_types || [])
    .map((t) => String(t.kind || '').trim())
    .filter(Boolean);
  if (!bp || !types.length) return { objectNodes: [], edges: [] };

  const known = new Set(types);
  const labelOf = new Map<string, string>();
  for (const t of bp.ontology_types || []) {
    const k = String(t.kind || '').trim();
    if (k) labelOf.set(k, String(t.display_name || t.kind || '').trim() || k);
  }

  const consumers = consumerCounts(bp);
  const collected = collectedKinds(bp, phaseNodes, known);
  const coleta = phaseNodes.find((n) => n.phase === 'coleta');
  const app = phaseNodes.find((n) => n.phase === 'aplicacao');

  // Banda de objetos abaixo das fases, ORDENADA pelo fluxo (raízes→folhas) e em
  // GRADE (quebra de linha) p/ muitos tipos não esticarem horizontalmente. F7.
  const ordered = orderByFlow(types, bp.proposed_links || []);
  const PER_ROW = 5;
  const COL_W = 300; // > largura do nó (240) → nunca sobrepõe
  const ROW_H = 190;
  // F5 — relações por tipo, p/ cada nó CITAR o lineage textualmente (→ referencia /
  // ← referenciado por), além das arestas visuais do F3.
  const outRels = new Map<string, { rel: string; other: string }[]>();
  const inRels = new Map<string, { rel: string; other: string }[]>();
  for (const l of bp.proposed_links || []) {
    const s = String(l.source_kind || '').trim();
    const t = String(l.target_kind || '').trim();
    if (!known.has(s) || !known.has(t) || s === t) continue;
    (outRels.get(s) || outRels.set(s, []).get(s)!).push({ rel: humanizeRelation(l.relation), other: t });
    (inRels.get(t) || inRels.set(t, []).get(t)!).push({ rel: humanizeRelation(l.relation), other: s });
  }

  const objectNodes: ObjectNode[] = ordered.map((k, i) => {
    const items: { label: string; detail?: string }[] = [];
    if (collected.has(k)) items.push({ label: 'Coletado', detail: 'Entra pela Coleta' });
    const c = consumers.get(k);
    if (c) items.push({ label: `Consumido em ${c}`, detail: 'widgets/ações da Construção' });
    // Relações (cap p/ não inflar o nó): → referencia / ← referenciado por.
    for (const r of (outRels.get(k) || []).slice(0, 3)) {
      items.push({ label: `→ ${r.rel}: ${labelOf.get(r.other) || r.other}`, detail: 'referencia' });
    }
    for (const r of (inRels.get(k) || []).slice(0, 3)) {
      items.push({ label: `← ${r.rel}: ${labelOf.get(r.other) || r.other}`, detail: 'referenciado por' });
    }
    const col = i % PER_ROW;
    const row = Math.floor(i / PER_ROW);
    return {
      id: objectNodeId(k),
      kind: 'ontology_type' as const,
      phase: 'ontologia' as const,
      title: labelOf.get(k) || k,
      config: { object_kind: k, items, synthetic: true as const },
      position: { x: 60 + col * COL_W, y: 520 + row * ROW_H },
    };
  });

  const edges: DerivedEdge[] = [];

  // 1) relações (proposed_links) — só entre tipos conhecidos (link órfão é dropado).
  for (const l of bp.proposed_links || []) {
    const s = String(l.source_kind || '').trim();
    const tg = String(l.target_kind || '').trim();
    if (!known.has(s) || !known.has(tg) || s === tg) continue;
    edges.push({
      id: `rel:${s}:${humanizeRelation(l.relation)}:${tg}`,
      source: objectNodeId(s),
      target: objectNodeId(tg),
      label: humanizeRelation(l.relation),
      relation: true,
    });
  }

  // 2) Coleta → objeto (o que a coleta ingere).
  if (coleta) {
    for (const k of collected) {
      edges.push({
        id: `coleta:${k}`,
        source: coleta.id,
        target: objectNodeId(k),
        label: labelOf.get(k) || k,
      });
    }
  }

  // 3) objeto → Construção (consumido por widget/ação).
  if (app) {
    for (const [k, n] of consumers) {
      if (!known.has(k)) continue;
      edges.push({
        id: `cons:${k}`,
        source: objectNodeId(k),
        target: app.id,
        label: `consumido (${n})`,
        consumer: true,
      });
    }
  }

  return { objectNodes, edges };
}
