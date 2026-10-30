import tempfile
import unittest
from pathlib import Path
from hidden_mechanics_micro import advance
from run_r2_extended import EXTENDED, VARIANTS, run, verify


class R2ExtendedTests(unittest.TestCase):
    def test_family_and_destination_only_collision(self):
        self.assertEqual(len(EXTENDED), 124)
        self.assertEqual(len(set(EXTENDED)), 124)
        self.assertEqual(len(VARIANTS), 4)
        base = [[0] * 8 for _ in range(8)]; base[3][2] = 2
        self.assertEqual(advance(base, (3, 3), (-2, 0)), (1, 3))
        base[3][1] = 2
        self.assertEqual(advance(base, (3, 3), (-2, 0)), (3, 3))
        self.assertEqual(advance(base, (0, 0), (-2, 0)), (0, 0))

    def test_all_cases_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'run'; report = run(out)
            self.assertEqual(report['summary']['episodes'], 15)
            self.assertEqual(report['jump_cases']['episodes'], 12)
            self.assertEqual(report['summary']['issued'], report['summary']['exact'])
            self.assertEqual(verify(out)['actions'], 750)
