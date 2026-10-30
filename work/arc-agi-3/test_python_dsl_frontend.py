import json,unittest
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as rt
from python_dsl_frontend import lower_source,source_for,PythonSyntaxProposer
from dsl_incumbent_dev import run_dev
from dsl_proposal_loop import canonical
from audit_proposal_identity import controls


class FrontendTests(unittest.TestCase):
    def test_roundtrip_controls_and_state(self):
        for ast in [*d.controls().values(),rt.memory_control()]:
            self.assertEqual(canonical(lower_source(source_for(ast),ast==rt.memory_control())['ast']),canonical(ast))

    def test_local_assignment_and_branch(self):
        p=lower_source('def step(g,a,s):\n x=g\n if boolean(True):\n  return x,s\n else:\n  return g,s\n')
        self.assertEqual(p['ast']['op'],'let')

    def test_host_calls_and_unbounded_syntax_rejected(self):
        cases=['import os\ndef step(g,a,s): return g,s','def step(g,a,s):\n return g.copy(),s',
            'def step(g,a,s):\n while True: pass\n return g,s','def step(g,a,s): return open(g),s',
            'def step(g,a,s): return g[0],s','@print\ndef step(g,a,s): return g,s']
        for source in cases:
            with self.subTest(source=source),self.assertRaises(ValueError):lower_source(source)
        with self.assertRaises(ValueError):lower_source('def step(g,a,s): return pair(color(99),s)')

    def test_fixture_repair_carries_source_and_rejects_safely(self):
        seen=[];identity='def step(g,a,s): return g,s'
        correct=source_for(d.controls()['click'])
        answers=iter([canonical({'uses_memory':False,'source':identity}),canonical({'uses_memory':False,'source':correct})])
        def callback(request):seen.append(json.loads(request));return next(answers)
        adapter=PythonSyntaxProposer(callback)
        r=run_dev(adapter,controls()['click'],2)
        self.assertEqual(r['stage'],'PROVISIONAL')
        self.assertIn('source',seen[1]['current_best']['proposal'])
        self.assertEqual(r['ratification'],'NOT_EVALUATED')
        bad=PythonSyntaxProposer(lambda request:'{"uses_memory":false,"source":"import os"}')
        r=run_dev(bad,controls()['click'],1)
        self.assertEqual(r['stage'],'NONE')
        self.assertEqual(bad.journal[0]['status'],'SOURCE_REJECTED')
