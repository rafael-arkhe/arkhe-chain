/**
 * synthesizeSampleSkeleton — monta um objeto-esqueleto a partir das propriedades
 * do tipo de objeto (valores-padrão por tipo). Extraído do SandboxIDE p/ ser
 * testável puro e reutilizar o MESMO contrato tanto no schema materializado
 * quanto nos `inputProps` propostos pelo blueprint (tipos ainda não criados).
 *
 * Antes, "Sintetizar amostra" lia só `schema.properties` (que faz 404 p/ tipos
 * PROPOSTOS) → produzia `{}` e parecia quebrado. Aqui o caller decide a fonte
 * das props (schema OU inputProps) e este helper só monta o esqueleto.
 */
export function synthesizeSampleSkeleton(
  props: ReadonlyArray<{ key: string; type?: string }>,
): Record<string, unknown> {
  const skeleton: Record<string, unknown> = {};
  for (const p of props) {
    if (!p || !p.key) continue;
    const ty = (p.type || '').toLowerCase();
    if (ty === 'number' || ty === 'integer' || ty === 'float' || ty === 'double')
      skeleton[p.key] = 0;
    else if (ty === 'boolean' || ty === 'bool') skeleton[p.key] = false;
    else if (ty === 'array' || ty === 'list') skeleton[p.key] = [];
    else if (ty === 'object' || ty === 'struct' || ty === 'map') skeleton[p.key] = {};
    else skeleton[p.key] = '';
  }
  return skeleton;
}
