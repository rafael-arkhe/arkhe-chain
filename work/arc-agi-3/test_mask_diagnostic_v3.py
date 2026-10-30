import unittest
from mask_diagnostic_v3 import compare,collect,controls

class Tests(unittest.TestCase):
    def test_missing_groups_or_changed_query_counts_are_not_silently_intersected(self):
        with self.assertRaises(ValueError):compare({'none':{'a':[10,10,10]},'mask':{'b':[10,10,10]}},20)
        with self.assertRaises(ValueError):compare({'none':{'a':[10,10,10]},'mask':{'a':[9,9,9]}},20)

    def test_undefined_conditional_error_remains_undefined(self):
        r=compare({'none':{'a':[10,0,0],'b':[10,0,0]},'mask':{'a':[10,10,10],'b':[10,10,10]}},20)
        d=r['results']['mask']['paired_differences_mask_minus_none']
        self.assertIsNone(d['conditional_error']['point']);self.assertEqual(d['conditional_error']['defined_draws'],0)
        self.assertEqual(d['selective_loss']['point'],-.5)

    def test_unchanged_compression_does_not_override_prediction_harm(self):
        r=compare({'none':{'a':[10,10,10],'b':[10,10,10]},'mask':{'a':[10,10,0],'b':[10,10,0]}},20)
        self.assertEqual(r['results']['mask']['descriptive_screen'],'EXCEEDS_MARGIN_IN_CONDITIONAL_BOOTSTRAP')
        self.assertFalse(r['results']['mask']['promotion_allowed'])

    def test_learned_intersection_cannot_be_pooled(self):
        with self.assertRaises(ValueError):collect({},'train_intersection_aux','mode')

    def test_all_four_known_controls(self):
        self.assertEqual(controls(20)['status'],'PASS')

if __name__=='__main__':unittest.main()
