"""Read-only material audit; NOT a broker decision implementation.

Validates schema, digests, signatures, retained MMR proofs, byte bindings,
snapshots and expected-payload safety. Does not produce expected decisions,
call a model, query live state or claim independent review.
"""
from pathlib import Path
import hashlib
import json

import blake3
import jsonschema
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'tests/provenance-broker/v3.1'
SCHEMAS = ROOT / 'schemas/provenance-broker'


def canonical(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(kind, v):
    raw = v if isinstance(v, bytes) else canonical(v)
    return hashlib.sha256(('ARKHE:BROKER:'+kind+':v1\0').encode('ascii')+raw).hexdigest()


def b3(raw):
    return blake3.blake3(raw).digest()


def load(path):
    def pairs(items):
        out = {}
        for k, v in items:
            if k in out:
                raise ValueError('duplicate JSON key: '+k)
            out[k] = v
        return out
    def bad(v):
        raise ValueError('non-integer number: '+v)
    v = json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=pairs,
                   parse_float=bad, parse_constant=bad)
    canonical(v)  # also rejects unpaired surrogates
    return v


def ordered_unique(items, key=lambda x: x):
    keys = [key(x) for x in items]
    assert keys == sorted(keys) and len(keys) == len(set(keys)), 'noncanonical list'


def signature(envelope, kind, anchors):
    assert envelope['key_id'] == anchors['key_id'], 'key id mismatch'
    msg = ('ARKHE:BROKER:SIGN:'+kind+':v1\0').encode()+canonical(envelope['body'])
    Ed25519PublicKey.from_public_bytes(bytes.fromhex(anchors['public_key_hex'])).verify(
        bytes.fromhex(envelope['signature_hex']), msg)


