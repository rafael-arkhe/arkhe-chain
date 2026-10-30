import contextlib
import io
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cognition_ci as ci


class CognitionEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.inputs = self.base / 'inputs'
        self.inputs.mkdir()
        self.context = {'GITHUB_REPOSITORY': 'example/arkhe', 'GITHUB_SHA': 'a' * 40,
                        'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}
        for gate in ci.GATES:
            self.create_gate(gate)

    def create_gate(self, gate):
        folder = self.inputs / gate
        folder.mkdir()
        spec = (ci.ROOT / ci.SPEC).read_bytes()
        (folder / 'COGNITION-SDK.md').write_bytes(spec)
        (folder / 'RESULTS.md').write_text('test report\n')
        spec_hash = hashlib.sha256(spec).hexdigest()
        ci.write_json(folder / 'receipt.json', {
            'gate': gate, 'exit_code': 0, 'context': self.context, 'execution': 'github-actions',
            'specification_before_sha256': spec_hash, 'specification_after_sha256': spec_hash})
        attempts = []
        for index, (name, command) in enumerate(ci.GATES[gate]):
            log = f'{index}-{name}.log'
            inventory = f'{index}-{name}.inputs.json'
            (folder / log).write_text('PASS\n')
            inputs = {'test.rs': 'a' * 64}
            ci.write_json(folder / inventory, inputs)
            encoded = json.dumps(inputs, sort_keys=True, separators=(',', ':')).encode()
            identity = hashlib.sha256(encoded).hexdigest()
            attempts.append({'gate': name, 'command': [sys.executable, *command], 'exit_code': 0, 'status': 'PASS',
                             'source_changed_during_execution': False,
                             'source_before_sha256': identity, 'source_after_sha256': identity,
                             'log': log, 'log_sha256': ci.digest(folder / log), 'inputs': inventory})
        ci.write_json(folder / 'results.json', {'context': self.context, 'attempts': attempts})

    def update(self, filename, mutate):
        path = self.inputs / 'conformance' / filename
        value = json.loads(path.read_text())
        mutate(value)
        ci.write_json(path, value)

    def collect(self, jobs=None):
        output = self.base / 'bundle'
        with contextlib.redirect_stdout(io.StringIO()):
            code = ci.bundle(self.inputs, output, self.context, jobs)
        report = json.loads((output / 'results.json').read_text())
        return code, report, output

    def test_valid_bundle_hashes_every_file(self):
        code, report, output = self.collect({'gates': {'result': 'success'}})
        self.assertEqual(code, 0)
        self.assertEqual(report['status'], 'PASS')
        self.assertEqual(report['signature'], 'not-generated-by-this-script')
        for line in (output / 'SHA256SUMS').read_text().splitlines():
            expected, name = line.split('  ', 1)
            self.assertEqual(ci.digest(output / name), expected)
        self.assertIn('results.json', (output / 'SHA256SUMS').read_text())
        self.assertIn('COGNITION-SDK.md', (output / 'SHA256SUMS').read_text())

    def test_tampered_log_rejected(self):
        (self.inputs / 'conformance/0-cognition.log').write_text('forged PASS')
        self.assertEqual(self.collect()[0], 1)

    def test_tampered_inventory_rejected(self):
        (self.inputs / 'conformance/0-cognition.inputs.json').write_text('{}')
        self.assertEqual(self.collect()[0], 1)

    def test_missing_receipt_rejected(self):
        (self.inputs / 'conformance/receipt.json').unlink()
        self.assertEqual(self.collect()[0], 1)

    def test_failed_attempt_rejected(self):
        self.update('results.json', lambda d: d['attempts'][0].update(exit_code=1, status='FAIL'))
        self.assertEqual(self.collect()[0], 1)

    def test_source_change_rejected(self):
        self.update('results.json', lambda d: d['attempts'][0].update(source_changed_during_execution=True))
        self.assertEqual(self.collect()[0], 1)

    def test_mismatched_run_rejected(self):
        self.update('receipt.json', lambda d: d['context'].update(GITHUB_RUN_ATTEMPT='2'))
        self.assertEqual(self.collect()[0], 1)

    def test_failed_upstream_job_rejected(self):
        self.assertEqual(self.collect({'gates': {'result': 'failure'}})[0], 1)

    def test_path_traversal_rejected(self):
        self.update('results.json', lambda d: d['attempts'][0].update(log='../outside.log'))
        self.assertEqual(self.collect()[0], 1)

    def test_changed_specification_rejected(self):
        (self.inputs / 'conformance/COGNITION-SDK.md').write_text('changed')
        self.assertEqual(self.collect()[0], 1)


if __name__ == '__main__':
    unittest.main()
