/**
 * Espelho TS do `_render_template` do engine
 * (ontology-module/app/services/pipeline/transforms.py). Substitui tokens
 * `{{ $var }}` contra UMA linha, sem eval. Usado SÓ para o preview inline do NDV
 * (o engine continua a fonte de verdade na execução) — por isso a semântica é
 * idêntica: campo ausente/None → string vazia; não-string passa intocado.
 *
 * A9 — vocabulário paridade n8n-core: $json.campo · $now/$today (ISO) · $itemIndex
 * · $execution.id · $workflow.id/.name · $prevNode. Token desconhecido → vazio.
 */

// Qualquer token $var (não só $json) — o espelho resolve todas as famílias.
const TOKEN_RE = /\{\{\s*(\$[A-Za-z0-9_.-]+)\s*\}\}/g;

export interface TemplateCtx {
  now?: string;
  today?: string;
  itemIndex?: number;
  executionId?: string;
  workflowId?: string;
  workflowName?: string;
  prevNode?: string;
}

/** O valor contém pelo menos um token `{{ $var }}`? */
export function hasTemplate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(value);
}

/** Resolve os tokens contra a linha + contexto opcional (espelho do backend). */
export function renderTemplate(
  value: unknown,
  row: Record<string, unknown>,
  ctx?: TemplateCtx,
  itemIndex?: number,
): unknown {
  if (typeof value !== 'string') return value;
  const c = ctx || {};
  const idx = itemIndex ?? c.itemIndex;
  TOKEN_RE.lastIndex = 0;
  return value.replace(TOKEN_RE, (_m, expr: string) => {
    const e = expr.trim();
    if (e.startsWith('$json.')) {
      const raw = row[e.slice('$json.'.length)];
      return raw == null ? '' : String(raw);
    }
    if (e === '$now') return c.now ?? new Date().toISOString();
    if (e === '$today') return c.today ?? new Date().toISOString().slice(0, 10);
    if (e === '$itemIndex') return idx == null ? '' : String(idx);
    if (e === '$execution.id' || e === '$execution') return c.executionId ?? '';
    if (e === '$workflow.id') return c.workflowId ?? '';
    if (e === '$workflow.name') return c.workflowName ?? '';
    if (e === '$prevNode' || e === '$prevNode.name') return c.prevNode ?? '';
    return '';
  });
}
