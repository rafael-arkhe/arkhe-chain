import unittest
import json
import dsl_proposal_loop as p
import finite_grid_dsl_types as d


def g():return [[0]*64 for _ in range(64)]
def response(ast):return json.dumps({'uses_memory':False,'ast':ast})

class ProposalLoopTests(unittest.TestCase):
    def test_fixture_repair_uses_training_counterexample(self):
        before=g();after=g();after[3][2]=5;requests=[]
        identity=d.node('pair',d.var('g'),d.var('s'))
        replies=iter([response(identity),response(d.controls()['click'])])
        def fixture(request):requests.append(json.loads(request));return next(replies)
        r=p.run_loop(fixture,[[(before,{'kind':'CLICK','x':2,'y':3},after)]])
        self.assertEqual(r['status'],'TRAINING_CANDIDATE_FOUND');self.assertEqual(len(r['attempts']),2)
        self.assertEqual(requests[1]['previous_training_feedback'][0]['training_counterexample']['reason'],'FIRST_GRID_MISMATCH')
        self.assertFalse(r['holdout_evaluated']);self.assertEqual(r['ratification'],'NOT_EVALUATED')
    def test_strict_parser(self):
        for raw in ['```json {} ```','{"uses_memory":false,"uses_memory":true,"ast":{}}','NaN']:
            with self.assertRaises(ValueError):p.parse_response(raw)
        ast=d.controls()['click'];ast['injected']='exec'
        with self.assertRaises(ValueError):p.parse_response(response(ast))
    def test_invalid_then_valid_budget(self):
        rows=[[(g(),{'kind':'NOOP'},g())]]
        r=p.run_loop(lambda request:'not JSON',rows,max_attempts=2)
        self.assertEqual(r['status'],'PROPOSAL_BUDGET_EXHAUSTED');self.assertEqual(len(r['attempts']),2)
    def test_provider_error_is_not_candidate_rejection(self):
        def failure(request):raise RuntimeError('unavailable')
        r=p.run_loop(failure,[])
        self.assertEqual(r['status'],'PROPOSER_ERROR_RUN_INCOMPLETE')
