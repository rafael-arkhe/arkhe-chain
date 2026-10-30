import copy
import json
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_preview_qualification import ROOT, PROFILE, audit


class PreviewQualificationTest(unittest.TestCase):
    def setUp(self):
        self.contract = json.loads((ROOT / 'config/runtime-preview1536-contract.json').read_text())
        self.catalog = json.loads((ROOT / 'config/runtime-containment-vectors.json').read_text())

    def test_unbound_contract_stays_blocked_without_runtime_effects(self):
        result = audit(self.contract, self.catalog, {})
        self.assertEqual(result['state'], 'SEAL_BLOCKED')
        for field in ('sealed', 'runtime_verified', 'execution_started', 'historical_receipts_imported'):
            self.assertIs(result[field], False)
        self.assertIn('EXTERNAL_AUTHORITY_NOT_ADMITTED', {v['code'] for v in result['issues']})

    def test_reduced_profile_cannot_be_relabelled(self):
        for field, value in [('memory_bytes', 134217728), ('cpu_quota', .5), ('pids_max', 16)]:
            candidate = copy.deepcopy(self.contract)
            candidate['target_profile'][field] = value
            result = audit(candidate, self.catalog, {'profile_id': PROFILE})
            self.assertIn('WRONG_TARGET_PROFILE', {v['code'] for v in result['issues']})

    def test_old_bindings_missing_vectors_and_self_approval_fail(self):
        result = audit(self.contract, self.catalog, {'profile_id': 'arkhe-unified-target-128m/v1'})
        self.assertIn('BINDINGS_PROFILE_MISMATCH', {v['code'] for v in result['issues']})
        self.contract['vectors'].pop()
        self.contract['sealed'] = True
        self.contract['authority']['root_authority_in_native_core'] = True
        codes = {v['code'] for v in audit(self.contract, self.catalog, {})['issues']}
        self.assertTrue({'VECTOR_SET_MISMATCH', 'PREMATURE_APPROVAL', 'AUTHORITY_INSIDE_NATIVE_CORE'} <= codes)
