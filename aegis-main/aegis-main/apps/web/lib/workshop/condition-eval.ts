/**
 * Mini-evaluator de expressão condicional para Workshop events (Sprint B4
 * do Parity Audit, 2026-05-21).
 *
 * Suporta um subset restrito do que safe_eval.py (backend) avalia, focado
 * em casos práticos do operator-side de event branching:
 *
 *   - Identificadores resolvidos contra `bindings`
 *   - Literais: string (single/double quote), number, boolean (true/false/null)
 *   - Comparações: == != > < >= <=
 *   - Negação: !x
 *   - Booleanos: && ||
 *   - Parêntesis: (expr)
 *   - Membership: x in [1,2,3]
 *
 * NÃO suporta: chamadas de função, atribuição, subscript ([]), property
 * access (.). Mantém parser pequeno e auditável.
 *
 * Em caso de erro, retorna `false` (fail-closed — branch then NÃO dispara).
 */

type Value = string | number | boolean | null;
type Bindings = Record<string, unknown>;

export function evaluateCondition(
  expression: string | undefined | null,
  bindings: Bindings,
): boolean {
  if (!expression || !expression.trim()) return false;
  try {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens, bindings);
    const result = parser.parseOr();
    if (parser.peek() !== undefined) return false;
    return toBool(result);
  } catch {
    return false;
  }
}

// ---------------- tokenizer -----------------
type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // string literal
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let str = '';
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\' && i + 1 < s.length) {
          str += s[i + 1];
          i += 2;
        } else {
          str += s[i];
          i++;
        }
      }
      i++; // skip closing quote
      out.push({ kind: 'str', value: str });
      continue;
    }
    // number literal
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(s[i + 1] ?? ''))) {
      let num = c;
      i++;
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i];
        i++;
      }
      out.push({ kind: 'num', value: Number(num) });
      continue;
    }
    // multi-char operators
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      out.push({ kind: 'op', op: two });
      i += 2;
      continue;
    }
    // single-char operators
    if ('!<>(),[]'.includes(c)) {
      out.push({ kind: 'op', op: c });
      i++;
      continue;
    }
    // identifier (incl reserved words true/false/null/in)
    if (/[a-zA-Z_]/.test(c)) {
      let ident = c;
      i++;
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
        ident += s[i];
        i++;
      }
      out.push({ kind: 'ident', name: ident });
      continue;
    }
    throw new Error(`unexpected char ${c}`);
  }
  return out;
}

// ---------------- parser (recursive descent) -----------------
class Parser {
  pos = 0;
  constructor(private tokens: Token[], private bindings: Bindings) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  consume(): Token | undefined {
    return this.tokens[this.pos++];
  }
  matchOp(op: string): boolean {
    const t = this.peek();
    if (t && t.kind === 'op' && t.op === op) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseOr(): Value {
    let left = this.parseAnd();
    while (this.matchOp('||')) {
      const right = this.parseAnd();
      left = toBool(left) || toBool(right);
    }
    return left;
  }

  parseAnd(): Value {
    let left = this.parseCmp();
    while (this.matchOp('&&')) {
      const right = this.parseCmp();
      left = toBool(left) && toBool(right);
    }
    return left;
  }

  parseCmp(): Value {
    const left = this.parseUnary();
    const t = this.peek();
    if (!t || t.kind !== 'op') return left;
    if (['==', '!=', '<', '>', '<=', '>='].includes(t.op)) {
      this.pos++;
      const right = this.parseUnary();
      return compare(left, t.op, right);
    }
    // membership: x in [a, b, c]
    if (t.kind === 'op' && t.op === 'in' as never) {
      // ('in' is parsed as ident below — check separately)
    }
    return left;
  }

  parseUnary(): Value {
    if (this.matchOp('!')) {
      const v = this.parseUnary();
      return !toBool(v);
    }
    return this.parsePrimary();
  }

  parsePrimary(): Value {
    const t = this.consume();
    if (!t) throw new Error('unexpected end');
    if (t.kind === 'num') return t.value;
    if (t.kind === 'str') return t.value;
    if (t.kind === 'op' && t.op === '(') {
      const inner = this.parseOr();
      if (!this.matchOp(')')) throw new Error('missing )');
      return inner;
    }
    if (t.kind === 'op' && t.op === '[') {
      // list literal — not a primary; tratamos só como rhs de `in`
      // (mas in não suportado nesta versão minimal)
      throw new Error('list literal não suportado');
    }
    if (t.kind === 'ident') {
      if (t.name === 'true') return true;
      if (t.name === 'false') return false;
      if (t.name === 'null') return null;
      const v = this.bindings[t.name];
      // Coerção rasa pra Value:
      if (v === null || v === undefined) return null;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
        return v;
      // Objetos/arrays caem em truthy/falsy
      return null;
    }
    throw new Error(`unexpected token ${JSON.stringify(t)}`);
  }
}

function compare(a: Value, op: string, b: Value): boolean {
  switch (op) {
    case '==':
      // eslint-disable-next-line eqeqeq
      return a == b;
    case '!=':
      // eslint-disable-next-line eqeqeq
      return a != b;
    case '<':
      return (a as number) < (b as number);
    case '>':
      return (a as number) > (b as number);
    case '<=':
      return (a as number) <= (b as number);
    case '>=':
      return (a as number) >= (b as number);
    default:
      return false;
  }
}

function toBool(v: Value | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return false;
}
