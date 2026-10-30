"""Experimental v6 contrastive re-analysis of recorded NLI evidence; no live policy updates."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from temperature_scale import probabilities, LABELS

ROOT = Path(__file__).resolve().parent

def evidence_state(entailment, contradiction):
    difference = entailment - contradiction
    if entailment >= 0.8 and contradiction >= 0.8: return 'CONFLICTING_EVIDENCE', difference
    if difference <= -0.5: return 'CONTRADICTION_SIGNAL', difference
    if difference >= 0.5: return 'SUPPORT_SIGNAL', difference
    return ('INSUFFICIENT_EVIDENCE' if max(entailment, contradiction) < 0.8 else 'UNCERTAIN'), difference

def analyze_claim(claim, temperature):
    if claim['status'] != 'MEASURED' or not claim['pairs']: return {**claim, 'state': 'UNAVAILABLE'}
    pairs = []
    for pair in claim['pairs']:
        if pair['status'] != 'MEASURED': return {**claim, 'state': 'UNAVAILABLE'}
        values = [pair['probabilities'][label] for label in LABELS]
        if not all(math.isfinite(x) and x > 0 for x in values): return {**claim, 'state': 'UNAVAILABLE'}
        if abs(sum(values) - 1) > 1e-5: return {**claim, 'state': 'UNAVAILABLE'}
        # log(p) differs from original logits only by a common additive constant,
        # modulo original floating-point rounding. No invented raw-logit recovery.
        scaled = probabilities([math.log(x) for x in values], temperature)
        pairs.append({**pair, 'original_probabilities': pair['probabilities'],
            'probabilities': dict(zip(LABELS, scaled))})
    e = max(p['probabilities']['entailment'] for p in pairs)
    c = max(p['probabilities']['contradiction'] for p in pairs)
    state, difference = evidence_state(e, c)
    return {**claim, 'pairs': pairs, 'max_entailment': e, 'max_contradiction': c,
        'contrastive_score': difference, 'state': state}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-run', type=Path, default=ROOT / 'runs/wixqa-nli-v5-sentencefix')
    parser.add_argument('--temperature-report', type=Path, default=ROOT / 'runs/nli-temperature-multinli-v1/temperature-report.json')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'runs/wixqa-contrastive-v6')
    args = parser.parse_args()
    if args.output_dir.exists(): raise ValueError('Choose a new output-dir')
    fitted = json.loads(args.temperature_report.read_text()); temperature = fitted['temperature']
    if fitted['labels'] != LABELS or fitted['model']['revision'] != '6c749ce3425cd33b46d187e45b92bbf96ee12ec7':
        raise ValueError('Temperature model binding mismatch')
    source = args.source_run / 'triage.jsonl'
    rows = [json.loads(line) for line in source.read_text().splitlines()]
    results = []
    for row in rows:
        raw = [analyze_claim(c, 1) for c in row['claims']]
        adjusted = [analyze_claim(c, temperature) for c in row['claims']]
        if row['base_panel']['reason'] == 'rule_judge_failed': decision, reason = 'DENY', 'structural_rule_failure'
        elif not adjusted or any(c['state'] != 'SUPPORT_SIGNAL' for c in adjusted): decision, reason = 'REQUIRE_APPROVAL', 'contrastive_evidence_triage'
        else: decision, reason = row['base_panel']['decision'], 'base_panel'
        results.append({'id': row['id'], 'v5_decision': row['decision'], 'decision': decision,
            'reason': reason, 'temperature': temperature, 'claims_before_scaling': raw,
            'claims_after_scaling': adjusted, 'calibration_status': 'PENDING', 'human_labels_status': 'NOT_ANNOTATED'})
    args.output_dir.mkdir(parents=True)
    (args.output_dir / 'triage.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in results))
    report = {'profile': 'support-contrastive-v6-experiment', 'status': 'NOT_PROMOTED',
        'support_domain_calibration': 'PENDING', 'temperature': temperature,
        'formula': 'max entailment - max contradiction; both maxima retained',
        'state_policy': {'conflict': 'E>=0.8 and C>=0.8', 'contradiction': 'difference<=-0.5',
            'support': 'difference>=0.5', 'otherwise': 'uncertain or insufficient evidence'},
        'thresholds_calibrated': False, 'original_v5_modified': False,
        'input_representation': 'Log of recorded positive softmax scores; equal to logits up to additive constant and original float rounding. Zero/nonfinite scores are unavailable.',
        'source_triage_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'temperature_report_sha256': hashlib.sha256(args.temperature_report.read_bytes()).hexdigest(),
        'temperature_scope': 'Generic MultiNLI only; not evidence of support-domain or max-over-window calibration',
        'cases': [{'id': r['id'], 'decision': r['decision'], 'states': [c['state'] for c in r['claims_after_scaling']]} for r in results]}
    (args.output_dir / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'temperature': temperature, 'cases': report['cases'], 'status': report['status']}))

if __name__ == '__main__': main()
