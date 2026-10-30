"""Mutation checks for the material auditor, not runtime integration tests."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('material_audit', ROOT/'scripts/validate_provenance_broker.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class MaterialAuditMutations(unittest.TestCase):
    def setUp(self):
        self.profile = audit.load(ROOT/'schemas/provenance-broker/profile-v1.json')
        self.fixture = audit.load(Path(__file__).parent/'fixtures/P-02.json')

    def test_rejects_extended_snapshot_validity(self):
        f = copy.deepcopy(self.fixture)
        f['expected_output']['snapshot']['valid_until'] += 1
        with self.assertRaises(AssertionError):
            audit.audit(f, self.profile)

    def test_rejects_payload_bytes_not_bound_to_source(self):
        f = copy.deepcopy(self.fixture)
        f['expected_output']['released_payload']['chunks'][0]['bytes_hex'] = '00'
        with self.assertRaises(AssertionError):
            audit.audit(f, self.profile)

    def test_rejects_superseded_chunk_in_chunks_only_payload(self):
        f = audit.load(Path(__file__).parent/'fixtures/P-05.json')
        f['expected_output']['released_payload']['chunks'].append(
            copy.deepcopy(self.fixture['expected_output']['released_payload']['chunks'][1]))
        with self.assertRaises(AssertionError):
            audit.audit(f, self.profile)

    def test_rejects_changed_policy_without_binding_update(self):
        f = copy.deepcopy(self.fixture)
        f['policy']['max_decision_ttl_ms'] += 1
        with self.assertRaises(AssertionError):
            audit.audit(f, self.profile)

    def test_rejects_unpinned_signing_key(self):
        f = copy.deepcopy(self.fixture)
        f['anchors']['public_key_hex'] = '00'*32
        with self.assertRaises(AssertionError):
            audit.audit(f, self.profile)

    def test_rejects_payload_on_negative_decision(self):
        f = audit.load(Path(__file__).parent/'fixtures/N-07.json')
        f['expected_output']['released_payload'] = copy.deepcopy(self.fixture['expected_output']['released_payload'])
        with self.assertRaises(AssertionError):
            audit.audit(f, self.profile)


if __name__ == '__main__':
    unittest.main()
