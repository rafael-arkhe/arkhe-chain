import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const spec = JSON.parse(readFileSync(new URL('./aggregation.spec.json', import.meta.url)));
const specHash = createHash('sha256').update(JSON.stringify(spec)).digest('hex');
const names = ['grounding', 'hallucination', 'model_judge'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Pinned implementation: accepts only this exact spec, not a general policy DSL.
export function aggregate(results, configuration = spec) {
  const finish = (decision, reason, details = {}) => ({
    decision, reason, composite: null, diagnostics: null,
    unavailable_or_invalid_judges: [], spec_id: spec.id, spec_version: spec.version,
    spec_hash: specHash, calibration_status: spec.calibration.status, ...details,
  });
  if (!isDeepStrictEqual(configuration, spec)) return finish('DENY', 'invalid_configuration');
  const rule = object(results) ? results.rule_judge : undefined;
  // Only explicit boolean false is a known failure. Malformed results escalate.
  if (object(rule) && rule.passed === false) return finish('DENY', 'rule_judge_failed');
  const invalid = [];
  if (!object(rule) || rule.passed !== true) invalid.push('rule_judge');
  for (const name of names) {
    const judge = object(results) ? results[name] : undefined;
    if (!object(judge) || !Number.isFinite(judge.score) || judge.score < 0 || judge.score > 1) invalid.push(name);
  }
  if (invalid.length) return finish('REQUIRE_APPROVAL', 'unavailable_or_invalid_judge', {
    unavailable_or_invalid_judges: invalid,
  });
  const g = results.grounding.score, h = results.hallucination.score, m = results.model_judge.score;
  const composite = 0.4 * g + 0.3 * (1 - h) + 0.3 * m;
  const zone = spec.zones.find(zone => composite >= zone.minimum_inclusive &&
    (Object.hasOwn(zone, 'maximum_exclusive') ? composite < zone.maximum_exclusive : composite <= zone.maximum_inclusive));
  return finish(zone.decision, 'composite_zone', {
    composite,
    raw_scores: { grounding: g, hallucination: h, model_judge: m },
    normalized_scores: { grounding: g, hallucination: 1 - h, model_judge: m },
    weights: Object.fromEntries(names.map(name => [name, spec.judges[name].weight])),
    diagnostics: { grounding_below_threshold: g < 0.8,
      hallucination_above_threshold: h >= 0.4, model_below_threshold: m < 0.7 },
  });
}
