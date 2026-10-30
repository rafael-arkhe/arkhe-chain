import unittest
from localize_region_changes import localize
from decompose_region_changes import describe


def g(points):
    a=[[0]*10 for _ in range(10)]
    for x,y,c in points:a[y][x]=c
    return a

class LocalizationTests(unittest.TestCase):
    def test_growth_old_region_unchanged_pixels(self):
        d=localize(g([(3,3,5)]),g([(3,3,5),(4,3,5)]))
        self.assertEqual(d['sides']['before']['regions'][0]['label'],'NO_DIFF_ON_VISIBLE_CELLS')
        self.assertEqual(d['sides']['before']['diff_on_inferred_background_cells'],1)
        self.assertEqual(d['sides']['after']['regions'][0]['area'],2)
    def test_color_swap_invisible_to_region_color_counts(self):
        a=g([(2,3,5),(7,3,9)]);b=g([(2,3,9),(7,3,5)])
        self.assertFalse(describe(a,b)['color_only_region_multiset_changed'])
        self.assertEqual(localize(a,b)['changed_pixels'],2)
    def test_translation_diff_background(self):
        d=localize(g([(3,3,5)]),g([(4,3,5)]))
        self.assertEqual(d['changed_pixels'],2)
        self.assertEqual(d['sides']['before']['diff_on_inferred_background_cells'],1)
        self.assertEqual(d['sides']['after']['diff_on_inferred_background_cells'],1)
