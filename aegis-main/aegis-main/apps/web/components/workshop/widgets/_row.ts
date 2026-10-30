/**
 * getField — leitor de campo de uma row de ObjectSet, multidomínio.
 *
 * As rows do /evaluate vêm como `{id, name, node_type, properties:{...}, markings}` —
 * os campos TIPADOS do objeto vivem sob `properties.<chave>`. Widgets de viz (chart,
 * timeline, time_axis) que liam `row[key]` cru achavam `undefined` => gráfico vazio
 * mesmo configurado. Este helper resolve: top-level → `properties[key]` → caminho
 * dotted ("properties.x"). Único lugar; reusado por todos os widgets de dado.
 */
export function getField(row: unknown, key: string | undefined): unknown {
  if (!row || typeof row !== 'object' || !key) return undefined;
  const rec = row as Record<string, unknown>;
  // caminho dotted explícito (ex.: "properties.uf")
  if (key.includes('.')) {
    let cur: unknown = rec;
    for (const seg of key.split('.')) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg];
      else return undefined;
    }
    return cur;
  }
  if (rec[key] != null) return rec[key];
  const props = rec.properties;
  if (props && typeof props === 'object') {
    const pv = (props as Record<string, unknown>)[key];
    if (pv != null) return pv;
  }
  return rec[key];
}
