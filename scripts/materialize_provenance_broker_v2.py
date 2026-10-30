"""Author extension fixtures without rewriting any v1 fixture or oracle.

Expected outputs below are authored explicitly, not obtained from either engine.
All test keys are public. Independent review stays pending.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from materialize_provenance_broker import canonical, digest, record_hash, b3, signed, write

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'tests/provenance-broker/v3.1'
OUT = BASE/'extensions-v2'
SCHEMA = ROOT/'schemas/provenance-broker'


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def schema_v2():
    schema = deepcopy(load(SCHEMA/'fixture-v1.schema.json'))
    schema['$id'] = 'urn:arkhe:broker:fixture:v2'
    schema['properties']['profile_id'] = {'const': 'arkhe-broker-local-v2'}
    defs = schema['$defs']
    idtype = deepcopy(defs['candidate']['properties']['candidate_id'])
    reftype = {'type': 'string', 'pattern': '^[0-9a-f]{64}$'}
    def obj(props):
        return {'type': 'object', 'additionalProperties': False, 'properties': props, 'required': list(props)}
    def array(item):
        return {'type': 'array', 'items': item, 'maxItems': 32}
    def add_required(name, key, value):
        defs[name]['properties'][key] = value
        defs[name]['required'].append(key)
    permission = {'enum': ['Permitted', 'Denied', 'Unknown']}
    source_auth = obj({'chunk_id': idtype, 'tenant': idtype, 'scope': idtype, 'verdict': permission})
    aggregate_auth = obj({'aggregate_id': idtype, 'principal': idtype,
        'constituent_refs': array(reftype), 'verdict': permission})
    # Signed bundle fields are required even for non-aggregates; empty means none.
    add_required('bundle', 'source_authorizations', array(source_auth))
    add_required('bundle', 'aggregate_authorizations', array(aggregate_auth))
    add_required('policy', 'cross_tenant_aggregation_permitted', {'type': 'boolean'})
    schema['properties']['aggregation'] = obj({'aggregate_id': idtype, 'constituent_refs': array(reftype)})
    schema['properties']['projection'] = obj({'state_revision': idtype, 'indexed_state': {'enum': ['Current', 'Revoked']}})
    schema['properties']['expected_schema_error_paths'] = array({'type': 'string'})
    schema['required'].append('expected_schema_error_paths')
    # Host-owned monotonic pin, independent of the candidate's retained checkpoint.
    anchors = schema['properties']['anchors']
    anchors['properties']['stream_id'] = idtype
    anchors['properties']['minimum_leaf_count'] = {'type': 'integer', 'minimum': 1, 'maximum': 1000000}
    anchors['required'] += ['stream_id', 'minimum_leaf_count']
    return schema


def rebind_chunks(f, texts=None):
    for i, c in enumerate(f['chunks']):
        raw = texts[i].encode('utf-8') if texts else bytes.fromhex(c['bytes_hex'])
        c.update(bytes_hex=raw.hex(), source_bytes_hex=raw.hex(), representation_hex=raw.hex())
        r = c['record']
        r.update(chunk_digest=digest('CHUNK', raw), source_digest=digest('SOURCE', raw),
            text_position={'repr_digest': digest('REPRESENTATION', raw), 'offset': 0, 'length': len(raw)})
        c['record_hash'] = record_hash(r).hex()
    leaves = [b3(b'\0'+bytes.fromhex(c['record_hash'])) for c in f['chunks']]
    assert len(leaves) in (1, 2)
    root = leaves[0] if len(leaves) == 1 else b3(b'\1'+leaves[0]+leaves[1])
    f['anchors'].update(root=root.hex(), leaf_count=len(leaves), checkpoint_id='extension-checkpoint-'+str(len(leaves)))
    for i, c in enumerate(f['chunks']):
        c['proof'].update(leaf_count=len(leaves), leaf_index=i, steps=[] if len(leaves) == 1 else
            [{'kind': 'node', 'direction': 'right' if i == 0 else 'left', 'hash': leaves[1-i].hex()}])


def main():
    original = load(BASE/'manifest.json')
    for rel, sha in original['files'].items():
        assert hashlib.sha256((ROOT/rel).read_bytes()).hexdigest() == sha, 'v1 changed: '+rel
    profile = deepcopy(load(SCHEMA/'profile-v1.json'))
    profile.update(profile_id='arkhe-broker-local-v2', extends='arkhe-broker-local-v1',
        schema='schemas/provenance-broker/fixture-v2.schema.json')
    profile['extension'] = {
        'signed_authorization': 'bundle.body source_authorizations per chunk and aggregate_authorizations per aggregate, all required for aggregated input',
        'aggregate_default': 'deny unless exact constituent binding, source decisions and aggregate decision permit; cross-tenant also requires explicit policy',
        'checkpoint_freshness': 'current query requires anchors.leaf_count >= host-owned minimum_leaf_count for stream_id; historical requests retain v1 rules',
        'projection': 'indexed_state and state_revision are index observations only; authoritative signed state always takes precedence',
        'mmr_shapes': [1, 2], 'extension_status': 'synthetic pilot; not a live cross-tenant authorization service'}
    profile['canonical_collections'].update(source_authorizations='chunk_id sorted unique',
        aggregate_authorizations='aggregate_id sorted unique')
    profile['diagnostics']['rule_ids'] = list(profile['diagnostics']['rule_ids'])
    write(SCHEMA/'profile-v2.json', profile)
    write(SCHEMA/'fixture-v2.schema.json', schema_v2())
    baseline = load(BASE/'fixtures/P-02.json')
    cases = []

    def case(fid, description, decision, rule, edit=None, texts=None, semantic='Supported', release=None, schema_errors=()):
        f = deepcopy(baseline)
        f.update(fixture_id=fid, description=description, profile_id=profile['profile_id'], expected_schema_error_paths=list(schema_errors))
        f['policy'].update(profile_id=profile['profile_id'], cross_tenant_aggregation_permitted=False)
        f['anchors'].update(stream_id='fixture-evidence-stream', minimum_leaf_count=2)
        b = f['observations']['bundle']['body']
        b.update(source_authorizations=[], aggregate_authorizations=[])
        if edit:
            edit(f)
        rebind_chunks(f, texts)
        refs = sorted(c['record_hash'] for c in f['chunks'])
        if '_aggregation' in f:
            settings = f.pop('_aggregation')
            f['aggregation'] = {'aggregate_id': 'aggregate-1', 'constituent_refs': refs}
            b['source_authorizations'] = [{'chunk_id': c['chunk_id'], 'tenant': c['record']['tenant'],
                'scope': c['record']['scope'], 'verdict': c['per_chunk']['access']} for c in f['chunks']]
            b['aggregate_authorizations'] = [{'aggregate_id': 'aggregate-1', 'principal': f['session']['principal'],
                'constituent_refs': refs, 'verdict': settings['verdict']}]
        b['resources'] = [c['chunk_id'] for c in f['chunks']]
        f['observations']['bundle'] = signed('BUNDLE', b)
        state_hash = b3(b'AKG:BROKER:STATE:v1\0'+canonical(b))
        f['anchors'].update(state_record_hash=state_hash.hex(), state_root=b3(b'\0'+state_hash).hex())
        sem = {'claim_digest': digest('CLAIM', f['candidate']['claim']), 'support_set_digest': digest('SUPPORT', refs),
            'outcome': semantic, 'method': 'Human', 'evaluator': 'fixture-reviewer', 'evaluator_version': '1', 'support_refs': refs}
        f['observations']['semantic'] = signed('SEMANTIC', sem)
        f['policy_digest'] = digest('POLICY', f['policy'])
        payload = {'chunks': [], 'claim_status': 'Omitted', 'temporal_context': {'mode': 'Current'}, 'restrictions': []}
        flags = []
        if decision.startswith('Admit'):
            ids = release if release is not None else [c['chunk_id'] for c in f['chunks']]
            for c in f['chunks']:
                if c['chunk_id'] in ids:
                    r = c['record']
                    payload['chunks'].append({'chunk_id': c['chunk_id'], 'bytes_hex': c['bytes_hex'],
                        'chunk_digest': r['chunk_digest'], 'source_digest': r['source_digest'],
                        'text_position': r['text_position'], 'evidence_ref': c['record_hash']})
            if decision == 'AdmitChunksOnly':
                flags = ['RELATION_OMITTED']
                payload['restrictions'] = ['ANALYSIS_ONLY', 'NO_RELATION_SUPPORT']
            else:
                payload.update(claim=f['candidate']['claim'], semantic=sem,
                    claim_status='ForAnalysis' if f['candidate']['query']['purpose'] == 'Analysis' else 'SupportedByEvaluation')
        snap = {'evaluated_at': f['clock_ms'],
            'valid_until': min(*b['expires_at'].values(), f['clock_ms']+f['policy']['max_decision_ttl_ms']),
            'revisions': b['revisions'], 'policy_digest': f['policy_digest'], 'anchor_set_digest': digest('ANCHORS', f['anchors']),
            'consistency': {'mode': 'BestEffort', 'profile_id': 'frozen-observations-v1', 'observation_digest': digest('OBSERVATIONS', f['observations'])},
            'temporal_guarantee': {'kind': 'ValidatedAt', 'validated_at': f['clock_ms'], 'accepted_interval_ms': 250}}
        f['expected_output'] = {'decision': decision, 'applied_rule': rule, 'flags': flags,
            'reasons': [{'rule_id': rule, 'code': 'RULE_MATCH'}], 'released_payload': payload, 'snapshot': snap,
            'delivery': {'outcome': 'Release' if decision.startswith('Admit') else 'Blocked',
                         'code': 'VALIDATION_WINDOW' if decision.startswith('Admit') else 'DECISION_DENIED'}, 'material_errors': []}
        f['independent_review'] = {'status': 'pending'}
        cases.append(f)

    def two_safe(f):
        f['candidate']['query']['purpose'] = 'Analysis'
        f['observations'].update(documental='Incomplete', mechanism={'kind': 'Extracted', 'predicate_span_valid': False})
    case('V2-P05-TWO-SAFE', 'Two verified current chunks released; no Claim or semantic relationship.',
        'AdmitChunksOnly', 'ANALYSIS_CHUNKS_ONLY', two_safe)
    case('V2-NEGATION-POSITIVE-CLAIM', 'Literal negative source versus positive migration Claim; evaluation retained, not model-extracted.',
        'Reject', 'ASSERTION_UNSUPPORTED', texts=['O serviço Atlas não migrou para PostgreSQL 16.', 'A equipe Aurora opera o serviço Atlas.'], semantic='Contradicted')
    case('V2-NEGATION-NEGATIVE-CLAIM', 'Negative Claim supported by literal negative source.', 'Admit', 'RELEASE_CURRENT',
        lambda f: f['candidate']['claim'].update(polarity='Negative'),
        texts=['O serviço Atlas não migrou para PostgreSQL 16.', 'A equipe Aurora opera o serviço Atlas.'])
    hypothetical = ['O serviço Atlas poderá migrar para PostgreSQL 16.', 'A equipe Aurora opera o serviço Atlas.']
    case('V2-HYPOTHESIS-ASSERTED', 'Hypothetical source does not sustain an asserted migration.',
        'Reject', 'ASSERTION_UNSUPPORTED', texts=hypothetical, semantic='Indeterminate')
    case('V2-HYPOTHESIS-POSSIBLE', 'Possible modality retained explicitly in Claim.', 'Admit', 'RELEASE_CURRENT',
        lambda f: f['candidate']['claim'].update(modality='Possible'), texts=hypothetical)
    correction = ['Relato de 20/10: o serviço Atlas migrou para PostgreSQL 16.',
        'Correção de 21/10: o relato de 20/10 estava errado; o serviço Atlas não migrou para PostgreSQL 16.']
    case('V2-CORRECTION-OLD-CLAIM', 'Explicit correction of earlier report; mechanical bindings remain Complete.',
        'Reject', 'ASSERTION_UNSUPPORTED', texts=correction, semantic='Contradicted')
    case('V2-CORRECTION-ANALYSIS', 'Analysis may inspect the explicit correction and original report as judgments.',
        'Admit', 'RELEASE_CURRENT', lambda f: f['candidate']['query'].update(purpose='Analysis'),
        texts=correction, semantic='Contradicted')
    case('V2-ENDPOINTS-NO-RELATION', 'Person and organization mentioned separately with no employment relation.',
        'Reject', 'ASSERTION_UNSUPPORTED', lambda f: f['candidate']['claim'].update(
            subject='person:alice', predicate='works_for', object='organization:acme'),
        texts=['Alice visitou a biblioteca.', 'Acme fabrica ferramentas.'], semantic='Indeterminate')

    def aggregate(f, cross=True, allow=False, aggregate_verdict='Permitted', source='Permitted'):
        f['candidate']['query']['purpose'] = 'Analysis'
        f['chunks'][1]['record'].update(tenant='partner-test' if cross else 'arkhe-test', scope='finance')
        f['chunks'][1]['per_chunk']['access'] = source
        f['policy']['cross_tenant_aggregation_permitted'] = allow
        f['_aggregation'] = {'verdict': aggregate_verdict}
    case('V2-AGG-SOURCE-DENIED', 'Cross-tenant aggregate grant cannot override denied source.', 'Reject', 'ACCESS_DENIED',
        lambda f: aggregate(f, allow=True, source='Denied'))
    case('V2-AGG-GRANT-DENIED', 'All sources allowed, aggregate itself denied.', 'Reject', 'ACCESS_DENIED',
        lambda f: aggregate(f, allow=True, aggregate_verdict='Denied'))
    case('V2-AGG-POLICY-DENIED', 'Source and aggregate grants do not override cross-tenant default policy.', 'Reject', 'ACCESS_DENIED',
        lambda f: aggregate(f))
    case('V2-AGG-EXPLICIT-ALLOW', 'Exact sources and aggregate authorized; cross-tenant policy explicitly permits.', 'Admit', 'RELEASE_CURRENT',
        lambda f: aggregate(f, allow=True))
    case('V2-AGG-SCOPE-DENIED', 'Same tenant, distinct scopes, aggregate denied.', 'Reject', 'ACCESS_DENIED',
        lambda f: aggregate(f, cross=False, aggregate_verdict='Denied'))
    case('V2-AGG-SCOPE-ALLOW', 'Same tenant, distinct scopes, explicit source and aggregate authorization.', 'Admit', 'RELEASE_CURRENT',
        lambda f: aggregate(f, cross=False))
    case('V2-AGG-SOURCE-UNKNOWN', 'Unknown constituent authorization blocks aggregate.', 'Exclude', 'ACCESS_UNKNOWN',
        lambda f: aggregate(f, allow=True, source='Unknown'))

    def rollback(f, historical=False):
        f['chunks'] = f['chunks'][:1]
        # Valid earlier one-leaf root is pinned as a historical root. Host requires >=2 for current state.
        f['anchors']['minimum_leaf_count'] = 2
    case('V2-ROLLBACK-VALID-OLD-PROOF', 'Cryptographically valid old one-leaf checkpoint, fresh observation timestamps, host monotonic minimum two.',
        'Exclude', 'STATE_UNAVAILABLE', rollback)
    def projection(f, revoked):
        f['projection'] = {'state_revision': 'state-0', 'indexed_state': 'Current'}
        if revoked:
            f['observations']['bundle']['body']['state'] = 'Revoked'
    case('V2-PROJECTION-REVOKED', 'Stale index says Current; signed authoritative source says Revoked.',
        'Reject', 'STATE_DISALLOWED', lambda f: projection(f, True))
    case('V2-PROJECTION-STILL-CURRENT', 'Stale index alone does not invalidate current authorized source state.',
        'Admit', 'RELEASE_CURRENT', lambda f: projection(f, False))

    sentence = 'O serviço Atlas migrou para PostgreSQL 16.'
    padded = sentence+' '*(32768-len(sentence.encode()))
    case('V2-LIMIT-CHUNK-AND-PAYLOAD-EXACT', 'Two 32768-byte UTF-8 chunks; released budget exactly 65536.',
        'Admit', 'RELEASE_CURRENT', texts=[padded, padded])
    def over_limit(f):
        f['observations']['integrity'] = 'Invalid'
        f['chunks'][0]['per_chunk']['integrity'] = 'Invalid'
    case('V2-LIMIT-CHUNK-OVER', '32769 bytes: schema failure and request rejection precede integrity failure.',
        'Reject', 'REQUEST_INVALID', over_limit, texts=[padded+' ', sentence],
        schema_errors=['chunks/0/bytes_hex'])

    for f in cases:
        write(OUT/'fixtures'/(f['fixture_id']+'.json'), f)
    manifest = {'profile_id': profile['profile_id'], 'fixture_count': len(cases),
        'independent_review': 'pending', 'v1_manifest_sha256': hashlib.sha256((BASE/'manifest.json').read_bytes()).hexdigest(), 'files': {}}
    for path in [SCHEMA/'profile-v2.json', SCHEMA/'fixture-v2.schema.json']+sorted((OUT/'fixtures').glob('*.json')):
        manifest['files'][path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    write(OUT/'manifest.json', manifest)
    print(f'Materialized {len(cases)} extension fixtures; original v1 files unchanged; independent review pending.')


if __name__ == '__main__':
    main()
