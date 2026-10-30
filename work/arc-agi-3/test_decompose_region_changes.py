import unittest
from decompose_region_changes import describe


def grid(points):
    a=[[0]*10 for _ in range(10)]
    for x,y,c in points:a[y][x]=c
    return a

class DecompositionTests(unittest.TestCase):
    def test_color_change_not_shape_multiset_change(self):
        d=describe(grid([(3,3,5)]),grid([(3,3,9)]))
        self.assertTrue(d['color_shape_multiset_changed']);self.assertFalse(d['shape_only_multiset_changed'])
        self.assertTrue(d['color_only_region_multiset_changed'])
    def test_shape_change_without_cardinality_change(self):
        d=describe(grid([(3,3,5),(4,3,5)]),grid([(3,3,5),(3,4,5)]))
        self.assertFalse(d['cardinality_changed']);self.assertTrue(d['shape_only_multiset_changed'])
        self.assertFalse(d['color_only_region_multiset_changed'])
    def test_repeated_shapes_are_not_semantic_identity(self):
        d=describe(grid([(2,3,5),(7,3,5)]),grid([(3,3,5),(8,3,5)]))
        self.assertEqual(d['complete_same_signature_bijections'],2)
        self.assertIsNone(d['identity_pairing_ambiguity']);self.assertIsNone(d['semantic_shape_change_rate'])
