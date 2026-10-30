import copy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from containment_mounts import evaluate_cases
from native_candidate_assessors import evaluate, baseline
from native_unified_adapter import NativeTrial, NativeAdapter
from unified_containment_runner import VECTORS
from run_resource_trial import LIMITS


def oracle():
    return {'status': 'CapEff:\t0000000000000000\nNoNewPrivs:\t1\nSeccomp:\t2\n',
            'namespaces': {'mnt': 'target'}, 'observer_namespaces': {'mnt': 'observer'},
            'membership': 'target', 'observer_membership': 'observer', 'cgroup': dict(LIMITS),
            'container_id': 'a'*64, 'host_pid': 12, 'boot_id': 'same-boot', 'mountinfo': 'unchanged'}


def observation(value):
    return {'state': 'OBSERVED', 'observations': json.dumps(value)}


class CandidateAssessmentTests(unittest.TestCase):
    def test_mount_errno_133_is_explicit_and_legacy_stays_eperm(self):
        obs = observation({'schema': 2, 'arch': 'x86_64', 'cases': [
            {'syscall': name, 'number': nr, 'result': -1, 'errno': 133}
            for name, nr in [('mount',165),('umount2',166),('pivot_root',155)]]})
        self.assertEqual(evaluate_cases(obs), 'FAIL')
        self.assertEqual(evaluate('mount-capability', obs, oracle(), oracle(), {}, ''), 'PASS')
        data = json.loads(obs['observations']);data['cases'][0]['errno'] = 1
        self.assertEqual(evaluate('mount-capability', observation(data), oracle(), oracle(), {}, ''), 'FAIL')

    def test_ffi_held_init_child_pid(self):
        data = {'arch':'x86_64', 'rust_pid':7, 'libc_pid':7, 'raw_pid':7, 'getppid':1, 'getppid_errno':0}
        self.assertEqual(evaluate('ffi-control', observation(data), oracle(), oracle(), {}, ''), 'PASS')
        for key, value in [('getppid',0),('raw_pid',8),('getppid_errno',133),('rust_pid',True)]:
            bad = {**data, key:value}
            self.assertNotEqual(evaluate('ffi-control', observation(bad), oracle(), oracle(), {}, ''), 'PASS')

    def test_effective_swap_and_all_limits_required(self):
        for key in LIMITS:
            bad = oracle();bad['cgroup'][key] = 'incorrect'
            self.assertFalse(baseline(bad))

    def test_identity_change_rejected(self):
        for key in ('container_id','host_pid','boot_id','membership','namespaces'):
            bad=oracle();bad[key]='changed'
            self.assertNotEqual(evaluate('subprocess-control', {'state':'OBSERVED','observations':'child_exit=Some(0)'}, oracle(), bad, {}, ''), 'PASS')

    def test_missing_dynamic_seccomp_is_never_pass(self):
        self.assertEqual(evaluate('seccomp-inventory', observation({}), oracle(), oracle(), {}, ''), 'UNASSESSED')

    def test_cgroup_probe_plus_external_swap(self):
        obs = {'state':'OBSERVED','observations':'\n'.join(k+'='+v for k,v in LIMITS.items() if k!='memory.swap.max')}
        self.assertEqual(evaluate('cgroup-enforcement', obs, oracle(), oracle(), {}, ''), 'PASS')
        bad=oracle();bad['cgroup']['memory.swap.max']='max'
        self.assertEqual(evaluate('cgroup-enforcement', obs, bad, oracle(), {}, ''), 'FAIL')


class NativePolicyTests(unittest.TestCase):
    def setUp(self):
        self.trial = NativeTrial.__new__(NativeTrial)
        self.trial.run_id='test-run'
        self.trial.image='sha256:'+'a'*64
        self.trial.profile_path='/opt/fixed-profile'
        self.trial.network_id='private-oracle'
        self.base=['create','--network=none','--read-only','--cap-drop=ALL', '--security-opt=no-new-privileges',
                   '--memory=1536m','--pids-limit=128','--cpus=2',self.trial.image]

    def policy(self, role):
        with patch('native_unified_adapter.Trial.policy', return_value=list(self.base)):
            return self.trial.policy('arkhe-containment-test-run-'+role, Path('.'), 'true')

    def test_all_22_targets_same_candidate(self):
        for vector in VECTORS:
            args = self.policy(vector)
            for flag in ('--memory=128m','--memory-swap=128m','--pids-limit=16','--cpus=0.5',
                         '--security-opt=seccomp=/opt/fixed-profile','--network=none','--read-only','--cap-drop=ALL'):
                self.assertIn(flag, args, vector)
            self.assertEqual(args, self.policy('identity'))

    def test_build_resources_preserved(self):
        self.assertEqual(self.policy('build'), self.base)
        self.assertEqual(self.policy('oracle-build'), self.base)

    def test_private_network_exception_only_for_positive_and_oracle(self):
        self.assertIn('--network=private-oracle', self.policy('positive-tcp-egress-before'))
        self.assertIn('--memory=128m', self.policy('positive-tcp-egress-before'))
        self.assertIn('--network=private-oracle', self.policy('oracle'))
        self.assertIn('--network=none', self.policy('tcp-egress'))

    def test_missing_fixture_network_rejected(self):
        self.trial.network_id=None
        with self.assertRaises(ValueError): self.policy('positive-tcp-egress-before')

    def test_stale_contract_rejected_before_creating_targets(self):
        adapter=NativeAdapter.__new__(NativeAdapter)
        adapter.trial=SimpleNamespace(image=self.trial.image)
        with self.assertRaisesRegex(ValueError, 'binding mismatch'):
            adapter.preflight({'contract_sha256':'wrong'}, 100)

    def test_local_wsl_cp_destination_translation(self):
        self.trial.engine=['podman','--connection','arkhe-containment']
        self.trial.active_deadline=None
        destination=Path(__file__).resolve().parents[2]/'docs/evidence/reference'
        with patch('native_unified_adapter.CapturedSmoke.call',return_value=b'ok') as call:
            self.trial.call([*self.trial.engine,'cp','a'*64+':/etc/debian_version',str(destination)])
            self.assertTrue(call.call_args.args[0][-1].startswith('/mnt/'))

    def test_oracle_uses_external_file_redirection(self):
        with patch('native_unified_adapter.Trial.policy', return_value=list(self.base)) as call:
            self.trial.policy('arkhe-containment-test-run-oracle',Path('.'),'exec /work/canary "$1"')
            self.assertTrue(call.call_args.args[3].endswith(' > /work/events.jsonl'))

    def test_evidence_failure_never_prevents_cleanup(self):
        adapter=NativeAdapter.__new__(NativeAdapter)
        adapter.trial=SimpleNamespace(active_deadline=None,canary_id='owned',ids=['owned'],canaries=set(),network_id=None,
                                      report={'lease_released':True,'tracers_stopped':True,'errors':[]})
        adapter.trial.events=lambda **kwargs: (_ for _ in ()).throw(ValueError('bad final evidence'))
        with patch('native_unified_adapter.Trial.finish') as finish:
            result=adapter.cleanup({'run_id':'x','contract_sha256':'a','source_snapshot_sha256':'b','image':'i',
                                    'probe_binary_sha256':'c','profile':{},'runtime':{}}, 100)
            finish.assert_called_once_with(adapter.trial)
            self.assertIn('final oracle evidence',result['errors'][0])


if __name__ == '__main__':unittest.main()
