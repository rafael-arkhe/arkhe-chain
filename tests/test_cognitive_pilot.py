import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pilot', Path(__file__).resolve().parents[1] / 'scripts/cognitive_pilot.py')
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


class PilotTests(unittest.TestCase):
    def test_rejects_external_and_credentialed_endpoints(self):
        for url in ['https://example.org/v1', 'http://localhost:80/v1',
                    'http://user:secret@127.0.0.1:80/v1',
                    'http://127.0.0.1:80/v1?key=x', 'http://127.0.0.1/v1']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                pilot.validate_endpoint(url)

    def test_fixed_balanced_protocol(self):
        cases = list(pilot.cases())
        self.assertEqual(len(cases), 18)
        self.assertEqual(len({c['id'] for c in cases}), 18)
        for condition in ['explicit_rule', 'examples', 'transfer']:
            self.assertEqual(sum(c['condition'] == condition for c in cases), 6)

    def test_labels_are_not_serialized_into_requests(self):
        for case in pilot.cases():
            request = pilot.payload(case, 'test-model')
            changed = dict(case, expected='SECRET_GOLD_LABEL')
            self.assertEqual(request, pilot.payload(changed, 'test-model'))
            self.assertEqual(request['max_tokens'], 128)
            self.assertEqual(request['temperature'], 0)

    def test_truncation_and_explanations_are_not_repaired(self):
        self.assertTrue(pilot.correct_answer(' 11\n', 'stop', '11'))
        for answer, finish in [('11', 'length'), ('answer: 11', 'stop'),
                               ('<think>reason</think>11', 'stop'), ('12', 'stop')]:
            self.assertFalse(pilot.correct_answer(answer, finish, '11'))

    def test_transport_errors_remain_in_denominator(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            weights = root / 'weights'
            binary = root / 'server'
            weights.write_bytes(b'synthetic unit fixture, not a model')
            binary.write_bytes(b'synthetic unit fixture, not a server')
            args = SimpleNamespace(endpoint='http://127.0.0.1:8087/v1',
                output=root / 'output', weights=weights, model='unit-fixture',
                weights_sha256=pilot.digest(weights), server_binary=binary,
                server_sha256=pilot.digest(binary))
            with patch.object(pilot, 'identity', return_value={'commit': 'fixture', 'tree': 'fixture'}), \
                 patch.object(pilot, 'infer', side_effect=TimeoutError('synthetic timeout')), \
                 patch('builtins.print'):
                self.assertEqual(pilot.run(args), 1)
            summary = json.loads((args.output / 'summary.json').read_text())
            for score in summary['conditions'].values():
                self.assertEqual(score, {'correct': 0, 'total': 6, 'errors': 6})
            events = [json.loads(line) for line in (args.output / 'attempts.jsonl').read_text().splitlines()]
            self.assertEqual(sum(e['event'] == 'started' for e in events), 18)
            self.assertEqual(sum(e['event'] == 'finished' for e in events), 18)

    def test_bad_weights_prevent_network_calls(self):
        with tempfile.TemporaryDirectory() as root:
            weights = Path(root) / 'weights'
            weights.write_bytes(b'fixture')
            args = SimpleNamespace(endpoint='http://127.0.0.1:8087/v1',
                output=Path(root) / 'out', weights=weights, weights_sha256='0'*64)
            with patch.object(pilot, 'identity', return_value={}), patch.object(pilot, 'infer') as infer:
                with self.assertRaisesRegex(ValueError, 'weights SHA256 mismatch'):
                    pilot.run(args)
                infer.assert_not_called()


if __name__ == '__main__':
    unittest.main()
