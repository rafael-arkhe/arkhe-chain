import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aggregate } from './ai-aggregate.mjs';

const z = 1.959963984540054; // two-sided 95% Wilson interval
export function wilson(successes, n) {
  if (!n) return null;
  const p = successes / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
function metrics(rows, threshold) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const row of rows) {
    const accepted = row.result.composite !== null && row.result.composite >= threshold;
    if (accepted) row.acceptable ? tp++ : fp++;
    else row.acceptable ? fn++ : tn++;
  }
  return { tp, fp, fn, tn, accepted: tp + fp, total: rows.length,
    precision: tp + fp ? tp / (tp + fp) : null,
    precision_wilson_95: wilson(tp, tp + fp),
    recall: tp + fn ? tp / (tp + fn) : null,
    coverage: rows.length ? (tp + fp) / rows.length : null };
}
export function kappa(rows) {
  const n = rows.length;
  if (!n) return null;
  const agreement = rows.filter(r => r.annotators[0] === r.annotators[1]).length / n;
  const p1 = rows.filter(r => r.annotators[0]).length / n;
  const p2 = rows.filter(r => r.annotators[1]).length / n;
  const chance = p1 * p2 + (1 - p1) * (1 - p2);
  return chance === 1 ? null : (agreement - chance) / (1 - chance);
}
export function calibrate(records, target = 0.95) {
  if (!Array.isArray(records) || !records.length || !Number.isFinite(target) || target <= 0 || target > 1) throw new Error('Invalid dataset or target');
  const ids = new Set(), groups = new Map();
  const rows = records.map(row => {
    if (!row || !['calibration', 'holdout'].includes(row.split) ||
      !['synthetic', 'external'].includes(row.provenance) || typeof row.acceptable !== 'boolean' ||
      !Array.isArray(row.annotators) || row.annotators.length !== 2 || !row.annotators.every(x => typeof x === 'boolean') ||
      ![row.id, row.group_id, row.reference, row.candidate, row.label_basis].every(x => typeof x === 'string' && x.trim())) throw new Error('Invalid record');
    if (ids.has(row.id)) throw new Error('Duplicate id'); ids.add(row.id);
    if (groups.has(row.group_id) && groups.get(row.group_id) !== row.split) throw new Error('Group leakage');
    groups.set(row.group_id, row.split);
    return { ...row, result: aggregate(row.judges) };
  });
  const dev = rows.filter(r => r.split === 'calibration'), test = rows.filter(r => r.split === 'holdout');
  for (const split of [dev, test]) {
    if (!split.some(r => r.acceptable) || !split.some(r => !r.acceptable)) throw new Error('Each split needs both labels');
  }
  // Only development scores propose cutoffs. Never tune on the holdout.
  // Scope: combined automatic-acceptance zone (ALLOW or ALLOW_WITH_LOGGING).
  const thresholds = [...new Set([0.7, 1, ...dev.map(r => r.result.composite)
    .filter(x => x !== null && x >= 0.7)])].sort((a, b) => a - b);
  const sweep = thresholds.map(threshold => ({ threshold, ...metrics(dev, threshold) }));
  const candidates = sweep.filter(m => m.accepted > 0 && m.precision_wilson_95[0] >= target)
    .sort((a, b) => b.coverage - a.coverage || b.precision - a.precision || b.threshold - a.threshold);
  const selected = candidates[0]?.threshold ?? null;
  const heldout = selected === null ? null : metrics(test, selected);
  return {
    status: 'PENDING', domain_calibrated: false,
    pending_reasons: [
      ...(rows.some(r => r.provenance === 'synthetic') ? ['synthetic_data_or_scores'] : []),
      ...(selected === null ? ['no_development_threshold_meets_confidence_bound'] : []),
      ...(heldout && (heldout.precision_wilson_95 === null || heldout.precision_wilson_95[0] < target) ? ['holdout_target_not_met'] : []),
      'external_provenance_and_sampling_require_human_review',
    ],
    target_precision: target, precision_interval: 'Wilson two-sided 95%; independent Bernoulli trials assumed',
    scope: 'Candidate combined auto-acceptance cutoff only; fixed weights; no live spec changes',
    selected_threshold: selected, development_sweep: sweep, holdout_selected: heldout,
    baseline: Object.fromEntries([['calibration', dev], ['holdout', test]].map(([name, split]) => [name, {
      combined_auto_acceptance: metrics(split, 0.7), allow_only: metrics(split, 0.85),
      decisions: split.reduce((acc, row) => { acc[row.result.decision] = (acc[row.result.decision] ?? 0) + 1; return acc; }, {}),
      annotator_cohen_kappa: kappa(split),
    }])),
    cases: rows.map(r => ({
      id: r.id, group_id: r.group_id, split: r.split, provenance: r.provenance,
      reference: r.reference, candidate: r.candidate, label_basis: r.label_basis,
      acceptable: r.acceptable, annotators: structuredClone(r.annotators),
      judges: structuredClone(r.judges ?? null), ...r.result,
    })),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || resolve(input) === resolve(output)) throw new Error('Usage: node calibrate.mjs input.jsonl report.json (distinct files)');
  const bytes = readFileSync(input);
  const records = bytes.toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => JSON.parse(line));
  const implementationFiles = ['calibrate.mjs', 'ai-aggregate.mjs', 'aggregation.spec.json'];
  const report = {
    dataset_sha256: createHash('sha256').update(bytes).digest('hex'),
    implementation_files: implementationFiles.map(file => ({ file,
      sha256: createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex') })),
    ...calibrate(records),
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, cases: records.length, selected_threshold: report.selected_threshold, output }));
}
