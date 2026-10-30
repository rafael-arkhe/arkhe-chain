"""Authored synthetic attribution cases; lexical baseline is NOT an entailment model."""
import argparse
import hashlib
import json
import random
from pathlib import Path
from collections import Counter
from python_citation_crosscheck import lexical, strict_json

LABELS = ('SUPPORTED', 'CONTRADICTED', 'INSUFFICIENT')
TRIPLETS = [
    ('negation', 'neg-1', 'The Atlas service is enabled.',
     ('The Atlas service is enabled.', 'The Atlas service is not enabled.', 'The Atlas service has backups.'),
     ('Restates the explicit status.', 'Negates the explicit status.', 'No backup information is supplied.')),
    ('negation', 'neg-2', 'The Atlas service does not store logs.',
     ('The Atlas service does not store logs.', 'The Atlas service stores logs.', 'The Atlas service encrypts logs.'),
     ('Restates the negative statement.', 'Asserts what the source denies.', 'Encryption behavior is unspecified.')),
    ('numerals', 'num-1', 'The Atlas office has exactly 15 desks.',
     ('The Atlas office has exactly 15 desks.', 'The Atlas office has exactly 5 desks.', 'The Atlas office has exactly 15 chairs.'),
     ('Exact count and object match.', 'Different exact count for the same objects.', 'Desk count does not specify chair count.')),
    ('numerals', 'num-2', 'The Atlas fee is exactly 120 dollars per month.',
     ('The Atlas fee is exactly 120 dollars per month.', 'The Atlas fee is exactly 20 dollars per month.', 'The Atlas fee is exactly 120 dollars per year.'),
     ('Same amount and billing period.', 'Different exact monthly amount.', 'Annual pricing is not given; no conversion rule is assumed.')),
    ('entities', 'ent-1', 'Atlas, not Boreal, owns the server.',
     ('Atlas owns the server.', 'Boreal owns the server.', 'Atlas owns the router.'),
     ('Ownership is explicitly assigned.', 'Ownership by Boreal is explicitly denied.', 'Router ownership is not stated.')),
    ('entities', 'ent-2', 'The Atlas branch is in Berlin, not Paris.',
     ('The Atlas branch is in Berlin.', 'The Atlas branch is in Paris.', 'The Atlas branch employs Berlin residents.'),
     ('Explicit location.', 'Explicitly excluded location.', 'Employee residence is not specified.')),
    ('dates', 'date-1', 'The only launch date for Atlas is 2026-10-01.',
     ('The launch date for Atlas is 2026-10-01.', 'The launch date for Atlas is 2026-10-02.', 'Atlas was tested on 2026-10-01.'),
     ('Same event and date.', 'Different date for the event with a unique date.', 'Testing date is not a launch date.')),
    ('dates', 'date-2', 'The Atlas meeting starts at exactly 09:00 on 2026-10-28.',
     ('The Atlas meeting starts at exactly 09:00 on 2026-10-28.',
      'The Atlas meeting starts at exactly 09:30 on 2026-10-28.',
      'The Atlas meeting ends at exactly 09:00 on 2026-10-28.'),
     ('Exact start time is repeated.', 'Different exact start time for the same meeting.', 'End time is not provided.')),
    ('quantifiers', 'quant-1', 'All three items in batch K passed inspection. None failed inspection.',
     ('All three items in batch K passed inspection.', 'At least one item in batch K failed inspection.',
      'All three items in batch K passed inspection on Monday.'),
     ('Explicit universal assertion.', 'Conflicts with no failures.', 'The day is unspecified.')),
    ('quantifiers', 'quant-2', 'At least one item in batch K passed inspection. Batch K contains three items.',
     ('At least one item in batch K passed inspection.', 'No item in batch K passed inspection.',
      'All three items in batch K passed inspection.'),
     ('Explicit existential assertion.', 'Denies the asserted existence.', 'At least one does not establish all three.')),
    ('relations', 'rel-1', 'Atlas sent the package to Boreal. Boreal did not send it to Atlas.',
     ('Atlas sent the package to Boreal.', 'Boreal sent the package to Atlas.', 'Atlas sent the package to Boreal by train.'),
     ('Direction and relation match.', 'Reverse transfer is explicitly denied.', 'Transport method is unspecified.')),
    ('relations', 'rel-2', 'Atlas is larger than Boreal. Their costs are unspecified.',
     ('Atlas is larger than Boreal.', 'Boreal is larger than Atlas.', 'Atlas costs more than Boreal.'),
     ('Repeats the size relation.', 'Reverses a strict size comparison.', 'Size does not determine cost.')),
]


def cases():
    result = []
    for category, group, evidence, claims, reasons in TRIPLETS:
        for label, claim, reason in zip(LABELS, claims, reasons):
            result.append({'category': category, 'group': group, 'evidence': evidence,
                           'claim': claim, 'label': label, 'rationale': reason})
    random.Random(20261028).shuffle(result)
    return [dict(row, id=f'C{i:03}') for i, row in enumerate(result, 1)]


def sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def score_predictions(gold, predictions):
    expected = {r['id']: r['label'] for r in gold}
    supplied = {}
    for row in predictions:
        if not isinstance(row, dict) or set(row) != {'id', 'label'}:
            raise ValueError('PREDICTION_SCHEMA')
        if row['id'] not in expected or row['id'] in supplied or row['label'] not in (*LABELS, 'ABSTAIN'):
            raise ValueError('UNKNOWN_DUPLICATE_OR_INVALID_PREDICTION')
        supplied[row['id']] = row['label']
    confusion = {label: {p: 0 for p in (*LABELS, 'ABSTAIN', 'MISSING')} for label in LABELS}
    for key, label in expected.items():
        confusion[label][supplied.get(key, 'MISSING')] += 1
    correct = sum(supplied.get(k) == v for k, v in expected.items())
    issued = sum(label != 'ABSTAIN' for label in supplied.values())
    per_class = {}
    for label in LABELS:
        tp = confusion[label][label]
        predicted = sum(confusion[g][label] for g in LABELS)
        total = sum(confusion[label].values())
        precision = tp / predicted if predicted else None
        recall = tp / total if total else None
        f1 = 2 * tp / (predicted + total) if predicted + total else None
        per_class[label] = {'precision': precision, 'recall_itt': recall, 'f1': f1}
    return {'cases': len(expected), 'submitted': len(supplied), 'issued': issued,
            'missing': len(expected) - len(supplied), 'correct': correct,
            'accuracy_itt': correct / len(expected),
            'accuracy_conditional': correct / issued if issued else None,
            'coverage': issued / len(expected), 'confusion': confusion, 'per_class': per_class}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False)
    data = cases()
    inputs = [{k: row[k] for k in ('id', 'evidence', 'claim')} for row in data]
    gold = [{k: row[k] for k in ('id', 'label', 'category', 'group', 'rationale')} for row in data]
    manifest = {'format': 'CITATION_SEMANTIC_DIAGNOSTIC_V1', 'cases': len(data),
        'labels': list(LABELS), 'categories': dict(Counter(r['category'] for r in data)),
        'label_counts': dict(Counter(r['label'] for r in data)),
        'input_digest': sha(inputs), 'gold_digest': sha(gold),
        'authorship': 'Same-agent manually authored synthetic examples and gold; no independent human review',
        'scope': 'English ASCII diagnostic; literal text support, not source truth or external world verification',
        'rubric': 'SUPPORTED: evidence entails claim; CONTRADICTED: evidence entails its negation; INSUFFICIENT: neither. Missing information is not false.',
        'assumptions': 'Same named referents/event; exact counts and unique event values; strict size relation; no annual-price conversion without stated rule.',
        'evaluation_policy': 'All declared cases retained; missing and abstaining predictions are zero in ITT; no replacement',
        'source_digests': {n: hashlib.sha256(Path(__file__).with_name(n).read_bytes()).hexdigest()
                           for n in ('citation_semantic_diagnostic.py', 'python_citation_crosscheck.py', 'blake3_reference.py')}}
    for name, value in [('manifest.json', manifest), ('inputs.json', inputs), ('gold.json', gold)]:
        (out / name).write_text(json.dumps(value, indent=2))
    (out / 'sources').mkdir()
    for name in manifest['source_digests']:
        (out / 'sources' / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    rows = []
    confusion = {label: {'PASS_LEXICAL': 0, 'FAIL_LEXICAL': 0} for label in LABELS}
    for row in data:
        verdict = lexical({'text': row['claim'], 'evidence_id': 'source'}, {'source': row['evidence']})
        confusion[row['label']][verdict['status']] += 1
        rows.append({'id': row['id'], 'gold_label': row['label'], 'category': row['category'], 'verdict': verdict})
    passes = sum(r['PASS_LEXICAL'] for r in confusion.values())
    supported_passes = confusion['SUPPORTED']['PASS_LEXICAL']
    report = {'phase': 'LEXICAL_BASELINE_AGAINST_AUTHORED_SEMANTIC_LABELS',
        'confusion_semantic_gold_vs_lexical_decision': confusion,
        'supported_fraction_among_lexical_passes': supported_passes / passes if passes else None,
        'supported_acceptance_rate': supported_passes / manifest['label_counts']['SUPPORTED'],
        'contradiction_acceptance_rate': confusion['CONTRADICTED']['PASS_LEXICAL'] / manifest['label_counts']['CONTRADICTED'],
        'insufficient_acceptance_rate': confusion['INSUFFICIENT']['PASS_LEXICAL'] / manifest['label_counts']['INSUFFICIENT'],
        'semantic_model_evaluated': False, 'production_trust_modified': False,
        'independent_annotation': False, 'rows': rows}
    (out / 'lexical-baseline.json').write_text(json.dumps(report, indent=2))
    return report


def score_files(directory, predictions, output):
    directory = Path(directory)
    manifest = strict_json((directory / 'manifest.json').read_text())
    inputs = strict_json((directory / 'inputs.json').read_text())
    gold = strict_json((directory / 'gold.json').read_text())
    if sha(inputs) != manifest['input_digest'] or sha(gold) != manifest['gold_digest']:
        raise ValueError('DATASET_DIGEST_MISMATCH')
    values = strict_json(Path(predictions).read_text())
    if not isinstance(values, list): raise ValueError('PREDICTIONS_MUST_BE_ARRAY')
    result = score_predictions(gold, values)
    with Path(output).open('x') as file:
        file.write(json.dumps(result, indent=2))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    build = sub.add_parser('build'); build.add_argument('directory')
    scoring = sub.add_parser('score'); scoring.add_argument('directory'); scoring.add_argument('predictions'); scoring.add_argument('output')
    args = parser.parse_args()
    result = run(args.directory) if args.command == 'build' else score_files(args.directory, args.predictions, args.output)
    print(json.dumps({k:v for k,v in result.items() if k!='rows'}, indent=2))
