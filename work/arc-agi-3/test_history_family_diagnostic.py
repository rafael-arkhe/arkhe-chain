import tempfile
import unittest
from pathlib import Path
from hidden_mechanics_micro import render
from history_family_diagnostic import HistoryDiagnostic, j2_jump_position
from run_history_family_control import run, verify


class HistoryFamilyTests(unittest.TestCase):
    def test_j2_intermediate_destination_and_border(self):
        base = [[0]*8 for _ in range(8)]
        base[3][3] = 2
        self.assertEqual(j2_jump_position(base, (2, 3), (2, 0)), (2, 3))
        self.assertEqual(j2_jump_position(base, (2, 5), (2, 0)), (4, 5))
        base[5][4] = 2
        self.assertEqual(j2_jump_position(base, (2, 5), (2, 0)), (2, 5))
        self.assertEqual(j2_jump_position(base, (7, 5), (2, 0)), (7, 5))

    def test_incremental_history_not_last_transition(self):
        base = [[0]*8 for _ in range(8)]; base[3][3] = 2
        d = HistoryDiagnostic()
        a = d.observe(base, render(base, (2,3)), 'ACTION1', render(base, (2,3)))
        b = d.observe(base, render(base, (2,5)), 'ACTION1', render(base, (4,5)))
        self.assertGreater(a['current_transition_candidates'], 0)
        self.assertFalse(a['history_incompatible'])
        self.assertEqual(b['current_transition_candidates'], 24)
        self.assertTrue(b['history_incompatible']); self.assertFalse(b['transition_incompatible'])
        repeated = d.observe(base, render(base, (2,5)), 'ACTION1', render(base, (4,5)))
        self.assertTrue(repeated['history_incompatible'])

    def test_controls_and_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'run'; report = run(out)
            self.assertEqual(report['cases']['J2_WITNESS']['final_candidates'], 0)
            self.assertEqual(report['cases']['J1_COMPATIBLE_CONTROL']['final_candidates'], 24)
            self.assertEqual(verify(out)['environment_actions'], 0)
