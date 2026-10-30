import copy,json,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runtime_containment import ROOT
from generate_seccomp_candidate import generate,active
from seccomp_bpf import decide
BUNDLE=ROOT/'config/seccomp/arkhe-unified-x86_64-v1'
class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.baseline=json.loads((BUNDLE/'baseline.json').read_text());self.abi=json.loads((BUNDLE/'abi.json').read_text());self.mandatory=json.loads((ROOT/'config/runtime-unified-contract.json').read_text())['seccomp_contract']['mandatory_restricted_syscalls']
    def test_deterministic_generation(self):
        p,r=generate(self.baseline,self.abi,self.mandatory)
        self.assertEqual(p,json.loads((BUNDLE/'profile.json').read_text()));self.assertEqual(r,json.loads((BUNDLE/'rules.json').read_text()))
    def test_no_capability_or_arch_selectors_survive(self):
        p,_=generate(self.baseline,self.abi,self.mandatory)
        self.assertEqual(p['architectures'],['SCMP_ARCH_X86_64'])
        self.assertFalse(any('includes' in r or 'excludes' in r for r in p['syscalls']))
    def test_restrictions_have_no_allow_overlap(self):
        p,_=generate(self.baseline,self.abi,self.mandatory)
        for name in self.mandatory:
            rules=[r for r in p['syscalls'] if name in r['names']]
            self.assertEqual(len(rules),1);self.assertEqual(rules[0]['errnoRet'],133)
    def test_wrong_arch_refused(self):
        self.abi['audit_arch']=0x40000003
        with self.assertRaises(ValueError):generate(self.baseline,self.abi,self.mandatory)
    def test_missing_mandatory_refused(self):
        self.abi['baseline_name_resolution']['mount']=-1
        with self.assertRaises(ValueError):generate(self.baseline,self.abi,self.mandatory)
    def test_unknown_condition_refused(self):
        self.baseline['syscalls'][0]['includes']={'unknown':True}
        with self.assertRaises(ValueError):generate(self.baseline,self.abi,self.mandatory)
    def test_unknown_arg_operator_refused(self):
        self.baseline['syscalls'][2]['args'][0]['op']='SCMP_CMP_UNKNOWN'
        with self.assertRaises(ValueError):generate(self.baseline,self.abi,self.mandatory)
    def test_argument_boolean_refused(self):
        self.baseline['syscalls'][2]['args'][0]['value']=True
        with self.assertRaises(ValueError):generate(self.baseline,self.abi,self.mandatory)
    def test_baseline_not_mutated(self):
        old=copy.deepcopy(self.baseline);generate(self.baseline,self.abi,self.mandatory);self.assertEqual(self.baseline,old)
    def test_capability_include_is_inactive(self):self.assertFalse(active({'includes':{'caps':['CAP_SYS_ADMIN']}}))
    def test_capability_exclude_with_no_caps_is_active(self):self.assertTrue(active({'excludes':{'caps':['CAP_SYS_ADMIN']}}))
    def test_foreign_arch_rule_inactive(self):self.assertFalse(active({'includes':{'arches':['arm64']}}))
    def test_default_change_refused(self):
        self.baseline['defaultAction']='SCMP_ACT_ALLOW'
        with self.assertRaises(ValueError):generate(self.baseline,self.abi,self.mandatory)
    def test_bpf_denies_required_and_allows_controls(self):
        p=(BUNDLE/'candidate.bpf').read_bytes()
        for name in self.mandatory:self.assertEqual(decide(p,self.abi['baseline_name_resolution'][name]),0x50085)
        for name in ['getpid','getppid']:self.assertEqual(decide(p,self.abi['baseline_name_resolution'][name]),0x7fff0000)
    def test_bpf_compatibility_samples_denied(self):
        p=(BUNDLE/'candidate.bpf').read_bytes()
        for row in self.abi['syscalls']:self.assertNotEqual(decide(p,row['number']|0x40000000),0x7fff0000)
        self.assertNotEqual(decide(p,20,arch=0x40000003),0x7fff0000)
    def test_bpf_bad_length_refused(self):
        with self.assertRaises(ValueError):decide(b'bad',39)
    def test_bpf_unknown_instruction_refused(self):
        with self.assertRaises(ValueError):decide(struct.pack('<HBBI',0xffff,0,0,0),39)
    def test_bpf_jump_outside_refused(self):
        with self.assertRaises(ValueError):decide(struct.pack('<HBBI',5,0,0,100),39)
if __name__=='__main__':unittest.main()
