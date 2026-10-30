/**
 * Avaliação de "Regras de cor" (formatação condicional) — fonte ÚNICA.
 *
 * Compartilhada por todos os widgets que coloram por limiar:
 *   - `metric_card`        → valor único (regra sem `field`)
 *   - `object_table_v2`    → por célula (regra com `field`)
 *   - `security.kpi_card`  → número grande do dashboard (regra sem `field`)
 *
 * O EDITOR visual (`components/workshop/format-rules-editor.tsx`) produz o
 * shape canônico como STRING JSON gravada em `widget.props.format_rules`.
 * Aqui só LEMOS/avaliamos — sem JSX, testável puro.
 *
 * Paridade EXATA com o comportamento anterior (antes inline em metric-card.tsx
 * e object-table.tsx):
 *   - 4 cores sólidas; `neutral` (oferecido pelo editor) cai fora da avaliação;
 *   - `eq` usa comparação solta (== ) p/ casar "10" com 10;
 *   - a PRIMEIRA regra que casa vence.
 */

export type FormatColor = 'success' | 'warning' | 'danger' | 'info';
export type FormatOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface FormatRule {
  /** Opcional — só widgets multi-coluna (tabela) usam pra escopar a célula. */
  field?: string;
  op: FormatOp;
  threshold: number | string;
  color: FormatColor;
}

/** Cores aceitas na avaliação. `neutral` do editor não colore (cai fora). */
export const FORMAT_COLORS: readonly FormatColor[] = ['success', 'warning', 'danger', 'info'];

export function evaluateFormatRule(value: unknown, rule: FormatRule): boolean {
  switch (rule.op) {
    case 'gt':
      return Number(value) > Number(rule.threshold);
    case 'gte':
      return Number(value) >= Number(rule.threshold);
    case 'lt':
      return Number(value) < Number(rule.threshold);
    case 'lte':
      return Number(value) <= Number(rule.threshold);
    case 'eq':
      // eslint-disable-next-line eqeqeq
      return value == rule.threshold;
    default:
      return false;
  }
}

/**
 * Lê o valor canônico (string JSON do editor, ou array em apps antigos) e
 * devolve só as regras plausíveis. `field` é opcional — quem precisa escopar
 * por coluna (tabela) filtra depois via `matchFormatRule(.., fieldFilter)`.
 */
export function parseFormatRules(raw: unknown): FormatRule[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (r): r is FormatRule =>
      !!r &&
      typeof r === 'object' &&
      typeof (r as FormatRule).op === 'string' &&
      'threshold' in (r as Record<string, unknown>) &&
      FORMAT_COLORS.includes((r as FormatRule).color),
  );
}

/**
 * Primeira regra que casa o valor. Quando `fieldFilter` é passado (tabela),
 * só considera regras daquela coluna; sem ele (valor único), considera todas.
 */
export function matchFormatRule(
  value: unknown,
  rules: FormatRule[],
  fieldFilter?: string,
): FormatRule | undefined {
  return rules.find((rule) => {
    if (fieldFilter !== undefined && rule.field !== fieldFilter) return false;
    return evaluateFormatRule(value, rule);
  });
}

/**
 * Atalho p/ widgets de valor único (KPI grande, metric_card): resolve a COR
 * da primeira regra que casa, ou `null` quando nenhuma casa / sem regras.
 * Aceita o shape canônico (string JSON) ou array já materializado.
 */
export function resolveFormatColor(
  value: unknown,
  rules: string | FormatRule[] | undefined | null,
): FormatColor | null {
  const matched = matchFormatRule(value, parseFormatRules(rules));
  return matched ? matched.color : null;
}
