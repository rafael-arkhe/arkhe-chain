import unittest
from analyze_prediction_scope import analyze

def row(source='s',target='t',prediction=None,action=1,x=None):
    data={'id':action}
    if x is not None:data.update(x=x,y=0)
    return {'before':source,'after':target,'action':data,'prediction':{'predicted_next':prediction}}

class Tests(unittest.TestCase):
    def test_frequency_and_unique_visited_pair_coverage_differ(self):
        r=analyze([row()]+[row(prediction='t') for _ in range(9)])
        self.assertEqual(r['prediction_frequency'],0.9)
        self.assertEqual(r['visited_pair_prediction_coverage'],1)
        self.assertEqual(r['unseen_pair_predictions'],0)
        self.assertIsNone(r['fragmentation_rate'])

    def test_error_is_per_prediction_event(self):
        r=analyze([row(prediction='t'),row(target='u',prediction='t')])
        self.assertEqual(r['prediction_error_on_issued_predictions'],0.5)
        self.assertEqual(r['unseen_pair_predictions'],1)

    def test_coordinates_distinguish_pairs_and_reset_is_excluded(self):
        r=analyze([row(action=0),row(action=6,x=1),row(action=6,x=2,prediction='t')])
        self.assertEqual(r['prediction_queries_non_reset'],2)
        self.assertEqual(r['visited_state_action_pairs'],2)
        self.assertEqual(r['visited_pair_prediction_coverage'],0.5)

    def test_empty_denominators_are_not_zero_error(self):
        r=analyze([])
        self.assertIsNone(r['prediction_frequency'])
        self.assertIsNone(r['prediction_error_on_issued_predictions'])
        self.assertIsNone(r['visited_pair_prediction_coverage'])

if __name__=='__main__':unittest.main()
