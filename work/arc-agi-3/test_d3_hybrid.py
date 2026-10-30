import unittest
from pathlib import Path
from run_d3_hybrid import analyze


class D3HybridTests(unittest.TestCase):
    def test_retained_prefix_and_counterfactual_branches(self):
        source=Path(__file__).with_name('arc3-d2-start-20261028')
        result=analyze(source)
        self.assertEqual(result['environment_actions'],0)
        for branch,expected in zip(result['branches'],(2,1)):
            self.assertEqual(branch['prefix_candidates'],expected)
            self.assertEqual(branch['ACTION2_prediction_count'],1)
            stay=branch['results']['J2_CONSTRUCTED_STAY']
            jump=branch['results']['J1_CONSTRUCTED_JUMP']
            self.assertEqual(stay['isolated_transition_candidates'],216)
            self.assertEqual(stay['prefix_plus_branch_candidates'],0)
            self.assertEqual(jump['prefix_plus_branch_candidates'],expected)
