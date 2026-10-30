/**
 * Onda K.2 — Form Widget logic helpers (pure).
 *
 * Cobre a lógica compartilhada (`form-logic.tsx`): avaliação de regras
 * condicionais, resolução de estado (visível+obrigatório), validação
 * client-side, defaults dinâmicos e valores computed. Espelha o backend.
 */
import {
  evaluateRule,
  resolveFieldState,
  validateForm,
  resolveDefault,
  resolveComputed,
} from '@/components/workshop/widgets/form-logic';
import type { FormFieldSpec, FormConditionalRule } from '@/lib/api';

const rule = (
  partial: Partial<FormConditionalRule> & Pick<FormConditionalRule, 'when_field'>,
): FormConditionalRule => ({
  operator: 'eq',
  value: undefined,
  effect: 'show',
  ...partial,
});

describe('evaluateRule', () => {
  it('eq / neq', () => {
    expect(evaluateRule(rule({ when_field: 't', operator: 'eq', value: 'pf' }), { t: 'pf' })).toBe(true);
    expect(evaluateRule(rule({ when_field: 't', operator: 'eq', value: 'pf' }), { t: 'pj' })).toBe(false);
    expect(evaluateRule(rule({ when_field: 't', operator: 'neq', value: 'pf' }), { t: 'pj' })).toBe(true);
  });

  it('numeric comparisons coerce strings', () => {
    expect(evaluateRule(rule({ when_field: 'i', operator: 'gte', value: 18 }), { i: '21' })).toBe(true);
    expect(evaluateRule(rule({ when_field: 'i', operator: 'gte', value: 18 }), { i: '16' })).toBe(false);
  });

  it('gt fails closed on non-numeric (no lexicographic)', () => {
    expect(evaluateRule(rule({ when_field: 'i', operator: 'gt', value: 'abc' }), { i: 'x' })).toBe(false);
  });

  it('contains / in', () => {
    expect(evaluateRule(rule({ when_field: 'tags', operator: 'contains', value: 'x' }), { tags: ['x', 'y'] })).toBe(true);
    expect(evaluateRule(rule({ when_field: 'uf', operator: 'in', value: ['SP', 'RJ'] }), { uf: 'SP' })).toBe(true);
    expect(evaluateRule(rule({ when_field: 'uf', operator: 'in', value: ['SP'] }), { uf: 'MG' })).toBe(false);
  });

  it('is_empty / is_not_empty', () => {
    expect(evaluateRule(rule({ when_field: 'x', operator: 'is_empty' }), { x: '' })).toBe(true);
    expect(evaluateRule(rule({ when_field: 'x', operator: 'is_not_empty' }), { x: 'v' })).toBe(true);
    expect(evaluateRule(rule({ when_field: 'x', operator: 'is_empty' }), { x: [] })).toBe(true);
  });
});

describe('resolveFieldState', () => {
  it('plain field is visible and uses base required', () => {
    const f: FormFieldSpec = { key: 'nome', type: 'text', required: true };
    expect(resolveFieldState(f, {})).toEqual({ visible: true, required: true });
  });

  it('show rule hides until matched', () => {
    const f: FormFieldSpec = {
      key: 'cnpj',
      type: 'text',
      rules: [rule({ when_field: 'tipo', value: 'pj', effect: 'show' })],
    };
    expect(resolveFieldState(f, { tipo: 'pf' })).toEqual({ visible: false, required: false });
    expect(resolveFieldState(f, { tipo: 'pj' })).toEqual({ visible: true, required: false });
  });

  it('hide rule wins and clears required', () => {
    const f: FormFieldSpec = {
      key: 'x',
      type: 'text',
      required: true,
      rules: [rule({ when_field: 'o', value: true, effect: 'hide' })],
    };
    expect(resolveFieldState(f, { o: true })).toEqual({ visible: false, required: false });
  });

  it('require rule turns on obligation only when matched', () => {
    const f: FormFieldSpec = {
      key: 'motivo',
      type: 'text',
      rules: [rule({ when_field: 'acao', value: 'bloquear', effect: 'require' })],
    };
    expect(resolveFieldState(f, { acao: 'bloquear' })).toEqual({ visible: true, required: true });
    expect(resolveFieldState(f, { acao: 'liberar' })).toEqual({ visible: true, required: false });
  });
});

