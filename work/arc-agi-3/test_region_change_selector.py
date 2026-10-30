import unittest
import region_change_selector as s


def grid(xs):
    g=[[0]*10 for _ in range(10)]
    for x in xs:g[3][x]=5
    return g

class SelectorTests(unittest.TestCase):
    def test_frozen_inference_before_action_only(self):
        m=s.Selector();before=grid([3]);after=grid([4]);rows=s.examples(before,{'id':4})
        for _ in range(2):m.observe(rows,after,before)
        h=s.b.digest(m.export());self.assertEqual(m.predict(rows[0][0])[0],1)
        self.assertEqual(s.b.digest(m.export()),h)
        self.assertIsNone(m.predict(s.examples(before,{'id':3})[0][0])[0])
    def test_conflicting_labels_abstain(self):
        m=s.Selector();b=grid([3]);rows=s.examples(b,{'id':4})
        m.observe(rows,b,b);m.observe(rows,grid([4]),b)
        self.assertEqual(m.predict(rows[0][0])[1],'CONFLICTING_LABELS')
    def test_growth_is_not_footprint_change(self):
        m=s.Selector();b=grid([3]);rows=s.examples(b,{'id':4})
        for _ in range(2):m.observe(rows,grid([3,4]),b)
        self.assertEqual(m.predict(rows[0][0])[0],0)
        self.assertNotEqual(b,grid([3,4]))
