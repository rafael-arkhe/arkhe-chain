/**
 * Logic Editor No-Code — pure TS engine. Sprint L13 (2026-05-23).
 *
 * Operadores compõem programas no-code via blocos:
 *   - filter   — mantém itens que satisfazem predicado
 *   - map      — projeta cada item via expressão de caminho
 *   - aggregate — count/sum/min/max/avg/distinct
 *   - branch    — if/then/else por predicado (sobre o input completo)
 *
 * Cada programa é uma lista de blocos aplicada em sequência (pipe).
 * Entrada é qualquer JSON-serializável; saída pode ser scalar/array/obj.
 *
 * Compilação backward: o programa serializado pode ir em
 * `AIPLogicFunction.signature.blocks` e ser executado server-side num
 * sprint futuro (Python mirror dessa engine — mantém semântica
 * idêntica via tests cross-stack).
 */

export type ScalarValue = string | number | boolean | null;

export interface FilterBlock {
  type: 'filter';
  /** Path como "kind" ou "props.severidade". */
  path: string;
  op: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'in' | 'exists';
  value?: unknown;
}

export interface MapBlock {
  type: 'map';
  /** Path único — substitui cada item por `getPath(item, path)`. */
  path: string;
}

export interface AggregateBlock {
  type: 'aggregate';
  op: 'count' | 'sum' | 'min' | 'max' | 'avg' | 'distinct';
  /** Path opcional. Sem path: opera no item completo (count). */
  path?: string;
}

export interface BranchBlock {
  type: 'branch';
  /** Avalia predicado contra input completo (não por item). */
  predicate: FilterBlock;
  then: LogicBlock[];
  else: LogicBlock[];
}

export type LogicBlock = FilterBlock | MapBlock | AggregateBlock | BranchBlock;

export type LogicProgram = LogicBlock[];

// ───────────────────────────────────────────────────────────────────────────
// Path resolution
// ───────────────────────────────────────────────────────────────────────────
export function getPath(obj: unknown, path: string): unknown {
  if (path === '' || path === '.') return obj;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      // Support `.length` as readable shortcut for array size.
      if (p === 'length') {
        cur = cur.length;
        continue;
      }
      const idx = Number(p);
      if (Number.isNaN(idx)) return undefined;
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// ───────────────────────────────────────────────────────────────────────────
// Predicate eval
// ───────────────────────────────────────────────────────────────────────────
export function evalPredicate(item: unknown, pred: FilterBlock): boolean {
  const actual = getPath(item, pred.path);
  switch (pred.op) {
    case 'eq':
      return actual === pred.value;
    case 'ne':
      return actual !== pred.value;
    case 'gt':
      return (
        typeof actual === 'number' &&
        typeof pred.value === 'number' &&
        actual > pred.value
      );
    case 'lt':
      return (
        typeof actual === 'number' &&
        typeof pred.value === 'number' &&
        actual < pred.value
      );
    case 'contains':
      if (typeof actual === 'string' && typeof pred.value === 'string') {
        return actual.toLowerCase().includes(pred.value.toLowerCase());
      }
      if (Array.isArray(actual)) {
        return actual.includes(pred.value);
      }
      return false;
    case 'in':
      return Array.isArray(pred.value) && pred.value.includes(actual);
    case 'exists':
      return actual !== undefined && actual !== null;
    default:
      return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Aggregates
// ───────────────────────────────────────────────────────────────────────────
function asNumberArray(arr: unknown[], path: string | undefined): number[] {
  const out: number[] = [];
  for (const x of arr) {
    const v = path ? getPath(x, path) : x;
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function evalAggregate(input: unknown, block: AggregateBlock): unknown {
  const arr = Array.isArray(input) ? input : [input];
  if (block.op === 'count') return arr.length;
  if (block.op === 'distinct') {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const x of arr) {
      const v = block.path ? getPath(x, block.path) : x;
      const key = JSON.stringify(v);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  }
  const nums = asNumberArray(arr, block.path);
  if (nums.length === 0) return null;
  if (block.op === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (block.op === 'min') return Math.min(...nums);
  if (block.op === 'max') return Math.max(...nums);
  if (block.op === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Block execution
// ───────────────────────────────────────────────────────────────────────────
export interface TraceEntry {
  block: LogicBlock;
  before: unknown;
  after: unknown;
}

export interface RunResult {
  output: unknown;
  trace: TraceEntry[];
  error?: string;
}

function runBlock(input: unknown, block: LogicBlock): unknown {
  if (block.type === 'filter') {
    const arr = Array.isArray(input) ? input : [input];
    return arr.filter((item) => evalPredicate(item, block));
  }
  if (block.type === 'map') {
    const arr = Array.isArray(input) ? input : [input];
    return arr.map((item) => getPath(item, block.path));
  }
  if (block.type === 'aggregate') {
    return evalAggregate(input, block);
  }
  if (block.type === 'branch') {
    const taken = evalPredicate(input, block.predicate) ? block.then : block.else;
    return run(input, taken).output;
  }
  return input;
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────
export function run(input: unknown, program: LogicProgram): RunResult {
  const trace: TraceEntry[] = [];
  let cur: unknown = input;
  for (const block of program) {
    try {
      const next = runBlock(cur, block);
      trace.push({ block, before: cur, after: next });
      cur = next;
    } catch (e) {
      return {
        output: cur,
        trace,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return { output: cur, trace };
}
