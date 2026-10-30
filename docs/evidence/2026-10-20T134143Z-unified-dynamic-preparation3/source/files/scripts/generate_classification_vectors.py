"""Independent fixtures for the optional typed WER binding; legacy vectors remain untouched."""
import json
import sys
from pathlib import Path
from generate_work_vectors import b3, cbor, projection

ROOT = Path(__file__).resolve().parents[1]


def main():
    baseline = next(row['input'] for row in json.loads((ROOT / 'tests/golden_vectors.json').read_text())['vectors']
                    if row['component'] == 'WorkerExecutionRecord')
    rows = []
    for index, policy in enumerate([None, 4, 5]):
        value = {**baseline, 'operation': 'Decide'}
        if policy is not None:
            value['classification'] = {'classification_digest': [3] * 32, 'policy_digest': [policy] * 32}
        projected = projection(value)
        if policy is not None:
            projected['classification'] = {key: bytes(raw) for key, raw in value['classification'].items()}
        encoded = cbor(projected)
        domain = b'AKG:WER:v1\0'
        rows.append({'id': f'OptionalClassification-{index}', 'component': 'WorkerExecutionRecord',
                     'input': value, 'domain_hex': domain.hex(), 'expected_output': {
                         'canonical_cbor_hex': encoded.hex(), 'object_digest_hex': b3(domain + encoded).hex()}})
    output = json.dumps({'scope': 'Independent local compatibility fixtures; no protocol freeze',
                         'generated_by': 'Python stdlib CBOR + independent BLAKE3', 'vectors': rows},
                        ensure_ascii=False, indent=2) + '\n'
    target = ROOT / 'tests/classification_vectors.json'
    if '--check' in sys.argv:
        if not target.exists() or target.read_text(encoding='utf-8') != output:
            raise SystemExit('FAIL typed classification vectors differ')
        print('PASS independent typed WER vectors; legacy fixture files unchanged')
    else:
        target.write_text(output, encoding='utf-8')


if __name__ == '__main__':
    main()
