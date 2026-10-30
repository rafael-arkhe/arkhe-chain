/**
 * Form logic helpers — Onda K.2 (2026-05-23).
 *
 * Lógica compartilhada entre o Form Widget (runtime) e o editor visual.
 * Espelha o backend (`platform_v23/forms.py`) para que a UX bata com a
 * validação autoritativa do servidor:
 *   - avaliação de regras condicionais (nível Salesforce)
 *   - resolução do estado (visível + obrigatório) de cada campo
 *   - validação client-side (required/min/max/minLength/maxLength/pattern)
 *   - defaults dinâmicos (usuário atual, data hoje, objeto selecionado)
 *
 * Mantido em `.tsx` apenas para ficar no namespace isolado `form-*.tsx`;
 * não contém JSX.
 */
import type {
  FormConditionalRule,
  FormFieldSpec,
  ActionValidationError,
} from '@/lib/api';

// ── Conditional rule evaluation ────────────────────────────────────────

function asNumbers(a: unknown, b: unknown): [number, number] | null {
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return null;
  return [na, nb];
}

export function evaluateRule(
  rule: FormConditionalRule,
  payload: Record<string, unknown>,
): boolean {
  const actual = payload[rule.when_field];
  const expected = rule.value;
  try {
    switch (rule.operator) {
      case 'is_empty':
        return (
          actual == null ||
          actual === '' ||
          (Array.isArray(actual) && actual.length === 0)
        );
      case 'is_not_empty':
        return !(
          actual == null ||
          actual === '' ||
          (Array.isArray(actual) && actual.length === 0)
        );
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'contains':
        if (Array.isArray(actual) || typeof actual === 'string') {
          return (actual as unknown[] | string).includes(expected as never);
        }
        return false;
      case 'in':
        return Array.isArray(expected) ? expected.includes(actual) : false;
      case 'gt':
      case 'lt':
      case 'gte':
      case 'lte': {
        const nums = asNumbers(actual, expected);
        if (!nums) return false;
        const [na, nb] = nums;
        if (rule.operator === 'gt') return na > nb;
        if (rule.operator === 'lt') return na < nb;
        if (rule.operator === 'gte') return na >= nb;
        return na <= nb;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/** Resolve (visible, required) de um campo após aplicar suas regras. */
export function resolveFieldState(
  field: FormFieldSpec,
  payload: Record<string, unknown>,
): { visible: boolean; required: boolean } {
  const rules = field.rules ?? [];
  let visible = true;
  let required = !!field.required;
  const hasShowRule = rules.some((r) => r.effect === 'show');
  if (hasShowRule) visible = false;
  for (const rule of rules) {
    const matched = evaluateRule(rule, payload);
    if (rule.effect === 'show' && matched) visible = true;
    else if (rule.effect === 'hide' && matched) visible = false;
    else if (rule.effect === 'require' && matched) required = true;
  }
  if (!visible) required = false;
  return { visible, required };
}

// ── Client-side validation (mirror of backend) ─────────────────────────

export function validateForm(
  fields: FormFieldSpec[],
  payload: Record<string, unknown>,
): ActionValidationError[] {
  const errors: ActionValidationError[] = [];
  for (const f of fields) {
    if (f.type === 'section' || f.type === 'computed' || f.type === 'hidden') {
      continue;
    }
    const { visible, required } = resolveFieldState(f, payload);
    if (!visible) continue;
    const val = payload[f.key];
    const empty =
      val == null ||
      val === '' ||
      (Array.isArray(val) && val.length === 0);
    if (required && empty) {
      errors.push({
        key: f.key,
        message: f.custom_message || 'Campo obrigatório.',
      });
      continue;
    }
    if (empty) continue;
    // numeric bounds
    if (f.type === 'number' || f.type === 'integer') {
      const n = Number(val);
      if (!Number.isNaN(n)) {
        if (f.minimum != null && n < f.minimum) {
          errors.push({ key: f.key, message: f.custom_message || `Mínimo: ${f.minimum}` });
        }
        if (f.maximum != null && n > f.maximum) {
          errors.push({ key: f.key, message: f.custom_message || `Máximo: ${f.maximum}` });
        }
      }
    }
    // string length + pattern
    if (
      f.type === 'text' ||
      f.type === 'textarea' ||
      f.type === 'select' ||
      f.type === 'radio'
    ) {
      const s = String(val);
      if (f.min_length != null && s.length < f.min_length) {
        errors.push({
          key: f.key,
          message: f.custom_message || `Mínimo de ${f.min_length} caracteres.`,
        });
      }
      if (f.max_length != null && s.length > f.max_length) {
        errors.push({
          key: f.key,
          message: f.custom_message || `Máximo de ${f.max_length} caracteres.`,
        });
      }
      if (f.pattern) {
        try {
          if (!new RegExp(`^(?:${f.pattern})$`).test(s)) {
            errors.push({
              key: f.key,
              message: f.custom_message || `Não corresponde ao padrão.`,
            });
          }
        } catch {
          /* regex inválida — ignora (backend revalida) */
        }
      }
    }
  }
  return errors;
}

// ── Dynamic defaults ───────────────────────────────────────────────────

export interface DefaultContext {
  /** Username do operador atual. */
  currentUser?: string;
  /** Variables resolvidas do Workshop (objeto selecionado etc). */
  variables: Record<string, unknown>;
}

/**
 * Resolve o valor inicial de um campo a partir de seu `default_source`:
 *   - `@today`       → data de hoje (YYYY-MM-DD)
 *   - `@now`         → ISO datetime local (YYYY-MM-DDTHH:mm)
 *   - `@user`        → username atual
 *   - `<var>` / `<var>.path` → lê de `variables` (objeto selecionado etc)
 *   - qualquer outra string → literal
 */
export function resolveDefault(
  field: FormFieldSpec,
  ctx: DefaultContext,
): unknown {
  const src = (field.default_source ?? '').trim();
  if (!src) return undefined;
  if (src === '@today') return new Date().toISOString().slice(0, 10);
  if (src === '@now') return new Date().toISOString().slice(0, 16);
  if (src === '@user') return ctx.currentUser ?? '';
  // variable / path lookup
  const [head, ...rest] = src.split('.');
  let cur: unknown = ctx.variables[head];
  for (const part of rest) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      cur = undefined;
      break;
    }
  }
  if (cur !== undefined) return cur;
  // literal fallback (não começa com @ e não casa variable)
  return src.startsWith('@') ? undefined : src;
}

/**
 * Resolve o valor de um campo `computed` a partir de `compute_expr`.
 * Suporta um subset seguro: concatenação de tokens `{campo}` + texto
 * literal. Ex: "{nome} ({cpf})". NÃO é eval — é template substitution.
 */
export function resolveComputed(
  field: FormFieldSpec,
  payload: Record<string, unknown>,
): unknown {
  const expr = (field.compute_expr ?? '').trim();
  if (!expr) return undefined;
  return expr.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = payload[key.trim()];
    return v == null ? '' : String(v);
  });
}
