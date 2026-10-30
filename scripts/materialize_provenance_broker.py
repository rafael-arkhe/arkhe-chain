"""Explicit fixture authoring tool. Never run from conformance checks.

Synthetic, public test keys only. Expected decisions below are authored cases,
not outputs of a broker implementation. Independent review remains pending.
Requires blake3, cryptography; validation additionally requires jsonschema.
"""
from pathlib import Path
import copy
import hashlib
import json

import blake3
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/provenance-broker/v3.1'
SCHEMA = ROOT / 'schemas/provenance-broker'
NOW = 1793232000000
U64 = 2**64 - 1
MMR = 'bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(kind, value):
    raw = value if isinstance(value, bytes) else canonical(value)
    prefix = ('ARKHE:BROKER:' + kind + ':v1\0').encode('ascii')
    return hashlib.sha256(prefix + raw).hexdigest()


def record_hash(record):
    return blake3.blake3(b'AKG:BROKER:RECORD:v1\0' + canonical(record)).digest()


def b3(raw):
    return blake3.blake3(raw).digest()


def key():
    # Public deterministic fixture seed; MUST NOT be used outside these fixtures.
    return Ed25519PrivateKey.from_private_bytes(bytes(range(32)))


def signed(kind, body):
    msg = ('ARKHE:BROKER:SIGN:' + kind + ':v1\0').encode() + canonical(body)
    return {'key_id': 'fixture-authority-1', 'body': body,
            'signature_hex': key().sign(msg).hex()}


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def obj(props, optional=()):
    return {'type': 'object', 'additionalProperties': False, 'properties': props,
            'required': [k for k in props if k not in optional]}


def arr(item, maximum=32):
    return {'type': 'array', 'items': item, 'maxItems': maximum}


def enum(*values):
    return {'enum': list(values)}


