/**
 * Sprint L13 — Logic Editor No-Code engine tests.
 */
import {
  getPath,
  evalPredicate,
  run,
  type LogicProgram,
} from '@/lib/logic/blocks';

describe('getPath', () => {
  it('returns root for empty path', () => {
    expect(getPath({ a: 1 }, '')).toEqual({ a: 1 });
    expect(getPath({ a: 1 }, '.')).toEqual({ a: 1 });
  });
  it('walks dotted keys', () => {
    expect(getPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
  });
  it('handles array index', () => {
    expect(getPath({ arr: ['x', 'y', 'z'] }, 'arr.1')).toBe('y');
  });
  it('returns undefined for missing', () => {
    expect(getPath({ a: 1 }, 'b.c')).toBeUndefined();
  });
});

describe('evalPredicate', () => {
  const item = { kind: 'Person', age: 30, name: 'João' };

  it('eq/ne', () => {
    expect(evalPredicate(item, { type: 'filter', path: 'kind', op: 'eq', value: 'Person' })).toBe(true);
    expect(evalPredicate(item, { type: 'filter', path: 'kind', op: 'ne', value: 'Person' })).toBe(false);
  });
  it('gt/lt numeric only', () => {
    expect(evalPredicate(item, { type: 'filter', path: 'age', op: 'gt', value: 25 })).toBe(true);
    expect(evalPredicate(item, { type: 'filter', path: 'age', op: 'lt', value: 18 })).toBe(false);
  });
  it('contains string case-insensitive', () => {
    expect(evalPredicate(item, { type: 'filter', path: 'name', op: 'contains', value: 'joão' })).toBe(true);
    expect(evalPredicate(item, { type: 'filter', path: 'name', op: 'contains', value: 'Maria' })).toBe(false);
  });
  it('in over array value', () => {
    expect(evalPredicate(item, { type: 'filter', path: 'kind', op: 'in', value: ['Person', 'Vehicle'] })).toBe(true);
  });
  it('exists', () => {
    expect(evalPredicate(item, { type: 'filter', path: 'age', op: 'exists' })).toBe(true);
    expect(evalPredicate(item, { type: 'filter', path: 'missing', op: 'exists' })).toBe(false);
  });
});

describe('run — pipeline', () => {
  const items = [
    { kind: 'Person', name: 'João', age: 30 },
    { kind: 'Vehicle', name: 'Corsa', age: 5 },
    { kind: 'Person', name: 'Maria', age: 25 },
    { kind: 'Person', name: 'Pedro', age: 17 },
  ];

  it('filter narrows array', () => {
    const program: LogicProgram = [
      { type: 'filter', path: 'kind', op: 'eq', value: 'Person' },
    ];
    const r = run(items, program);
    expect(Array.isArray(r.output)).toBe(true);
    expect((r.output as object[]).length).toBe(3);
  });

  it('filter + map chains', () => {
    const program: LogicProgram = [
      { type: 'filter', path: 'kind', op: 'eq', value: 'Person' },
      { type: 'map', path: 'name' },
    ];
    const r = run(items, program);
    expect(r.output).toEqual(['João', 'Maria', 'Pedro']);
  });

  it('aggregate count returns length', () => {
    const program: LogicProgram = [
      { type: 'filter', path: 'kind', op: 'eq', value: 'Person' },
      { type: 'aggregate', op: 'count' },
    ];
    const r = run(items, program);
    expect(r.output).toBe(3);
  });

  it('aggregate sum/avg/min/max', () => {
    expect(run(items, [{ type: 'aggregate', op: 'sum', path: 'age' }]).output).toBe(77);
    expect(run(items, [{ type: 'aggregate', op: 'min', path: 'age' }]).output).toBe(5);
    expect(run(items, [{ type: 'aggregate', op: 'max', path: 'age' }]).output).toBe(30);
    expect(run(items, [{ type: 'aggregate', op: 'avg', path: 'age' }]).output).toBeCloseTo(19.25);
  });

  it('aggregate distinct preserves order, removes duplicates', () => {
    const program: LogicProgram = [{ type: 'aggregate', op: 'distinct', path: 'kind' }];
    const r = run(items, program);
    expect(r.output).toEqual(['Person', 'Vehicle']);
  });

  it('branch picks then-arm when predicate true', () => {
    const program: LogicProgram = [
      {
        type: 'branch',
        predicate: { type: 'filter', path: 'length', op: 'gt', value: 0 },
        then: [{ type: 'aggregate', op: 'count' }],
        else: [{ type: 'map', path: 'name' }],
      },
    ];
    const r = run(items, program);
    expect(r.output).toBe(items.length);
  });

  it('trace records each block hop', () => {
    const program: LogicProgram = [
      { type: 'filter', path: 'kind', op: 'eq', value: 'Person' },
      { type: 'aggregate', op: 'count' },
    ];
    const r = run(items, program);
    expect(r.trace.length).toBe(2);
    expect(r.trace[0].block.type).toBe('filter');
    expect(r.trace[1].block.type).toBe('aggregate');
    expect(r.trace[1].after).toBe(3);
  });
});
