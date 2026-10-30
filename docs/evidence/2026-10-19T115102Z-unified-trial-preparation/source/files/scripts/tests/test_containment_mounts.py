import copy,json,unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from containment_mounts import evaluate_cases,evaluate,CASES
class MountCasesTests(unittest.TestCase):
    def setUp(self):
        self.data={'schema':2,'arch':'x86_64','cases':[{'syscall':k,'number':v,'result':-1,'errno':1} for k,v in CASES.items()]}
        self.before={'container_id':'owned','host_pid':100,'boot_id':'boot','status':'CapEff:\t0000000000000000\nNoNewPrivs:\t1\n','namespaces':{'mnt':'target'},'observer_namespaces':{'mnt':'host'},'membership':'target','observer_membership':'host','mountinfo':'unchanged'}
        self.after=copy.deepcopy(self.before)
    def obs(self):return {'state':'OBSERVED','observations':json.dumps(self.data)}
    def test_three_denials_and_stable_mounts(self):self.assertEqual(evaluate(self.obs(),self.before,self.after),'PASS')
    def test_missing_subcheck(self):
        self.data['cases'].pop();self.assertEqual(evaluate_cases(self.obs()),'ERROR')
    def test_duplicate_subcheck(self):
        self.data['cases'][2]=self.data['cases'][0];self.assertEqual(evaluate_cases(self.obs()),'ERROR')
    def test_invalid_argument_is_not_denial(self):
        self.data['cases'][1]['errno']=22;self.assertEqual(evaluate_cases(self.obs()),'FAIL')
    def test_nonexistent_path_is_not_denial(self):
        self.data['cases'][2]['errno']=2;self.assertEqual(evaluate_cases(self.obs()),'FAIL')
    def test_syscall_success_fails(self):
        self.data['cases'][0].update(result=0,errno=0);self.assertEqual(evaluate_cases(self.obs()),'FAIL')
    def test_boolean_errno_rejected(self):
        self.data['cases'][0]['errno']=True;self.assertEqual(evaluate_cases(self.obs()),'ERROR')
    def test_wrong_abi_number_rejected(self):
        self.data['cases'][2]['number']=166;self.assertEqual(evaluate_cases(self.obs()),'ERROR')
    def test_changed_mounts_fails(self):
        self.after['mountinfo']='extra mount';self.assertEqual(evaluate(self.obs(),self.before,self.after),'FAIL')
    def test_observer_isolation_required(self):
        self.after['observer_namespaces']['mnt']='target';self.assertEqual(evaluate(self.obs(),self.before,self.after),'ERROR')
    def test_identity_change_blocks(self):
        self.after['host_pid']=101;self.assertEqual(evaluate(self.obs(),self.before,self.after),'ERROR')
    def test_privilege_change_blocks(self):
        self.after['status']=self.after['status'].replace('CapEff:\t0000000000000000','CapEff:\t0000000000000001');self.assertEqual(evaluate(self.obs(),self.before,self.after),'FAIL')
    def test_duplicate_json_rejected(self):self.assertEqual(evaluate_cases({'state':'OBSERVED','observations':'{"schema":2,"schema":2}'}),'ERROR')
    def test_legacy_observation_does_not_cover_three_cases(self):self.assertEqual(evaluate_cases({'state':'OBSERVED','observations':'{"mount_result":-1,"mount_errno":1}'}),'ERROR')
if __name__=='__main__':unittest.main()
