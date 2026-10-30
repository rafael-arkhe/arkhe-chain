import unittest
from balanced_selection import balanced_bank,left_control,details
from audit_proposal_identity import controls
from dsl_proposal_loop import training_check


class BalancedTests(unittest.TestCase):
    def test_equal_families_unique_fit_and_valid_colors(self):
        rows=balanced_bank();self.assertEqual(len(rows),9)
        self.assertEqual(sum('On CLICK' in x['description'] for x in rows),4)
        self.assertEqual(sum('dx=' in x['description'] for x in rows),4)
        for episodes in [controls()['click'],controls()['move'],left_control()]:
            self.assertEqual(sum(training_check(x['proposal'],episodes)['status']=='REPLAY_PASS' for x in rows),1)

    def test_required_color_comes_only_from_dev_counterexample(self):
        episodes=controls()['click'];wrong=next(x for x in balanced_bank() if 'color 2.' in x['description'])
        mismatch=training_check(wrong['proposal'],episodes)
        result=details({'training_episodes':episodes,'previous_training_feedback':[{'training_counterexample':mismatch}]})
        self.assertEqual(result[0]['differences'],[{'x':2,'y':3,'predicted':2,'required':5}])
