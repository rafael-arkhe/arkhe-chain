"""Pure pilot policy over host-retained observations (not an ingestion API).

No expected_output, live service, clock or model is read. Cryptographic source
verification belongs to the host adapter before this function. No production
authority is created by passing a fixture to this module.
"""
from copy import deepcopy
import hashlib
import json
import sys

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(kind, value):
    return hashlib.sha256(('ARKHE:BROKER:'+kind+':v1\0').encode()+canonical(value)).hexdigest()


def safe_chunks(data):
    return [c for c in sorted(data['chunks'], key=lambda c: c['chunk_id'])
            if c['per_chunk'] == {'integrity': 'OK', 'access': 'Permitted',
                                  'state': 'Current', 'transform': 'Accepted'}]


def semantic_binding(data):
    sem = data['observations']['semantic']['body']
    refs = sorted(c['record_hash'] for c in data['chunks'])
    return (sem['claim_digest'] == digest('CLAIM', data['candidate']['claim'])
        and sem['support_refs'] == refs and sem['support_set_digest'] == digest('SUPPORT', refs))


def state_verdict(data):
    b, p, now = data['observations']['bundle']['body'], data['policy'], data['clock_ms']
    historical = data['candidate']['query'].get('historical_req')
    if (not historical and data['policy']['profile_id'] == 'arkhe-broker-local-v2'
            and data['anchors']['leaf_count'] < data['anchors']['minimum_leaf_count']):
        return 'Stale'
    if historical and (not p['historical_permitted'] or b['state'] == 'HistoricalDenied'):
        return 'HistoricalDenied'
    if b['observed_at'] > now or now-b['observed_at'] > p['max_state_age_ms'] or now >= b['expires_at']['state']:
        return 'Stale'
    if historical:
        instant = historical['requested_instant']
        if (b['state'] == 'Historical' and b['historical_state'] == 'Active'
                and b['effective_from'] <= instant < b['effective_to']):
            return 'Historical'
        return 'Unknown'
    return b['state'] if b['state'] in ('Current', 'Revoked', 'Superseded', 'Stale', 'Unknown') else 'Unknown'


