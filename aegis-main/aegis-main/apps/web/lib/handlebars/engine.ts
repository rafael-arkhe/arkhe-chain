/**
 * Handlebars-style templating engine — Sprint L7 (2026-05-23).
 *
 * Pesquisa R2 Slate · logic/handlebars.md: o operador escreve textos com
 * `{{var}}`, `{{#if cond}}…{{/if}}`, `{{#each arr}}…{{/each}}` e o engine
 * resolve via lookup no `ctx`. Nada de `eval`, nada de execução arbitrária —
 * parser regex puro com tokenizer recursivo.
 *
 * Suporta:
 *   - `{{ caminho.aninhado }}` — lookup com `.` ou `[i]`
 *   - `{{# if cond}}A{{ else }}B{{/ if}}`     condicional (truthy JS)
 *   - `{{# each list}}item={{ this }}{{/each}}` iteração
 *   - escapa HTML por default (`{{var}}` ↔ `&lt;`/`&gt;` etc)
 *   - `{{{var}}}` triple-mustache → raw (sem escape)
 *
 * NÃO suporta (intencional, futuro):
 *   - helpers `{{eq a b}}` arbitrários
 *   - `{{#unless}}`, `{{#with}}`
 *   - partials `{{> name}}`
 *
 * Esses ficaram fora por simplicidade — `compile` é puro, determinístico,
 * sem dependências, ~120 linhas. Cobertura: 15+ testes em
 * `__tests__/handlebars-engine.test.ts`.
 */

export type HandlebarsCtx = Record<string, unknown>;

const TOKEN_RE = /(\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\})/g;
const BLOCK_OPEN_RE = /^\{\{\s*#\s*(if|each)\s+([^}]+?)\s*\}\}$/;
const BLOCK_CLOSE_RE = /^\{\{\s*\/\s*(if|each)\s*\}\}$/;
const ELSE_RE = /^\{\{\s*else\s*\}\}$/;
const VAR_RE = /^\{\{\s*([^}]+?)\s*\}\}$/;
const TRIPLE_RE = /^\{\{\{\s*([^}]+?)\s*\}\}\}$/;

interface TextNode {
  kind: 'text';
  value: string;
}
interface VarNode {
  kind: 'var';
  path: string;
  raw: boolean;
}
interface IfNode {
  kind: 'if';
  cond: string;
  then: AstNode[];
  otherwise: AstNode[];
}
interface EachNode {
  kind: 'each';
  source: string;
  body: AstNode[];
}
type AstNode = TextNode | VarNode | IfNode | EachNode;

/** Marker symbol que carrega o `this` primitivo dentro de #each de array de primitivos. */
const THIS_KEY = '__hbs_this__';

/**
 * Resolve `a.b[0].c` no objeto context. Retorna `undefined` se algum
 * passo for null/undefined ou se a chave for inexistente. `this` significa
 * o próprio context (usado dentro de `{{#each}}` quando `this` referencia
 * o elemento atual). Quando o ctx carrega `THIS_KEY` (primitivos em #each),
 * `this` resolve pra esse marker em vez do objeto inteiro.
 */
export function lookup(path: string, ctx: HandlebarsCtx): unknown {
  if (!path || path === '.') {
    if (ctx && typeof ctx === 'object' && THIS_KEY in ctx) {
      return (ctx as Record<string, unknown>)[THIS_KEY];
    }
    return ctx;
  }
  if (path === 'this') {
    if (ctx && typeof ctx === 'object' && THIS_KEY in ctx) {
      return (ctx as Record<string, unknown>)[THIS_KEY];
    }
    return ctx;
  }
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean);
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function tokenize(tmpl: string): string[] {
  // Split mantendo os tokens — `{{var}}` continuam no array junto com os
  // segmentos de texto. Cada item é texto puro OU um token mustache completo.
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(tmpl)) !== null) {
    if (m.index > last) parts.push(tmpl.slice(last, m.index));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < tmpl.length) parts.push(tmpl.slice(last));
  return parts;
}

