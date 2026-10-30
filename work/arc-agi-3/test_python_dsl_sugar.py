import unittest
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as rt
from python_dsl_sugar import lower_sugar
from python_dsl_frontend import lower_source,PythonSyntaxProposer
from dsl_proposal_loop import canonical


class SugarTests(unittest.TestCase):
    def test_grid_read_and_write_xy_order(self):
        p=lower_sugar('def step(g,a,s):\n g[0][0] = g[1][2]\n return g,s')
        grid=[[0]*64 for _ in range(64)];grid[1][2]=5
        result=rt.execute(p['ast'],grid,{'kind':'NOOP'})
        self.assertEqual(result['grid'][0][0],5)
        self.assertEqual(grid[0][0],0)

    def test_object_attributes(self):
        p=lower_sugar('def step(g,a,s):\n return match_option(list_head(objects(g)), (g,s), lambda obj: (grid_set(g,obj.pos,obj.color),s))')
        self.assertEqual(d.check_program(p['ast'])['type'],('Pair','Grid','State'))

    def test_bounded_for_matches_explicit_fold(self):
        source='def step(g,a,s):\n for obj in objects(g):\n  g=translate(g,obj,offset(1),offset(0))\n return g,s'
        p=lower_sugar(source)
        explicit=lower_source('def step(g,a,s):\n g=fold(grid_objects(g),g,lambda g,obj:translate(g,obj,offset(1),offset(0)))\n return g,s')
        self.assertEqual(canonical(p),canonical(explicit))
        grid=[[0]*64 for _ in range(64)];grid[3][3]=5
        result=rt.execute(p['ast'],grid,{'kind':'MOVE','dx':1,'dy':0})
        self.assertEqual(result['grid'][3][4],5)

    def test_rejects_arbitrary_loops_attributes_and_escaped_item(self):
        cases=['def step(g,a,s):\n while True: pass\n return g,s',
            'def step(g,a,s): return g.__class__,s',
            'def step(g,a,s): return g.objects(ignore=1),s',
            'def step(g,a,s):\n for obj in objects(g):\n  break\n return g,s',
            'def step(g,a,s):\n for obj in objects(g):\n  g=translate(g,obj,offset(1),offset(0))\n return obj,s']
        for source in cases:
            with self.subTest(source=source),self.assertRaises(ValueError):lower_sugar(source)

    def test_adapter_explicit_extension(self):
        source='def step(g,a,s):\n g[0][0]=g[1][2]\n return g,s'
        adapter=PythonSyntaxProposer(lambda request:canonical({'uses_memory':False,'source':source}),
            lower_fn=lower_sugar,frontend_contract='bounded sugar v2')
        value=adapter('{}')
        self.assertEqual(adapter.journal[0]['status'],'LOWERED_AND_TYPED')
