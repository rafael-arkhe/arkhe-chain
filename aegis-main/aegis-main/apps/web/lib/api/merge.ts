/**
 * Cliente do MERGE governado /buscar → objeto da ontologia (ontology-module
 * app/routers/ontology_merge.py, montado em /ontology/merge).
 *
 * Projeta o resultado de QUALQUER conector nas properties TIPADAS do Object Type
 * alvo e aplica pelo pipeline GOVERNADO de Action (gates + savepoint +
 * ActionExecution + LineageEvent). Tool-agnóstico: o alvo é um node_type (DADO),
 * a projeção é por NOME + SHAPE (extract_selectors + format), nada de vertical.
 *
 * Três gestos (todos sob a perm ontology.merge):
 *   - suggestTarget → auto-sugere o objeto canônico que casa {node_type, canonical}.
 *   - preview       → DRY-RUN (SAVEPOINT+rollback): conflito campo-a-campo
 *                     {field, old, new} + format-check + creates/updates, SEM commit.
 *   - apply         → cria/atualiza/vincula o objeto canônico, honrando as
 *                     resoluções de conflito (keep/replace/append) + proveniência.
 *
 * Perm: ontology.merge.
 */
import { aegis } from './sdk';

/** Como resolver o objeto alvo (os três caminhos): picker manual (object_id),
 *  auto-sugerir por (node_type+canonical), ou criar novo (create=node_type).
 *  `type` (não `interface`) de propósito: ganha index signature implícita e
 *  flui direto pros params `Json` do SDK. */
export type MergeTarget = {
  object_id?: string;
  node_type?: string;
  canonical?: string;
  create?: string;
};

/** Resumo de um objeto candidato a alvo (auto-sugerir/picker). */
export interface MergeTargetSummary {
  object_id: string;
  node_type: string;
  name?: string | null;
  canonical?: string | null;
  score: number;
}

/** Erro de FORMATO numa property declarada (cpf/cnpj/email/...). `code` é estável
 *  p/ traduzir via useT; `error` é o texto pt-BR de fallback. */
export interface MergeFormatError {
  field: string;
  format: string;
  code: string;
  error: string;
}

/** Conflito campo-a-campo: o par existente→novo (não só a chave alterada). */
export interface MergeConflict {
  field: string;
  old: unknown;
  new: unknown;
}

export interface MergeCreates {
  node_type: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface MergeUpdates {
  object_id: string;
  name?: string | null;
  changed_fields: string[];
}

export interface MergePreviewResult {
  resolved_target: 'existing' | 'create';
  node_type: string;
  target_suggestion?: MergeTargetSummary | null;
  target_alternatives: MergeTargetSummary[];
  projected_properties: Record<string, unknown>;
  creates?: MergeCreates | null;
  updates?: MergeUpdates | null;
  conflicts: MergeConflict[];
  format_errors: MergeFormatError[];
}

/** Resolução de conflito por campo: manter o existente, substituir pelo novo, ou
 *  combinar (append: une listas / concatena strings). */
export type FieldResolution = 'keep' | 'replace' | 'append';

/** Vínculo opcional criado junto do merge (objeto ↔ objeto).
 *  `type` de propósito — ver nota em MergeTarget. */
export type MergeLink = {
  target_object_id: string;
  relation_type: string;
  metadata?: Record<string, unknown>;
};

export interface MergeCreatedEdge {
  edge_id: string;
  relation_type: string;
  target_object_id: string;
}

export interface MergeApplyResult {
  object_id: string;
  created: boolean;
  applied_fields: string[];
  created_edges: MergeCreatedEdge[];
  execution_ids: string[];
  lineage_event_ids: string[];
}

/** Corpo comum: ou um result_payload cru (projetado no servidor) ou properties já
 *  prontas — pelo menos um é obrigatório. */
interface MergeInput {
  result_payload?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

export const Merge = {
  /**
   * POST /ontology/merge/suggest-target — auto-sugere o melhor objeto canônico
   * que casa {node_type, canonical} + alternativas. Não escreve nada.
   */
  suggestTarget: (body: { node_type: string; canonical: string }) =>
    aegis.merge.suggestTarget<{
      target_suggestion: MergeTargetSummary | null;
      target_alternatives: MergeTargetSummary[];
    }>(body.node_type, body.canonical),

  /**
   * POST /ontology/merge/preview — DRY-RUN: projeta + resolve o alvo + roda
   * format-check e conflito campo-a-campo. SEM commit. Use o retorno p/ a
   * revisão (conflicts/format_errors) antes do apply.
   */
  preview: (body: MergeInput & { target: MergeTarget }) => {
    const { target, ...input } = body;
    return aegis.merge.preview<MergePreviewResult>(target, input);
  },

  /**
   * POST /ontology/merge/apply — aplica o merge pelo pipeline governado de
   * Action. `field_resolutions` resolve cada conflito (keep/replace/append);
   * `link` cria um vínculo opcional. Idempotente. Devolve o object_id + os
   * campos aplicados + arestas criadas + a trilha (execution/lineage ids).
   */
  apply: (
    body: MergeInput & {
      target: MergeTarget;
      field_resolutions?: Record<string, FieldResolution>;
      link?: MergeLink;
    },
  ) => {
    const { target, ...input } = body;
    return aegis.merge.apply<MergeApplyResult>(target, input);
  },
};