describe('validateForm', () => {
  it('flags missing required', () => {
    const fields: FormFieldSpec[] = [{ key: 'nome', type: 'text', required: true }];
    expect(validateForm(fields, {}).some((e) => e.key === 'nome')).toBe(true);
  });

  it('passes when required present', () => {
    const fields: FormFieldSpec[] = [{ key: 'nome', type: 'text', required: true }];
    expect(validateForm(fields, { nome: 'Maria' })).toEqual([]);
  });

  it('pattern + length', () => {
    const fields: FormFieldSpec[] = [
      { key: 'cpf', type: 'text', pattern: '\\d{11}', min_length: 11 },
    ];
    expect(validateForm(fields, { cpf: 'abc' }).some((e) => e.key === 'cpf')).toBe(true);
    expect(validateForm(fields, { cpf: '12345678901' })).toEqual([]);
  });

  it('numeric min/max', () => {
    const fields: FormFieldSpec[] = [{ key: 'idade', type: 'integer', minimum: 18, maximum: 120 }];
    expect(validateForm(fields, { idade: 5 }).some((e) => e.key === 'idade')).toBe(true);
    expect(validateForm(fields, { idade: 30 })).toEqual([]);
  });

  it('custom message overrides default', () => {
    const fields: FormFieldSpec[] = [
      { key: 'email', type: 'text', pattern: '[^@]+@[^@]+', custom_message: 'E-mail inválido.' },
    ];
    const errs = validateForm(fields, { email: 'nope' });
    expect(errs[0].message).toBe('E-mail inválido.');
  });

  it('conditional required not enforced when hidden', () => {
    const fields: FormFieldSpec[] = [
      { key: 'tipo', type: 'select', options: ['pf', 'pj'] },
      {
        key: 'cnpj',
        type: 'text',
        rules: [
          rule({ when_field: 'tipo', value: 'pj', effect: 'show' }),
          rule({ when_field: 'tipo', value: 'pj', effect: 'require' }),
        ],
      },
    ];
    expect(validateForm(fields, { tipo: 'pf' })).toEqual([]);
    expect(validateForm(fields, { tipo: 'pj' }).some((e) => e.key === 'cnpj')).toBe(true);
  });

  it('skips structural types', () => {
    const fields: FormFieldSpec[] = [
      { key: 'sec', type: 'section' },
      { key: 'calc', type: 'computed' },
    ];
    expect(validateForm(fields, {})).toEqual([]);
  });
});

describe('resolveDefault', () => {
  it('@today returns a date string', () => {
    const f: FormFieldSpec = { key: 'd', type: 'date', default_source: '@today' };
    const v = resolveDefault(f, { variables: {} });
    expect(typeof v).toBe('string');
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('@user returns the current user', () => {
    const f: FormFieldSpec = { key: 'u', type: 'text', default_source: '@user' };
    expect(resolveDefault(f, { currentUser: 'agente1', variables: {} })).toBe('agente1');
  });

  it('reads from variable path', () => {
    const f: FormFieldSpec = { key: 'n', type: 'text', default_source: 'sel.name' };
    expect(resolveDefault(f, { variables: { sel: { name: 'Caso 1' } } })).toBe('Caso 1');
  });

  it('literal fallback when no @ and no variable', () => {
    const f: FormFieldSpec = { key: 'x', type: 'text', default_source: 'fixo' };
    expect(resolveDefault(f, { variables: {} })).toBe('fixo');
  });

  it('returns undefined with no source', () => {
    const f: FormFieldSpec = { key: 'x', type: 'text' };
    expect(resolveDefault(f, { variables: {} })).toBeUndefined();
  });
});

describe('resolveComputed', () => {
  it('substitutes {field} tokens', () => {
    const f: FormFieldSpec = { key: 'c', type: 'computed', compute_expr: '{nome} ({cpf})' };
    expect(resolveComputed(f, { nome: 'Ana', cpf: '111' })).toBe('Ana (111)');
  });

  it('empty for unset tokens', () => {
    const f: FormFieldSpec = { key: 'c', type: 'computed', compute_expr: '{x}' };
    expect(resolveComputed(f, {})).toBe('');
  });
});
