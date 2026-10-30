import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from containment_filesystem import evaluate, snapshot, decode_cases


class FilesystemOracleTests(unittest.TestCase):
    def setUp(self):
        self.request={'nonce':'a'*64,'sentinel_bytes':b'sentinel'}
        self.before={'sentinel':{'sha256':'known'}}
        self.after={**self.before,'go':{'sha256':hashlib.sha256(b'release\n').hexdigest()}}
        self.external={'sha256':'outside','entries':['sentinel']}
        self.oracle={'mountinfo':'1 0 0:1 / / ro - overlay overlay ro\n2 1 0:2 / /input ro - bind bind ro\n3 1 0:3 / /tmp rw,noexec - tmpfs tmpfs rw\n4 1 0:4 / /work rw - tmpfs tmpfs rw\n'}

    def verdict(self, vector, cases):
        observation={'state':'OBSERVED','observations':json.dumps(cases)}
        return evaluate(vector,observation,self.oracle,self.request,self.before,self.after,
                        self.external,self.external,b'12\n')

    def case(self,name,outcome='error',errno=30,value='denied'):
        return {'case':name,'outcome':outcome,'errno':errno,'value':value}

    def writes(self,errno=30):
        return [self.case(n,errno=errno) for n in ['input-overwrite','input-create','input-rename']]

    def test_readonly_write_denials_with_integrity(self):
        self.assertEqual(self.verdict('input-write',self.writes()),'PASS')

    def test_wrong_path_error_cannot_prove_readonly(self):
        self.assertEqual(self.verdict('input-write',self.writes(errno=2)),'FAIL')

    def test_successful_forbidden_write_is_fail(self):
        cases=self.writes();cases[0]=self.case('input-overwrite','ok',None,'write-succeeded')
        self.assertEqual(self.verdict('input-write',cases),'FAIL')

    def test_modified_input_is_fail(self):
        self.after['sentinel']={'sha256':'changed'}
        self.assertEqual(self.verdict('input-write',self.writes()),'FAIL')

    def test_unexpected_fixture_entry_is_fail(self):
        self.after['unexpected']={}
        self.assertEqual(self.verdict('input-write',self.writes()),'FAIL')

    def test_duplicate_or_missing_attempt_rejected(self):
        with self.assertRaises(ValueError):self.verdict('input-write',self.writes()[:2])
        with self.assertRaises(ValueError):self.verdict('input-write',[self.writes()[0]]*3)

    def test_noexec_accepts_actual_eacces_with_positive_control(self):
        cases=[self.case('work-exec-control','ok',None,'exit=Some(0)'),self.case('tmp-exec',errno=13)]
        self.assertEqual(self.verdict('tmp-noexec',cases),'PASS')
        self.oracle['mountinfo']=self.oracle['mountinfo'].replace('/tmp rw,noexec','/tmp rw')
        self.assertEqual(self.verdict('tmp-noexec',cases),'FAIL')

    def test_noexec_requires_work_control(self):
        cases=[self.case('work-exec-control',errno=13),self.case('tmp-exec',errno=13)]
        self.assertEqual(self.verdict('tmp-noexec',cases),'FAIL')

    def test_inside_symlink_required_for_traversal_negative(self):
        cases=[self.case('inside-symlink-control','ok',None,'sentinel'),
               self.case('traversal-read',errno=2),self.case('outside-symlink-read',errno=2)]
        self.assertEqual(self.verdict('traversal-and-symlink',cases),'PASS')
        cases[0]=self.case('inside-symlink-control',errno=2)
        self.assertEqual(self.verdict('traversal-and-symlink',cases),'FAIL')

    def test_readonly_claim_requires_host_mount_flag(self):
        self.oracle['mountinfo']=self.oracle['mountinfo'].replace('/input ro','/input rw')
        self.assertEqual(self.verdict('input-write',self.writes()),'FAIL')

    def test_changed_external_canary_cannot_pass(self):
        observation={'state':'OBSERVED','observations':json.dumps([
            self.case('outside-read',errno=2),self.case('outside-write',errno=2)])}
        changed={**self.external,'sha256':'changed'}
        result=evaluate('outside-mount-canary',observation,self.oracle,self.request,
                        self.before,self.after,self.external,changed,b'12\n')
        self.assertEqual(result,'FAIL')

    def test_snapshot_never_follows_directory_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory);(p/'unexpected').mkdir()
            with self.assertRaises(ValueError):snapshot(p)
