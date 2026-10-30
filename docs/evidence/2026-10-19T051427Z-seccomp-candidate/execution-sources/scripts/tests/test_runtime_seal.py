import copy,json,unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from audit_runtime_seal import audit
from runtime_containment import ROOT
class SealAuditTests(unittest.TestCase):
    def setUp(self):
        self.contract=json.loads((ROOT/'config/runtime-unified-contract.json').read_text())
        self.catalog=json.loads((ROOT/'config/runtime-containment-vectors.json').read_text())
    def codes(self):return {i['code'] for i in audit(self.contract,self.catalog)['issues']}
    def test_draft_is_not_sealed(self):
        r=audit(self.contract,self.catalog);self.assertFalse(r['sealed']);self.assertFalse(r['execution_started']);self.assertFalse(r['runtime_verified']);self.assertEqual(r['state'],'SEAL_BLOCKED')
    def test_missing_manifests_block(self):self.assertIn('UNBOUND_ARTIFACT',self.codes())
    def test_hashes_alone_do_not_seal(self):
        self.contract['state']='READY_FOR_SEAL'
        for section in ['mount_contract','seccomp_contract']:
            for key in self.contract[section]:
                if key.endswith('_sha256'):self.contract[section][key]='a'*64
        self.assertFalse(audit(self.contract,self.catalog)['sealed'])
    def test_duplicate_vector_blocks(self):
        self.contract['vectors'][-1]=self.contract['vectors'][0];self.assertIn('VECTOR_SET_MISMATCH',self.codes())
    def test_resource_mismatch_blocks(self):
        self.contract['target_profile']['memory_bytes']=1610612736;self.assertIn('TARGET_LIMIT_MISMATCH',self.codes())
    def test_premature_flags_block(self):
        self.contract.update(runtime_verified=True,execution_enabled=True);self.assertTrue({'PREMATURE_VERIFICATION','PREMATURE_EXECUTION'}<=self.codes())
    def test_production_overclaim_blocks(self):
        self.contract['target_profile']['production_1536m_approval']=True;self.assertIn('PRODUCTION_SCOPE_OVERCLAIM',self.codes())
    def test_missing_binding_blocks(self):self.assertIn('MISSING_SEAL_BINDING',self.codes())
    def test_malformed_binding_is_diagnostic_not_crash(self):
        self.contract['seccomp_contract']['profile_file_sha256']='a'*64
        result=audit(self.contract,self.catalog,{'seccomp_profile':'invalid'})
        self.assertIn('MISSING_SEAL_BINDING',{i['code'] for i in result['issues']})
    def test_contract_hash_must_match_detached_binding(self):
        self.contract['seccomp_contract']['profile_file_sha256']='a'*64
        result=audit(self.contract,self.catalog,{'seccomp_profile':{'sha256':'b'*64,'path':'not-present'}})
        self.assertIn('CONTRACT_BINDING_MISMATCH',{i['code'] for i in result['issues']})
    def test_corrupt_bound_artifact_blocks(self):
        r=audit(self.contract,self.catalog,{'probe_binary':{'sha256':'a'*64,'path':'does-not-exist'}})
        self.assertIn('ARTIFACT_HASH_MISMATCH',{i['code'] for i in r['issues']})
if __name__=='__main__':unittest.main()
