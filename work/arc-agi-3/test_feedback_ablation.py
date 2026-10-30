import unittest
import finite_grid_dsl_types as d
from audit_proposal_identity import controls
from run_feedback_ablation import feedback


class FeedbackTests(unittest.TestCase):
    def test_conditions_keep_counterexample_and_stationary_targets(self):
        p={'uses_memory':False,'ast':d.node('pair',d.var('g'),d.var('s'))}
        episodes=controls()['move']
        self.assertEqual(feedback('A',p,episodes),[])
        b=feedback('B',p,episodes)[0]
        c=feedback('C',p,episodes)[0]
        e=feedback('D',p,episodes)[0]
        self.assertEqual(b['training_counterexample'],c['training_counterexample'])
        self.assertEqual(b['training_counterexample'],e['training_counterexample'])
        self.assertEqual(len(c['pixel_counterexample']['differences']),2)
        self.assertIn('blocked',e['repair_instruction'])
