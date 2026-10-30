"""Local diagnostic tripwires. No sandbox, native WER, signature or trusted clock."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from micro_evaluation_evidence import digest


def now():
    return datetime.now(timezone.utc).isoformat()


def commit(path, records):
    marker = str(uuid.uuid4())
    data = json.dumps({'records': records, 'canary': marker}, sort_keys=True).encode()
    Path(path).write_bytes(data)
    return {'algorithm': 'SHA-256', 'content_hash': hashlib.sha256(data).hexdigest(),
            'bytes': len(data), 'canary_commitment': hashlib.sha256(marker.encode()).hexdigest(),
            'sealed_at_local': now(), 'confidentiality': 'NOT_ENFORCED'}, marker


class AuditedReader:
    """Only reads through this wrapper are observed. Lane identity is caller supplied."""
    def __init__(self, path, commitment):
        self.path, self.commitment, self.events = Path(path), commitment, []

    def read(self, actor, lane, purpose):
        allowed = lane == 'EVAL'
        self.events.append({'actor': actor, 'lane': lane, 'purpose': purpose,
                            'local_time': now(), 'decision': 'ALLOW' if allowed else 'DENY'})
        if not allowed:
            raise PermissionError('WRAPPER_LANE_DENIED')
        data = self.path.read_bytes()
        if hashlib.sha256(data).hexdigest() != self.commitment['content_hash']:
            raise ValueError('CONTENT_MISMATCH')
        return json.loads(data)['records']


def scan(marker, artifacts):
    hits = [name for name, value in artifacts.items() if marker.encode() in value]
    return {'status': 'MARKER_DETECTED' if hits else 'NOT_DETECTED_IN_SCANNED_ARTIFACTS',
            'hits': hits, 'weights': 'NOT_ASSESSED', 'absence_of_leakage': 'NOT_ESTABLISHED'}


def checkpoint(previous, batch_id, records):
    body = {'format': 'LOCAL_BATCH_CHECKPOINT_V1', 'batch_id': batch_id,
            'previous': previous, 'records': records, 'records_digest': digest(records),
            'local_time': now(), 'signed': False, 'external_anchor': False}
    return dict(body, hash=digest(body))


def verify_chain(chain, expected_head=None):
    previous = '0' * 64
    for i, row in enumerate(chain):
        body = {k: v for k, v in row.items() if k != 'hash'}
        if (row['batch_id'] != i or row['previous'] != previous or
                row['records_digest'] != digest(row['records']) or row['hash'] != digest(body)):
            raise ValueError('CHAIN_MISMATCH')
        if row['signed'] or row['external_anchor']:
            raise ValueError('UNSUPPORTED_TRUST_CLAIM')
        previous = row['hash']
    if expected_head is not None and previous != expected_head:
        raise ValueError('EXPECTED_HEAD_MISMATCH')
    return {'status': 'INTERNAL_CONSISTENCY_VERIFIED', 'head': previous,
            'completeness': 'RELATIVE_TO_SUPPLIED_HEAD_ONLY' if expected_head else 'NOT_ESTABLISHED'}


def run(out):
    from hidden_mechanics_micro import Episode, ACTIONS
    out = Path(out)
    out.mkdir(exist_ok=False)
    # Synthetic fixtures, not a new confidential dataset or a capability evaluation.
    env = Episode(137, 1100, 50)
    records = []
    for action in ACTIONS[:4]:
        before = env.observe()['grid']
        env.step(action)
        records.append({'before': before, 'action': action, 'after': env.observe()['grid']})
    commitment, marker = commit(out / 'private-fixture.json', records)
    model = {'algorithm': 'identity', 'source_digest': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
             'frozen_at_local': now()}
    protocol = {'model': model, 'dataset': commitment, 'batch_size': 2,
                'scope': 'Known synthetic fixtures; local diagnostic, not generalization evidence'}
    (out / 'manifest.json').write_text(json.dumps(protocol, indent=2))
    reader = AuditedReader(out / 'private-fixture.json', commitment)
    try:
        reader.read('repair', 'DEV', 'negative control')
    except PermissionError:
        pass
    data = reader.read('evaluator', 'EVAL', 'scoring')
    chain, batch, correct = [], [], 0
    for i, pair in enumerate(data):
        # The fixed predictor receives features only, never the after grid.
        predicted = pair['before']
        prediction = {'kind': 'LocalEvaluationPredictionOnly', 'pair_id': i,
                      'state_digest': digest(pair['before']), 'action': pair['action'],
                      'prediction_digest': digest(predicted), 'model_digest': digest(model),
                      'protocol_digest': digest(protocol), 'prediction_at_local': now()}
        # Persist prediction before evaluator compares the label.
        with (out / 'predictions.jsonl').open('a') as file:
            file.write(json.dumps(prediction) + '\n')
            file.flush()
        exact = predicted == pair['after']
        correct += exact
        batch.append({'prediction': prediction, 'exact_grid': exact})
        if len(batch) == 2:
            chain.append(checkpoint(chain[-1]['hash'] if chain else '0' * 64, len(chain), batch))
            batch = []
    head = chain[-1]['hash']
    # Deliberately bypass wrapper and strip metadata: this is the counterexample.
    bypass = json.loads((out / 'private-fixture.json').read_bytes())['records']
    stripped = json.dumps(bypass).encode()
    def rejects(candidate, expected=None):
        try:
            verify_chain(candidate, expected)
            return False
        except ValueError:
            return True
    report = {'format': 'LOCAL_HOLDOUT_DIAGNOSTICS_V1', 'exact_grid': [correct, len(data)],
              'wrapper_events': reader.events,
              'positive_marker_control': scan(marker, {'copied_marker': marker.encode()}),
              'bypass_without_marker_control': scan(marker, {'copied_labels': stripped}),
              'bypass_read_registered': False,
              'complete_chain': verify_chain(chain, head),
              'suffix_without_reference': verify_chain(chain[:-1]),
              'suffix_rejected_with_original_head': rejects(chain[:-1], head),
              'missing_first_batch_rejected': rejects(chain[1:]),
              'trust': {'native_wer': 'NOT_INTEGRATED', 'trusted_time': 'NOT_ESTABLISHED',
                        'authentication': 'NOT_ESTABLISHED', 'holdout_isolation': 'NOT_ESTABLISHED',
                        'weights_contamination': 'NOT_ASSESSED', 'mmr': 'NOT_IMPLEMENTED'},
              'ordering': 'Dataset committed before model freeze; local times are declarations.'}
    for name, value in [('checkpoints.json', chain), ('report.json', report)]:
        (out / name).write_text(json.dumps(value, indent=2))
    return report


if __name__ == '__main__':
    import sys
    print(json.dumps(run(sys.argv[1]), indent=2))