def make_schema():
    sid = {'type': 'string', 'pattern': '^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,127}$'}
    sha = {'type': 'string', 'pattern': '^[0-9a-f]{64}$'}
    uint = {'type': 'integer', 'minimum': 0, 'maximum': U64}
    raw = {'type': 'string', 'pattern': '^([0-9a-f]{2})*$', 'maxLength': 65536}
    ref = lambda name: {'$ref': '#/$defs/' + name}
    defs = {}
    defs['position'] = obj({'repr_digest': sha, 'offset': uint, 'length': uint})
    defs['claim'] = obj({'subject': sid, 'predicate': sid, 'object': sid,
                         'polarity': enum('Positive', 'Negative'),
                         'modality': enum('Asserted', 'Possible', 'Conditional'),
                         'qualifiers': arr(obj({'kind': sid, 'value': sid}), 16)})
    defs['candidate'] = obj({'candidate_id': sid, 'claim': ref('claim'), 'query': obj({
        'purpose': enum('Assertion', 'Analysis'),
        'historical_req': obj({'requested_instant': uint})}, ('historical_req',))})
    defs['session'] = obj({'principal': sid, 'session_id': sid, 'tenant': sid, 'scopes': arr(sid)})
    defs['record'] = obj({'chunk_id': sid, 'chunk_digest': sha, 'source_digest': sha,
        'text_position': ref('position'), 'transformation_ref': sid, 'tenant': sid, 'scope': sid})
    defs['step'] = obj({'kind': enum('node', 'bag'), 'direction': enum('left', 'right'), 'hash': sha})
    blob = {'type': 'string', 'pattern': '^([0-9a-f]{2})*$', 'maxLength': 2097152}
    defs['chunk'] = obj({'chunk_id': sid, 'bytes_hex': raw, 'source_bytes_hex': blob,
        'representation_hex': blob, 'record': ref('record'), 'record_hash': sha,
        'proof': obj({'profile_digest': {'const': MMR}, 'leaf_count': uint,
                      'leaf_index': uint, 'steps': arr(ref('step'), 64)}),
        'per_chunk': obj({'integrity': enum('OK', 'Invalid', 'Unknown'),
                         'access': enum('Permitted', 'Denied', 'Unknown'),
                         'state': enum('Current', 'Revoked', 'Superseded', 'Unknown', 'Stale'),
                         'transform': enum('Accepted', 'Rejected', 'Unknown')})})
    defs['transform'] = obj({'transformation_ref': sid, 'verdict': enum('Accepted', 'Rejected', 'Unknown')})
    defs['policy'] = obj({'policy_id': sid, 'policy_version': sid, 'profile_id': sid,
        'purposes': arr(enum('Analysis', 'Assertion'), 2), 'best_effort_permitted': {'type': 'boolean'},
        'historical_permitted': {'type': 'boolean'}, 'grants_permitted': {'type': 'boolean'},
        'max_state_age_ms': uint, 'max_decision_ttl_ms': uint, 'accepted_interval_ms': uint,
        'accepted_evaluator': sid, 'accepted_transforms': arr(sid), 'rejected_transforms': arr(sid),
        'accepted_rules': arr(sid),
        'accepted_revision_combinations': arr(obj({'authorization': sid, 'state': sid, 'policy': sid, 'anchor_set': sid}))})
    defs['revisions'] = obj({k: sid for k in ('authorization', 'state', 'policy', 'anchor_set')})
    defs['expirations'] = obj({k: uint for k in ('authorization', 'state', 'policy', 'anchor_set')})
    defs['bundle'] = obj({'authority': sid, 'subject': sid, 'resources': arr(sid),
        'revisions': ref('revisions'), 'observed_at': uint, 'expires_at': ref('expirations'),
        'access': enum('Permitted', 'Denied', 'Unknown'),
        'state': enum('Current', 'Historical', 'HistoricalDenied', 'Stale', 'Revoked', 'Superseded', 'Unknown'),
        'effective_from': uint, 'effective_to': uint, 'historical_state': enum('Active', 'Unknown')})
    defs['grant'] = obj({'issuer': sid, 'subject': sid, 'resources': arr(sid),
        'operations': arr(enum('access_check', 'state_check'), 2),
        'purpose': enum('Analysis', 'Assertion'), 'not_before': uint, 'valid_until': uint,
        'contract_id': {'const': 'fixture-lease-v1'}, 'conditions': arr(sid), 'revision': sid})
    defs['semantic'] = obj({'claim_digest': sha, 'support_set_digest': sha,
        'outcome': enum('Supported', 'Partial', 'Contradicted', 'Indeterminate', 'NotEvaluated'),
        'method': enum('Human', 'None'), 'evaluator': sid, 'evaluator_version': sid,
        'support_refs': arr(sha)})
    defs['attestation'] = obj({'key_id': sid, 'body': ref('bundle'),
        'signature_hex': {'type': 'string', 'pattern': '^[0-9a-f]{128}$'}})
    defs['grant_envelope'] = obj({'key_id': sid, 'body': ref('grant'),
        'signature_hex': {'type': 'string', 'pattern': '^[0-9a-f]{128}$'}})
    defs['semantic_envelope'] = obj({'key_id': sid, 'body': ref('semantic'),
        'signature_hex': {'type': 'string', 'pattern': '^[0-9a-f]{128}$'}})
    defs['release_chunk'] = obj({'chunk_id': sid, 'bytes_hex': raw, 'chunk_digest': sha,
        'text_position': ref('position'), 'source_digest': sha, 'evidence_ref': sha})
    defs['temporal'] = obj({'mode': enum('Current', 'Historical'), 'requested_instant': uint}, ('requested_instant',))
    defs['payload'] = obj({'chunks': arr(ref('release_chunk')), 'claim': ref('claim'),
        'claim_status': enum('Omitted', 'ForAnalysis', 'SupportedByEvaluation'),
        'semantic': ref('semantic'), 'temporal_context': ref('temporal'), 'restrictions': arr(sid)}, ('claim', 'semantic'))
    defs['reason'] = obj({'rule_id': sid, 'code': sid})
    defs['failure'] = obj({'code': sid, 'ref': sid})
    defs['snapshot'] = obj({'evaluated_at': uint, 'valid_until': uint,
        'revisions': ref('revisions'), 'policy_digest': sha, 'anchor_set_digest': sha,
        'consistency': obj({'mode': {'const': 'BestEffort'},
            'profile_id': {'const': 'frozen-observations-v1'}, 'observation_digest': sha}),
        'temporal_guarantee': obj({'kind': {'const': 'ValidatedAt'}, 'validated_at': uint,
                                   'accepted_interval_ms': uint})})
    defs['observations'] = obj({'integrity': enum('OK', 'Invalid', 'Unknown'),
        'transform_items': arr(ref('transform')), 'documental': enum('Complete', 'Incomplete', 'Invalid', 'NotEvaluated'),
        'mechanism': obj({'kind': enum('Extracted', 'Derived'), 'predicate_span_valid': {'type': 'boolean'},
            'premise_refs': arr(sha), 'rule_id': sid, 'rule_version': sid,
            'derivation_artifact_ref': sha, 'derivation_binding_valid': {'type': 'boolean'}},
            ('predicate_span_valid', 'premise_refs', 'rule_id', 'rule_version', 'derivation_artifact_ref', 'derivation_binding_valid')),
        'bundle': ref('attestation'), 'semantic': ref('semantic_envelope'),
        'failures': arr(ref('failure'))})
    defs['delivery'] = obj({'attempted_at': uint, 'authorization_source_available': {'type': 'boolean'},
        'other_sources_available': {'type': 'boolean'},
        'observed_revisions': ref('revisions'), 'grant': ref('grant_envelope')}, ('grant',))
    defs['expected'] = obj({'decision': enum('Admit', 'AdmitHistorical', 'AdmitChunksOnly', 'Exclude', 'Reject'),
        'applied_rule': sid, 'flags': arr(sid), 'reasons': arr(ref('reason')),
        'released_payload': ref('payload'), 'snapshot': ref('snapshot'),
        'delivery': obj({'outcome': enum('Release', 'Blocked', 'Reevaluate'), 'code': sid}),
        'material_errors': arr(sid)})
    schema = obj({'fixture_id': sid, 'profile_id': {'const': 'arkhe-broker-local-v1'},
        'description': {'type': 'string', 'maxLength': 1024}, 'clock_ms': uint,
        'candidate': ref('candidate'), 'session': ref('session'), 'policy': ref('policy'),
        'policy_digest': sha, 'chunks': arr(ref('chunk')),
        'anchors': obj({'checkpoint_id': sid, 'root': sha, 'leaf_count': uint,
            'mmr_profile_digest': {'const': MMR}, 'public_key_hex': sha, 'key_id': sid,
            'state_record_hash': sha, 'state_root': sha,
            'state_proof': obj({'leaf_count': {'const': 1}, 'leaf_index': {'const': 0}, 'steps': arr(ref('step'), 0)})}),
        'observations': ref('observations'), 'delivery': ref('delivery'),
        'derivation_artifact': obj({'rule_id': sid, 'rule_version': sid, 'premise_refs': arr(sha),
            'premise_claim': ref('claim'), 'conclusion': ref('claim') }),
        'expected_output': ref('expected'), 'independent_review': obj({'status': {'const': 'pending'}})}, ('derivation_artifact',))
    schema.update({'$schema': 'https://json-schema.org/draft/2020-12/schema',
                   '$id': 'urn:arkhe:broker:fixture:v1', '$defs': defs})
    return schema