def choose(data):
    p, obs, chunks = data['policy'], data['observations'], data['chunks']
    query, session = data['candidate']['query'], data['session']
    b = obs['bundle']['body']
    if (not session['principal'] or not chunks or len(chunks) > 32
            or len({c['chunk_id'] for c in chunks}) != len(chunks)
            or len(data['candidate']['claim']['qualifiers']) > 16
            or any(len(bytes.fromhex(c['bytes_hex'])) > 32768 for c in chunks)
            or sum(len(bytes.fromhex(c['bytes_hex'])) for c in chunks) > 65536):
        return 'Reject', 'REQUEST_INVALID'
    if (p['profile_id'] not in ('arkhe-broker-local-v1', 'arkhe-broker-local-v2') or query['purpose'] not in p['purposes']
            or not p['best_effort_permitted'] or b['revisions'] not in p['accepted_revision_combinations']
            or digest('POLICY', p) != data['policy_digest']):
        return 'Exclude', 'POLICY_UNRESOLVED'
    aggregate = data.get('aggregation')
    aggregate_access = None
    if aggregate:
        authorities = b.get('source_authorizations', [])
        grants = b.get('aggregate_authorizations', [])
        grant = next((g for g in grants if g['aggregate_id'] == aggregate['aggregate_id']), {})
        source_map = {a['chunk_id']: a for a in authorities}
        refs = sorted(c['record_hash'] for c in chunks)
        binding = (p['profile_id'] == 'arkhe-broker-local-v2'
            and len(grants) == 1
            and len(source_map) == len(authorities) == len(chunks)
            and aggregate['constituent_refs'] == refs
            and grant.get('aggregate_id') == aggregate['aggregate_id']
            and grant.get('principal') == session['principal']
            and grant.get('constituent_refs') == refs)
        for c in chunks:
            a = source_map.get(c['chunk_id'], {})
            binding = binding and a.get('tenant') == c['record']['tenant'] and a.get('scope') == c['record']['scope']
        cross = any(c['record']['tenant'] != session['tenant'] for c in chunks)
        if (not binding or (cross and not p.get('cross_tenant_aggregation_permitted'))
                or grant.get('verdict') == 'Denied'
                or any(a['verdict'] == 'Denied' for a in authorities)):
            aggregate_access = 'Denied'
        elif grant.get('verdict') != 'Permitted' or any(a['verdict'] != 'Permitted' for a in authorities):
            aggregate_access = 'Unknown'
        else:
            aggregate_access = 'Permitted'
    if (b['access'] == 'Denied' or b['subject'] != session['principal'] or aggregate_access == 'Denied'
            or any(c['per_chunk']['access'] == 'Denied' or (not aggregate and
                   (c['record']['tenant'] != session['tenant'] or c['record']['scope'] not in session['scopes'])) for c in chunks)):
        return 'Reject', 'ACCESS_DENIED'
    if b['access'] == 'Unknown' or aggregate_access == 'Unknown' or any(c['per_chunk']['access'] == 'Unknown' for c in chunks):
        return 'Exclude', 'ACCESS_UNKNOWN'
    if obs['integrity'] == 'Invalid' or any(c['per_chunk']['integrity'] == 'Invalid' for c in chunks):
        return 'Reject', 'INTEGRITY_INVALID'
    if obs['integrity'] != 'OK' or any(c['per_chunk']['integrity'] != 'OK' for c in chunks):
        return 'Exclude', 'INTEGRITY_UNKNOWN'
    transforms = {t['transformation_ref']: t['verdict'] for t in obs['transform_items']}
    needed = {c['record']['transformation_ref'] for c in chunks}
    if (needed.intersection(p['rejected_transforms'])
            or any(t['verdict'] == 'Rejected' for t in obs['transform_items'])):
        return 'Reject', 'TRANSFORM_REJECTED'
    if any(ref not in p['accepted_transforms'] or transforms.get(ref) != 'Accepted' for ref in needed):
        return 'Exclude', 'TRANSFORM_UNKNOWN'
    state = state_verdict(data)
    if state == 'HistoricalDenied':
        return 'Reject', 'HISTORICAL_DENIED'
    if state in ('Unknown', 'Stale') or data['clock_ms'] >= min(b['expires_at'].values()):
        return 'Exclude', 'STATE_UNAVAILABLE'
    if state in ('Revoked', 'Superseded'):
        return 'Reject', 'STATE_DISALLOWED'
    doc, mechanism = obs['documental'], obs['mechanism']
    if mechanism['kind'] == 'Derived':
        artifact = data.get('derivation_artifact')
        if (not artifact or mechanism.get('rule_id', '')+'@'+mechanism.get('rule_version', '') not in p['accepted_rules']
                or not mechanism.get('derivation_binding_valid')
                or digest('DERIVATION', artifact) != mechanism.get('derivation_artifact_ref')
                or artifact['conclusion'] != artifact['premise_claim']
                or artifact['conclusion'] != data['candidate']['claim']
                or mechanism['premise_refs'] != sorted(c['record_hash'] for c in chunks)
                or any(c['per_chunk']['state'] != 'Current' for c in chunks)):
            doc = 'Invalid'
    elif doc == 'Complete' and not mechanism.get('predicate_span_valid'):
        doc = 'Invalid'
    if doc in ('Invalid', 'NotEvaluated'):
        return 'Reject', 'DOCUMENT_INVALID'
    if doc == 'Complete' and len(safe_chunks(data)) != len(chunks):
        doc = 'Incomplete'
    if query['purpose'] == 'Analysis' and state == 'Current' and doc == 'Incomplete' and safe_chunks(data):
        return 'AdmitChunksOnly', 'ANALYSIS_CHUNKS_ONLY'
    if doc == 'Incomplete':
        return 'Reject', 'DOCUMENT_INCOMPLETE'
    sem = obs['semantic']['body']
    semantic_accepted = (sem['outcome'] == 'Supported' and sem['method'] == 'Human'
        and sem['evaluator'] == p['accepted_evaluator'] and sem['evaluator_version'] == '1'
        and semantic_binding(data))
    if query['purpose'] == 'Assertion' and not semantic_accepted:
        return 'Reject', 'ASSERTION_UNSUPPORTED'
    if doc == 'Complete' and state == 'Historical':
        return 'AdmitHistorical', 'RELEASE_HISTORICAL'
    if doc == 'Complete' and state == 'Current':
        return 'Admit', 'RELEASE_CURRENT'
    return 'Exclude', 'DEFAULT_EXCLUDE'


