"""Independent Python reference for the proposed Unity summary and rejection cases."""
import copy
import json
import sys
from pathlib import Path
from generate_work_vectors import b3, cbor, projection

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'tests/core_conformance_vectors.json'
DOMAINS = {'MatchSummary': b'AKG:MATCH_SUMMARY:v1\0',
           'WorkerExecutionRecord': b'AKG:WER:v1\0',
           'WorkIntent': b'AKG:WORKINTENT:v1\0'}


def build():
    rows = []

    def add(identity, kind, value, rejection=None):
        row = dict(id=identity, component=kind, input=value,
                   domain_hex=DOMAINS[kind].hex(), expected='REJECT' if rejection else 'ACCEPT')
        if rejection:
            row['rejection_reason'] = rejection
        else:
            projected = projection(value)
            if kind == 'MatchSummary':
                for field in ('session_id', 'player_id', 'stage_seed', 'input_digest', 'state_hash'):
                    projected[field] = bytes(value[field])
            encoded = cbor(projected)
            row['expected_output'] = dict(canonical_cbor_hex=encoded.hex(),
                                         object_digest_hex=b3(DOMAINS[kind] + encoded).hex())
        rows.append(row)

    summary = dict(version=1, session_id=[0]*32, player_id=[1]*32, stage_seed=[2]*32,
                   input_digest=[3]*32, state_hash=[4]*32, survival_ms=1,
                   projectiles_absorbed=0, waves_cleared=0, bosses_defeated=0, final_score=0)
    add('MatchSummary-minimal', 'MatchSummary', summary)
    maximum = dict(summary, survival_ms=1800000, projectiles_absorbed=2**32-1,
                   waves_cleared=65535, bosses_defeated=65535, final_score=2**64-1)
    add('MatchSummary-integer-boundaries', 'MatchSummary', maximum)
    # Distinct commitments ensure accidental field swaps do not pass the vectors.
    add('MatchSummary-distinct-digests', 'MatchSummary',
        dict(summary, session_id=list(range(32)), state_hash=list(range(255,223,-1)),
             survival_ms=60000, final_score=65536))

    legacy = json.loads((ROOT / 'tests/golden_vectors.json').read_text(encoding='utf-8'))['vectors']
    wer = copy.deepcopy(next(r['input'] for r in legacy if r['component'] == 'WorkerExecutionRecord'))
    large = dict(wer, evidence_refs=[[i % 256]*32 for i in range(10000)],
                 confidence_bps=10000, uncertainty_note='10k refs')
    add('WER-large-refs-10k', 'WorkerExecutionRecord', large)
    add('WER-confidence-zero', 'WorkerExecutionRecord', dict(wer, confidence_bps=0))
    add('WER-confidence-negative', 'WorkerExecutionRecord', dict(wer, confidence_bps=-1), 'unsigned integer required')
    add('WER-confidence-over-10000', 'WorkerExecutionRecord', dict(wer, confidence_bps=10001), 'basis points exceed 10000')
    add('WER-confidence-float', 'WorkerExecutionRecord', dict(wer, confidence_bps=1.5), 'float forbidden')
    add('WER-unknown-field', 'WorkerExecutionRecord', dict(wer, unexpected=True), 'unknown field')
    intent = next(r['input'] for r in legacy if r['component'] == 'WorkIntent')
    add('WorkIntent-float', 'WorkIntent', dict(intent, claimed_created_at=1.5), 'float forbidden')
    add('WorkIntent-unknown-field', 'WorkIntent', dict(intent, unexpected=True), 'unknown field')
    add('MatchSummary-unknown-field', 'MatchSummary', dict(summary, events=[]), 'unknown field')
    add('MatchSummary-float', 'MatchSummary', dict(summary, final_score=1.5), 'float forbidden')
    add('MatchSummary-version', 'MatchSummary', dict(summary, version=2), 'unsupported version')
    add('MatchSummary-zero-survival', 'MatchSummary', dict(summary, survival_ms=0), 'survival below bound')
    add('MatchSummary-survival-overflow', 'MatchSummary', dict(summary, survival_ms=1800001), 'survival above bound')
    add('MatchSummary-short-digest', 'MatchSummary', dict(summary, state_hash=[0]*31), 'digest length')
    return dict(version='AKG-CBOR-v1', generated_by='independent Python CBOR + BLAKE3', vectors=rows)


if __name__ == '__main__':
    data = (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if '--check' in sys.argv:
        if not PATH.exists() or PATH.read_bytes() != data:
            raise SystemExit('FAIL conformance reference differs')
        print('PASS independent core conformance reference')
    else:
        PATH.write_bytes(data)
        print('Generated independent core conformance reference')
