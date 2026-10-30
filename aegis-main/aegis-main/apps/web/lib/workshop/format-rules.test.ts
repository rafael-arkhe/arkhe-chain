import {
  parseFormatRules,
  evaluateFormatRule,
  matchFormatRule,
  resolveFormatColor,
  FORMAT_COLORS,
  type FormatRule,
} from './format-rules';

describe('format-rules — util compartilhado (fonte única)', () => {
  describe('evaluateFormatRule — operadores', () => {
    it('gt / gte / lt / lte numéricos', () => {
      expect(evaluateFormatRule(10, { op: 'gt', threshold: 5, color: 'danger' })).toBe(true);
      expect(evaluateFormatRule(5, { op: 'gt', threshold: 5, color: 'danger' })).toBe(false);
      expect(evaluateFormatRule(5, { op: 'gte', threshold: 5, color: 'danger' })).toBe(true);
      expect(evaluateFormatRule(4, { op: 'lt', threshold: 5, color: 'success' })).toBe(true);
      expect(evaluateFormatRule(5, { op: 'lt', threshold: 5, color: 'success' })).toBe(false);
      expect(evaluateFormatRule(5, { op: 'lte', threshold: 5, color: 'success' })).toBe(true);
    });

    it('eq usa comparação solta (string "10" casa número 10)', () => {
      expect(evaluateFormatRule('10', { op: 'eq', threshold: 10, color: 'info' })).toBe(true);
      expect(evaluateFormatRule(10, { op: 'eq', threshold: '10', color: 'info' })).toBe(true);
      expect(evaluateFormatRule(11, { op: 'eq', threshold: 10, color: 'info' })).toBe(false);
    });

    it('coerção numérica: strings viram número em gt/lt', () => {
      expect(evaluateFormatRule('80', { op: 'gte', threshold: '50', color: 'warning' })).toBe(true);
    });
  });

  describe('parseFormatRules — tolerância de shape', () => {
    it('string JSON → array de regras válidas', () => {
      const raw = JSON.stringify([{ op: 'gte', threshold: 90, color: 'danger' }]);
      expect(parseFormatRules(raw)).toEqual([{ op: 'gte', threshold: 90, color: 'danger' }]);
    });

    it('array já materializado passa direto', () => {
      const arr: FormatRule[] = [{ op: 'lt', threshold: 10, color: 'success' }];
      expect(parseFormatRules(arr)).toEqual(arr);
    });

    it('descarta entradas com cor inválida (ex.: neutral do editor)', () => {
      const raw = JSON.stringify([
        { op: 'gte', threshold: 1, color: 'neutral' },
        { op: 'gte', threshold: 2, color: 'warning' },
      ]);
      expect(parseFormatRules(raw)).toEqual([{ op: 'gte', threshold: 2, color: 'warning' }]);
    });

    it('JSON inválido / não-array / vazio → []', () => {
      expect(parseFormatRules('não é json')).toEqual([]);
      expect(parseFormatRules('{"op":"gt"}')).toEqual([]);
      expect(parseFormatRules(undefined)).toEqual([]);
      expect(parseFormatRules(null)).toEqual([]);
      expect(parseFormatRules('')).toEqual([]);
    });

    it('preserva field opcional (usado pela tabela)', () => {
      const raw = JSON.stringify([{ field: 'score', op: 'gte', threshold: 5, color: 'danger' }]);
      expect(parseFormatRules(raw)).toEqual([
        { field: 'score', op: 'gte', threshold: 5, color: 'danger' },
      ]);
    });

    it('FORMAT_COLORS expõe exatamente as 4 cores sólidas', () => {
      expect([...FORMAT_COLORS]).toEqual(['success', 'warning', 'danger', 'info']);
    });
  });

  describe('matchFormatRule — primeira que casa vence + escopo por field', () => {
    const rules: FormatRule[] = [
      { op: 'gte', threshold: 100, color: 'danger' },
      { op: 'gte', threshold: 50, color: 'warning' },
    ];

    it('retorna a PRIMEIRA regra que casa (ordem importa)', () => {
      expect(matchFormatRule(120, rules)?.color).toBe('danger');
      expect(matchFormatRule(60, rules)?.color).toBe('warning');
      expect(matchFormatRule(10, rules)).toBeUndefined();
    });

    it('fieldFilter restringe às regras daquela coluna', () => {
      const colRules: FormatRule[] = [
        { field: 'a', op: 'gte', threshold: 1, color: 'danger' },
        { field: 'b', op: 'gte', threshold: 1, color: 'warning' },
      ];
      expect(matchFormatRule(5, colRules, 'b')?.color).toBe('warning');
      // Regra de outra coluna não casa esta célula.
      expect(matchFormatRule(5, colRules, 'c')).toBeUndefined();
    });

    it('sem fieldFilter, regra COM field ainda é avaliada (paridade metric_card)', () => {
      const withField: FormatRule[] = [{ field: 'x', op: 'gte', threshold: 1, color: 'info' }];
      expect(matchFormatRule(5, withField)?.color).toBe('info');
    });
  });

  describe('resolveFormatColor — atalho para valor único (KPI/metric)', () => {
    const rulesJson = JSON.stringify([
      { op: 'gte', threshold: 90, color: 'danger' },
      { op: 'lt', threshold: 50, color: 'success' },
    ]);

    it('gt → danger', () => {
      expect(resolveFormatColor(95, rulesJson)).toBe('danger');
    });
    it('lt → success', () => {
      expect(resolveFormatColor(20, rulesJson)).toBe('success');
    });
    it('nenhuma regra casa → null', () => {
      expect(resolveFormatColor(70, rulesJson)).toBeNull();
    });
    it('sem regras → null', () => {
      expect(resolveFormatColor(70, undefined)).toBeNull();
      expect(resolveFormatColor(70, null)).toBeNull();
      expect(resolveFormatColor(70, '')).toBeNull();
    });
  });
});
