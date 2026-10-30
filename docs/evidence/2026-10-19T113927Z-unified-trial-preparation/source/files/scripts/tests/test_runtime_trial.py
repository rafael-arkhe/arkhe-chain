import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_containment_trial import assess, bounded


class RuntimeTrialTests(unittest.TestCase):
    def setUp(self):
        self.oracle = {
            'status': 'Uid:\t110000\t110000\t110000\t110000\nNoNewPrivs:\t1\nCapEff:\t0000000000000000\n',
            'uid_map': '0 1000 1\n1 100000 65536\n',
            'cgroup': {'memory.max': '1610612736\n', 'pids.max': '128\n', 'cpu.max': '200000 100000\n'}}
        self.observation = {'state': 'OBSERVED', 'observations': 'Uid:\t10001\t10001\t10001\t10001\n'}

    def test_rootless_uid_mapping_required(self):
        self.assertEqual(assess('identity', self.observation, self.oracle, ''), 'PASS')
        self.oracle['uid_map'] = '0 2000 65536\n'
        self.assertEqual(assess('identity', self.observation, self.oracle, ''), 'FAIL')

    def test_no_new_privileges_required(self):
        self.oracle['status'] = self.oracle['status'].replace('NoNewPrivs:\t1', 'NoNewPrivs:\t0')
        self.assertEqual(assess('identity', self.observation, self.oracle, ''), 'FAIL')

    def test_cgroup_observer_and_probe_must_agree(self):
        self.observation['observations'] = 'memory.max=1610612736\npids.max=128\ncpu.max=200000 100000'
        self.assertEqual(assess('cgroup-enforcement', self.observation, self.oracle, ''), 'PASS')
        self.oracle['cgroup']['memory.max'] = 'max\n'
        self.assertEqual(assess('cgroup-enforcement', self.observation, self.oracle, ''), 'FAIL')

    def test_seccomp_inventory_never_proves_filter(self):
        self.assertEqual(assess('seccomp-inventory', self.observation, self.oracle, ''), 'UNASSESSED')

    def test_mount_inventory_never_proves_enforcement(self):
        self.assertEqual(assess('mount-inventory', self.observation, self.oracle, ''), 'UNASSESSED')

    def test_subprocess_is_positive_control(self):
        self.observation['observations'] = 'child_exit=Some(0)'
        self.assertEqual(assess('subprocess-control', self.observation, self.oracle, ''), 'PASS')
        self.observation['observations'] = 'child_exit=Some(1)'
        self.assertEqual(assess('subprocess-control', self.observation, self.oracle, ''), 'FAIL')

    def test_input_bytes_are_not_newline_normalized(self):
        sentinel = 'sentinel:nonce\r\n'
        self.observation['observations'] = sentinel
        self.assertEqual(assess('input-read-control', self.observation, self.oracle, sentinel), 'PASS')
        self.assertEqual(assess('input-read-control', self.observation, self.oracle, sentinel.replace('\r\n','\n')), 'FAIL')

    def test_unsupported_is_not_pass(self):
        self.observation['state'] = 'UNSUPPORTED'
        self.assertEqual(assess('identity', self.observation, self.oracle, ''), 'UNSUPPORTED')

    def test_supervisor_limits_output(self):
        with self.assertRaises(ValueError):
            bounded([sys.executable, '-c', 'print("x"*10000)'], timeout=3, limit=64)

    def test_supervisor_kills_timed_out_client(self):
        with self.assertRaises(TimeoutError):
            bounded([sys.executable, '-c', 'import time;time.sleep(5)'], timeout=0.2, limit=64)
