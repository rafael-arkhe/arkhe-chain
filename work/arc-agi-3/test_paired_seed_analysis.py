import unittest
from paired_seed_analysis import paired_blocks,summarize

def rows():
    return [{'seed':seed,'game_id':game,'profile':policy,'status':'COMPLETED',
             'budget':200,'levels_completed':int(policy=='frontier')}
            for seed in (0,1) for game in ('a','b') for policy in ('random','frontier')]

class Tests(unittest.TestCase):
    def test_pairs_seed_vectors_not_individual_transitions(self):
        r=summarize(rows())
        self.assertEqual(r['independent_policy_seed_blocks_assumed'],2)
        self.assertEqual(r['mean_completed_level_difference'],1)
        self.assertIsNone(r['cluster_robust_standard_error_by_game'])
        self.assertFalse(r['preregistered_analysis'])

    def test_missing_duplicate_and_failed_episodes_rejected(self):
        with self.assertRaises(ValueError):paired_blocks(rows()[:-1])
        with self.assertRaises(ValueError):paired_blocks(rows()+[rows()[0]])
        data=rows();data[0]['status']='FAILED'
        with self.assertRaises(ValueError):paired_blocks(data)

if __name__=='__main__':unittest.main()
