"""Material and host/dual-engine conformance for the versioned extension.

Reads retained oracles; never regenerates them or marks review completed.
"""
from copy import deepcopy
import argparse
import hashlib
import json
from pathlib import Path

import jsonschema

from compare_provenance_broker import host_input, node_decisions
from provenance_broker_decision import decide, digest
from provenance_broker_host import FrozenHost
from validate_provenance_broker import load, ordered_unique

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'tests/provenance-broker/v3.1'
DATA = BASE/'extensions-v2'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    manifest = load(DATA/'manifest.json')
    assert hashlib.sha256((BASE/'manifest.json').read_bytes()).hexdigest() == manifest['v1_manifest_sha256']
    for inventory in [load(BASE/'manifest.json'), manifest]:
        for rel, sha in inventory['files'].items():
            path = ROOT/rel
            assert path.resolve().is_relative_to(ROOT.resolve())
            assert hashlib.sha256(path.read_bytes()).hexdigest() == sha, rel
    profile = load(ROOT/'schemas/provenance-broker/profile-v2.json')
    schema = load(ROOT/'schemas/provenance-broker/fixture-v2.schema.json')
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema)
    fixtures = [load(p) for p in sorted((DATA/'fixtures').glob('*.json'))]
    assert len(fixtures) == manifest['fixture_count']
    node = node_decisions([host_input(f) for f in fixtures])
    rows = []
    for f, alternate in zip(fixtures, node, strict=True):
        errors = sorted('/'.join(str(v) for v in e.absolute_path) for e in validator.iter_errors(f))
        assert errors == sorted(f['expected_schema_error_paths']), (f['fixture_id'], errors)
        assert f['independent_review'] == {'status': 'pending'}
        assert len(json.dumps(f).encode()) <= profile['limits']['fixture_bytes']
        ordered_unique(f['chunks'], lambda c: c['chunk_id'])
        body = f['observations']['bundle']['body']
        ordered_unique(body['source_authorizations'], lambda a: a['chunk_id'])
        ordered_unique(body['aggregate_authorizations'], lambda a: a['aggregate_id'])
        for grant in body['aggregate_authorizations']:
            ordered_unique(grant['constituent_refs'])
        refs = sorted(c['record_hash'] for c in f['chunks'])
        sem = f['observations']['semantic']['body']
        assert sem['claim_digest'] == digest('CLAIM', f['candidate']['claim'])
        assert sem['support_set_digest'] == digest('SUPPORT', refs) and sem['support_refs'] == refs
        expected = {k: v for k, v in f['expected_output'].items() if k != 'material_errors'}
        data = host_input(f)
        actual = decide(data)
        assert actual == expected, f['fixture_id']+': Python mismatch'
        assert alternate == expected, f['fixture_id']+': Node mismatch'
        host = FrozenHost(data, profile).evaluate_and_release(data['candidate'])
        assert host['host_audit'] == expected, f['fixture_id']+': host mismatch'
        if expected['delivery']['outcome'] == 'Release':
            assert host['agent_payload'] == expected['released_payload']
        else:
            assert host['agent_payload']['chunks'] == [] and 'claim' not in host['agent_payload']
        if f['fixture_id'] == 'V2-ROLLBACK-VALID-OLD-PROOF':
            # Crypto proof is valid. Only removal of the independent freshness pin changes admission.
            relaxed = deepcopy(data)
            relaxed['anchors']['minimum_leaf_count'] = 1
            unpinned = FrozenHost(relaxed, profile).evaluate_and_release(relaxed['candidate'])
            assert unpinned['host_audit']['decision'] == 'Admit'
            assert actual['applied_rule'] == 'STATE_UNAVAILABLE'
        rows.append({'fixture_id': f['fixture_id'], 'schema_errors_expected': errors,
            'decision': actual['decision'], 'applied_rule': actual['applied_rule'],
            'python_match': True, 'node_match': True, 'local_host_match': True})
    files = ['scripts/materialize_provenance_broker_v2.py', 'scripts/validate_provenance_broker_v2.py',
        'scripts/materialize_provenance_broker.py', 'tests/provenance-broker/v3.1/test_extension_v2.py',
        'scripts/provenance_broker_decision.py', 'scripts/provenance_broker_decision.mjs',
        'scripts/provenance_broker_host.py', 'tests/provenance-broker/v3.1/extensions-v2/manifest.json']
    report = {'status': 'pass', 'profile_id': profile['profile_id'], 'independent_review': 'pending',
        'independent_authorship': False, 'scope': 'synthetic source bindings, frozen policy, local host delivery',
        'fixtures': rows, 'v1_material_preserved': True,
        'sha256': {rel: hashlib.sha256((ROOT/rel).read_bytes()).hexdigest() for rel in files}}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'PASS: {len(rows)} extension fixtures: schemas, signatures/source bindings, Python, Node, local host and payloads.')
    print('PASS: 28 original v1 materials and schema/profile hashes unchanged.')
    print('PENDING: independent review, reserved adversarial corpus, live services and full limit matrix.')


if __name__ == '__main__':
    main()
