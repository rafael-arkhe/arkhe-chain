import tempfile
import unittest
from pathlib import Path
from run_d2_start import run, verify
from run_d2_active import J2Episode


class D2StartTests(unittest.TestCase):
    def test_stated_one_action_paths(self):
        env=J2Episode(); env.pos=(2,2); env.step('ACTION3'); self.assertEqual(env.pos,(2,3))
        env=J2Episode(); env.pos=(0,3); env.step('ACTION2'); self.assertEqual(env.pos,(2,3))
        env=J2Episode(); env.pos=(1,3); env.step('ACTION2'); self.assertEqual(env.pos,(1,3))

    def test_paired_active_and_passive(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'run'; report=run(out)
            self.assertEqual(report['actions'],150)
            for result in report['results']:
                self.assertTrue(result['active_report']['criteria']['C4_same_sets_all_50_steps'])
                if result['active_report']['criteria']['C1_ACTION2_at_A_steps']:
                    self.assertTrue(result['visitation']['V_A'])
                if result['active_report']['criteria']['C2_ACTION2_at_B_steps']:
                    self.assertTrue(result['visitation']['V_B'])
            self.assertEqual(report['results'][0]['active_report']['first_singleton_step'],5)
            self.assertEqual(verify(out)['actions'],150)
