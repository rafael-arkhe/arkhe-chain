import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import containment_probe as probe


class ProbeProtocolTests(unittest.TestCase):
    def setUp(self):
        self.request = {'protocol': probe.PROTOCOL, 'vector_id': 'identity', 'nonce': 'a' * 64}
        self.observation = {**self.request, 'state': 'OBSERVED', 'observations': 'Uid: 10001', 'errno': None}

    def decode(self):
        return probe.decode_observation(json.dumps(self.observation).encode(), self.request)

    def test_observation_is_not_a_pass(self):
        self.assertEqual(self.decode()['state'], 'OBSERVED')

    def test_probe_cannot_assert_pass(self):
        self.observation['state'] = 'PASS'
        with self.assertRaises(ValueError):
            self.decode()

    def test_probe_cannot_assert_verification(self):
        self.observation['runtime_verified'] = True
        with self.assertRaises(ValueError):
            self.decode()

    def test_replay_nonce_rejected(self):
        self.observation['nonce'] = 'b' * 64
        with self.assertRaises(ValueError):
            self.decode()

    def test_cross_vector_receipt_rejected(self):
        self.observation['vector_id'] = 'input-write'
        with self.assertRaises(ValueError):
            self.decode()

    def test_protocol_mismatch_rejected(self):
        self.observation['protocol'] = 'unknown/v9'
        with self.assertRaises(ValueError):
            self.decode()

    def test_output_limit_rejected(self):
        with self.assertRaises(ValueError):
            probe.decode_observation(b'x' * 65537, self.request)

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaises(ValueError):
            probe.decode_observation(b'{"state":"OBSERVED","state":"PASS"}', self.request)

    def test_errno_preserves_numeric_os_code(self):
        self.observation.update(state='ERROR', errno=13)
        self.assertEqual(self.decode()['errno'], 13)
        self.observation['errno'] = True
        with self.assertRaises(ValueError):
            self.decode()


class ProbeCollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'docs/evidence').mkdir(parents=True)
        (self.root / 'docs/RUNTIME-CONTAINMENT.md').write_text('test spec')
        catalog = json.loads(probe.CATALOG.read_text())
        runtime = self.root / catalog['runtime_source']
        runtime.parent.mkdir(parents=True)
        runtime.write_text('test runtime')
        self.session = self.root / 'docs/evidence/session'
        self.observations = self.root / 'docs/evidence/observations'
        self.observations.mkdir()
        self.patcher = patch.object(probe, 'ROOT', self.root)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        with contextlib.redirect_stdout(io.StringIO()):
            self.prepared = probe.prepare(self.session)

    def collect(self):
        output = self.root / 'docs/evidence/collected'
        with contextlib.redirect_stdout(io.StringIO()):
            report = probe.collect(self.session, self.observations, output)
        return report, output

    def emit(self, identity='identity', state='OBSERVED'):
        request = json.loads((self.session / 'requests' / (identity + '.json')).read_text())
        data = {key: request[key] for key in ('protocol', 'nonce', 'vector_id')}
        data.update(state=state, observations='test fixture observation', errno=None)
        (self.observations / (identity + '.json')).write_text(json.dumps(data))

    def test_preparation_covers_all_vectors_with_unique_nonces(self):
        requests = [json.loads(p.read_text()) for p in (self.session / 'requests').glob('*.json')]
        self.assertEqual(len(requests), 22)
        self.assertEqual(len({r['nonce'] for r in requests}), 22)
        self.assertFalse(self.prepared['runtime_verified'])
        self.assertFalse(self.prepared['executor_implemented'])

    def test_absent_observations_never_verify_runtime(self):
        report, _ = self.collect()
        self.assertFalse(report['runtime_verified'])
        self.assertEqual(report['status'], 'INCOMPLETE')
        self.assertTrue(all(v['status'] == 'PLANNED' for v in report['vectors']))

    def test_observation_without_oracle_is_unassessed(self):
        self.emit()
        report, output = self.collect()
        entry = next(v for v in report['vectors'] if v['vector_id'] == 'identity')
        self.assertEqual(entry['status'], 'UNASSESSED')
        self.assertFalse(report['runtime_verified'])
        self.assertIn('receipts/identity.json', (output / 'SHA256SUMS').read_text())

    def test_forged_pass_becomes_error(self):
        self.emit(state='PASS')
        report, _ = self.collect()
        self.assertEqual(next(v for v in report['vectors'] if v['vector_id'] == 'identity')['status'], 'ERROR')
        self.assertFalse(report['runtime_verified'])

    def test_changed_fixture_is_rejected(self):
        (self.session / 'fixtures/identity/arkhe-containment-sentinel').write_text('changed')
        report, _ = self.collect()
        self.assertEqual(next(v for v in report['vectors'] if v['vector_id'] == 'identity')['status'], 'ERROR')

    def test_changed_request_is_rejected(self):
        (self.session / 'requests/identity.json').write_text('{}')
        report, _ = self.collect()
        self.assertEqual(next(v for v in report['vectors'] if v['vector_id'] == 'identity')['status'], 'ERROR')

    def test_changed_staged_support_is_rejected(self):
        (self.session / 'network-wire.rs').write_text('changed support')
        with self.assertRaises(ValueError):
            self.collect()

    def test_changed_staged_probe_is_rejected(self):
        (self.session / 'probe.rs').write_text('changed')
        with self.assertRaises(ValueError):
            self.collect()
