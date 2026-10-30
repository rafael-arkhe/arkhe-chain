"""Extension mutation/host checks; fixture authority and checkpoint pins are synthetic."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts'))
from compare_provenance_broker import host_input
from materialize_provenance_broker import b3, canonical, signed
from provenance_broker_host import FrozenHost, HostVerificationError

DATA = Path(__file__).parent/'extensions-v2/fixtures'


class ExtensionV2Host(unittest.TestCase):
    def context(self, name):
        data = host_input(json.loads((DATA/(name+'.json')).read_text(encoding='utf-8')))
        profile = json.loads((ROOT/'schemas/provenance-broker/profile-v2.json').read_text(encoding='utf-8'))
        return data, profile

    def release(self, name):
        data, profile = self.context(name)
        return FrozenHost(data, profile).evaluate_and_release(data['candidate'])

    def resign_bundle(self, data):
        body = data['observations']['bundle']['body']
        data['observations']['bundle'] = signed('BUNDLE', body)
        rh = b3(b'AKG:BROKER:STATE:v1\0'+canonical(body))
        data['anchors'].update(state_record_hash=rh.hex(), state_root=b3(b'\0'+rh).hex())

    def test_two_safe_chunks_omit_claim_and_semantics(self):
        result = self.release('V2-P05-TWO-SAFE')
        self.assertEqual([c['chunk_id'] for c in result['agent_payload']['chunks']], ['chunk-1', 'chunk-2'])
        self.assertNotIn('claim', result['agent_payload'])
        self.assertNotIn('semantic', result['agent_payload'])

    def test_literal_corpus_is_bound_to_expected_semantic_cases(self):
        cases = [('V2-NEGATION-POSITIVE-CLAIM', 'não migrou', 'Reject'),
                 ('V2-HYPOTHESIS-ASSERTED', 'poderá migrar', 'Reject'),
                 ('V2-CORRECTION-OLD-CLAIM', 'Correção', 'Reject')]
        for name, literal, expected in cases:
            with self.subTest(name=name):
                data, profile = self.context(name)
                text = '\n'.join(bytes.fromhex(c['bytes_hex']).decode() for c in data['chunks'])
                self.assertIn(literal, text)
                self.assertEqual(FrozenHost(data, profile).evaluate_and_release(data['candidate'])['host_audit']['decision'], expected)

    def test_same_tenant_separate_scopes_need_aggregate_permission(self):
        self.assertEqual(self.release('V2-AGG-SCOPE-DENIED')['agent_payload']['chunks'], [])
        self.assertEqual(len(self.release('V2-AGG-SCOPE-ALLOW')['agent_payload']['chunks']), 2)

    def test_source_authorization_cannot_be_overridden_by_aggregate_grant(self):
        for name in ('V2-AGG-SOURCE-DENIED', 'V2-AGG-SOURCE-UNKNOWN'):
            with self.subTest(name=name):
                self.assertEqual(self.release(name)['agent_payload']['chunks'], [])

    def test_signed_wrong_tenant_binding_still_denies(self):
        data, profile = self.context('V2-AGG-EXPLICIT-ALLOW')
        data['observations']['bundle']['body']['source_authorizations'][1]['tenant'] = 'unrelated'
        self.resign_bundle(data)
        result = FrozenHost(data, profile).evaluate_and_release(data['candidate'])
        self.assertEqual(result['host_audit']['applied_rule'], 'ACCESS_DENIED')
        self.assertEqual(result['agent_payload']['chunks'], [])

    def test_constituent_substitution_is_denied(self):
        data, profile = self.context('V2-AGG-EXPLICIT-ALLOW')
        data['aggregation']['constituent_refs'] = ['00'*32]
        result = FrozenHost(data, profile).evaluate_and_release(data['candidate'])
        self.assertEqual(result['host_audit']['applied_rule'], 'ACCESS_DENIED')

    def test_unsigned_authorization_change_is_rejected(self):
        data, profile = self.context('V2-AGG-GRANT-DENIED')
        data['observations']['bundle']['body']['aggregate_authorizations'][0]['verdict'] = 'Permitted'
        with self.assertRaises(HostVerificationError):
            FrozenHost(data, profile).evaluate_and_release(data['candidate'])

    def test_valid_old_proof_fails_monotonic_freshness(self):
        data, profile = self.context('V2-ROLLBACK-VALID-OLD-PROOF')
        result = FrozenHost(data, profile).evaluate_and_release(data['candidate'])
        self.assertEqual(result['host_audit']['applied_rule'], 'STATE_UNAVAILABLE')
        self.assertEqual(result['agent_payload']['chunks'], [])
        data['anchors']['minimum_leaf_count'] = 1
        self.assertEqual(FrozenHost(data, profile).evaluate_and_release(data['candidate'])['host_audit']['decision'], 'Admit')

    def test_projection_does_not_override_authoritative_state(self):
        revoked = self.release('V2-PROJECTION-REVOKED')
        self.assertEqual(revoked['host_audit']['decision'], 'Reject')
        self.assertEqual(revoked['agent_payload']['chunks'], [])
        self.assertEqual(self.release('V2-PROJECTION-STILL-CURRENT')['host_audit']['decision'], 'Admit')

    def test_chunk_and_payload_limits(self):
        exact = self.release('V2-LIMIT-CHUNK-AND-PAYLOAD-EXACT')
        self.assertEqual(sum(len(bytes.fromhex(c['bytes_hex'])) for c in exact['agent_payload']['chunks']), 65536)
        over = self.release('V2-LIMIT-CHUNK-OVER')
        self.assertEqual(over['host_audit']['applied_rule'], 'REQUEST_INVALID')
        self.assertEqual(over['agent_payload']['chunks'], [])


if __name__ == '__main__':
    unittest.main()
