import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from assess_runtime_smoke import assess_mounts
from runtime_containment import ROOT
class SmokeAssessmentTests(unittest.TestCase):
    def setUp(self):
        p=ROOT/'docs/evidence/2026-10-19T054917Z-verified-captured-smoke'
        self.c=json.loads((ROOT/'config/runtime-mounts-candidate.json').read_text());self.before=json.loads((p/'host-receipts/before.json').read_text());self.after=json.loads((p/'host-receipts/after.json').read_text());self.s1=json.loads((p/'source-bindings/result-1.json').read_text());self.s2=json.loads((p/'source-bindings/result-2.json').read_text())
    def run_assess(self):return assess_mounts(self.c,self.before,self.after,self.s1,self.s2)
    def test_verified_pair_freezes_candidate_not_runtime(self):
        r=self.run_assess();self.assertFalse(r['runtime_verified']);self.assertFalse(r['sealed']);self.assertEqual(r['verification']['source_bindings_verified'],38)
    def test_missing_source_blocks(self):
        self.s1['records'].pop()
        with self.assertRaises(ValueError):self.run_assess()
    def test_error_row_blocks_even_when_summary_says_verified(self):
        self.s1['records'][0]['status']='ERROR'
        with self.assertRaises(ValueError):self.run_assess()
    def test_source_hash_change_blocks(self):
        self.s2['oci_config_sha256']='changed'
        with self.assertRaises(ValueError):self.run_assess()
    def test_source_row_change_blocks(self):
        self.s2['records'][0]['source']='changed'
        with self.assertRaises(ValueError):self.run_assess()
    def test_device_change_blocks(self):
        self.after['device_metadata']['/dev/null']['minor']=9
        with self.assertRaises(ValueError):self.run_assess()
    def test_mount_state_change_blocks(self):
        self.after['oracle']['mountinfo']+='\n'
        with self.assertRaises(ValueError):self.run_assess()
    def test_boot_change_blocks(self):
        self.after['oracle']['boot_id']='other'
        with self.assertRaises(ValueError):self.run_assess()
    def test_foreign_source_identity_blocks(self):
        self.s2['container_id']='other'
        with self.assertRaises(ValueError):self.run_assess()
    def test_failed_source_verdict_blocks(self):
        self.s1['verdict']='ERROR'
        with self.assertRaises(ValueError):self.run_assess()
if __name__=='__main__':unittest.main()
