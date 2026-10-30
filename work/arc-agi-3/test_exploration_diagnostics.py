import unittest
from analyze_exploration import analyze,TransitionModel

def row(step,before,after,action,levels=0):
    return {'step':step,'before':before,'after':after,'action':action,'levels_completed':levels}

class Tests(unittest.TestCase):
    def test_repetition_denominator_excludes_reset_and_distinguishes_clicks(self):
        records=[row(1,'s','s',{'id':0}),row(2,'s','s',{'id':6,'x':1,'y':2}),
                 row(3,'s','t',{'id':6,'x':1,'y':3}),row(4,'s','u',{'id':6,'x':1,'y':2},1)]
        r=analyze(records)
        self.assertEqual(r['repeated_exact_state_action_count'],1)
        self.assertEqual(r['repeat_ratio_exact_non_reset'],1/3)
        self.assertEqual(r['first_positive_level_step'],4)
        self.assertEqual(r['exact_self_loop_count'],1)

    def test_empty_does_not_fabricate_zero_ratio(self):
        self.assertIsNone(analyze([])['repeat_ratio_exact_non_reset'])

    def test_confirming_transition_is_not_classified_as_stuck(self):
        records=[row(1,'s','t',{'id':1}),row(2,'s','t',{'id':1})]
        r=analyze(records)
        self.assertEqual(r['same_outcome_repeat_ratio_non_reset'],0.5)
        self.assertEqual(r['stuck_classification'],'NOT_IDENTIFIABLE_FROM_TRANSITION_DUPLICATION')
        self.assertEqual(r['prediction_count'],1)
        self.assertEqual(r['model_prediction_error_on_predictions'],0)

    def test_prediction_is_before_update_and_abstains_on_tie(self):
        records=[row(1,'s','t',{'id':1}),row(2,'s','u',{'id':1}),row(3,'s','u',{'id':1})]
        r=analyze(records)
        self.assertEqual(r['prediction_count'],1)
        self.assertEqual(r['prediction_error_count'],1)
        self.assertEqual(r['repeated_pair_new_outcome_count'],1)
        self.assertEqual(r['same_outcome_repeat_count'],1)
        self.assertEqual(r['repeat_ratio_exact_non_reset'],2/3)
        self.assertEqual(r['transition_novelty_pair_ratio'],1/3)

    def test_unknown_pairs_have_no_scored_prediction(self):
        r=analyze([row(1,'s','t',{'id':1})])
        self.assertEqual(r['prediction_coverage'],0)
        self.assertIsNone(r['model_prediction_error_on_predictions'])

    def test_level_rate_uses_all_dispatches(self):
        r=analyze([row(1,'s','s',{'id':0}),row(2,'s','t',{'id':1},1)])
        self.assertEqual(r['levels_per_100_actions'],50)

if __name__=='__main__':unittest.main()
