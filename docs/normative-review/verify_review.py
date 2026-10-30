#!/usr/bin/env python3
"""Verify a documentary review and mathematical counterexamples, not AKG conformance."""
import argparse
import hashlib
import json
from pathlib import Path

EXPECTED_SOURCE_SHA256 = 'e2ba86120a90cbe151bafff8ec112487c951d97fdba5db6d4e0615f33458c852'
EXPECTED_SOURCE_LINES = 19221
EXPECTED_SOURCE_BYTES = 714416
HERE = Path(__file__).resolve().parent

def load(name):
    return json.loads((HERE / name).read_text(encoding='utf-8'))

def run(source_path):
    checks = []
    def check(name, value, detail):
        checks.append({'check': name, 'passed': bool(value), 'detail': detail})
    data = source_path.read_bytes()
    text = data.decode('utf-8')
    lines = text.splitlines()
    digest = hashlib.sha256(data).hexdigest()
    check('original_source_identity', digest == EXPECTED_SOURCE_SHA256 and len(data) == EXPECTED_SOURCE_BYTES and len(lines) == EXPECTED_SOURCE_LINES,
          {'sha256': digest, 'bytes': len(data), 'lines': len(lines)})
    if digest != EXPECTED_SOURCE_SHA256:
        return {'status': 'LOCAL_DOCUMENTARY_CHECK_FAILED', 'protocol_freeze': 'NOT_FROZEN', 'checks': checks}
    index = load('source-index.json')
    coverage = [0] * len(lines)
    for segment in index['segments']:
        for number in range(segment['start'], segment['end'] + 1):
            if not 1 <= number <= len(lines):
                raise ValueError('Invalid segment boundary')
            coverage[number - 1] += 1
    check('all_lines_classified_once', set(coverage) == {1}, {'segments': len(index['segments']), 'classified_lines': len(coverage)})
    rules_doc = load('normative-rules.json')
    facts_doc = load('audit-findings.json')
    tasks_doc = load('implementation-tasks.json')
    facts = facts_doc['facts']
    rules = rules_doc['rules']
    tasks = tasks_doc['tasks']
    spans = [s for item in rules + facts for s in item['source_spans']]
    check('all_fact_and_rule_references_in_range', all(1 <= s['start'] <= s['end'] <= len(lines) for s in spans), {'span_count': len(spans)})
    check('all_headings_resolve_to_source', all(lines[h['line'] - 1] == h['heading'] for h in index['headings']), {'headings': len(index['headings'])})
    check('factual_records_do_not_encode_policy_severity', all('severity' not in f and 'disposition' not in f for f in facts), {'facts': len(facts), 'triage_is_editorial': True})
    ids = {f['id'] for f in facts}
    tids = {t['id'] for t in tasks}
    check('task_ids_and_findings_resolve', len(ids) == len(facts) and len(tids) == len(tasks) and all(set(t['addresses']) <= ids and set(t['depends_on']) <= tids for t in tasks), {'tasks': len(tasks), 'findings': len(facts)})
    remaining = {t['id']: set(t['depends_on']) for t in tasks}
    order = []
    while remaining:
        ready = sorted(t for t, dependencies in remaining.items() if not dependencies)
        if not ready:
            break
        order.extend(ready)
        for t in ready:
            del remaining[t]
        for dependencies in remaining.values():
            dependencies.difference_update(ready)
    check('task_dependency_graph_acyclic', not remaining, {'one_topological_order': order})
    registry = load('domain-registry.json')
    active_domains = registry['domains']
    expected_lengths = [14, 14, 14, 15, 11, 15, 18, 18, 18]
    valid = len(active_domains) == len(expected_lengths)
    for d, expected in zip(active_domains, expected_lengths):
        encoded = bytes.fromhex(d['hex'])
        label = d['literal']
        valid &= label.endswith('\\0') and encoded == label[:-2].encode('ascii') + b'\x00'
        valid &= len(encoded) == d['length'] == expected
    check('domain_literals_hex_and_lengths', valid, {'domains': len(active_domains), 'lengths': [d['length'] for d in active_domains]})
    check('no_active_domain_policy', not any('POLICY' in d['literal'] for d in active_domains), {'deferred': registry['deferred']})
    # Concrete CBOR keys: positive integer 24 = 18 18; negative integer -1 = 20.
    # Both are valid encodings; bytewise order and length-first order differ.
    keys = [bytes.fromhex('1818'), bytes.fromhex('20')]
    bytewise = sorted(keys)
    length_first = sorted(keys, key=lambda x: (len(x), x))
    check('cbor_ordering_rules_are_distinct', bytewise != length_first,
          {'keys': {'24': '1818', '-1': '20'}, 'bytewise': [x.hex() for x in bytewise], 'length_first': [x.hex() for x in length_first], 'not_an_akg_vector': True})
    # State = (x,z). C enables a branch of B that is invisible at the base.
    A = lambda s: (s[0] + 1, s[1])
    B = lambda s: (s[0] * 2 if s[1] else s[0], s[1])
    C = lambda s: (s[0], 1)
    base = (0, 0)
    after_c = C(base)
    check('base_agreement_not_universal_commutation', B(A(base)) == A(B(base)) and B(A(after_c)) != A(B(after_c)),
          {'base_AB': B(A(base)), 'base_BA': A(B(base)), 'prefix_C_AB': B(A(after_c)), 'prefix_C_BA': A(B(after_c)), 'scope': 'Mathematical counterexample, not a protocol simulation.'})
    # Equal immediate visible y; hidden x differs and is later exposed.
    hidden_ab, hidden_ba = (2, 0), (1, 0)
    observation = lambda s: s[1]
    continuation = lambda s: (s[0], s[0])
    check('immediate_observation_not_congruence', observation(hidden_ab) == observation(hidden_ba) and observation(continuation(hidden_ab)) != observation(continuation(hidden_ba)),
          {'immediate': [observation(hidden_ab), observation(hidden_ba)], 'after_continuation': [observation(continuation(hidden_ab)), observation(continuation(hidden_ba))]})
    same_ref = ('example-policy', 1)
    policy_a, policy_b = b'allow=false', b'allow=true'
    check('same_policy_ref_does_not_fix_artifact_bytes', policy_a != policy_b and hashlib.sha256(policy_a).digest() != hashlib.sha256(policy_b).digest(),
          {'same_ref': same_ref, 'hash_used_only_for_illustration': 'SHA-256; not an AKG PolicyDigest computation'})
    manifest = load('manifest.json')
    file_ok = True
    for entry in manifest['files']:
        rel = Path(entry['path'])
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('Unsafe manifest path')
        content = (HERE / rel).read_bytes()
        file_ok &= hashlib.sha256(content).hexdigest() == entry['sha256'] and len(content) == entry['bytes']
    check('review_file_integrity', file_ok, {'files': len(manifest['files']), 'manifest_is_unsigned': True})
    check('candidate_does_not_claim_ratification', rules_doc['status'] == 'CANDIDATE_NOT_FROZEN' and rules_doc['ratified'] is False, {'rules': len(rules)})
    return {'status': 'LOCAL_DOCUMENTARY_CHECKS_PASS' if all(c['passed'] for c in checks) else 'LOCAL_DOCUMENTARY_CHECK_FAILED',
            'source_sha256': digest, 'protocol_freeze': 'NOT_FROZEN',
            'finding_propagation_audit': 'NOT_RUN', 'policy_digest_propagation_audit': 'BLOCKED',
            'b1_conformance': 'NOT_RUN', 'b2_parity': 'NOT_RUN',
            'limits': 'Checks cover documentary integrity, references and explicit counterexamples. They do not implement AKG CBOR, BLAKE3 object identities, signature profiles, semantic propagation audits or native enforcement.',
            'checks': checks}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path, help='Original unmodified attachment')
    parser.add_argument('--output', type=Path, default=HERE / 'verification-results.json')
    args = parser.parse_args()
    result = run(args.source)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'passed_checks': sum(c['passed'] for c in result['checks']), 'checks': len(result['checks']), 'protocol_freeze': result['protocol_freeze']}, ensure_ascii=False))
    return 0 if result['status'] == 'LOCAL_DOCUMENTARY_CHECKS_PASS' else 1

if __name__ == '__main__':
    raise SystemExit(main())
