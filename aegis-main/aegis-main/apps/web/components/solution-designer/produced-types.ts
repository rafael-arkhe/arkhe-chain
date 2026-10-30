/**
 * produced-types — uma fonte de Coleta produz UM OU MAIS Tipos de objeto.
 *
 * Erro reportado pelo operador: a Coleta do Instagram retorna PerfilInstagram
 * E PostInstagram, mas a UI só deixava escolher UM `target_node_type`. Aqui
 * normalizamos uma LISTA (`target_node_types`) mantendo retrocompat com o
 * campo singular `target_node_type` (1ª posição = primário, p/ o backend
 * legado e o mapa de campos id/nome).
 */
export interface ProducingSource {
  target_node_type?: string;
  target_node_types?: string[];
}

/** Lista canônica de Tipos que a fonte produz — dedupe, sem vazios. */
export function producedTypes(src: ProducingSource): string[] {
  const list =
    src.target_node_types && src.target_node_types.length
      ? src.target_node_types
      : src.target_node_type
        ? [src.target_node_type]
        : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of list) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Reescreve a fonte com a lista de Tipos produzidos. Mantém `target_node_type`
 * sincronizado ao 1º (retrocompat: mapa de campos id/nome + backend legado).
 * Lista vazia → ambos os campos removidos (vínculo só de proveniência).
 */
export function withProducedTypes<S extends ProducingSource>(
  src: S,
  types: string[],
): S {
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const k of types) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    clean.push(k);
  }
  return {
    ...src,
    target_node_type: clean[0] || undefined,
    target_node_types: clean.length ? clean : undefined,
  };
}
