import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calibrate, wilson, kappa } from './calibrate.mjs';
const fixtures = () => readFileSync(new URL('./calibration-fixture.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
test('Wilson has uncertainty even with zero observed errors', () => {
  assert.equal(wilson(0, 0), null);
  assert.ok(wilson(10, 10)[0] < 0.95);
  assert.ok(wilson(100, 100)[0] > 0.95);
});
test('synthetic smoke dataset never qualifies the domain', () => {
  const r = calibrate(fixtures());
  assert.equal(r.status, 'PENDING'); assert.equal(r.domain_calibrated, false);
  assert.equal(r.selected_threshold, null);
  assert.ok(r.pending_reasons.includes('synthetic_data_or_scores'));
});
test('holdout labels cannot alter threshold selection', () => {
  const a = fixtures(), b = fixtures();
  for (const r of b.filter(r => r.split === 'holdout')) r.acceptable = !r.acceptable;
  assert.deepEqual(calibrate(a).development_sweep, calibrate(b).development_sweep);
});
test('group leakage and duplicate IDs are rejected', () => {
  const a = fixtures(); a.at(-1).group_id = a[0].group_id;
  assert.throws(() => calibrate(a), /leakage/);
  const b = fixtures(); b.at(-1).id = b[0].id;
  assert.throws(() => calibrate(b), /Duplicate/);
});
test('an unobserved acceptance precision is null, not perfect', () => {
  const rows = fixtures();
  for (const row of rows) row.judges.rule_judge = { passed: false };
  const r = calibrate(rows);
  assert.equal(r.baseline.holdout.combined_auto_acceptance.precision, null);
  assert.equal(r.baseline.holdout.combined_auto_acceptance.coverage, 0);
});
test('Cohen kappa reports agreement beyond chance and degenerate case', () => {
  assert.equal(kappa([{ annotators: [true, true] }, { annotators: [false, false] }]), 1);
  assert.equal(kappa([{ annotators: [true, true] }]), null);
});
test('threshold proposal and conservative tie-break work on a large synthetic fixture', () => {
  const rows = [];
  for (const split of ['calibration', 'holdout']) {
    for (let i = 0; i < 110; i++) rows.push({ ...fixtures()[0], id: `${split}-${i}`, group_id: `${split}-${i}`, split,
      acceptable: i < 100, annotators: [i < 100, i < 100], judges: {
        rule_judge: { passed: true }, grounding: { score: i < 100 ? 1 : 0 },
        hallucination: { score: i < 100 ? 0 : 1 }, model_judge: { score: i < 100 ? 1 : 0 } } });
  }
  const r = calibrate(rows);
  assert.equal(r.selected_threshold, 1);
  assert.equal(r.holdout_selected.precision, 1);
  assert.equal(r.status, 'PENDING');
});
