"""Descriptive statistics; no model call, human ratification or population validity claim."""
import json
import math
from pathlib import Path
from statistics import NormalDist, mean, variance, stdev


def wilson(successes, total):
    if type(successes) is not int or type(total) is not int or not 0 <= successes <= total:
        raise ValueError('integer counts with 0 <= successes <= total required')
    if not total:
        return None
    z = NormalDist().inv_cdf(0.975)
    p = successes / total
    denominator = 1 + z*z/total
    center = (p + z*z/(2*total)) / denominator
    half = z * math.sqrt(p*(1-p)/total + z*z/(4*total*total)) / denominator
    return [max(0.0, center-half), min(1.0, center+half)]


def binary_agreement(truth, predicted):
    if len(truth) != len(predicted) or not truth:
        raise ValueError('paired nonempty binary ratings required')
    if any(type(v) is not bool for v in [*truth, *predicted]):
        raise ValueError('ratings must be booleans')
    n = len(truth)
    agreement = sum(a == b for a, b in zip(truth, predicted)) / n
    p, q = sum(truth)/n, sum(predicted)/n
    chance = p*q + (1-p)*(1-q)
    return {'agreement': agreement, 'cohens_kappa': (agreement-chance)/(1-chance) if chance < 1 else None}


def flip_rate(repetitions):
    if len(repetitions) < 2 or not repetitions[0]:
        raise ValueError('at least two nonempty complete repetitions required')
    if any(len(r) != len(repetitions[0]) or any(type(v) is not bool for v in r) for r in repetitions):
        raise ValueError('aligned complete binary repetitions required; report errors separately')
    return sum(len(set(values)) > 1 for values in zip(*repetitions)) / len(repetitions[0])


def repetition_summary(truth, repetitions):
    """Aligned cases; None is an invalid/missing response, never a negative vote."""
    if not truth or any(type(v) is not bool for v in truth) or len(repetitions) < 2:
        raise ValueError('nonempty boolean labels and at least two repetitions required')
    if any(len(r) != len(truth) or any(v is not None and type(v) is not bool for v in r) for r in repetitions):
        raise ValueError('aligned boolean or None predictions required')
    def ratio(a, b):
        return a/b if b else None
    per_repeat = []
    for predictions in repetitions:
        counts = {key: 0 for key in ['TP','TN','FP','FN','ERROR']}
        for label, prediction in zip(truth, predictions):
            key = 'ERROR' if prediction is None else ('TP' if prediction else 'FN') if label else ('FP' if prediction else 'TN')
            counts[key] += 1
        tp, tn, fp, fn = (counts[k] for k in ['TP','TN','FP','FN'])
        per_repeat.append({**counts, 'fpr': ratio(fp, fp+tn), 'precision': ratio(tp, tp+fp),
                           'recall': ratio(tp, tp+fn), 'coverage': 1-counts['ERROR']/len(truth)})
    columns = list(zip(*repetitions))
    complete = [values for values in columns if all(v is not None for v in values)]
    flips = sum(len(set(values)) > 1 for values in complete)
    incomplete = len(truth)-len(complete)
    dispersion = {}
    for metric in ['fpr', 'precision', 'recall', 'coverage']:
        values = [r[metric] for r in per_repeat if r[metric] is not None]
        dispersion[metric] = {'defined_repetitions': len(values),
                              'mean': mean(values) if values else None,
                              'sample_variance': variance(values) if len(values)>1 else None,
                              'sample_stdev': stdev(values) if len(values)>1 else None}
    return {'repetitions': len(repetitions), 'per_repetition': per_repeat,
            'descriptive_dispersion': dispersion, 'complete_cases': len(complete),
            'incomplete_cases': incomplete, 'complete_case_fraction': len(complete)/len(truth),
            'flipped_complete_cases': flips, 'flip_rate_complete': ratio(flips,len(complete)),
            'flip_rate_wilson_95_descriptive': wilson(flips,len(complete)),
            'missing_case_sensitivity_bounds_not_ci': [flips/len(truth), (flips+incomplete)/len(truth)]}


def main():
    root = Path(__file__).resolve().parents[1]
    base = root / 'docs/evidence/local/2026-10-17/triage-evaluation'
    rows = json.loads((base/'run-01/results.json').read_text())['cases']
    counts = {key: sum(r['outcome'] == key for r in rows) for key in ['TP','TN','FP','FN','ERROR']}
    tp, tn, fp, fn = (counts[k] for k in ['TP','TN','FP','FN'])
    result = {'status': 'DESCRIPTIVE_CONDITIONAL_ON_UNREVIEWED_LABELS', 'counts': counts,
              'wilson_95': {'fpr': wilson(fp, fp+tn), 'precision': wilson(tp, tp+fp),
                            'recall': wilson(tp, tp+fn)},
              'fpr': fp/(fp+tn), 'false_discovery_proportion': fp/(tp+fp),
              'assumptions': 'Binomial illustration only; tiny convenience sample, paired cases and unratified labels prevent population inference.',
              'human_agreement': None, 'flip_rate': None}
    (base/'run-01-descriptive-intervals.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
