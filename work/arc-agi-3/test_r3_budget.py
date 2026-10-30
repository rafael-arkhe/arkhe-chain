import tempfile
import unittest
from pathlib import Path
from run_r3_budget import run, verify


class R3BudgetTests(unittest.TestCase):
    def test_known_case_and_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'run'; report = run(out, layouts=(42,))
            case = next(p for p in report['pairs'] if p['episode'] == 'JUMP_ACTION2-layout42')
            self.assertEqual(case['failure_10'], 'IDENTIFICATION_BUDGET_EXHAUSTED')
            self.assertEqual(case['singleton_step_10'], 16)
            self.assertEqual(case['singleton_step_20'], 16)
            self.assertIsNone(case['failure_20'])
            self.assertEqual(case['terminal_marker_20'], 4)
            self.assertEqual(case['stay_ratio_20'], 1)
            self.assertEqual(verify(out)['actions'], 500)
