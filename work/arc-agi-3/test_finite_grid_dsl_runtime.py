import unittest
import finite_grid_dsl_types as t
import finite_grid_dsl_runtime as r


def grid():return [[0]*64 for _ in range(64)]

class FiniteDSLRuntimeTests(unittest.TestCase):
    def test_click_and_noop_immutable(self):
        g=grid();ast=t.controls()['click'];x=r.execute(ast,g,{'kind':'CLICK','x':12,'y':9})
        self.assertEqual(x['grid'][9][12],5);self.assertEqual(g[9][12],0)
        self.assertEqual(r.execute(ast,g,{'kind':'NOOP'})['grid'],g)
    def test_movement_free_blocked_empty(self):
        ast=t.controls()['move'];g=grid();g[3][3]=5
        moved=r.execute(ast,g,{'kind':'MOVE','dx':1,'dy':0})
        self.assertEqual(moved['grid'][3][4],5);self.assertEqual(moved['grid'][3][3],0)
        g[3][4]=9;self.assertEqual(r.execute(ast,g,{'kind':'MOVE','dx':1,'dy':0})['grid'],g)
        self.assertEqual(r.execute(ast,grid(),{'kind':'NOOP'})['grid'],grid())
    def test_memory_distinguishes_stateless_input(self):
        ast=r.memory_control();g=grid();self.assertLessEqual(t.check_program(ast,True)['nodes'],24)
        x=r.execute(ast,g,{'kind':'NOOP'},uses_memory=True)
        y=r.execute(ast,g,{'kind':'NOOP'},x['state'],uses_memory=True)
        self.assertEqual(x['state'],{'k0':1});self.assertEqual(y['state'],{'k0':2})
        self.assertEqual(x['grid'][0][0],0);self.assertEqual(y['grid'][0][0],5)
    def test_hidden_mode_identical_reset_inputs(self):
        ast=r.memory_control();g=grid()
        outputs=[r.execute(ast,g,{'kind':'NOOP'},uses_memory=True)['grid'] for _ in range(2)]
        targets=[grid(),grid()];targets[1][0][0]=5
        self.assertEqual(outputs[0],outputs[1]);self.assertLess(sum(x==y for x,y in zip(outputs,targets)),2)
    def test_fuel_and_internal_work(self):
        with self.assertRaises(r.StepLimitExceeded):r.execute(t.controls()['move'],grid(),{'kind':'NOOP'},limit=100)
        x=r.execute(t.controls()['move'],grid(),{'kind':'NOOP'})
        self.assertGreater(x['steps'],8192)
    def test_invalid_inputs_and_saturation(self):
        with self.assertRaises(ValueError):r.execute(t.controls()['click'],grid(),{'kind':'MOVE','dx':0,'dy':0})
        with self.assertRaises(ValueError):r.execute(t.controls()['click'],grid(),{'kind':'CLICK','x':64,'y':0})
        n=t.node;ast=n('pair',t.var('g'),n('state_set',t.var('s'),t.lit(t.K,'k0'),n('add',n('option_default',n('state_get',t.var('s'),t.lit(t.K,'k0')),t.lit(t.D,0)),t.lit(t.D,1))))
        self.assertEqual(r.execute(ast,grid(),{'kind':'NOOP'},{'k0':64},True)['state']['k0'],64)
    def test_fold_threads_grid(self):
        n=t.node;ast=n('pair',n('fold',n('coord_neighbors8',t.lit(t.C,(0,0))),t.var('g'),
            n('lambda',n('grid_set',t.var('acc'),t.var('cell'),t.lit(t.P,5)),params=['acc','cell'])),t.var('s'))
        x=r.execute(ast,grid(),{'kind':'NOOP'});self.assertEqual(sum(c==5 for row in x['grid'] for c in row),3)