def audit(f, profile):
    actual_errors = set()
    p, obs, exp = f['policy'], f['observations'], f['expected_output']
    assert f['policy_digest'] == digest('POLICY', p)
    assert f['anchors']['public_key_hex'] == profile['signatures']['public_key_hex']
    assert f['anchors']['key_id'] == profile['signatures']['authority']
    assert p['profile_id'] == profile['profile_id']
    assert exp['applied_rule'] in profile['diagnostics']['rule_ids']
    assert f['independent_review']['status'] == 'pending'
    assert f['clock_ms'] <= exp['snapshot']['valid_until']
    for k in ['purposes', 'accepted_transforms', 'rejected_transforms', 'accepted_rules']:
        ordered_unique(p[k])
    ordered_unique(f['chunks'], lambda x: x['chunk_id'])
    ordered_unique(obs['transform_items'], lambda x: x['transformation_ref'])
    ordered_unique(obs['failures'], lambda x: (x['code'], x['ref']))
    ordered_unique(exp['flags'])
    ordered_unique(exp['reasons'], lambda x: (x['rule_id'], x['code']))
    for failure in obs['failures']:
        assert failure['code'] in profile['diagnostics']['failure_codes']
    assert all(r['code'] in profile['diagnostics']['reason_codes'] for r in exp['reasons'])
    assert all(x in profile['diagnostics']['flag_codes'] for x in exp['flags'])
    signature(obs['bundle'], 'BUNDLE', f['anchors'])
    signature(obs['semantic'], 'SEMANTIC', f['anchors'])
    body = obs['bundle']['body']
    assert body['authority'] == f['anchors']['key_id']
    assert body['subject'] == f['session']['principal']
    assert body['revisions'] in p['accepted_revision_combinations']
    assert body['observed_at'] <= f['clock_ms']
    assert body['effective_from'] < body['effective_to']
    assert f['clock_ms'] - body['observed_at'] <= p['max_state_age_ms']
    assert all(t >= body['observed_at'] for t in body['expires_at'].values())
    state_hash = b3(b'AKG:BROKER:STATE:v1\0'+canonical(body))
    assert state_hash.hex() == f['anchors']['state_record_hash']
    assert b3(b'\0'+state_hash).hex() == f['anchors']['state_root']
    assert f['anchors']['state_proof'] == {'leaf_count': 1, 'leaf_index': 0, 'steps': []}
    for c in f['chunks']:
        r = c['record']
        raw = bytes.fromhex(c['bytes_hex'])
        source = bytes.fromhex(c['source_bytes_hex'])
        representation = bytes.fromhex(c['representation_hex'])
        assert r['chunk_id'] == c['chunk_id']
        assert c['chunk_id'] in body['resources']
        assert len(raw) <= profile['limits']['chunk_bytes']
        assert len(source) <= profile['limits']['source_bytes']
        assert len(representation) <= profile['limits']['representation_bytes']
        chunk_matches = digest('CHUNK', raw) == r['chunk_digest']
        if not chunk_matches:
            actual_errors.add('CHUNK_DIGEST_MISMATCH')
        assert digest('SOURCE', source) == r['source_digest']
        assert digest('REPRESENTATION', representation) == r['text_position']['repr_digest']
        assert source == representation  # utf8-identity@1 fixture transform
        pos = r['text_position']
        start, end = pos['offset'], pos['offset']+pos['length']
        assert end <= len(representation) and end <= 2**64-1
        representation[:start].decode('utf-8')
        representation[start:end].decode('utf-8')
        if chunk_matches:
            assert raw == representation[start:end]
        rh = b3(b'AKG:BROKER:RECORD:v1\0'+canonical(r))
        assert rh.hex() == c['record_hash']
        proof = c['proof']
        # These material fixtures intentionally use the frozen native two-leaf shape.
        assert proof['leaf_count'] == 2 and proof['leaf_index'] in (0, 1)
        assert len(proof['steps']) == 1
        step = proof['steps'][0]
        assert step['kind'] == 'node'
        assert step['direction'] == ('right' if proof['leaf_index'] == 0 else 'left')
        leaf = b3(b'\0'+rh)
        sibling = bytes.fromhex(step['hash'])
        root = b3(b'\1'+leaf+sibling) if step['direction'] == 'right' else b3(b'\1'+sibling+leaf)
        if root.hex() != f['anchors']['root']:
            actual_errors.add('PROOF_INVALID')
    assert f['anchors']['leaf_count'] == 2
    sem = obs['semantic']['body']
    refs = sorted(c['record_hash'] for c in f['chunks'])
    assert sem['claim_digest'] == digest('CLAIM', f['candidate']['claim'])
    assert sem['support_set_digest'] == digest('SUPPORT', refs)
    assert sem['support_refs'] == refs
    assert sem['evaluator'] == p['accepted_evaluator']
    if obs['mechanism']['kind'] == 'Derived' and 'derivation_artifact' in f:
        m, a = obs['mechanism'], f['derivation_artifact']
        assert 'predicate_span_valid' not in m
        assert m['premise_refs'] == refs == a['premise_refs']
        assert m['derivation_artifact_ref'] == digest('DERIVATION', a)
        assert m['rule_id']+'@'+m['rule_version'] in p['accepted_rules']
        assert a['conclusion'] == a['premise_claim'] == f['candidate']['claim']
    elif obs['mechanism']['kind'] == 'Derived':
        assert obs['documental'] == 'Invalid', 'missing derivation artifact must not be treated as complete'
    for t in obs['transform_items']:
        ref = t['transformation_ref']
        expected = 'Rejected' if ref in p['rejected_transforms'] else 'Accepted' if ref in p['accepted_transforms'] else 'Unknown'
        assert t['verdict'] == expected
    snap = exp['snapshot']
    assert snap['evaluated_at'] == snap['temporal_guarantee']['validated_at'] == f['clock_ms']
    assert snap['valid_until'] == min(*body['expires_at'].values(), f['clock_ms']+p['max_decision_ttl_ms'])
    assert snap['revisions'] == body['revisions']
    assert snap['policy_digest'] == f['policy_digest']
    assert snap['anchor_set_digest'] == digest('ANCHORS', f['anchors'])
    assert snap['consistency']['observation_digest'] == digest('OBSERVATIONS', obs)
    assert snap['temporal_guarantee']['accepted_interval_ms'] == p['accepted_interval_ms']
    assert p['best_effort_permitted']
    hist = f['candidate']['query'].get('historical_req')
    if exp['decision'] == 'AdmitHistorical':
        assert hist and p['historical_permitted'] and body['historical_state'] == 'Active'
        assert body['effective_from'] <= hist['requested_instant'] < body['effective_to']
    payload = exp['released_payload']
    ordered_unique(payload['chunks'], lambda x: x['chunk_id'])
    assert sum(len(bytes.fromhex(c['bytes_hex'])) for c in payload['chunks']) <= profile['limits']['released_bytes']
    if exp['decision'] in ('Reject', 'Exclude'):
        assert payload['chunks'] == [] and payload['claim_status'] == 'Omitted'
        assert 'claim' not in payload and 'semantic' not in payload
    else:
        for released in payload['chunks']:
            c = next(c for c in f['chunks'] if c['chunk_id'] == released['chunk_id'])
            r = c['record']
            assert c['per_chunk'] == {'integrity': 'OK', 'access': 'Permitted', 'state': 'Current', 'transform': 'Accepted'}
            assert released == {'chunk_id': c['chunk_id'], 'bytes_hex': c['bytes_hex'],
                'chunk_digest': r['chunk_digest'], 'text_position': r['text_position'],
                'source_digest': r['source_digest'], 'evidence_ref': c['record_hash']}
        assert payload['chunks']
        if exp['decision'] == 'AdmitChunksOnly':
            assert 'claim' not in payload and 'semantic' not in payload
            assert payload['claim_status'] == 'Omitted'
            assert payload['restrictions'] == ['ANALYSIS_ONLY', 'NO_RELATION_SUPPORT']
            assert exp['flags'] == ['RELATION_OMITTED']
        else:
            assert payload['claim'] == f['candidate']['claim'] and payload['semantic'] == sem
            if f['candidate']['query']['purpose'] == 'Assertion':
                assert sem['outcome'] == 'Supported' and payload['claim_status'] == 'SupportedByEvaluation'
    d = f['delivery']
    if 'grant' in d:
        g = d['grant']['body']
        try:
            signature(d['grant'], 'GRANT', f['anchors'])
        except InvalidSignature:
            actual_errors.add('GRANT_SIGNATURE_INVALID')
        assert g['subject'] == f['session']['principal']
        assert g['resources'] == body['resources']
        assert g['purpose'] == f['candidate']['query']['purpose']
        assert g['operations'] == ['access_check'] and p['grants_permitted']
        assert g['conditions'] == []
    assert sorted(actual_errors) == exp['material_errors'], (actual_errors, exp['material_errors'])


def main():
    manifest = load(DATA/'manifest.json')
    for rel, sha in manifest['files'].items():
        path = ROOT/rel
        assert path.resolve().is_relative_to(ROOT.resolve())
        assert hashlib.sha256(path.read_bytes()).hexdigest() == sha, 'manifest: '+rel
    profile = load(SCHEMAS/'profile-v1.json')
    schema = load(SCHEMAS/'fixture-v1.schema.json')
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema)
    fixtures = sorted((DATA/'fixtures').glob('*.json'))
    assert len(fixtures) == manifest['fixture_count']
    for path in fixtures:
        assert path.stat().st_size <= profile['limits']['fixture_bytes']
        f = load(path)
        validator.validate(f)
        try:
            audit(f, profile)
        except Exception as exc:
            raise AssertionError(path.name+': '+str(exc)) from exc
    print(f'PASS: {len(fixtures)} schemas/materials; signatures, native-shape MMR proofs, bindings, snapshots and payloads audited.')
    print('NOT RUN: broker decision implementations, live delivery/integration, independent fixture review.')


if __name__ == '__main__':
    main()
