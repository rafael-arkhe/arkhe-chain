import unittest
from evaluate_joint_rank_probe import structural

class JointRankArchiveTests(unittest.TestCase):
    def grid(self,pts):
        g=[[0]*10 for _ in range(10)]
        for x,y,c in pts:g[y][x]=c
        return g
    def test_layout_does_not_equal_positions(self):
        a=self.grid([(2,3,5),(6,3,5)]);b=self.grid([(3,3,5),(7,3,5)])
        d=structural(a,b)
        self.assertFalse(d['layout_changed']);self.assertFalse(d['cardinality_changed'])
    def test_equal_count_can_change_signature(self):
        a=self.grid([(2,3,5)]);b=self.grid([(2,3,9)])
        d=structural(a,b)
        self.assertFalse(d['cardinality_changed']);self.assertTrue(d['layout_changed'])
        self.assertTrue(d['signature_multiset_changed'])
