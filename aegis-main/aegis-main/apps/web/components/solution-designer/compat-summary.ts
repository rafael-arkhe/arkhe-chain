/**
 * F4 — resume o diff (RefactorBlueprintDiff de /refactor/preview) na visão do
 * operador que está REUSANDO tipos existentes: para cada tipo proposto que JÁ
 * EXISTE na ontologia, o que a operação PRECISA e o tipo existente não tem
 * (campos a adicionar), o que diverge (tipo mudou), o que sobra, e as relações
 * que precisam ser criadas. PURA / testável. Reusa a engine `_blueprint_diff`.
 */
import type { RefactorBlueprintDiff } from '@/lib/api';

export type CompatConflict = {
  kind: string;
  /** campos que a operação precisa e o tipo EXISTENTE não tem (added_properties) */
  missing: string[];
  /** divergências de tipo (changed_properties) */
  divergent: { key: string; from: string; to: string }[];
  /** campos do tipo existente NÃO usados pela operação (removed_properties) */
  extra: string[];
  /** mexe em dado existente (divergência/remoção) → exige cautela */
  destructive: boolean;
};

export type CompatSummary = {
  /** tipos EXISTENTES que precisam de ajuste p/ a operação */
  conflicts: CompatConflict[];
  /** relações que a operação precisa e ainda não existem */
  relationsToCreate: { source: string; relation: string; target: string }[];
  /** tipos propostos NOVOS (serão criados — sem conflito) */
  newTypes: string[];
  /** há algo que o operador precisa saber (conflito ou relação a criar) */
  hasAny: boolean;
};

export function compatSummary(diff: RefactorBlueprintDiff | null | undefined): CompatSummary {
  const updated = diff?.updated_types ?? [];
  const conflicts: CompatConflict[] = updated
    .map((td) => ({
      kind: td.kind,
      missing: (td.added_properties ?? []).map((p) => p.key),
      divergent: (td.changed_properties ?? []).map((c) => ({
        key: c.key,
        from: c.from_type,
        to: c.to_type,
      })),
      extra: td.removed_properties ?? [],
      destructive: !!(
        (td.changed_properties ?? []).length || (td.removed_properties ?? []).length
      ),
    }))
    .filter((c) => c.missing.length || c.divergent.length || c.extra.length);

  const relationsToCreate = (diff?.added_links ?? []).map((l) => ({
    source: l.source_kind,
    relation: l.relation,
    target: l.target_kind,
  }));

  const newTypes = (diff?.added_types ?? []).map((t) => t.kind);

  return {
    conflicts,
    relationsToCreate,
    newTypes,
    hasAny: conflicts.length > 0 || relationsToCreate.length > 0,
  };
}
