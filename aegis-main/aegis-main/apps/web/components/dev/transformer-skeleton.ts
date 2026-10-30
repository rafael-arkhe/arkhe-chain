/**
 * F6 — gera o ESQUELETO de código do transformer JÁ LINKADO ao contexto do nó:
 * a ENTRADA (o objeto do `nodeType` com suas propriedades reais) e a SAÍDA
 * (a propriedade de saída do nó). Sem isto a IDE abre um código genérico e o
 * operador não sabe "o que chamo, onde, cadê os objetos". PURA / testável.
 */
export type SkelProp = { key: string; type?: string; label?: string };

export function transformerSkeleton(
  nodeType: string,
  props: SkelProp[],
  outputProperty?: string,
): string {
  const kind = (nodeType || 'Objeto').trim() || 'Objeto';
  const out = (outputProperty || '').trim() || 'resultado';
  const inputLines = props.length
    ? props.map(
        (p) =>
          `#   - ${p.key} (${(p.type || 'text').toLowerCase()})` +
          (p.label && p.label !== p.key ? ` — ${p.label}` : ''),
      )
    : ['#   (este tipo ainda não tem propriedades declaradas)'];
  const access = props.length
    ? props
        .slice(0, 4)
        .map((p) => `    ${p.key} = props.get(${JSON.stringify(p.key)})`)
    : ['    # props.get("<campo>")'];

  return [
    'from aegis import AegisClient',
    '',
    `c = AegisClient()  # autentica como o operador (token efêmero do sandbox)`,
    '',
    `# Transformador de "${kind}".`,
    `# ENTRADA (cada objeto vindo da Coleta) tem estas propriedades:`,
    ...inputLines,
    `# SAÍDA: retorne um dict gravando o resultado na propriedade "${out}".`,
    '',
    'def transform(obj):',
    '    props = obj.get("properties", {})',
    ...access,
    `    ${out} = None  # seu processamento / inferência aqui`,
    `    return {${JSON.stringify(out)}: ${out}}`,
    '',
  ].join('\n');
}

/**
 * O3c — esqueleto BATCH p/ o NÓ DE CÓDIGO do pipeline. Diferente do per-object
 * (`transformerSkeleton`, usado pelo AIP enrich): o nó `code` roda 1× sobre TODAS
 * as linhas e segue o contrato de `_apply_code_step` — o sandbox executa o source
 * CRU, então o script LÊ `input.json` (`{"rows":[...]}`) e IMPRIME `{"rows":[...]}`.
 * Auto-contido (sem depender de harness). PURA / testável.
 */
export function transformerSkeletonBatch(
  nodeType: string,
  cols: SkelProp[],
): string {
  const kind = (nodeType || 'dados').trim() || 'dados';
  const colList = cols.length
    ? cols.map((c) => `#   - ${c.key}`)
    : ['#   (schema da entrada ainda desconhecido)'];
  return [
    'import json',
    '',
    `# Transformação em lote de "${kind}" — roda 1× sobre TODAS as linhas.`,
    '# Cada linha é um dict com as colunas:',
    ...colList,
    '',
    'with open("input.json") as f:',
    '    data = json.load(f)',
    'rows = data.get("rows", [])',
    '',
    'out = []',
    'for row in rows:',
    '    r = dict(row)',
    '    # seu processamento aqui (ex.: r["nova_coluna"] = ...)',
    '    out.append(r)',
    '',
    '# Saída tipada: SEMPRE imprima {"rows": [...]} (contrato do nó de código).',
    'print(json.dumps({"rows": out}))',
    '',
  ].join('\n');
}
