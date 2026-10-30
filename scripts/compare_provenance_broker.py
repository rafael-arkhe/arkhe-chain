"""Compare two pure decision implementations against authored fixture oracles.

Neither implementation receives expected_output or independent_review. This is
conformance on frozen host observations, not independent fixture review or live
authentication/state integration. Does not regenerate fixtures.
"""
from copy import deepcopy
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from provenance_broker_decision import decide, digest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/'tests/provenance-broker/v3.1'
HOST_FIELDS = ('candidate', 'session', 'policy', 'policy_digest', 'chunks', 'anchors',
               'observations', 'clock_ms', 'delivery', 'derivation_artifact', 'aggregation', 'projection')


def host_input(fixture):
    return deepcopy({k: fixture[k] for k in HOST_FIELDS if k in fixture})


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def node_decisions(inputs):
    run = subprocess.run(['node', str(ROOT/'scripts/provenance_broker_decision.mjs')],
        input=json.dumps(inputs, ensure_ascii=False).encode(), capture_output=True, check=True)
    return json.loads(run.stdout)


def semantic_hash(data):
    """Refresh a constructed host observation for pure-policy test cases only."""
    data['policy_digest'] = digest('POLICY', data['policy'])


def matrix_cases(base):
    cases = []
    def add(name, decision, rule, change, delivered=None):
        data = deepcopy(base)
        change(data)
        semantic_hash(data)
        cases.append((name, data, decision, rule, delivered))
    bundle = lambda d: d['observations']['bundle']['body']
    add('empty-principal', 'Reject', 'REQUEST_INVALID', lambda d: d['session'].update(principal=''))
    add('no-chunks', 'Reject', 'REQUEST_INVALID', lambda d: d.update(chunks=[]))
    add('purpose-uncovered', 'Exclude', 'POLICY_UNRESOLVED', lambda d: d['policy'].update(purposes=['Analysis']))
    add('best-effort-denied', 'Exclude', 'POLICY_UNRESOLVED', lambda d: d['policy'].update(best_effort_permitted=False))
    add('access-denied', 'Reject', 'ACCESS_DENIED', lambda d: bundle(d).update(access='Denied'))
    add('access-unknown', 'Exclude', 'ACCESS_UNKNOWN', lambda d: bundle(d).update(access='Unknown'))
    add('wrong-tenant', 'Reject', 'ACCESS_DENIED', lambda d: d['session'].update(tenant='other'))
    add('scope-denied', 'Reject', 'ACCESS_DENIED', lambda d: d['session'].update(scopes=[]))
    add('integrity-unknown', 'Exclude', 'INTEGRITY_UNKNOWN', lambda d: d['observations'].update(integrity='Unknown'))
    add('revoked', 'Reject', 'STATE_DISALLOWED', lambda d: bundle(d).update(state='Revoked'))
    add('superseded', 'Reject', 'STATE_DISALLOWED', lambda d: bundle(d).update(state='Superseded'))
    add('unknown-state', 'Exclude', 'STATE_UNAVAILABLE', lambda d: bundle(d).update(state='Unknown'))
    add('state-age-expired', 'Exclude', 'STATE_UNAVAILABLE', lambda d: bundle(d).update(observed_at=d['clock_ms']-1001))
    add('state-age-boundary-accepted', 'Admit', 'RELEASE_CURRENT', lambda d: bundle(d).update(observed_at=d['clock_ms']-1000))
    add('future-observation', 'Exclude', 'STATE_UNAVAILABLE', lambda d: bundle(d).update(observed_at=d['clock_ms']+1))
    add('document-invalid', 'Reject', 'DOCUMENT_INVALID', lambda d: d['observations'].update(documental='Invalid'))
    add('document-not-evaluated', 'Reject', 'DOCUMENT_INVALID', lambda d: d['observations'].update(documental='NotEvaluated'))
    add('document-incomplete-assertion', 'Reject', 'DOCUMENT_INCOMPLETE', lambda d: d['observations'].update(documental='Incomplete'))
    for outcome in ('Partial', 'Contradicted', 'Indeterminate', 'NotEvaluated'):
        add('assertion-'+outcome, 'Reject', 'ASSERTION_UNSUPPORTED', lambda d, o=outcome: d['observations']['semantic']['body'].update(outcome=o))
    add('semantic-wrong-claim', 'Reject', 'ASSERTION_UNSUPPORTED', lambda d: d['observations']['semantic']['body'].update(claim_digest='00'*32))
    add('semantic-evaluator-unaccepted', 'Reject', 'ASSERTION_UNSUPPORTED', lambda d: d['policy'].update(accepted_evaluator='other'))
    def analysis_new_claim(d):
        d['candidate']['query']['purpose'] = 'Analysis'
        d['candidate']['claim']['object'] = 'database:other'
    add('analysis-changed-claim', 'Admit', 'RELEASE_CURRENT', analysis_new_claim)
    add('window-boundary', 'Admit', 'RELEASE_CURRENT', lambda d: d['delivery'].update(attempted_at=d['clock_ms']+250), ('Reevaluate', 'VALIDATION_WINDOW_EXPIRED'))
    add('expiry-boundary', 'Admit', 'RELEASE_CURRENT', lambda d: d['delivery'].update(attempted_at=d['clock_ms']+800), ('Reevaluate', 'SNAPSHOT_EXPIRED'))
    add('delivery-before-validation', 'Admit', 'RELEASE_CURRENT', lambda d: d['delivery'].update(attempted_at=d['clock_ms']-1), ('Reevaluate', 'VALIDATION_WINDOW_EXPIRED'))
    add('other-source-unavailable', 'Admit', 'RELEASE_CURRENT', lambda d: d['delivery'].update(other_sources_available=False), ('Blocked', 'SOURCE_UNAVAILABLE'))
    # u64-safe serialization and arithmetic beyond Number.MAX_SAFE_INTEGER.
    def large_clock(d):
        delta = 2**53
        d['clock_ms'] += delta
        d['delivery']['attempted_at'] += delta
        b = bundle(d)
        for k in ('observed_at', 'effective_from', 'effective_to'):
            b[k] += delta
        b['expires_at'] = {k: v+delta for k, v in b['expires_at'].items()}
    add('u64-above-js-safe-integer', 'Admit', 'RELEASE_CURRENT', large_clock, ('Release', 'VALIDATION_WINDOW'))
    return cases


