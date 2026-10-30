"""Local integration of frozen test sources, request boundary, policy and delivery.

No claims of production identity, Postgres/WormGraph connectivity or live leases.
"""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts'))
from compare_provenance_broker import host_input
from provenance_broker_host import FrozenHost, HostVerificationError
import jsonschema

DATA = Path(__file__).parent


class FrozenSourceIntegration(unittest.TestCase):
    def setUp(self):
        self.profile = json.loads((ROOT/'schemas/provenance-broker/profile-v1.json').read_text(encoding='utf-8'))

    def fixture(self, name):
        return json.loads((DATA/'fixtures'/f'{name}.json').read_text(encoding='utf-8'))

    def run_case(self, name, mutate=None):
        data = host_input(self.fixture(name))
        if mutate:
            mutate(data)
        return FrozenHost(data, self.profile).evaluate_and_release(data['candidate'])

    def test_genuine_sources_release_bound_payload(self):
        f = self.fixture('P-02')
        result = self.run_case('P-02')
        self.assertEqual(result['agent_payload'], f['expected_output']['released_payload'])

    def test_caller_cannot_supply_principal_or_policy(self):
        context = host_input(self.fixture('P-02'))
        host = FrozenHost(context, self.profile)
        for k in ('principal', 'policy_id', 'tenant', 'scope'):
            candidate = deepcopy(context['candidate'])
            candidate['query'][k] = 'forged'
            with self.subTest(field=k), self.assertRaises(jsonschema.ValidationError):
                host.evaluate_and_release(candidate)

    def test_unknown_candidate_cannot_resolve_sources(self):
        context = host_input(self.fixture('P-02'))
        candidate = deepcopy(context['candidate'])
        candidate['candidate_id'] = 'missing'
        with self.assertRaises(HostVerificationError):
            FrozenHost(context, self.profile).evaluate_and_release(candidate)

    def test_unsigned_state_change_is_not_accepted(self):
        with self.assertRaises(HostVerificationError):
            self.run_case('P-02', lambda d: d['observations']['bundle']['body'].update(state='Revoked'))

    def test_signed_revocation_blocks_agent_payload(self):
        result = self.run_case('N-11')
        self.assertEqual(result['host_audit']['decision'], 'Reject')
        self.assertEqual(result['agent_payload']['chunks'], [])

    def test_proof_corruption_overrides_positive_observation(self):
        result = self.run_case('P-02', lambda d: d['chunks'][0]['proof']['steps'][0].update(hash='00'*32))
        self.assertEqual(result['host_audit']['applied_rule'], 'INTEGRITY_INVALID')
        self.assertEqual(result['agent_payload']['chunks'], [])

    def test_blocked_delivery_does_not_export_admitted_payload(self):
        result = self.run_case('D-GRANT-INVALID')
        self.assertEqual(result['host_audit']['decision'], 'Admit')
        self.assertEqual(result['host_audit']['delivery']['outcome'], 'Blocked')
        self.assertEqual(result['agent_payload']['chunks'], [])
        self.assertNotIn('claim', result['agent_payload'])

    def test_chunks_only_omits_superseded_source_and_claim(self):
        result = self.run_case('P-05')
        self.assertEqual([c['chunk_id'] for c in result['agent_payload']['chunks']], ['chunk-1'])
        self.assertNotIn('claim', result['agent_payload'])
        self.assertNotIn('semantic', result['agent_payload'])

    def test_revision_change_blocks_delivery(self):
        result = self.run_case('D-REVISION')
        self.assertEqual(result['host_audit']['delivery']['outcome'], 'Reevaluate')
        self.assertEqual(result['agent_payload']['chunks'], [])

    def test_valid_lease_covers_only_authorization_query(self):
        result = self.run_case('D-GRANT')
        self.assertEqual(result['host_audit']['delivery']['code'], 'ACCESS_GRANT')
        blocked = self.run_case('D-GRANT', lambda d: d['delivery'].update(other_sources_available=False))
        self.assertEqual(blocked['host_audit']['delivery']['outcome'], 'Blocked')
        self.assertEqual(blocked['agent_payload']['chunks'], [])

    def test_analysis_does_not_relabel_evaluation_for_changed_claim(self):
        context = host_input(self.fixture('P-06'))
        request = deepcopy(context['candidate'])
        request['claim']['object'] = 'database:other'
        result = FrozenHost(context, self.profile).evaluate_and_release(request)
        self.assertEqual(result['host_audit']['decision'], 'Admit')
        self.assertNotIn('semantic', result['agent_payload'])


if __name__ == '__main__':
    unittest.main()
