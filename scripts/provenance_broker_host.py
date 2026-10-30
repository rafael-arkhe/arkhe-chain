"""In-process fixture host adapter; no database, network or production keys.

Candidate is the only caller-controlled object. Session, sources, policy, pins
and observations are injected by the test host. Cryptographic validation occurs
before the pure policy runs. A denied delivery exposes no admission payload.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

import blake3
import jsonschema
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from provenance_broker_decision import canonical, decide, digest

ROOT = Path(__file__).resolve().parents[1]


class HostVerificationError(ValueError):
    pass


class FrozenHost:
    """Authority here means injected test context, not a real identity provider."""
    def __init__(self, trusted_context, profile):
        self.context = deepcopy(trusted_context)
        self.profile = deepcopy(profile)
        schema = json.loads((ROOT/'schemas/provenance-broker/fixture-v1.schema.json').read_text(encoding='utf-8'))
        self.request_schema = {'$schema': schema['$schema'], '$ref': '#/$defs/candidate', '$defs': schema['$defs']}

    def _signature(self, envelope, kind):
        pin = self.profile['signatures']
        if envelope['key_id'] != pin['authority']:
            raise HostVerificationError('untrusted observation issuer')
        try:
            Ed25519PublicKey.from_public_bytes(bytes.fromhex(pin['public_key_hex'])).verify(
                bytes.fromhex(envelope['signature_hex']),
                ('ARKHE:BROKER:SIGN:'+kind+':v1\0').encode()+canonical(envelope['body']))
        except (InvalidSignature, ValueError) as exc:
            raise HostVerificationError('invalid observation signature') from exc

    def evaluate_and_release(self, candidate):
        jsonschema.Draft202012Validator(self.request_schema).validate(candidate)
        data = deepcopy(self.context)
        if candidate['candidate_id'] != data['candidate']['candidate_id']:
            raise HostVerificationError('unknown candidate id')
        data['candidate'] = deepcopy(candidate)
        # Resolved policy and roots are injected separately from CandidateInput.
        if digest('POLICY', data['policy']) != data['policy_digest']:
            raise HostVerificationError('policy binding invalid')
        if (data['anchors']['key_id'] != self.profile['signatures']['authority']
                or data['anchors']['public_key_hex'] != self.profile['signatures']['public_key_hex']):
            raise HostVerificationError('anchor key not pinned')
        obs = data['observations']
        self._signature(obs['bundle'], 'BUNDLE')
        self._signature(obs['semantic'], 'SEMANTIC')
        body = obs['bundle']['body']
        state_hash = blake3.blake3(b'AKG:BROKER:STATE:v1\0'+canonical(body)).digest()
        if (state_hash.hex() != data['anchors']['state_record_hash']
                or blake3.blake3(b'\0'+state_hash).hexdigest() != data['anchors']['state_root']
                or data['anchors']['state_proof'] != {'leaf_count': 1, 'leaf_index': 0, 'steps': []}):
            raise HostVerificationError('state checkpoint binding invalid')
        if body['subject'] != data['session']['principal']:
            raise HostVerificationError('observation subject does not match authenticated session')
        if set(body['resources']) != {c['chunk_id'] for c in data['chunks']}:
            raise HostVerificationError('source set differs from retained observation')
        # V1 uses two leaves; V2 additionally retains a one-leaf historical pin.
        # Generic MMR and a live monotonic-checkpoint provider remain out of scope.
        errors = []
        for c in data['chunks']:
            rec, proof = c['record'], c['proof']
            good = True
            try:
                raw, source, representation = (bytes.fromhex(c[k]) for k in ('bytes_hex', 'source_bytes_hex', 'representation_hex'))
                sha = lambda tag, value: hashlib.sha256(('ARKHE:BROKER:'+tag+':v1\0').encode()+value).hexdigest()
                pos = rec['text_position']
                start, end = pos['offset'], pos['offset']+pos['length']
                good &= start <= end <= len(representation) and end <= 2**64-1
                representation[:start].decode('utf-8')
                representation[start:end].decode('utf-8')
                good &= raw == representation[start:end] and source == representation
                good &= sha('CHUNK', raw) == rec['chunk_digest']
                good &= sha('SOURCE', source) == rec['source_digest']
                good &= sha('REPRESENTATION', representation) == pos['repr_digest']
                good &= len(raw) <= self.profile['limits']['chunk_bytes']
                good &= len(source) <= self.profile['limits']['source_bytes']
                good &= len(representation) <= self.profile['limits']['representation_bytes']
                rh = blake3.blake3(b'AKG:BROKER:RECORD:v1\0'+canonical(rec)).digest()
                good &= rh.hex() == c['record_hash'] and rec['chunk_id'] == c['chunk_id']
                good &= proof['profile_digest'] == self.profile['mmr']['profile_digest']
                count = proof['leaf_count']
                allowed_counts = (1, 2) if data['policy']['profile_id'] == 'arkhe-broker-local-v2' else (2,)
                good &= count in allowed_counts and 0 <= proof['leaf_index'] < count
                good &= count == data['anchors']['leaf_count'] and len(proof['steps']) == count-1
                if good:
                    leaf = blake3.blake3(b'\0'+rh).digest()
                    if count == 1:
                        good &= leaf.hex() == data['anchors']['root']
                    else:
                        step = proof['steps'][0]
                        good &= step['kind'] == 'node' and step['direction'] == ('right' if proof['leaf_index'] == 0 else 'left')
                        sibling = bytes.fromhex(step['hash'])
                        node = leaf+sibling if step['direction'] == 'right' else sibling+leaf
                        good &= blake3.blake3(b'\1'+node).hexdigest() == data['anchors']['root']
            except (ValueError, KeyError, IndexError, UnicodeError, TypeError):
                good = False
            if not good:
                c['per_chunk']['integrity'] = 'Invalid'
                errors.append(c['chunk_id'])
        if errors:
            obs['integrity'] = 'Invalid'
        result = decide(data)
        # Host retains the audit record. Only agent_payload is routed to the agent.
        if result['delivery']['outcome'] == 'Release':
            agent_payload = deepcopy(result['released_payload'])
        else:
            agent_payload = {'chunks': [], 'claim_status': 'Omitted', 'restrictions': []}
        return {'host_audit': result, 'agent_payload': agent_payload}