def check_fixture(path):
    f = read(path)
    data = host_input(f)
    oracle = {k: v for k, v in f['expected_output'].items() if k != 'material_errors'}
    return f['fixture_id'], data, oracle


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path)
    parser.add_argument('--local-tests', action='store_true')
    args = parser.parse_args()
    fixtures = [check_fixture(p) for p in sorted((DATA/'fixtures').glob('*.json'))]
    node = node_decisions([d for _, d, _ in fixtures])
    rows = []
    for (fid, data, oracle), alternate in zip(fixtures, node, strict=True):
        actual = decide(data)
        if actual != oracle or alternate != oracle:
            raise AssertionError(f'{fid}: Python={actual == oracle}; Node={alternate == oracle}')
        rows.append({'fixture_id': fid, 'match': True, 'decision': actual['decision'],
                     'rule': actual['applied_rule'], 'delivery': actual['delivery']})
    base = next(d for fid, d, _ in fixtures if fid == 'P-02')
    matrix = matrix_cases(base)
    alternate_cases = node_decisions([d for _, d, _, _, _ in matrix])
    tests = []
    for (name, data, decision, rule, delivery), alternate in zip(matrix, alternate_cases, strict=True):
        actual = decide(data)
        if actual != alternate or actual['decision'] != decision or actual['applied_rule'] != rule:
            raise AssertionError('matrix: '+name)
        if delivery and actual['delivery'] != {'outcome': delivery[0], 'code': delivery[1]}:
            raise AssertionError('delivery: '+name)
        if decision in ('Reject', 'Exclude'):
            assert actual['released_payload']['chunks'] == []
            assert 'claim' not in actual['released_payload']
        if name == 'analysis-changed-claim':
            assert 'semantic' not in actual['released_payload']
        tests.append({'case': name, 'match': True})
    test_run = None
    if args.local_tests:
        command = [sys.executable, '-m', 'unittest', 'discover', '-s', str(DATA), '-p', 'test_*.py', '-v']
        run = subprocess.run(command, capture_output=True, text=True, check=True)
        test_run = {'command': command, 'exit_code': run.returncode, 'output': run.stdout+run.stderr}
    source_files = ['scripts/provenance_broker_decision.py', 'scripts/provenance_broker_decision.mjs',
                    'scripts/compare_provenance_broker.py', 'schemas/provenance-broker/profile-v1.json',
                    'scripts/provenance_broker_host.py',
                    'scripts/validate_provenance_broker.py', 'scripts/materialize_provenance_broker.py',
                    'tests/provenance-broker/v3.1/test_decision_integration.py',
                    'tests/provenance-broker/v3.1/test_material_audit.py',
                    'tests/provenance-broker/v3.1/manifest.json']
    for rel in ['tests/provenance-broker/v3.1/test_extension_v2.py',
                'tests/provenance-broker/v3.1/extensions-v2/manifest.json',
                'schemas/provenance-broker/profile-v2.json', 'schemas/provenance-broker/fixture-v2.schema.json']:
        if (ROOT/rel).is_file():
            source_files.append(rel)
    report = {'status': 'pass', 'scope': 'pure policy over frozen host observations; not live source verification',
        'python': sys.version.split()[0],
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'independent_authorship': False, 'independent_fixture_review': 'pending',
        'fixtures': rows, 'policy_boundary_cases': tests,
        'local_tests': test_run,
        'sha256': {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in source_files}}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'PASS: {len(rows)} material fixtures x Python/Node; full payload/snapshot/delivery match authored oracles.')
    print(f'PASS: {len(tests)} constructed policy/boundary cases; independent algorithms agree.')
    if test_run:
        print('PASS: local host integration and material-auditor mutation tests (see retained test output).')
    print('PENDING: independent authorship/review, live auth/state/delivery integration, complete material matrix.')


if __name__ == '__main__':
    main()
