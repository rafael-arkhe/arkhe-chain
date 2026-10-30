import unittest
import finite_grid_dsl_types as d

class FiniteDSLTypeTests(unittest.TestCase):
    def test_controls_exact_size_and_type(self):
        for name,n in [('click',20),('move',22)]:
            self.assertEqual(d.check_program(d.controls()[name])['nodes'],n)
    def test_option_and_count_not_offset(self):
        with self.assertRaises(ValueError):d.infer(d.node('coord',d.node('grid_count',d.var('g'),d.lit(d.P,0)),d.lit(d.D,0)))
        with self.assertRaises(ValueError):d.infer(d.node('is_blocked',d.var('g'),d.node('list_head',d.node('grid_objects',d.var('g'))),d.lit(d.D,1),d.lit(d.D,0)))
    def test_bounds_arity_and_memory(self):
        with self.assertRaises(ValueError):d.infer(d.lit(d.D,4096))
        with self.assertRaises(ValueError):d.infer(d.node('grid_get',d.var('g')))
        with self.assertRaises(ValueError):d.infer(d.node('state_set',d.var('s'),d.lit(d.K,'k0'),d.lit(d.D,1)),uses_memory=False)
    def test_fold_threads_type(self):
        ast=d.node('fold',d.node('grid_objects',d.var('g')),d.var('g'),d.node('lambda',d.var('acc'),params=['acc','obj']))
        self.assertEqual(d.infer(ast),d.G)
