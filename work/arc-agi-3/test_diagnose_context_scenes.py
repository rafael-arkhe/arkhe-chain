import unittest
from diagnose_context_scenes import describe

class SceneDiagnosisTests(unittest.TestCase):
    def test_repeated_signatures_not_empty(self):
        g=[[0]*10 for _ in range(10)];g[2][2]=5;g[6][6]=5;g[4][4]=9
        d=describe(g)
        self.assertEqual(d['region_count'],3);self.assertEqual(d['unique_region_count'],1)
        self.assertEqual(d['structural_rejection'],'REPEATED_SIGNATURES')
        self.assertTrue(d['exact_reconstruction']);self.assertIsNone(d['background_correctness'])
    def test_empty_distinct_from_unique(self):
        g=[[0]*10 for _ in range(10)]
        self.assertEqual(describe(g)['structural_rejection'],'EMPTY_SCENE')
        g[3][3]=5;self.assertIsNone(describe(g)['structural_rejection'])
