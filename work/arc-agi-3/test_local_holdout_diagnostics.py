import tempfile
import unittest
from pathlib import Path
from local_holdout_diagnostics import commit, AuditedReader, scan, checkpoint, verify_chain, run


class HoldoutDiagnosticsTests(unittest.TestCase):
    def test_wrapper_and_bypass(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'data.json'
            commitment, marker = commit(path, [{'label': 42}])
            reader = AuditedReader(path, commitment)
            with self.assertRaises(PermissionError):
                reader.read('dev', 'DEV', 'repair')
            self.assertEqual(reader.read('eval', 'EVAL', 'score'), [{'label': 42}])
            self.assertNotIn(marker, str(commitment))
            self.assertEqual(scan(marker, {'labels': b'42'})['absence_of_leakage'], 'NOT_ESTABLISHED')
            path.write_text('{}')
            with self.assertRaises(ValueError):
                reader.read('eval', 'EVAL', 'score')

    def test_truncation_requires_reference(self):
        first = checkpoint('0' * 64, 0, [1])
        second = checkpoint(first['hash'], 1, [2])
        verify_chain([first, second], second['hash'])
        verify_chain([first])
        with self.assertRaises(ValueError):
            verify_chain([first], second['hash'])
        with self.assertRaises(ValueError):
            verify_chain([second])
        first['records'] = [99]
        with self.assertRaises(ValueError):
            verify_chain([first, second])

    def test_demo_negative_controls(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = run(Path(tmp) / 'out')
            self.assertEqual(report['positive_marker_control']['status'], 'MARKER_DETECTED')
            self.assertEqual(report['bypass_without_marker_control']['status'], 'NOT_DETECTED_IN_SCANNED_ARTIFACTS')
            self.assertTrue(report['suffix_rejected_with_original_head'])
            self.assertFalse(report['bypass_read_registered'])
