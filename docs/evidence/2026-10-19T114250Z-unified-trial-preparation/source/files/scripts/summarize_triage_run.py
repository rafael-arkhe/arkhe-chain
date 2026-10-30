"""Independently recompute run-01 counts, trivial baselines and latency from retained outputs."""
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / 'docs/evidence/local/2026-10-17/triage-evaluation/run-01'


def main():
    dataset = json.loads((RUN / 'dataset.json').read_text(encoding='utf-8'))['cases']
    recorded = json.loads((RUN / 'results.json').read_text(encoding='utf-8'))
    totals = {'TP': 0, 'TN': 0, 'FP': 0, 'FN': 0, 'ERROR': 0}
    for case in dataset:
        saved = next(r for r in recorded['cases'] if r['id'] == case['id'])
        if saved['exit_code'] != 0:
            totals['ERROR'] += 1
            continue
        prediction = json.loads((RUN / case['id'] / 'stdout.txt').read_text(encoding='utf-8'))['assessment']['supports_proposal']
        assert type(prediction) is bool
        outcome = { (True, True): 'TP', (True, False): 'FN',
                    (False, True): 'FP', (False, False): 'TN'}[(case['expected_support'], prediction)]
        totals[outcome] += 1
        assert saved['outcome'] == outcome
    assert all(recorded['metrics'][key] == value for key, value in totals.items())
    positive = sum(c['expected_support'] for c in dataset)
    negative = len(dataset) - positive
    times = sorted(r['elapsed_seconds'] for r in recorded['cases'])
    result = {'independently_recomputed_counts': totals,
              'baselines_same_labels_no_inference': {
                  'always_support': {'TP': positive, 'FP': negative, 'TN': 0, 'FN': 0,
                                     'precision': positive / len(dataset), 'recall': 1.0,
                                     'false_positive_rate': 1.0},
                  'always_reject': {'TP': 0, 'FP': 0, 'TN': negative, 'FN': positive,
                                    'precision': None, 'recall': 0.0, 'false_positive_rate': 0.0}},
              'latency_seconds': {'sum_case_wall': sum(times), 'mean': statistics.mean(times),
                                  'median': statistics.median(times), 'min': min(times),
                                  'max': max(times),
                                  'includes_cold_start_and_cli_overhead': True},
              'monetary_cost': None, 'energy_kwh': None,
              'cost_note': 'Local Ollama; no paid provider used; electricity and hardware cost not measured.',
              'human_escalation_in_run_01': 'NOT_EXECUTED',
              'production_acceptability': 'NOT_ESTABLISHED'}
    path = RUN.parent / 'run-01-independent-summary.json'
    path.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
