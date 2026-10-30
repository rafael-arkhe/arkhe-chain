import unittest
from collections import Counter
from feedback_itt_and_plan import plan, itt


class PlanTests(unittest.TestCase):
    def test_schedule_balanced_reproducible_and_interleaved(self):
        p=plan();self.assertEqual(p,plan())
        self.assertEqual(len(p['schedule']),80)
        counts=Counter((r['feedback'],r['control']) for r in p['schedule'])
        self.assertEqual(set(counts.values()),{10})
        self.assertNotEqual(p['schedule'],plan(1)['schedule'])

    def test_rejection_keeps_denominator(self):
        report={'records':[{'condition':'A','control':'click','status':'INCOMPLETE_OR_REJECTED'}]}
        conditional={c:{'required_cells_correct':0,'executed':0,'training_pass':0} for c in 'ABCD'}
        result=itt(report,conditional)
        self.assertEqual(result['A']['required_cells_all_requests'],2)
        self.assertEqual(result['A']['all_request_cell_score'],0)
        self.assertIsNone(result['B']['all_request_cell_score'])
