import unittest
import finite_grid_dsl_search as s


def grid():return [[0]*64 for _ in range(64)]

class FiniteDSLSearchTests(unittest.TestCase):
    def test_identity_found_complete_small_profile_size(self):
        g=grid();r=s.search([[(g,{'kind':'NOOP'},g)]],max_nodes=3)
        self.assertEqual(r['search_status'],'COMPLETE');self.assertEqual(r['max_size_fully_explored'],3)
        self.assertEqual(len(r['replay_passed']),1)
    def test_generation_limit_not_model_rejection(self):
        g=grid();r=s.search([[(g,{'kind':'NOOP'},g)]],max_expansions=1)
        self.assertEqual(r['search_status'],'SEARCH_INCOMPLETE_GENERATION')
        self.assertEqual(r['ratification'],'NOT_EVALUATED')
    def test_repeatability(self):
        g=grid();data=[[(g,{'kind':'NOOP'},g)]]
        self.assertEqual(s.search(data,max_expansions=500),s.search(data,max_expansions=500))
    def test_no_match_is_scoped_to_completed_size(self):
        g=grid();target=grid();target[3][3]=5
        r=s.search([[(g,{'kind':'CLICK','x':3,'y':3},target)]],max_nodes=3)
        self.assertEqual(r['search_status'],'COMPLETE');self.assertEqual(r['replay_passed'],[])
