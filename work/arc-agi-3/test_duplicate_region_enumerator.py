import unittest
import duplicate_region_enumerator as e
import object_transition_probe as b


def grid(points):
    g=[[0]*10 for _ in range(10)]
    for x,y,c in points:g[y][x]=c
    return g

class EnumeratorTests(unittest.TestCase):
    def test_static_duplicates_and_mover(self):
        g=grid([(2,2,5),(7,2,5),(4,6,9)])
        options={i:([(1,0)] if o['color']==9 else [(0,0)]) for i,o in enumerate(b.scene(g)['objects'])}
        r=e.predict(g,options);self.assertEqual(r['reason'],'CONSENSUS')
        self.assertEqual(r['prediction'],grid([(2,2,5),(7,2,5),(5,6,9)]))
    def test_unique_context_hypotheses(self):
        g=grid([(2,2,5),(7,6,5),(1,2,9)])
        options={i:([(1,0)] if o['color']==5 and o['y']==2 else [(0,0)]) for i,o in enumerate(b.scene(g)['objects'])}
        self.assertEqual(e.predict(g,options)['prediction'],grid([(3,2,5),(7,6,5),(1,2,9)]))
    def test_identity_ambiguous_render_identical(self):
        g=grid([(2,3,5),(5,3,5)])
        r=e.predict(g,{0:[(0,0),(3,0)],1:[(0,0),(-3,0)]})
        self.assertEqual(r['reason'],'CONSENSUS');self.assertEqual(r['admissible_examined'],2)
        self.assertEqual(r['prediction'],g)
    def test_render_disagreement(self):
        g=grid([(2,3,5),(5,3,5)])
        self.assertEqual(e.predict(g,{0:[(0,0),(1,0)],1:[(0,0)]})['reason'],'AMBIGUOUS_RENDER')
    def test_global_multicell_collision(self):
        g=grid([(1,2,5),(2,2,5),(5,2,9),(6,2,9)])
        self.assertEqual(e.predict(g,{0:[(2,0)],1:[(-1,0)]})['reason'],'NO_ADMISSIBLE_SCENE')
    def test_budget_no_prefix_consensus(self):
        g=grid([(2,3,5)])
        r=e.predict(g,{0:[(0,0),(1,0)]},budget=1)
        self.assertEqual(r['reason'],'SEARCH_INCOMPLETE');self.assertIsNone(r['prediction'])
        self.assertEqual(r['explored'],1);self.assertEqual(r['raw_cartesian_total'],2)
        self.assertEqual(e.predict(g,{0:[(0,0)]},budget=1)['reason'],'CONSENSUS')
    def test_empty_missing_outside(self):
        self.assertEqual(e.predict(grid([]),{})['reason'],'NO_REGIONS')
        g=grid([(2,3,5)])
        self.assertEqual(e.predict(g,{})['reason'],'NO_SUPPORTED_DISPLACEMENT')
        self.assertEqual(e.predict(g,{0:[(-3,0)]})['reason'],'NO_ADMISSIBLE_SCENE')
    def test_hidden_changes_are_scored_wrong(self):
        g=grid([(2,3,5),(5,3,5)])
        stationary=e.predict(g,{0:[(0,0)],1:[(0,0)]})['prediction']
        moved=grid([(3,3,5),(6,3,5)])
        self.assertNotEqual(stationary,moved)
        self.assertNotEqual(e.predict(g,{0:[(1,0)],1:[(1,0)]})['prediction'],g)
    def test_training_conflict_full_context(self):
        g=grid([(2,3,5)]);h=grid([(3,3,5)])
        self.assertEqual(e.training_conflicts([(g,{'id':4},g),(g,{'id':4},h)]),1)
        self.assertEqual(e.gate(2,2,2,1),'FAIL')
        self.assertEqual(e.training_conflicts([({'frame':g,'level':0},4,g),({'frame':g,'level':1},4,h)]),0)
    def test_one_step_consensus_not_two_step_identity(self):
        # Two retained identity-labelled trajectories share pixels at t+1,
        # but their next transitions differ. Enumerator claims only h=1.
        g=grid([(2,3,5),(5,3,5)])
        r=e.predict(g,{0:[(0,0),(3,0)],1:[(0,0),(-3,0)]})
        self.assertEqual(r['prediction'],g);self.assertEqual(r['horizon'],1)
        continuation_a=grid([(3,3,5),(5,3,5)]);continuation_b=grid([(2,3,5),(6,3,5)])
        self.assertNotEqual(continuation_a,continuation_b)
    def test_invalid_and_click(self):
        g=grid([(2,3,5)])
        self.assertEqual(e.predict(g,{0:[(0,0)]},action_id=6)['reason'],'UNSUPPORTED_ACTION')
        with self.assertRaises(ValueError):e.predict(g,{0:[(0,0)]},budget=0)
