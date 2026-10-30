import tempfile
import unittest
from pathlib import Path
from run_e1_family import run, verify


class E1FamilyTests(unittest.TestCase):
    def test_two_fixed_witnesses_and_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'run'; report = run(out)
            for case in report['cases']:
                self.assertEqual(case['first_outside'], case['divergence_step'])
                self.assertEqual(case['premature_outside'], 0)
                self.assertEqual(case['post_detection_issued'], 0)
                self.assertEqual(case['post_detection_fallback'], case['post_detection_queries'])
                self.assertTrue(all(r['hypotheses_after'] == 0 for r in case['rows'] if r['step'] >= case['first_outside']))
            self.assertIsNotNone(report['cases'][1]['first_singleton_step'])
            self.assertLess(report['cases'][1]['first_singleton_step'], 11)
            self.assertEqual(verify(out)['actions'], 100)
