/**
 * inference-vars — helpers puros do template de inferência (`{{var}}`).
 *
 * O operador via "Template da inferência" citando `{{VARIAVEL}}` SEM saber quais
 * existem. As variáveis disponíveis são: built-ins + variáveis declaradas + os
 * CAMPOS do objeto de entrada (o backend `aip_enrich._render` substitui
 * `{{prop}}` pelo valor da propriedade do objeto). Aqui derivamos os nomes dos
 * campos e calculamos refs não-resolvidas considerando TODOS eles (senão
 * `{{username}}` alertava como não-resolvido mesmo sendo um campo válido).
 */

/** Nomes dos campos do objeto de entrada (propriedades do tipo). */
export function objectFieldNames(
  inputProps: ReadonlyArray<{ key: string }> | undefined,
): string[] {
  if (!inputProps) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of inputProps) {
    const k = (p?.key || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** `{{xxx}}` no prompt que não estão no conjunto conhecido (dedupe, em ordem). */
export function unresolvedRefs(prompt: string, knownNames: Iterable<string>): string[] {
  const known = new Set(knownNames);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of (prompt || '').matchAll(/\{\{(\w+)\}\}/g)) {
    const name = m[1];
    if (known.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
