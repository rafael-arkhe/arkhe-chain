import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregate } from './ai-aggregate.mjs';
const spec = JSON.parse(readFileSync(new URL('./aggregation.spec.json', import.meta.url)));
const panel = (g = 0.82, h = 0.28, m = 0.74) => ({ rule_judge: { passed: true },
  grounding: { score: g }, hallucination: { score: h }, model_judge: { score: m } });

test('high hallucination is diagnostic, not an individual veto', () => {
  const r = aggregate(panel(0.82, 0.9, 0.74));
  assert.equal(r.decision, 'REQUIRE_APPROVAL');
  assert.ok(Math.abs(r.composite - 0.58) < 1e-12);
  assert.equal(r.diagnostics.hallucination_above_threshold, true);
});
test('base example yields 0.766 and ALLOW_WITH_LOGGING', () => {
  const r = aggregate(panel());
  assert.equal(r.decision, 'ALLOW_WITH_LOGGING');
  assert.ok(Math.abs(r.composite - 0.766) < 1e-12);
  assert.equal(r.calibration_status, 'PENDING');
});
test('each missing judge escalates without a partial composite', () => {
  for (const name of ['rule_judge', 'grounding', 'hallucination', 'model_judge']) {
    const p = panel(); p[name] = null;
    const r = aggregate(p);
    assert.equal(r.decision, 'REQUIRE_APPROVAL'); assert.equal(r.composite, null);
    assert.deepEqual(r.unavailable_or_invalid_judges, [name]);
  }
});
test('known rule failure precedes missing scores', () => {
  assert.equal(aggregate({ rule_judge: { passed: false } }).decision, 'DENY');
});
test('malformed rule results are invalid, not known failures', () => {
  for (const rule of [{}, { passed: 'false' }, { passed: 0 }, true, []]) {
    const p = panel(); p.rule_judge = rule;
    assert.equal(aggregate(p).decision, 'REQUIRE_APPROVAL');
  }
});
test('non-finite, out-of-domain or coerced scores escalate', () => {
  for (const name of ['grounding', 'hallucination', 'model_judge']) {
    for (const score of [NaN, Infinity, -Infinity, -0.01, 1.01, '0.8', null]) {
      const p = panel(); p[name] = { score };
      assert.equal(aggregate(p).decision, 'REQUIRE_APPROVAL');
      assert.equal(aggregate(p).composite, null);
    }
  }
});
test('invalid configuration is DENY and precedes judges', () => {
  for (const config of [null, {}, { ...spec, strategy: 'different' },
    { ...spec, composite: { ...spec.composite, weight_sum: 2 } }]) {
    const r = aggregate(null, config);
    assert.equal(r.decision, 'DENY'); assert.equal(r.reason, 'invalid_configuration');
  }
});
test('empty or malformed panels escalate', () => {
  for (const p of [null, undefined, [], 'panel', {}]) assert.equal(aggregate(p).decision, 'REQUIRE_APPROVAL');
});
test('zone boundaries use unrounded composite', () => {
  for (const [p, expected] of [[panel(1, 0, 0.5), 'ALLOW'], [panel(1, 0, 0), 'ALLOW_WITH_LOGGING'],
    [panel(0.5, 0, 0), 'REQUIRE_APPROVAL'], [panel(0.499, 0, 0), 'DENY'],
    [panel(1, 0, 1), 'ALLOW'], [panel(0, 1, 0), 'DENY']]) {
    assert.equal(aggregate(p).decision, expected);
  }
});
test('aggregation does not mutate inputs and returned data is independent', () => {
  const p = panel(), original = structuredClone(p);
  const r = aggregate(p); r.weights.grounding = 100; r.raw_scores.grounding = 0;
  assert.deepEqual(p, original);
  assert.equal(aggregate(p).weights.grounding, 0.4);
});
