import unittest
import finite_grid_dsl_types as d
from audit_proposal_identity import controls
from run_example_packages import score


class ScoreTests(unittest.TestCase):
    def test_failure_zero_with_full_denominators(self):
        m=score(controls()['move'])
        self.assertEqual((m['required_correct'],m['required_cells']),(0,2))
        self.assertEqual((m['exact_pairs'],m['pairs']),(0,2))
        self.assertEqual((m['stationary_exact'],m['stationary_pairs']),(0,1))
        self.assertIsNone(m['grid_identity'])

    def test_exact_control_counts_required_and_stationary(self):
        m=score(controls()['click'],{'uses_memory':False,'ast':d.controls()['click']})
        self.assertEqual((m['required_correct'],m['required_cells']),(2,2))
        self.assertEqual((m['exact_pairs'],m['pairs']),(3,3))
        self.assertFalse(m['grid_identity'])
