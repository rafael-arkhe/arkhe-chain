/**
 * Validação client-side dirigida pelo `param_schema` declarado de uma skill.
 *
 * Extraído de conectores-workspace.tsx para ser COMPARTILHADO pelas duas
 * superfícies que escrevem config por schema (o modal Configurar do conector e
 * o Configurar do dispositivo em Dispositivos) — mesma regra, uma implementação
 * só. O clamp server-side permanece como defesa em profundidade.
 */
import type { SkillParam } from '@/lib/api';

const NUM_PARAM_TYPES = new Set(['int', 'float', 'integer', 'number']);

export type SchemaIssue = { kind: 'required' | 'range'; p: SkillParam };

/** Primeiro problema do preenchimento: obrigatório vazio, depois fora de faixa. */
export function schemaIssue(
  schema: SkillParam[],
  values: Record<string, unknown>,
): SchemaIssue | null {
  const missing = schema.find(
    (p) => p.required && (values[p.key] == null || values[p.key] === ''),
  );
  if (missing) return { kind: 'required', p: missing };
  const outOfRange = schema.find((p) => {
    if (!NUM_PARAM_TYPES.has(p.param_type) || (p.min == null && p.max == null)) return false;
    const raw = values[p.key];
    if (raw == null || raw === '') return false;
    const n = Number(raw);
    if (Number.isNaN(n)) return true;
    return (p.min != null && n < p.min) || (p.max != null && n > p.max);
  });
  if (outOfRange) return { kind: 'range', p: outOfRange };
  return null;
}

/** Mensagem i18n do problema (rótulo declarado do param, nunca a chave crua). */
export function schemaIssueMessage(
  t: (k: string) => string,
  issue: SchemaIssue,
): string {
  if (issue.kind === 'required') {
    return t('conectores.err.required_param').replace('{name}', issue.p.label || issue.p.key);
  }
  return t('conectores.err.param_range')
    .replace('{name}', issue.p.label || issue.p.key)
    .replace('{min}', String(issue.p.min ?? ''))
    .replace('{max}', String(issue.p.max ?? ''));
}
