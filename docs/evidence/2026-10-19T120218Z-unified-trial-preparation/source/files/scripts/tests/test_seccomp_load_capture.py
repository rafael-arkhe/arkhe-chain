import copy,json,struct,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from seccomp_load_capture import assess,decode_program,number
from run_captured_smoke import validate_wrapper
class LoadCaptureTests(unittest.TestCase):
    def setUp(self):
        self.program=struct.pack('<HBBI',6,0,0,0x7fff0000)
        self.trace={'container_id':'owned','pid':12,'text':'1.000 seccomp(0x1, 0x4, {len=1, filter=[BPF_STMT(0x6|0, 0x7fff0000)]}) = 0\n'}
    def test_load_success_bound_to_bytes_and_pid(self):self.assertEqual(assess([self.trace],'owned',12,self.program)['state'],'CANDIDATE_LOAD_ACCEPTED_OBSERVED')
    def test_failed_load_rejected(self):
        self.trace['text']=self.trace['text'].replace('= 0','= -1 EPERM (Operation not permitted)')
        with self.assertRaises(ValueError):assess([self.trace],'owned',12,self.program)
    def test_wrong_pid_rejected(self):
        with self.assertRaises(ValueError):assess([self.trace],'owned',13,self.program)
    def test_foreign_container_rejected(self):
        with self.assertRaises(ValueError):assess([self.trace],'foreign',12,self.program)
    def test_wrong_bytes_rejected(self):
        with self.assertRaises(ValueError):assess([self.trace],'owned',12,b'wrong')
    def test_duplicate_load_rejected(self):
        with self.assertRaises(ValueError):assess([self.trace,self.trace],'owned',12,self.program)
    def test_probe_without_program_not_evidence(self):
        self.trace['text']='1.0 seccomp(0x1, 0x4, NULL) = -1 EFAULT\n'
        with self.assertRaises(ValueError):assess([self.trace],'owned',12,self.program)
    def test_truncation_rejected(self):
        with self.assertRaises(ValueError):decode_program('BPF_STMT(0x6, 0), ...',2)
    def test_count_mismatch_rejected(self):
        with self.assertRaises(ValueError):decode_program('BPF_STMT(0x6, 0)',2)
    def test_expressions_are_not_executed(self):
        with self.assertRaises(ValueError):number('__import__("os")',255)
    def test_jump_ranges_checked(self):
        with self.assertRaises(ValueError):decode_program('BPF_JUMP(0x15, 0, 256, 0)',1)
    def test_unknown_flags_rejected(self):
        self.trace['text']=self.trace['text'].replace('0x4,','0x8000,')
        with self.assertRaises(ValueError):assess([self.trace],'owned',12,self.program)
    def test_crlf_wrapper_rejected(self):
        with self.assertRaises(ValueError):validate_wrapper(b'#!/usr/bin/python3\r\npass\r\n')
    def test_invalid_generated_wrapper_rejected(self):
        with self.assertRaises(SyntaxError):validate_wrapper(b'#!/usr/bin/python3\nexec(S"broken")\n')
    def test_valid_lf_wrapper(self):validate_wrapper(b'#!/usr/bin/python3\npass\n')
if __name__=='__main__':unittest.main()
