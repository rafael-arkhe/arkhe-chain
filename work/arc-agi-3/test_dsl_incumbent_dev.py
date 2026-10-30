import json,unittest
import finite_grid_dsl_types as d
from audit_proposal_identity import controls
from dsl_incumbent_dev import run_dev
from dsl_proposal_loop import canonical,digest


class IncumbentTests(unittest.TestCase):
    def test_parent_and_counterexample_carried_no_admission(self):
        identity={'uses_memory':False,'ast':d.node('pair',d.var('g'),d.var('s'))}
        correct={'uses_memory':False,'ast':d.controls()['click']}
        requests=[];answers=iter([canonical(identity),canonical(correct)])
        def proposer(request):requests.append(json.loads(request));return next(answers)
        result=run_dev(proposer,controls()['click'],2)
        self.assertEqual(requests[1]['current_best']['proposal'],identity)
        self.assertEqual(requests[1]['previous_training_feedback'][0]['training_counterexample']['reason'],'FIRST_GRID_MISMATCH')
        self.assertEqual(result['stage'],'PROVISIONAL')
        self.assertEqual(result['ratification'],'NOT_EVALUATED')
        self.assertEqual(result['production_effects'],0)
        self.assertNotIn('holdout',requests[1])

    def test_rejected_attempt_preserves_best_and_empty_panel_no_promote(self):
        p={'uses_memory':False,'ast':d.node('pair',d.var('g'),d.var('s'))}
        answers=iter([canonical(p),'{}'])
        result=run_dev(lambda request:next(answers),controls()['click'],2)
        self.assertEqual(result['incumbent_sha256'],digest(p))
        self.assertEqual(result['stage'],'CANDIDATE')
        empty=run_dev(lambda request:canonical(p),[],1)
        self.assertEqual(empty['stage'],'NONE')