def main():
    write(SCHEMA / 'fixture-v1.schema.json', make_schema())
    profile = {
        'profile_id': 'arkhe-broker-local-v1', 'status': 'candidate',
        'scope': 'offline synthetic fixtures; not runtime admission or production trust',
        'serialization': {'format': 'JSON', 'charset': 'UTF-8', 'bom': False,
            'canonical': 'sorted keys, no whitespace, ensure_ascii=false, integer-only numbers; reject duplicate keys, floats, nonfinite, surrogates',
            'bytes': 'lowercase hex, no prefix', 'integer': 'unsigned u64; implementations must preserve exact values',
            'unicode_normalization': 'none; retain source bytes', 'unknown_properties': 'reject'},
        'limits': {'fixture_bytes': 2097152, 'source_bytes': 1048576, 'representation_bytes': 1048576,
            'chunk_bytes': 32768, 'chunks': 32, 'premises': 32, 'proof_steps': 64,
            'leaf_count': 1000000, 'released_bytes': 65536, 'id_ascii_bytes': 128,
            'qualifiers': 16, 'max_clock_skew_ms': 0, 'max_decision_ttl_ms': 1000},
        'sha256_domains': {k: 'ARKHE:BROKER:' + k + ':v1' for k in
            ('SOURCE', 'REPRESENTATION', 'CHUNK', 'CLAIM', 'SUPPORT', 'POLICY', 'ANCHORS', 'OBSERVATIONS', 'DERIVATION')},
        'sha256_preimage': 'ASCII(domain) || 0x00 || payload; raw bytes for SOURCE/REPRESENTATION/CHUNK; canonical JSON otherwise',
        'record_hash': {'algorithm': 'BLAKE3-256', 'preimage': 'ASCII(AKG:BROKER:RECORD:v1) || 0x00 || canonical JSON(record)'},
        'state_record_hash': {'algorithm': 'BLAKE3-256', 'preimage': 'ASCII(AKG:BROKER:STATE:v1) || 0x00 || canonical JSON(bundle.body)'},
        'mmr': {'profile_id': 'arkhe-mmr@1', 'profile_digest': MMR,
            'leaf_bytes': '32 raw bytes of broker record_hash', 'fixture_tree': 'two leaves; leaf=BLAKE3(0x00||leaf_bytes), node=BLAKE3(0x01||left||right)',
            'native_reference': 'verification/crates/arkhe-verify-core/src/mmr/inclusion.rs'},
        'signatures': {'algorithm': 'Ed25519', 'preimage': 'ASCII(ARKHE:BROKER:SIGN:<kind>:v1) || 0x00 || canonical JSON(body)',
            'kinds': ['BUNDLE', 'SEMANTIC', 'GRANT'], 'authority': 'fixture-authority-1',
            'public_key_hex': key().public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex(),
            'public_test_seed_hex': bytes(range(32)).hex(), 'production_use': 'forbidden'},
        'consistency': {'mode': 'BestEffort', 'profile_id': 'frozen-observations-v1',
            'property': 'authenticity and exact binding of retained observations; no claim of cross-source atomicity',
            'guaranteed_profiles': [], 'policy_must_accept_revision_vector': True},
        'fixture_rules': {'fixture-identity@1': 'conclusion must equal retained premise_claim; tests binding and identity rule only, not linguistic premise extraction'},
        'temporal': {'kind': 'ValidatedAt', 'accepted_interval_ms': 250,
            'delivery_interval': 'validated_at <= attempted_at < min(valid_until, validated_at + accepted_interval_ms)',
            'valid_until': 'min(each observation expires_at, evaluated_at + max_decision_ttl_ms)',
            'grant_contract': 'fixture-lease-v1; only access_check; accepted subject/resources/purpose; signed; stable until expiry; no revocation check during lease; fixture-only assumption'},
        'canonical_collections': {'transform_items': 'transformation_ref unique, ASCII lexicographic',
            'failures': '(code,ref) sorted unique', 'reasons': '(rule_id,code) sorted unique',
            'flags': 'sorted unique', 'agg_sources': '(tenant,scope) sorted unique',
            'chunks': 'chunk_id sorted unique', 'support_refs': 'record_hash sorted unique'},
        'diagnostics': {'reason_codes': ['RULE_MATCH'], 'flag_codes': ['RELATION_OMITTED'],
            'rule_ids': ['REQUEST_INVALID', 'POLICY_UNRESOLVED', 'ACCESS_DENIED', 'ACCESS_UNKNOWN',
                'INTEGRITY_INVALID', 'INTEGRITY_UNKNOWN', 'TRANSFORM_REJECTED', 'TRANSFORM_UNKNOWN',
                'HISTORICAL_DENIED', 'STATE_UNAVAILABLE', 'STATE_DISALLOWED', 'DOCUMENT_INVALID',
                'ANALYSIS_CHUNKS_ONLY', 'DOCUMENT_INCOMPLETE', 'ASSERTION_UNSUPPORTED',
                'RELEASE_HISTORICAL', 'RELEASE_CURRENT', 'DEFAULT_EXCLUDE'],
            'failure_codes': ['CHUNK_DIGEST_MISMATCH', 'PROOF_INVALID'],
            'material_error_codes': ['CHUNK_DIGEST_MISMATCH', 'GRANT_SIGNATURE_INVALID', 'PROOF_INVALID']},
        'schema': 'schemas/provenance-broker/fixture-v1.schema.json'
    }
    write(SCHEMA / 'profile-v1.json', profile)
    texts = ['O serviço Atlas migrou para PostgreSQL 16.', 'A equipe Aurora opera o serviço Atlas.']
    chunks = []
    for i, text in enumerate(texts):
        raw = text.encode()
        rid = digest('REPRESENTATION', raw)
        rec = {'chunk_id': f'chunk-{i+1}', 'chunk_digest': digest('CHUNK', raw),
               'source_digest': digest('SOURCE', raw),
               'text_position': {'repr_digest': rid, 'offset': 0, 'length': len(raw)},
               'transformation_ref': 'utf8-identity@1', 'tenant': 'arkhe-test', 'scope': 'research'}
        chunks.append({'chunk_id': rec['chunk_id'], 'bytes_hex': raw.hex(), 'source_bytes_hex': raw.hex(),
            'representation_hex': raw.hex(), 'record': rec, 'record_hash': record_hash(rec).hex(),
            'per_chunk': {'integrity': 'OK', 'access': 'Permitted', 'state': 'Current', 'transform': 'Accepted'}})
    leaves = [b3(b'\0' + bytes.fromhex(c['record_hash'])) for c in chunks]
    root = b3(b'\1' + leaves[0] + leaves[1]).hex()
    for i, chunk in enumerate(chunks):
        chunk['proof'] = {'profile_digest': MMR, 'leaf_count': 2, 'leaf_index': i,
            'steps': [{'kind': 'node', 'direction': 'right' if i == 0 else 'left', 'hash': leaves[1-i].hex()}]}
    pub = key().public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    revisions = {'authorization': 'auth-1', 'state': 'state-1', 'policy': 'policy-1', 'anchor_set': 'anchors-1'}
    policy = {'policy_id': 'broker-pilot', 'policy_version': '1', 'profile_id': profile['profile_id'],
        'purposes': ['Analysis', 'Assertion'], 'best_effort_permitted': True,
        'historical_permitted': True, 'grants_permitted': True, 'max_state_age_ms': 1000,
        'max_decision_ttl_ms': 1000, 'accepted_interval_ms': 250,
        'accepted_evaluator': 'fixture-reviewer', 'accepted_transforms': ['utf8-identity@1'],
        'rejected_transforms': [], 'accepted_rules': ['fixture-identity@1'],
        'accepted_revision_combinations': [revisions]}
    claim = {'subject': 'service:atlas', 'predicate': 'migrated_to', 'object': 'database:postgresql-16',
             'polarity': 'Positive', 'modality': 'Asserted', 'qualifiers': []}
    bundle = {'authority': 'fixture-authority-1', 'subject': 'researcher-1',
        'resources': ['chunk-1', 'chunk-2'], 'revisions': revisions, 'observed_at': NOW-100,
        'expires_at': {k: NOW+800 for k in revisions}, 'access': 'Permitted', 'state': 'Current',
        'effective_from': NOW-10000, 'effective_to': NOW+10000, 'historical_state': 'Active'}
    base = {'fixture_id': 'base', 'profile_id': profile['profile_id'], 'description': '', 'clock_ms': NOW,
        'candidate': {'candidate_id': 'candidate-atlas', 'claim': claim, 'query': {'purpose': 'Assertion'}},
        'session': {'principal': 'researcher-1', 'session_id': 'session-1', 'tenant': 'arkhe-test', 'scopes': ['research']},
        'policy': policy, 'policy_digest': digest('POLICY', policy), 'chunks': chunks,
        'anchors': {'checkpoint_id': 'fixture-checkpoint-2', 'root': root, 'leaf_count': 2,
            'mmr_profile_digest': MMR, 'public_key_hex': pub, 'key_id': 'fixture-authority-1',
            'state_record_hash': '00'*32, 'state_root': '00'*32,
            'state_proof': {'leaf_count': 1, 'leaf_index': 0, 'steps': []}},
        'observations': {'integrity': 'OK', 'transform_items': [{'transformation_ref': 'utf8-identity@1', 'verdict': 'Accepted'}],
            'documental': 'Complete', 'mechanism': {'kind': 'Extracted', 'predicate_span_valid': True},
            'bundle': signed('BUNDLE', bundle), 'failures': []},
        'delivery': {'attempted_at': NOW+100, 'authorization_source_available': True,
                     'other_sources_available': True, 'observed_revisions': copy.deepcopy(revisions)},
        'independent_review': {'status': 'pending'}}
    cases = []

    def case(fid, desc, decision, rule, edit=None, delivery=('Release', 'VALIDATION_WINDOW'), errors=()):
        f = copy.deepcopy(base)
        f.update(fixture_id=fid, description=desc)
        if edit:
            edit(f)
        f['policy_digest'] = digest('POLICY', f['policy'])
        support = sorted(c['record_hash'] for c in f['chunks'])
        sem = {'claim_digest': digest('CLAIM', f['candidate']['claim']), 'support_set_digest': digest('SUPPORT', support),
            'outcome': f.pop('_semantic', 'Supported'), 'method': 'Human', 'evaluator': 'fixture-reviewer',
            'evaluator_version': '1', 'support_refs': support}
        f['observations']['semantic'] = signed('SEMANTIC', sem)
        body = f['observations']['bundle']['body']
        f['observations']['bundle'] = signed('BUNDLE', body)
        state_hash = b3(b'AKG:BROKER:STATE:v1\0' + canonical(body))
        f['anchors']['state_record_hash'] = state_hash.hex()
        f['anchors']['state_root'] = b3(b'\0' + state_hash).hex()
        hist = f['candidate']['query'].get('historical_req')
        temporal = {'mode': 'Historical', **hist} if hist else {'mode': 'Current'}
        payload = {'chunks': [], 'claim_status': 'Omitted', 'temporal_context': temporal, 'restrictions': []}
        flags = []
        if decision in ('Admit', 'AdmitHistorical', 'AdmitChunksOnly'):
            for c in f['chunks']:
                if c['per_chunk'] == {'integrity': 'OK', 'access': 'Permitted', 'state': 'Current', 'transform': 'Accepted'}:
                    r = c['record']
                    payload['chunks'].append({'chunk_id': c['chunk_id'], 'bytes_hex': c['bytes_hex'],
                        'chunk_digest': r['chunk_digest'], 'text_position': r['text_position'],
                        'source_digest': r['source_digest'], 'evidence_ref': c['record_hash']})
            if decision == 'AdmitChunksOnly':
                payload['restrictions'] = ['ANALYSIS_ONLY', 'NO_RELATION_SUPPORT']
                flags = ['RELATION_OMITTED']
            else:
                payload.update(claim=f['candidate']['claim'], semantic=sem,
                    claim_status='ForAnalysis' if f['candidate']['query']['purpose'] == 'Analysis' else 'SupportedByEvaluation')
        snap = {'evaluated_at': NOW, 'valid_until': min(*body['expires_at'].values(), NOW+policy['max_decision_ttl_ms']),
            'revisions': body['revisions'], 'policy_digest': f['policy_digest'],
            'anchor_set_digest': digest('ANCHORS', f['anchors']),
            'consistency': {'mode': 'BestEffort', 'profile_id': 'frozen-observations-v1',
                            'observation_digest': digest('OBSERVATIONS', f['observations'])},
            'temporal_guarantee': {'kind': 'ValidatedAt', 'validated_at': NOW, 'accepted_interval_ms': 250}}
        f['expected_output'] = {'decision': decision, 'applied_rule': rule, 'flags': flags,
            'reasons': [{'rule_id': rule, 'code': 'RULE_MATCH'}], 'released_payload': payload,
            'snapshot': snap, 'delivery': {'outcome': delivery[0], 'code': delivery[1]}, 'material_errors': sorted(errors)}
        cases.append(f)

    case('P-02', 'Extracted; complete Assertion baseline, signed retained evaluation.', 'Admit', 'RELEASE_CURRENT')
    def derived(f):
        refs = sorted(c['record_hash'] for c in f['chunks'])
        artifact = {'rule_id': 'fixture-identity', 'rule_version': '1', 'premise_refs': refs,
            'premise_claim': f['candidate']['claim'], 'conclusion': f['candidate']['claim']}
        f['derivation_artifact'] = artifact
        f['observations']['mechanism'] = {'kind': 'Derived', 'premise_refs': refs, 'rule_id': artifact['rule_id'],
            'rule_version': '1', 'derivation_artifact_ref': digest('DERIVATION', artifact), 'derivation_binding_valid': True}
    case('P-03', 'Derived binding fixture; rule/application acceptance is a frozen host observation, not a factual proof.', 'Admit', 'RELEASE_CURRENT', derived)
    def historical(f):
        f['candidate']['query']['historical_req'] = {'requested_instant': NOW-1000}
        f['observations']['bundle']['body']['state'] = 'Historical'
    case('P-04', 'Signed retained historical interval covers requested instant; no live-history claim.', 'AdmitHistorical', 'RELEASE_HISTORICAL', historical)
    def partial(f):
        f['candidate']['query']['purpose'] = 'Analysis'
        f['observations']['documental'] = 'Incomplete'
        f['observations']['mechanism']['predicate_span_valid'] = False
        f['chunks'][1]['per_chunk']['state'] = 'Superseded'
    case('P-05', 'Release chunk-1 only; chunk-2 superseded; omit claim and relation evaluation.', 'AdmitChunksOnly', 'ANALYSIS_CHUNKS_ONLY', partial)
    def contradicted(f):
        f['candidate']['query']['purpose'] = 'Analysis'
        f['_semantic'] = 'Contradicted'
    case('P-06', 'Contradiction may be examined in Analysis.', 'Admit', 'RELEASE_CURRENT', contradicted)
    def tamper(f):
        f['chunks'][0]['bytes_hex'] = b'alterado'.hex()
        f['observations']['integrity'] = 'Invalid'
        f['observations']['failures'] = [{'code': 'CHUNK_DIGEST_MISMATCH', 'ref': 'chunk-1'}]
    case('N-01', 'Retained record intact, chunk bytes altered.', 'Reject', 'INTEGRITY_INVALID', tamper,
         ('Blocked', 'DECISION_DENIED'), ['CHUNK_DIGEST_MISMATCH'])
    for fid, verdict, decision, rule in [('N-02', 'Rejected', 'Reject', 'TRANSFORM_REJECTED'), ('N-03', 'Unknown', 'Exclude', 'TRANSFORM_UNKNOWN')]:
        def transform_edit(f, v=verdict):
            f['observations']['transform_items'][0]['verdict'] = v
            for c in f['chunks']:
                c['per_chunk']['transform'] = v
            f['policy']['accepted_transforms'] = []
            if v == 'Rejected':
                f['policy']['rejected_transforms'] = ['utf8-identity@1']
        case(fid, 'Frozen transform-policy result: '+verdict, decision, rule,
             transform_edit, ('Blocked', 'DECISION_DENIED'))
    def denied_history(f):
        historical(f)
        f['policy']['historical_permitted'] = False
        f['observations']['bundle']['body']['state'] = 'HistoricalDenied'
    case('N-05', 'Historical request denied; never convert to current.', 'Reject', 'HISTORICAL_DENIED', denied_history, ('Blocked', 'DECISION_DENIED'))
    def missing_state(f):
        historical(f)
        f['observations']['bundle']['body'].update(state='Unknown', historical_state='Unknown')
    case('N-06', 'Historical state not demonstrated.', 'Exclude', 'STATE_UNAVAILABLE', missing_state, ('Blocked', 'DECISION_DENIED'))
    def assertion_contradicted(f):
        f['_semantic'] = 'Contradicted'
    case('N-07', 'Assertion does not accept contradicted evaluation.', 'Reject', 'ASSERTION_UNSUPPORTED', assertion_contradicted, ('Blocked', 'DECISION_DENIED'))
    case('N-04', 'Authorization observation unavailable.', 'Exclude', 'ACCESS_UNKNOWN',
         lambda f: f['observations']['bundle']['body'].update(access='Unknown'), ('Blocked', 'DECISION_DENIED'))
    case('N-08', 'Positive semantic evaluation cannot compensate incomplete document binding.', 'Reject', 'DOCUMENT_INCOMPLETE',
         lambda f: f['observations'].update(documental='Incomplete'), ('Blocked', 'DECISION_DENIED'))
    def empty_safe(f):
        partial(f)
        for c in f['chunks']:
            c['per_chunk']['state'] = 'Superseded'
    case('N-09', 'Incomplete Analysis has no individually current chunk.', 'Reject', 'DOCUMENT_INCOMPLETE',
         empty_safe, ('Blocked', 'DECISION_DENIED'))
    def missing_rule(f):
        f['observations'].update(documental='Invalid', mechanism={'kind': 'Derived'})
    case('N-10', 'Derived host observation has no declared rule or artifact.', 'Reject', 'DOCUMENT_INVALID',
         missing_rule, ('Blocked', 'DECISION_DENIED'))
    case('N-11', 'Current state revoked; historical use not requested.', 'Reject', 'STATE_DISALLOWED',
         lambda f: f['observations']['bundle']['body'].update(state='Revoked'), ('Blocked', 'DECISION_DENIED'))
    case('N-12', 'Authorization denied.', 'Reject', 'ACCESS_DENIED',
         lambda f: f['observations']['bundle']['body'].update(access='Denied'), ('Blocked', 'DECISION_DENIED'))
    case('N-13', 'Resolved pilot policy does not cover requested Assertion purpose.', 'Exclude', 'POLICY_UNRESOLVED',
         lambda f: f['policy'].update(purposes=['Analysis']), ('Blocked', 'DECISION_DENIED'))
    def proof_bad(f):
        f['chunks'][0]['proof']['steps'][0]['hash'] = '00'*32
        f['observations']['integrity'] = 'Invalid'
        f['observations']['failures'] = [{'code': 'PROOF_INVALID', 'ref': 'chunk-1'}]
    case('N-PROOF', 'Corrupt sibling hash.', 'Reject', 'INTEGRITY_INVALID', proof_bad, ('Blocked', 'DECISION_DENIED'), ['PROOF_INVALID'])
    case('D-UNAVAILABLE', 'Admitted decision, mandatory delivery query unavailable.', 'Admit', 'RELEASE_CURRENT',
         lambda f: f['delivery'].update(authorization_source_available=False), ('Blocked', 'SOURCE_UNAVAILABLE'))
    case('D-EXPIRED', 'Delivery after decision expiry.', 'Admit', 'RELEASE_CURRENT',
         lambda f: f['delivery'].update(attempted_at=NOW+801), ('Reevaluate', 'SNAPSHOT_EXPIRED'))
    case('D-EXPIRY-BOUNDARY', 'Delivery exactly at snapshot expiry is not allowed.', 'Admit', 'RELEASE_CURRENT',
         lambda f: f['delivery'].update(attempted_at=NOW+800), ('Reevaluate', 'SNAPSHOT_EXPIRED'))
    case('D-WINDOW-BOUNDARY', 'Delivery exactly at validation-window upper bound requires reevaluation.', 'Admit', 'RELEASE_CURRENT',
         lambda f: f['delivery'].update(attempted_at=NOW+250), ('Reevaluate', 'VALIDATION_WINDOW_EXPIRED'))
    case('D-OTHER-UNAVAILABLE', 'State/policy/anchor source needed for delivery unavailable.', 'Admit', 'RELEASE_CURRENT',
         lambda f: f['delivery'].update(other_sources_available=False), ('Blocked', 'SOURCE_UNAVAILABLE'))
    case('D-REVISION', 'Delivery revision differs from snapshot.', 'Admit', 'RELEASE_CURRENT',
         lambda f: f['delivery']['observed_revisions'].update(state='state-2'), ('Reevaluate', 'REVISION_CHANGED'))
    def grant(f, expired=False, corrupt=False):
        f['delivery']['authorization_source_available'] = False
        body = {'issuer': 'fixture-authority-1', 'subject': 'researcher-1', 'resources': ['chunk-1', 'chunk-2'],
            'operations': ['access_check'], 'purpose': 'Assertion', 'not_before': NOW-100,
            'valid_until': NOW+50 if expired else NOW+500, 'contract_id': 'fixture-lease-v1',
            'conditions': [], 'revision': 'auth-1'}
        f['delivery']['grant'] = signed('GRANT', body)
        if corrupt:
            f['delivery']['grant']['signature_hex'] = '00'*64
    case('D-GRANT', 'Valid access lease dispenses only unavailable authorization query; state/policy/anchors remain frozen available observations.',
         'Admit', 'RELEASE_CURRENT', grant, ('Release', 'ACCESS_GRANT'))
    case('D-GRANT-EXPIRED', 'Expired access lease requires query; authorization source unavailable.', 'Admit', 'RELEASE_CURRENT',
         lambda f: grant(f, expired=True), ('Blocked', 'SOURCE_UNAVAILABLE'))
    case('D-GRANT-INVALID', 'Invalid signature blocks attempt; do not downgrade to absent lease.', 'Admit', 'RELEASE_CURRENT',
         lambda f: grant(f, corrupt=True), ('Blocked', 'GRANT_INVALID'), ['GRANT_SIGNATURE_INVALID'])
    for f in cases:
        write(OUT / 'fixtures' / (f['fixture_id'] + '.json'), f)
    manifest = {'profile_id': profile['profile_id'], 'independent_review': 'pending',
        'fixture_count': len(cases), 'files': {}}
    for path in sorted([SCHEMA/'profile-v1.json', SCHEMA/'fixture-v1.schema.json'] + list((OUT/'fixtures').glob('*.json'))):
        manifest['files'][path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    write(OUT/'manifest.json', manifest)
    print(f'Materialized {len(cases)} synthetic fixtures; independent_review=pending')


if __name__ == '__main__':
    main()
