/**
 * Tradução pt-BR dos `metadata.kind` que o ontology grava em LineageEvent.
 *
 * Decisão 2026-05-17 do operador: o `metadata.kind` no DB fica em
 * inglês (padrão lineage internacional, ex. `cctv.face.observe`) e a
 * UI traduz no momento de mostrar. Isso permite suportar EN/PT no
 * futuro sem rewrite de dados.
 */

const TABLE: Record<string, string> = {
  // CCTV streams
  'cctv.stream.create': 'Câmera cadastrada',
  'cctv.stream.update': 'Câmera atualizada',

  // CCTV detections
  'cctv.face.observe': 'Rosto identificado',
  'cctv.detection.lpr': 'Placa detectada',
  'cctv.detection.face': 'Rosto detectado',
  'cctv.detection.object': 'Objeto detectado',

  // Generic lineage event types (event_type column)
  ingest: 'Ingestão',
  transform: 'Transformação',
  enrich: 'Enriquecimento',
  export: 'Exportação',

  // Workflow-graph edge kinds (relação das arestas do Mapa do Workflow) —
  // usados como tooltip/aria de cada aresta e no painel de vínculos.
  derived: 'Derivado de',
  'action.execute': 'Ação',
  'action.execute.success': 'Ação',
  'action.execute.denied': 'Ação (negada)',
  'action.execute.requested': 'Ação (solicitada)',
  inference: 'Inferência',
  'workspace.consumes': 'Consome',
};

export function labelLineageKind(kind: string | null | undefined): string {
  if (!kind) return 'Evento';
  return TABLE[kind] ?? kind;
}

export function isKnownLineageKind(kind: string | null | undefined): boolean {
  return !!kind && kind in TABLE;
}
