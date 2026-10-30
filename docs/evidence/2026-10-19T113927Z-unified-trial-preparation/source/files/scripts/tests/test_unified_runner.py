import copy
from pathlib import Path
import tempfile
import unittest

from runtime_source_snapshot import freeze, verify, sha
from unified_containment_runner import make_plan, context, collect, orchestrate, RunJournal
import json


def plan():
    return make_plan({'target_profile': {'memory_bytes': 134217728}, 'runtime': {'engine': 'test-double'}}, 'a'*64, 'sha256:'+'b'*64, 'c'*64)


def receipt(p, request):
    return {**{k: request[k] for k in ('vector_id', 'ordinal', 'nonce')}, 'context': context(p),
            'status': 'PASS', 'target_removed': True,
            'subchecks': {k: {'status': 'PASS', 'evidence': 'test fixture only', 'sha256': sha(b'test fixture only')}
                          for k in request['required_subchecks']}}


def cleanup(p):
    return {'context': context(p), **{k: True for k in ('targets_removed', 'auxiliaries_removed', 'lease_released', 'tracers_stopped')}}


class UnifiedRunnerTests(unittest.TestCase):
    def setUp(self):
        self.p = plan()
        self.receipts = [receipt(self.p, r) for r in self.p['requests']]

    def assess(self, receipts=None, **kwargs):
        return collect(self.p, self.receipts if receipts is None else receipts, kwargs.get('cleanup', cleanup(self.p)), kwargs.get('unchanged', True))

    def test_complete_does_not_grant_runtime_approval(self):
        result = self.assess()
        self.assertEqual(result['status'], 'OBSERVATIONS_COMPLETE')
        self.assertFalse(result['runtime_verified'])
        self.assertFalse(result['sealed'])

    def test_missing(self):
        self.assertEqual(self.assess(self.receipts[:-1])['status'], 'INCOMPLETE')

    def test_replay(self):
        self.receipts[1] = self.receipts[0]
        self.assertTrue(self.assess()['errors'])

    def test_tuple_mismatch(self):
        for key in ('run_id', 'image', 'profile', 'runtime', 'probe_binary_sha256', 'source_snapshot_sha256'):
            rows = copy.deepcopy(self.receipts)
            rows[0]['context'][key] = 'other'
            self.assertTrue(self.assess(rows)['errors'], key)

    def test_unassessed(self):
        self.receipts[0]['status'] = 'UNASSESSED'
        self.assertTrue(self.assess()['errors'])

    def test_subcheck_missing_or_corrupt(self):
        self.receipts[0]['subchecks']['observation']['sha256'] = '0'*64
        self.assertTrue(self.assess()['errors'])
        del self.receipts[0]['subchecks']['observation']
        self.assertTrue(self.assess()['errors'])

    def test_cleanup_and_sources_required(self):
        self.assertTrue(self.assess(cleanup=None)['errors'])
        self.assertTrue(self.assess(unchanged=False)['errors'])

    def test_cannot_remove_mandatory_plan_subchecks(self):
        self.p['requests'][0]['required_subchecks'] = []
        self.assertTrue(self.assess()['errors'])

    def test_duplicate_nonce_rejected(self):
        self.p['requests'][1]['nonce'] = self.p['requests'][0]['nonce']
        self.assertTrue(self.assess()['errors'])

    def test_run_id_cannot_escape_paths(self):
        self.p['run_id']='../../other-run'
        self.assertTrue(self.assess()['errors'])

    def test_orchestration_cleans_after_failure_and_stops(self):
        calls = []
        class Adapter:
            def preflight(self, p, deadline): calls.append('preflight')
            def execute(self, p, request, deadline):
                calls.append(request['vector_id'])
                raise TimeoutError('target deadline')
            def cleanup(self, p, deadline):
                calls.append('cleanup')
                return cleanup(p)
        result = orchestrate(self.p, Adapter(), lambda: None, lambda *args: None)
        self.assertEqual(calls, ['preflight', 'identity', 'cleanup'])
        self.assertEqual(result['status'], 'INCOMPLETE')

    def test_orchestration_complete(self):
        class Adapter:
            def preflight(self, p, deadline): pass
            def execute(self, p, request, deadline): return receipt(p, request)
            def cleanup(self, p, deadline): return cleanup(p)
        result = orchestrate(self.p, Adapter(), lambda: None, lambda *args: None)
        self.assertEqual(result['status'], 'OBSERVATIONS_COMPLETE')

    def test_journal_exclusive_and_hash_linked(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'journal'
            journal = RunJournal(folder, self.p['run_id'])
            journal('start', {})
            journal('result', {'status': 'INCOMPLETE'})
            first = (folder / '0000.json').read_bytes()
            second = json.loads((folder / '0001.json').read_text())
            self.assertEqual(second['previous_sha256'], sha(first))
            with self.assertRaises(FileExistsError): RunJournal(folder, self.p['run_id'])

    def test_deadline_stops_before_next_target(self):
        calls = []
        times = iter((0, 871))
        class Adapter:
            def preflight(self, p, deadline): pass
            def execute(self, *args): calls.append('execute')
            def cleanup(self, p, deadline):
                calls.append('cleanup')
                return cleanup(p)
        result = orchestrate(self.p, Adapter(), lambda: None, lambda *args: None, clock=lambda: next(times))
        self.assertEqual(calls, ['cleanup'])
        self.assertEqual(result['status'], 'INCOMPLETE')


class SourceSnapshotTests(unittest.TestCase):
    def test_copy_verify_detect_edit_add_delete_and_frozen_corruption(self):
        for change in ('edit', 'add', 'delete', 'copy'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as temp:
                root = Path(temp) / 'repo'
                (root / 'scripts').mkdir(parents=True)
                source = root / 'scripts/a.py'
                source.write_text('print(1)')
                output = Path(temp) / 'frozen'
                freeze(root, output)
                verify(root, output / 'snapshot.json')
                if change == 'edit': source.write_text('print(2)')
                elif change == 'add': (root / 'scripts/b.py').write_text('new')
                elif change == 'delete': source.unlink()
                else: (output / 'files/scripts/a.py').write_text('corrupt')
                with self.assertRaises(ValueError): verify(root, output / 'snapshot.json')

    def test_empty_closure_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError): freeze(Path(temp), Path(temp) / 'out')


if __name__ == '__main__':
    unittest.main()