def grant_verdict(data):
    envelope = data['delivery'].get('grant')
    if envelope is None:
        return 'Absent'
    grant, anchors = envelope['body'], data['anchors']
    try:
        if envelope['key_id'] != anchors['key_id']:
            return 'Invalid'
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(anchors['public_key_hex'])).verify(
            bytes.fromhex(envelope['signature_hex']), b'ARKHE:BROKER:SIGN:GRANT:v1\0'+canonical(grant))
    except (InvalidSignature, ValueError):
        return 'Invalid'
    if (grant['contract_id'] != 'fixture-lease-v1' or grant['issuer'] != anchors['key_id']
            or grant['subject'] != data['session']['principal']
            or grant['resources'] != data['observations']['bundle']['body']['resources']
            or grant['operations'] != ['access_check'] or grant['conditions']
            or grant['purpose'] != data['candidate']['query']['purpose']
            or grant['revision'] != data['observations']['bundle']['body']['revisions']['authorization']):
        return 'Invalid'
    now = data['delivery']['attempted_at']
    if not grant['not_before'] <= now < grant['valid_until']:
        return 'Expired'
    return 'Valid' if data['policy']['grants_permitted'] else 'Unaccepted'


def delivery_verdict(data, decision, snapshot):
    result = lambda outcome, code: {'outcome': outcome, 'code': code}
    if decision in ('Reject', 'Exclude'):
        return result('Blocked', 'DECISION_DENIED')
    grant = grant_verdict(data)
    if grant == 'Invalid':
        return result('Blocked', 'GRANT_INVALID')
    delivery, now = data['delivery'], data['delivery']['attempted_at']
    if now >= snapshot['valid_until']:
        return result('Reevaluate', 'SNAPSHOT_EXPIRED')
    if not delivery['other_sources_available']:
        return result('Blocked', 'SOURCE_UNAVAILABLE')
    # The fixture lease covers only authorization; other revisions always match.
    names = ['state', 'policy', 'anchor_set'] + ([] if grant == 'Valid' else ['authorization'])
    if any(delivery['observed_revisions'][k] != snapshot['revisions'][k] for k in names):
        return result('Reevaluate', 'REVISION_CHANGED')
    validated = snapshot['temporal_guarantee']['validated_at']
    if now < validated or now >= validated+snapshot['temporal_guarantee']['accepted_interval_ms']:
        return result('Reevaluate', 'VALIDATION_WINDOW_EXPIRED')
    if grant == 'Valid':
        return result('Release', 'ACCESS_GRANT')
    if not delivery['authorization_source_available']:
        return result('Blocked', 'SOURCE_UNAVAILABLE')
    return result('Release', 'VALIDATION_WINDOW')


def decide(data):
    """Input is host-retained fixture fields only; returns no external effects."""
    decision, rule = choose(data)
    query, policy = data['candidate']['query'], data['policy']
    body = data['observations']['bundle']['body']
    temporal = {'mode': 'Current'}
    if 'historical_req' in query:
        temporal = {'mode': 'Historical', **query['historical_req']}
    payload = {'chunks': [], 'claim_status': 'Omitted', 'temporal_context': temporal, 'restrictions': []}
    flags = []
    if decision not in ('Reject', 'Exclude'):
        for c in safe_chunks(data):
            r = c['record']
            payload['chunks'].append({'chunk_id': c['chunk_id'], 'bytes_hex': c['bytes_hex'],
                'chunk_digest': r['chunk_digest'], 'text_position': r['text_position'],
                'source_digest': r['source_digest'], 'evidence_ref': c['record_hash']})
        if decision == 'AdmitChunksOnly':
            flags = ['RELATION_OMITTED']
            payload['restrictions'] = ['ANALYSIS_ONLY', 'NO_RELATION_SUPPORT']
        else:
            payload.update(claim=data['candidate']['claim'],
                claim_status='ForAnalysis' if query['purpose'] == 'Analysis' else 'SupportedByEvaluation')
            if semantic_binding(data):
                payload['semantic'] = data['observations']['semantic']['body']
    snapshot = {'evaluated_at': data['clock_ms'],
        'valid_until': min(*body['expires_at'].values(), data['clock_ms']+policy['max_decision_ttl_ms']),
        'revisions': body['revisions'], 'policy_digest': data['policy_digest'],
        'anchor_set_digest': digest('ANCHORS', data['anchors']),
        'consistency': {'mode': 'BestEffort', 'profile_id': 'frozen-observations-v1',
                        'observation_digest': digest('OBSERVATIONS', data['observations'])},
        'temporal_guarantee': {'kind': 'ValidatedAt', 'validated_at': data['clock_ms'],
                               'accepted_interval_ms': policy['accepted_interval_ms']}}
    return deepcopy({'decision': decision, 'applied_rule': rule, 'flags': flags,
        'reasons': [{'rule_id': rule, 'code': 'RULE_MATCH'}], 'released_payload': payload,
        'snapshot': snapshot, 'delivery': delivery_verdict(data, decision, snapshot)})


if __name__ == '__main__':
    # Local trusted-input conformance CLI, not an exposed service.
    json.dump(decide(json.load(sys.stdin)), sys.stdout, ensure_ascii=False, allow_nan=False)
