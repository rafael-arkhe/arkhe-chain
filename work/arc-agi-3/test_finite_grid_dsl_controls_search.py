import unittest
import json
import finite_grid_dsl_controls_search as s
import finite_grid_dsl_types as d

class ControlProfileSearchTests(unittest.TestCase):
    def test_pruning_preserves_small_complete_grammar(self):
        env=(('g',d.G),('a',d.A),('s',d.S))
        for target in (s.ROOT,d.D,('Option',d.D)):
            for size in range(1,6):
                a=s.ControlGenerator(False,max_expansions=100000)
                b=s.ControlGenerator(True,max_expansions=100000)
                normalize=lambda items:[json.dumps(x,sort_keys=True) for x in items]
                self.assertEqual(normalize(a.expressions(target,size,env)),normalize(b.expressions(target,size,env)))
    def test_scope_aware_inhabitation(self):
        g=s.ControlGenerator();self.assertFalse(g.inhabits(d.O,1,{d.G}))
        self.assertTrue(g.inhabits(d.O,1,{d.G,d.O}))
    def test_analysis_budget_is_incomplete(self):
        r=s.search([],max_analysis_states=1)
        self.assertEqual(r['search_status'],'SEARCH_INCOMPLETE_ANALYSIS')
    def test_profile_contains_control_operators(self):
        allowed=set(s.PROFILE_CONTROLS)|set(s.SPECIAL)|{'var','literal','lambda'}
        def walk(x):
            self.assertIn(x['op'],allowed)
            for child in x.get('args',[]):walk(child)
        for ast in d.controls().values():walk(ast)
