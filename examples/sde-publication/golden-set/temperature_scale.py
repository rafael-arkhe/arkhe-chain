"""Fit one temperature on labelled generic NLI pairs; never promote support-domain calibration."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LABELS = ['contradiction', 'entailment', 'neutral']

def probabilities(logits, temperature=1):
    if not math.isfinite(temperature) or temperature <= 0 or len(logits) != 3 or not all(math.isfinite(x) for x in logits):
        raise ValueError('Invalid logits or temperature')
    scaled = [x / temperature for x in logits]; maximum = max(scaled)
    values = [math.exp(x - maximum) for x in scaled]; total = sum(values)
    return [x / total for x in values]

def nll(rows, temperature):
    if not rows: raise ValueError('No labelled pairs')
    losses = []
    for row in rows:
        scaled = [x / temperature for x in row['logits']]; maximum = max(scaled)
        losses.append(maximum + math.log(sum(math.exp(x - maximum) for x in scaled)) - scaled[LABELS.index(row['gold_label'])])
    return sum(losses) / len(losses)

def fit_temperature(rows):
    # Fixed bounds and iterations declared before seeing holdout metrics.
    a, b = -3.0, 3.0; ratio = (math.sqrt(5) - 1) / 2
    for _ in range(80):
        left, right = b - ratio * (b - a), a + ratio * (b - a)
        if nll(rows, math.exp(left)) < nll(rows, math.exp(right)): b = right
        else: a = left
    t = math.exp((a + b) / 2)
    return t if nll(rows, t) <= nll(rows, 1) else 1.0

def ece(pairs):
    total = len(pairs); result = 0
    for index in range(10):
        bucket = [(confidence, outcome) for confidence, outcome in pairs if min(9, int(confidence * 10)) == index]
        if bucket:
            result += len(bucket) / total * abs(sum(x for x, _ in bucket) / len(bucket) - sum(y for _, y in bucket) / len(bucket))
    return result

def metrics(rows, temperature):
    predicted = [probabilities(r['logits'], temperature) for r in rows]
    gold = [LABELS.index(r['gold_label']) for r in rows]
    chosen = [max(range(3), key=lambda i: p[i]) for p in predicted]
    return {'count': len(rows), 'nll': nll(rows, temperature),
        'accuracy': sum(a == b for a, b in zip(chosen, gold)) / len(rows),
        'multiclass_brier_sum': sum(sum((p[i] - (i == y)) ** 2 for i in range(3)) for p, y in zip(predicted, gold)) / len(rows),
        'top_label_ece_10bins': ece([(max(p), int(c == y)) for p, c, y in zip(predicted, chosen, gold)]),
        'contradiction_ece_10bins': ece([(p[0], int(y == 0)) for p, y in zip(predicted, gold)])}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'runs/nli-temperature-multinli-v1')
    args = parser.parse_args()
    if args.output_dir.exists(): raise ValueError('Use a new output-dir; do not overwrite a calibration experiment')
    args.output_dir.mkdir(parents=True)
    source = ROOT / 'sources/multinli/temperature-pairs.jsonl'
    rows = [json.loads(line) for line in source.read_text().splitlines()]
    groups = {}
    for row in rows:
        if row['group_id'] in groups and groups[row['group_id']] != row['split']: raise ValueError('Group leakage')
        groups[row['group_id']] = row['split']
    import torch
    import transformers
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    from transformers.utils import logging
    logging.disable_progress_bar()
    torch.set_num_threads(4)
    model_dir = ROOT / 'models/nli-deberta-v3-base'
    model_manifest = json.loads((model_dir / 'download-manifest.json').read_text())
    for entry in model_manifest['files']:
        if hashlib.sha256((model_dir / entry['file']).read_bytes()).hexdigest() != entry['sha256']: raise ValueError('Model hash mismatch')
    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True, trust_remote_code=False)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir, local_files_only=True,
        use_safetensors=True, trust_remote_code=False).to('cpu').eval()
    if [model.config.id2label[i] for i in range(3)] != LABELS: raise ValueError('Model label order mismatch')
    eligible, excluded = [], []
    for row in rows:
        if len(tokenizer(row['premise'], row['hypothesis'], truncation=False)['input_ids']) > 512:
            excluded.append({'id': row['id'], 'reason': 'pair_exceeds_512_tokens'})
        else: eligible.append(row)
    logits_rows = []
    for offset in range(0, len(eligible), 8):
        batch = eligible[offset:offset + 8]
        encoded = tokenizer([r['premise'] for r in batch], [r['hypothesis'] for r in batch], padding=True, truncation=False, return_tensors='pt')
        with torch.inference_mode(): logits = model(**encoded).logits.double().tolist()
        logits_rows.extend({**row, 'logits': values} for row, values in zip(batch, logits))
        if offset % 40 == 0: print(json.dumps({'measured_pairs': len(logits_rows)}), flush=True)
    dev = [r for r in logits_rows if r['split'] == 'calibration']; holdout = [r for r in logits_rows if r['split'] == 'holdout']
    for split in [dev, holdout]:
        if {r['gold_label'] for r in split} != set(LABELS): raise ValueError('Each split needs all three labels')
    temperature = fit_temperature(dev)
    result = {'created_at': datetime.now(timezone.utc).isoformat(), 'status': 'EXPERIMENTAL_GENERIC_NLI_ONLY',
        'support_domain_calibration': 'PENDING', 'temperature': temperature, 'labels': LABELS,
        'fit': {'method': 'bounded golden-section on log(T), dev NLL only', 'log_temperature_bounds': [-3, 3], 'iterations': 80},
        'development': {'before': metrics(dev, 1), 'after': metrics(dev, temperature)},
        'holdout': {'before': metrics(holdout, 1), 'after': metrics(holdout, temperature)},
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'model': model_manifest,
        'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'excluded': excluded, 'limits': ['Small generic NLI sample, not support-domain evidence',
            'Model training or selection exposure to this benchmark cannot be excluded',
            'Positive temperature preserves class argmax; it cannot fix wrong class predictions',
            'ECE is sample/bin dependent; no guarantee of out-of-domain or max-over-window calibration',
            'No automatic promotion, threshold change or live policy update']}
    (args.output_dir / 'logits.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in logits_rows))
    (args.output_dir / 'temperature-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'temperature': temperature, 'holdout': result['holdout'], 'status': result['status']}), flush=True)

if __name__ == '__main__': main()
