/**
 * T3-G3 (a) — Filtro do object-set numa seção de widget. Núcleo testável: o
 * compilador de condições (UI) → FilterPredicate (contrato do backend) e a
 * curadoria de operadores por tipo de propriedade (sem op cru na UI).
 */
import {
  buildFilterPredicate,
  opsForType,
  type FilterCondition,
} from '@/components/relatorios/widget-section';

const cond = (over: Partial<FilterCondition> = {}): FilterCondition => ({
  field: 'uf',
  op: 'eq',
  value: 'SP',
  ...over,
});

describe('buildFilterPredicate', () => {
  it('vazio → null (sem filtro)', () => {
    expect(buildFilterPredicate([])).toBeNull();
    expect(buildFilterPredicate(undefined)).toBeNull();
  });

  it('condição incompleta é ignorada → null', () => {
    expect(buildFilterPredicate([cond({ field: '' })])).toBeNull();
    expect(buildFilterPredicate([cond({ op: '' })])).toBeNull();
    expect(buildFilterPredicate([cond({ value: '' })])).toBeNull();
    expect(buildFilterPredicate([cond({ value: '   ' })])).toBeNull();
    expect(buildFilterPredicate([cond({ value: undefined })])).toBeNull();
  });

  it('uma condição completa → leaf {op,field,value}', () => {
    expect(buildFilterPredicate([cond()])).toEqual({ op: 'eq', field: 'uf', value: 'SP' });
  });

  it('preserva tipos não-string (número/booleano) no valor', () => {
    expect(buildFilterPredicate([cond({ field: 'score', op: 'gte', value: 80 })])).toEqual({
      op: 'gte',
      field: 'score',
      value: 80,
    });
    expect(buildFilterPredicate([cond({ field: 'ativo', op: 'eq', value: false })])).toEqual({
      op: 'eq',
      field: 'ativo',
      value: false,
    });
    // valor 0 é completo (não confundir com vazio)
    expect(buildFilterPredicate([cond({ field: 'n', op: 'eq', value: 0 })])).toEqual({
      op: 'eq',
      field: 'n',
      value: 0,
    });
  });

  it('duas+ condições completas → AND de leaves', () => {
    const out = buildFilterPredicate([
      cond({ field: 'uf', op: 'eq', value: 'SP' }),
      cond({ field: 'score', op: 'gte', value: 80 }),
    ]);
    expect(out).toEqual({
      op: 'and',
      operands: [
        { op: 'eq', field: 'uf', value: 'SP' },
        { op: 'gte', field: 'score', value: 80 },
      ],
    });
  });

  it('mistura completas + incompletas → só as completas', () => {
    const out = buildFilterPredicate([
      cond({ field: 'uf', op: 'eq', value: 'SP' }),
      cond({ field: '', op: 'eq', value: 'x' }),
    ]);
    expect(out).toEqual({ op: 'eq', field: 'uf', value: 'SP' });
  });
});

describe('opsForType', () => {
  const ops = (t?: string) => opsForType(t).map((o) => o.op);

  it('string/desconhecido → igualdade + texto (eq/neq/contains/prefix)', () => {
    expect(ops('string')).toEqual(['eq', 'neq', 'contains', 'prefix']);
    expect(ops(undefined)).toEqual(['eq', 'neq', 'contains', 'prefix']);
    expect(ops('text')).toEqual(['eq', 'neq', 'contains', 'prefix']);
  });

  it('numérico → comparações (sem contains/prefix)', () => {
    expect(ops('number')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
    expect(ops('integer')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
  });

  it('temporal → comparações de ordem', () => {
    expect(ops('date')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
    expect(ops('datetime')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
  });

  it('booleano → só igualdade', () => {
    expect(ops('boolean')).toEqual(['eq', 'neq']);
  });

  it('todo op tem rótulo pt-BR (nunca op cru exposto)', () => {
    for (const { op, label } of opsForType('string')) {
      expect(label).toBeTruthy();
      expect(label).not.toEqual(op);
    }
  });
});
