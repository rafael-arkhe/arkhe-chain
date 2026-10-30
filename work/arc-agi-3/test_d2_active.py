import tempfile
import unittest
from pathlib import Path
from run_d2_active import J2Episode, run, verify


class D2ActiveTests(unittest.TestCase):
    def test_single_jump_semantics_and_no_reset(self):
        env = J2Episode()
        self.assertNotIn('RESET', env.observe()['available_actions'])
        env.pos=(2,3); self.assertEqual(env.step('ACTION2')['step'],1)
        self.assertEqual(env.pos,(2,3))
        env.pos=(2,5); env.step('ACTION2'); self.assertEqual(env.pos,(4,5))
        env.step('ACTION1'); self.assertEqual(env.pos,(3,5))

    def test_active_same_trajectory_passive(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'run'; report=run(out)
            self.assertEqual(report['queries'],50)
            self.assertTrue(report['criteria']['C4_same_sets_all_50_steps'])
            self.assertEqual(verify(out)['actions'],50)
