import copy
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from run_syscall_trial import pin_profile, assess_syscall, PINNED_PROFILE

class SyscallTests(unittest.TestCase):
    def setUp(self):
        self.oracle={'status':'NoNewPrivs:\t1\nCapEff:\t0000000000000000\nSeccomp:\t2\n'}
        self.data={'arch':'x86_64','rust_pid':1,'libc_pid':1,'raw_pid':1,'getppid':-1,'getppid_errno':133}
        self.pin={'profile':PINNED_PROFILE,'hash_verified':True,'explicit_oci_profile':True}
    def observation(self,data=None):return {'state':'OBSERVED','observations':json.dumps(self.data if data is None else data)}
    def test_paired_pinned_deny(self):
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,self.pin,True),'PASS')
    def test_errno_eperm_does_not_prove_custom_filter(self):
        self.data['getppid_errno']=1
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,self.pin,True),'FAIL')
    def test_positive_control_required(self):
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,self.pin,False),'ERROR')
    def test_profile_hash_required(self):
        self.pin['hash_verified']=False
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,self.pin,True),'ERROR')
    def test_explicit_oci_path_required(self):
        self.pin['explicit_oci_profile']=False
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,self.pin,True),'ERROR')
    def test_seccomp_mode_alone_insufficient(self):
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,None,True),'ERROR')
    def test_identity_must_match(self):
        self.data['libc_pid']=2
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,self.pin,True),'FAIL')
    def test_ffi_is_positive_control(self):
        self.data.update(getppid=0,getppid_errno=0)
        self.assertEqual(assess_syscall('ffi-control',self.observation(),self.oracle),'PASS')
    def test_mount_denial_no_seccomp_attribution(self):
        self.assertEqual(assess_syscall('mount-capability',self.observation({'mount_result':-1,'mount_errno':1}),self.oracle),'ERROR')
        self.assertEqual(assess_syscall('mount-capability',self.observation({'mount_result':0,'mount_errno':0}),self.oracle),'ERROR')
    def test_privilege_change_rejected(self):
        self.oracle['status']=self.oracle['status'].replace('NoNewPrivs:\t1','NoNewPrivs:\t0')
        self.assertEqual(assess_syscall('seccomp-inventory',self.observation(),self.oracle,self.pin,True),'FAIL')
    def test_duplicate_body_rejected(self):
        with self.assertRaises(ValueError):assess_syscall('ffi-control',{'state':'OBSERVED','observations':'{"arch":"x86_64","arch":"wrong"}'},self.oracle)
    def test_profile_derivation_removes_only_getppid(self):
        source={'defaultAction':'SCMP_ACT_ERRNO','syscalls':[{'names':['getpid','getppid'],'action':'SCMP_ACT_ALLOW'},{'names':['mount'],'action':'SCMP_ACT_ERRNO','errnoRet':1}]}
        old=copy.deepcopy(source);value=pin_profile(source)
        self.assertEqual(source,old)
        self.assertEqual(value['syscalls'][0],{'names':['getpid'],'action':'SCMP_ACT_ALLOW'})
        self.assertEqual(value['syscalls'][1],old['syscalls'][1])
        self.assertEqual(value['syscalls'][-1],{'names':['getppid'],'action':'SCMP_ACT_ERRNO','errnoRet':133})
    def test_boolean_errno_is_not_numeric_evidence(self):
        self.assertEqual(assess_syscall('mount-capability',self.observation({'mount_result':-1,'mount_errno':True}),self.oracle),'ERROR')
        self.data['getppid_errno']=False
        self.assertEqual(assess_syscall('ffi-control',self.observation(),self.oracle),'ERROR')
    def test_array_body_rejected(self):
        self.assertEqual(assess_syscall('ffi-control',self.observation([]),self.oracle),'ERROR')
    def test_allow_by_default_refused(self):
        with self.assertRaises(ValueError):pin_profile({'defaultAction':'SCMP_ACT_ALLOW','syscalls':[]})

if __name__=='__main__':unittest.main()
