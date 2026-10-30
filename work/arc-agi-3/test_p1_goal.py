import tempfile
import unittest
from pathlib import Path
from run_p1_goal import run, verify


class P1GoalTests(unittest.TestCase):
    def test_short_composition_and_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'run'
            report = run(out, (2, 2, 2))
            self.assertEqual(report['summary']['actions'], 300)
            self.assertEqual(report['summary']['terminal_discriminative'], 6)
            self.assertEqual(report['summary']['terminal_on_selected_target'], 6)
            self.assertEqual(report['summary']['successes'], 5)
            self.assertEqual(report['summary']['planning_failures'], 0)
            self.assertIsNone(report['chains'][-1]['next_choice_confirmation'])
            self.assertEqual(report['episodes'][0]['identification_events'][0]['label'], 'INITIAL_IDENTIFIED')
            self.assertTrue(report['episodes'][1]['inherited_singleton'])
            self.assertEqual(verify(out)['status'], 'LOCAL_FULL_REPLAY_VERIFIED')
            path = out / 'report.json'; path.write_text('{}')
            with self.assertRaises(ValueError):
                verify(out)