/**
 * Parser recursivo. `pos` é cursor mutável (objeto p/ passar por ref).
 * Quando `stopOn` é dado, para no primeiro token que casar (`else` ou
 * `/if`/`/each`). Retorna o array de nodes consumido e atualiza pos.cur.
 */
function parse(
  tokens: string[],
  pos: { cur: number },
  stopOn?: 'else' | 'close',
): AstNode[] {
  const out: AstNode[] = [];
  while (pos.cur < tokens.length) {
    const tok = tokens[pos.cur];
    if (stopOn === 'close' && BLOCK_CLOSE_RE.test(tok)) return out;
    if (stopOn === 'else' && (ELSE_RE.test(tok) || BLOCK_CLOSE_RE.test(tok))) return out;

    // Pure text (não começa com {{)
    if (!tok.startsWith('{{')) {
      out.push({ kind: 'text', value: tok });
      pos.cur += 1;
      continue;
    }

    // Triple mustache — raw (sem escape)
    const triple = tok.match(TRIPLE_RE);
    if (triple) {
      out.push({ kind: 'var', path: triple[1].trim(), raw: true });
      pos.cur += 1;
      continue;
    }

    // Block open
    const openM = tok.match(BLOCK_OPEN_RE);
    if (openM) {
      pos.cur += 1;
      const kind = openM[1] as 'if' | 'each';
      const argument = openM[2].trim();
      if (kind === 'if') {
        const thenBranch = parse(tokens, pos, 'else');
        let elseBranch: AstNode[] = [];
        if (pos.cur < tokens.length && ELSE_RE.test(tokens[pos.cur])) {
          pos.cur += 1; // consume {{else}}
          elseBranch = parse(tokens, pos, 'close');
        }
        if (pos.cur < tokens.length && BLOCK_CLOSE_RE.test(tokens[pos.cur])) {
          pos.cur += 1; // consume {{/if}}
        }
        out.push({ kind: 'if', cond: argument, then: thenBranch, otherwise: elseBranch });
        continue;
      }
      // each
      const body = parse(tokens, pos, 'close');
      if (pos.cur < tokens.length && BLOCK_CLOSE_RE.test(tokens[pos.cur])) {
        pos.cur += 1; // consume {{/each}}
      }
      out.push({ kind: 'each', source: argument, body });
      continue;
    }

    // Plain var
    const varM = tok.match(VAR_RE);
    if (varM) {
      out.push({ kind: 'var', path: varM[1].trim(), raw: false });
      pos.cur += 1;
      continue;
    }

    // Unknown token — tratamos como texto literal (defensive fallback)
    out.push({ kind: 'text', value: tok });
    pos.cur += 1;
  }
  return out;
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

function render(nodes: AstNode[], ctx: HandlebarsCtx): string {
  const out: string[] = [];
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        out.push(n.value);
        break;
      case 'var': {
        const v = lookup(n.path, ctx);
        const s = toStr(v);
        out.push(n.raw ? s : escapeHtml(s));
        break;
      }
      case 'if': {
        const v = lookup(n.cond, ctx);
        out.push(render(truthy(v) ? n.then : n.otherwise, ctx));
        break;
      }
      case 'each': {
        const list = lookup(n.source, ctx);
        if (!Array.isArray(list)) break;
        for (const item of list) {
          // Estende ctx com `this` apontando pro item; mantém `..` apontando
          // pro pai (não exposto neste MVP, mas reservado).
          let childCtx: HandlebarsCtx;
          if (item && typeof item === 'object') {
            childCtx = { ...(item as Record<string, unknown>), [THIS_KEY]: item } as HandlebarsCtx;
          } else {
            childCtx = { [THIS_KEY]: item } as HandlebarsCtx;
          }
          out.push(render(n.body, childCtx));
        }
        break;
      }
    }
  }
  return out.join('');
}

/**
 * Compila + renderiza um template handlebars-style.
 *
 * @param template texto com {{markers}}
 * @param ctx valores para resolução
 */
export function compile(template: string, ctx: HandlebarsCtx = {}): string {
  if (!template) return '';
  const tokens = tokenize(template);
  const pos = { cur: 0 };
  const ast = parse(tokens, pos);
  return render(ast, ctx);
}
