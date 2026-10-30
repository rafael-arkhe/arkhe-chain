import unittest
import joint_rank_transition_probe as j


def grid(xs):
    g=[[0]*20 for _ in range(10)]
    for x in xs:g[4][x]=5
    return g

class JointRankTests(unittest.TestCase):
    def test_counterexample_preserves_vectors(self):
        a=grid([5,10]);b=grid([6,11]);m=j.JointRankModel()
        m.observe(a,{'id':4},b);m.observe(a,{'id':4},b)
        v=next(iter(m.rules.values()))
        self.assertEqual(v,{((1,0),(1,0)),((6,0),(-4,0))})
        r=m.predict(a,{'id':4});self.assertEqual(r['prediction'],b)
        self.assertEqual(r['total'],2);self.assertEqual(m.training_gate()['status'],'PASS')
    def test_second_transition_selects_constant_rank_rule(self):
        m=j.JointRankModel();m.observe(grid([5,10]),{'id':4},grid([6,11]))
        m.observe(grid([4,10]),{'id':4},grid([5,11]))
        self.assertEqual(next(iter(m.rules.values())),{((1,0),(1,0))})
        self.assertEqual(m.predict(grid([3,8]),{'id':4})['prediction'],grid([4,9]))
    def test_swap_emits_without_identity(self):
        m=j.JointRankModel();a=grid([5,10]);m.observe(a,{'id':4},a)
        r=m.predict(a,{'id':4});self.assertEqual(r['prediction'],a);self.assertFalse(r['identity_certified'])
        self.assertEqual(r['total'],2)
    def test_conflict_gate(self):
        m=j.JointRankModel();a=grid([5,10]);m.observe(a,{'id':4},a);m.observe(a,{'id':4},grid([6,11]))
        self.assertEqual(m.training_gate()['status'],'FAIL');self.assertEqual(m.training_gate()['conflicts'],1)
    def test_budget_and_representation(self):
        a=grid([5,10]);self.assertEqual(j.candidates(a,a,1)['status'],'SEARCH_INCOMPLETE')
        self.assertEqual(j.candidates(a,grid([5]))['status'],'UNSUPPORTED_REPRESENTATION')
        self.assertEqual(j.candidates(grid([]),grid([]))['status'],'NO_REGIONS')
        v={((0,0),(0,0)),((1,0),(1,0))}
        self.assertEqual(j.predict_vectors(a,v,1)['reason'],'SEARCH_INCOMPLETE')
    def test_no_persistence_or_click_support(self):
        m=j.JointRankModel();a=grid([5,10])
        self.assertIsNone(m.predict(a,{'id':4})['prediction'])
        self.assertEqual(m.predict(a,{'id':6,'x':5,'y':4})['reason'],'UNSUPPORTED_ACTION')
